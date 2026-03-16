import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { apis, resources, stages, integrations } from './index.js';
import type { ApiResource } from './index.js';
import { functions } from '../lambda/state.js';
import { executeLambdaHandler } from '../lambda/executor.js';
import { debug } from '../../util/logger.js';
import { ACCOUNT_ID } from '../../config.js';

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseHost(host: string): { apiId: string; region: string } | null {
  const hostname = host.split(':')[0];
  const match = hostname.match(/^([^.]+)\.execute-api\.([^.]+)\./);
  if (!match) return null;
  return { apiId: match[1], region: match[2] };
}

function parseStagePath(pathname: string): { stage: string; resourcePath: string } | null {
  const withoutLeading = pathname.replace(/^\//, '');
  const slashIdx = withoutLeading.indexOf('/');
  if (slashIdx === -1) {
    return { stage: withoutLeading, resourcePath: '/' };
  }
  return {
    stage: withoutLeading.slice(0, slashIdx),
    resourcePath: '/' + withoutLeading.slice(slashIdx + 1),
  };
}

function pathTemplateToRegex(template: string): RegExp {
  const escaped = template.replace(/\{[^}]+\}/g, '([^/]+)');
  return new RegExp(`^${escaped}$`);
}

function matchResource(
  apiId: string,
  resourcePath: string,
): ApiResource | null {
  const resMap = resources.get(apiId);
  if (!resMap) return null;

  // Exact match
  for (const resource of resMap.values()) {
    if (resource.path === resourcePath) return resource;
  }

  let bestMatch: ApiResource | null = null;
  let bestSegments = 0;
  for (const resource of resMap.values()) {
    if (!resource.path?.includes('{')) continue;
    if (resource.path.includes('{') && resource.path.includes('+')) continue;
    const regex = pathTemplateToRegex(resource.path);
    if (regex.test(resourcePath)) {
      const segments = resource.path.split('/').length;
      if (segments > bestSegments) {
        bestMatch = resource;
        bestSegments = segments;
      }
    }
  }
  if (bestMatch) return bestMatch;

  // {proxy+} catch-all: find a resource whose path ends with /{proxy+}
  // and whose parent path is a prefix of the request
  for (const resource of resMap.values()) {
    if (!resource.pathPart?.includes('{') || !resource.pathPart.includes('+')) continue;
    const parentPath = resource.path!.replace(/\/\{[^}]+\+\}$/, '');
    const prefix = parentPath === '' ? '/' : parentPath;
    if (prefix === '/' && resourcePath.startsWith('/')) return resource;
    if (resourcePath.startsWith(prefix + '/') || resourcePath === prefix) return resource;
  }

  return null;
}

function extractFunctionName(integrationUri: string): string | null {
  const match = integrationUri.match(/functions\/arn:aws:lambda:[^:]+:\d+:function:([^/]+)\/invocations/);
  if (match) return match[1];
  const arnMatch = integrationUri.match(/functions\/(arn:aws:lambda:[^/]+)\/invocations/);
  if (arnMatch) {
    const parts = arnMatch[1].split(':');
    return parts[parts.length - 1];
  }
  return null;
}

function parseQueryString(search: string): Record<string, string> | null {
  if (!search || search === '?') return null;
  const params = new URLSearchParams(search);
  const result: Record<string, string> = {};
  let hasAny = false;
  for (const [key, value] of params.entries()) {
    result[key] = value;
    hasAny = true;
  }
  return hasAny ? result : null;
}

function multiValueParams(search: string): Record<string, string[]> | null {
  if (!search || search === '?') return null;
  const params = new URLSearchParams(search);
  const result: Record<string, string[]> = {};
  let hasAny = false;
  for (const [key, value] of params.entries()) {
    if (!result[key]) result[key] = [];
    result[key].push(value);
    hasAny = true;
  }
  return hasAny ? result : null;
}

function buildHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(', ');
  }
  return headers;
}

function buildMultiValueHeaders(req: IncomingMessage): Record<string, string[]> {
  const headers: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = [value];
    else if (Array.isArray(value)) headers[key] = value;
  }
  return headers;
}

function jsonResponse(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(payload)),
  });
  res.end(payload);
}

export async function handleApiGatewayRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const host = String(req.headers[':authority'] ?? req.headers.host ?? '');
  const parsed = parseHost(host);
  if (!parsed) {
    jsonResponse(res, 404, { message: 'Not Found' });
    return;
  }

  const { apiId } = parsed;
  const api = apis.get(apiId);
  if (!api) {
    debug(`API Gateway: no REST API with id ${apiId}`);
    jsonResponse(res, 404, { message: 'Not Found' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://${host}`);
  const stagePath = parseStagePath(url.pathname);
  if (!stagePath) {
    jsonResponse(res, 404, { message: 'Not Found' });
    return;
  }

  const stageMap = stages.get(apiId);
  if (!stageMap?.has(stagePath.stage)) {
    debug(`API Gateway: stage ${stagePath.stage} not found for API ${apiId}`);
    jsonResponse(res, 404, { message: 'Not Found' });
    return;
  }

  const resource = matchResource(apiId, stagePath.resourcePath);
  if (!resource) {
    debug(`API Gateway: no resource matching ${stagePath.resourcePath} in API ${apiId}`);
    jsonResponse(res, 404, { message: 'Not Found' });
    return;
  }

  const httpMethod = req.method ?? 'GET';

  // Look up integration: try exact method first, then ANY
  let integrationKey = `${apiId}/${resource.id}/${httpMethod}`;
  let integration = integrations.get(integrationKey);
  if (!integration) {
    integrationKey = `${apiId}/${resource.id}/ANY`;
    integration = integrations.get(integrationKey);
  }

  if (!integration) {
    debug(`API Gateway: no integration for ${httpMethod} on resource ${resource.path} (${resource.id})`);
    jsonResponse(res, 404, { message: 'Not Found' });
    return;
  }

  const functionName = extractFunctionName(integration.uri!);
  if (!functionName) {
    debug(`API Gateway: cannot extract function name from URI ${integration.uri}`);
    jsonResponse(res, 502, { message: 'Internal server error' });
    return;
  }

  const fn = functions.get(functionName);
  if (!fn) {
    debug(`API Gateway: Lambda function ${functionName} not found`);
    jsonResponse(res, 502, { message: 'Internal server error' });
    return;
  }

  const bodyBuf = await readBody(req);
  const bodyStr = bodyBuf.length > 0 ? bodyBuf.toString('utf-8') : null;
  const headers = buildHeaders(req);
  const multiValueHeaders = buildMultiValueHeaders(req);
  const queryStringParameters = parseQueryString(url.search);
  const multiValueQueryStringParameters = multiValueParams(url.search);

  // Extract path parameters
  let pathParameters: Record<string, string> | null = null;
  if (resource.path?.includes('{')) {
    if (resource.pathPart?.includes('{') && resource.pathPart.includes('+')) {
      const parentPath = resource.path.replace(/\/\{[^}]+\+\}$/, '');
      const proxyValue = parentPath === ''
        ? stagePath.resourcePath.replace(/^\//, '')
        : stagePath.resourcePath.slice(parentPath.length + 1);
      const paramName = resource.pathPart!.replace(/[{}+]/g, '');
      pathParameters = { [paramName]: proxyValue };
    } else {
      const templateParts = resource.path!.split('/');
      const requestParts = stagePath.resourcePath.split('/');
      pathParameters = {};
      for (let i = 0; i < templateParts.length; i++) {
        const match = templateParts[i].match(/^\{(.+)\}$/);
        if (match && requestParts[i]) {
          pathParameters[match[1]] = requestParts[i];
        }
      }
      if (Object.keys(pathParameters).length === 0) pathParameters = null;
    }
  }

  const event = {
    resource: resource.path,
    path: stagePath.resourcePath,
    httpMethod,
    headers,
    multiValueHeaders,
    queryStringParameters,
    multiValueQueryStringParameters,
    pathParameters,
    stageVariables: null,
    body: bodyStr,
    isBase64Encoded: false,
    requestContext: {
      resourceId: resource.id,
      resourcePath: resource.path,
      httpMethod,
      path: `/${stagePath.stage}${stagePath.resourcePath}`,
      accountId: ACCOUNT_ID,
      stage: stagePath.stage,
      requestId: randomUUID(),
      identity: {
        sourceIp: 'localhost',
        userAgent: headers['user-agent'] ?? '',
      },
      apiId,
    },
  };

  debug(`API Gateway: invoking Lambda ${functionName} for ${httpMethod} ${stagePath.resourcePath}`);

  try {
    const result = await executeLambdaHandler(fn, event);

    if (result.error) {
      debug(`API Gateway: Lambda ${functionName} error: ${result.error.errorMessage}`);
      jsonResponse(res, 502, { message: 'Internal server error' });
      return;
    }

    const lambdaResponse = result.result as {
      statusCode?: number;
      headers?: Record<string, string>;
      multiValueHeaders?: Record<string, string[]>;
      body?: string;
      isBase64Encoded?: boolean;
    } | null;

    if (!lambdaResponse || typeof lambdaResponse.statusCode !== 'number') {
      debug(`API Gateway: Lambda ${functionName} returned invalid response`);
      jsonResponse(res, 502, { message: 'Internal server error' });
      return;
    }

    const responseHeaders: Record<string, string | string[]> = {};
    if (lambdaResponse.headers) {
      for (const [k, v] of Object.entries(lambdaResponse.headers)) {
        responseHeaders[k] = v;
      }
    }
    if (lambdaResponse.multiValueHeaders) {
      for (const [k, v] of Object.entries(lambdaResponse.multiValueHeaders)) {
        responseHeaders[k] = v;
      }
    }
    responseHeaders['access-control-allow-origin'] = '*';

    res.writeHead(lambdaResponse.statusCode, responseHeaders);

    if (lambdaResponse.body) {
      if (lambdaResponse.isBase64Encoded) {
        res.end(Buffer.from(lambdaResponse.body, 'base64'));
      } else {
        res.end(lambdaResponse.body);
      }
    } else {
      res.end();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    debug(`API Gateway: exception invoking Lambda ${functionName}: ${msg}`);
    jsonResponse(res, 502, { message: 'Internal server error' });
  }
}
