import { randomBytes } from 'node:crypto';
import { defineMockService } from '../service.js';
import type { ApiResponse, ParsedApiRequest } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import { json, ServiceError } from '../response.js';
import type {
  RestApi as SdkRestApi,
  Resource as SdkResource,
  Deployment as SdkDeployment,
  Stage as SdkStage,
  Integration as SdkIntegration,
} from '@aws-sdk/client-api-gateway';

export interface RestApi extends Omit<SdkRestApi, 'createdDate'> {
  createdDate: number;
}

export type ApiResource = SdkResource;

type ApiDeployment = Omit<SdkDeployment, 'createdDate'> & { createdDate: number };

type ApiStage = Omit<SdkStage, 'createdDate'> & { createdDate: number };

type ApiIntegration = SdkIntegration;

export const apis = new PersistentMap<string, RestApi>('apigateway-apis');
export const resources = new PersistentMap<string, Map<string, ApiResource>>('apigateway-resources');
export const deployments = new PersistentMap<string, Map<string, ApiDeployment>>('apigateway-deployments');
export const stages = new PersistentMap<string, Map<string, ApiStage>>('apigateway-stages');
export const integrations = new PersistentMap<string, ApiIntegration>('apigateway-integrations');

export const gatewayResponses = new PersistentMap<string, { apiId: string; responseType: string; statusCode?: string; responseParameters?: Record<string, string>; responseTemplates?: Record<string, string> }>('apigateway-gateway-responses');

export let apiGatewayAccount: { cloudwatchRoleArn?: string } = {};
export function setApiGatewayAccount(account: { cloudwatchRoleArn?: string }): void { apiGatewayAccount = account; }

export const genId = (): string => randomBytes(5).toString('hex');

export function createRestApi(name: string, description: string): { api: RestApi; rootResourceId: string } {
  const id = genId();
  const rootResourceId = genId();
  const api: RestApi = {
    id,
    name,
    description,
    createdDate: Date.now() / 1000,
    rootResourceId,
  };
  apis.set(id, api);
  const rootResource: ApiResource = { id: rootResourceId, parentId: '', pathPart: '', path: '/', resourceMethods: {} };
  resources.set(id, new Map([[rootResourceId, rootResource]]));
  deployments.set(id, new Map());
  stages.set(id, new Map());
  return { api, rootResourceId };
}

export function createResource(apiId: string, parentId: string, pathPart: string): ApiResource {
  const resMap = resources.get(apiId);
  if (!resMap) throw new ServiceError('NotFoundException', 'Invalid API identifier specified', 404);
  const parent = resMap.get(parentId);
  if (!parent) throw new ServiceError('NotFoundException', 'Invalid Resource identifier specified', 404);
  const id = genId();
  const fullPath = parent.path === '/' ? `/${pathPart}` : `${parent.path}/${pathPart}`;
  const resource: ApiResource = { id, parentId, pathPart, path: fullPath, resourceMethods: {} };
  resMap.set(id, resource);
  resources.set(apiId, resMap);
  return resource;
}

export function createDeployment(apiId: string, description: string): { id: string; createdDate: number; description: string } {
  const depMap = deployments.get(apiId);
  if (!depMap) throw new ServiceError('NotFoundException', 'Invalid API identifier specified', 404);
  const id = genId();
  const dep = { id, createdDate: Date.now() / 1000, description };
  depMap.set(id, dep);
  deployments.set(apiId, depMap);
  return dep;
}

export function createStage(apiId: string, stageName: string, deploymentId: string): { stageName: string; deploymentId: string; createdDate: number } {
  const stageMap = stages.get(apiId);
  if (!stageMap) throw new ServiceError('NotFoundException', 'Invalid API identifier specified', 404);
  const stage = { stageName, deploymentId, createdDate: Date.now() / 1000 };
  stageMap.set(stageName, stage);
  stages.set(apiId, stageMap);
  return stage;
}

const error = (code: string, message: string, statusCode = 404): ApiResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'x-amzn-errortype': code },
  body: JSON.stringify({ __type: code, message }),
});

function stripHostPrefix(path: string): string {
  const match = path.match(/^\/api\/[^/]+(\/.*)/);
  return match ? match[1] : path;
}

const v2ListEndpoints = new Set(['apis', 'domainnames', 'vpclinks']);

function routeV2(_segments: string[], _method: string): ApiResponse {
  return json({ Items: [] });
}

function route(req: ParsedApiRequest): ApiResponse {
  const path = stripHostPrefix(req.path);
  const method = req.method;
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'v2') {
    return routeV2(segments.slice(1), method);
  }

  if (segments[0] !== 'restapis') {
    if (segments[0] === 'account') {
      if (method === 'GET') {
        return json({ cloudwatchRoleArn: apiGatewayAccount.cloudwatchRoleArn || '', throttleSettings: { burstLimit: 5000, rateLimit: 10000 } });
      }
      if (method === 'PATCH') {
        const ops = (req.body as Record<string, unknown>).patchOperations as Array<{ op: string; path: string; value: string }> | undefined;
        if (ops) {
          for (const op of ops) {
            if (op.path === '/cloudwatchRoleArn') apiGatewayAccount.cloudwatchRoleArn = op.value;
          }
        }
        return json({ cloudwatchRoleArn: apiGatewayAccount.cloudwatchRoleArn || '', throttleSettings: { burstLimit: 5000, rateLimit: 10000 } });
      }
    }
    return json({});
  }

  if (segments.length === 1) {
    if (method === 'POST') return handleCreateRestApi(req);
    if (method === 'GET') return getRestApis();
  }

  const apiId = segments[1];
  if (!apiId) return json({});

  if (segments.length === 2) {
    if (method === 'GET') return getRestApi(apiId);
    if (method === 'DELETE') return deleteRestApi(apiId);
  }

  const sub = segments[2];

  if (sub === 'resources') {
    if (segments.length === 3 && method === 'GET') return getResources(apiId);
    if (segments.length === 4 && method === 'POST') return handleCreateResource(apiId, segments[3], req);
    if (segments.length === 4 && method === 'DELETE') return deleteResource(apiId, segments[3]);
    if (segments.length === 6 && sub === 'resources' && segments[4] === 'methods' && method === 'PUT') {
      return putMethod(apiId, segments[3], segments[5], req);
    }
  }

  if (sub === 'deployments') {
    if (segments.length === 3 && method === 'POST') return handleCreateDeployment(apiId, req);
    if (segments.length === 3 && method === 'GET') return getDeployments(apiId);
  }

  if (sub === 'stages') {
    if (segments.length === 3 && method === 'POST') return handleCreateStage(apiId, req);
    if (segments.length === 3 && method === 'GET') return getStages(apiId);
    if (segments.length === 4 && method === 'GET') return getStage(apiId, segments[3]);
  }

  if (sub === 'gatewayresponses') {
    if (segments.length === 3 && method === 'GET') return getGatewayResponses(apiId);
    if (segments.length === 4 && method === 'PUT') return putGatewayResponse(apiId, segments[3], req);
    if (segments.length === 4 && method === 'GET') return getGatewayResponse(apiId, segments[3]);
    if (segments.length === 4 && method === 'DELETE') return deleteGatewayResponse(apiId, segments[3]);
  }

  return json({});
}

function handleCreateRestApi(req: ParsedApiRequest): ApiResponse {
  const body = req.body as Record<string, unknown>;
  const { api, rootResourceId } = createRestApi(String(body.name || ''), String(body.description || ''));
  return json({ ...restApiOutput(api), rootResourceId }, 201);
}

function restApiOutput(a: RestApi): Record<string, unknown> {
  return {
    id: a.id, name: a.name, description: a.description, createdDate: a.createdDate,
    apiKeySource: 'HEADER',
    endpointConfiguration: { types: ['REGIONAL'] },
    disableExecuteApiEndpoint: false,
    tags: {},
    version: '',
  };
}

function getRestApis(): ApiResponse {
  const items = [...apis.values()].map(restApiOutput);
  return json({ item: items });
}

function getRestApi(apiId: string): ApiResponse {
  const api = apis.get(apiId);
  if (!api) return error('NotFoundException', 'Invalid API identifier specified', 404);
  return json({ ...restApiOutput(api), rootResourceId: api.rootResourceId });
}

function deleteRestApi(apiId: string): ApiResponse {
  if (!apis.has(apiId)) return error('NotFoundException', 'Invalid API identifier specified', 404);
  apis.delete(apiId);
  resources.delete(apiId);
  deployments.delete(apiId);
  stages.delete(apiId);
  return json({}, 202);
}

function getResources(apiId: string): ApiResponse {
  const resMap = resources.get(apiId);
  if (!resMap) return error('NotFoundException', 'Invalid API identifier specified', 404);
  const items = [...resMap.values()].map(r => ({
    id: r.id, parentId: r.parentId || undefined, pathPart: r.pathPart || undefined, path: r.path, resourceMethods: r.resourceMethods && Object.keys(r.resourceMethods).length > 0 ? r.resourceMethods : undefined,
  }));
  return json({ item: items });
}

function handleCreateResource(apiId: string, parentId: string, req: ParsedApiRequest): ApiResponse {
  try {
    const body = req.body as Record<string, unknown>;
    const resource = createResource(apiId, parentId, String(body.pathPart || ''));
    return json({ id: resource.id, parentId: resource.parentId, pathPart: resource.pathPart, path: resource.path }, 201);
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function deleteResource(apiId: string, resourceId: string): ApiResponse {
  const resMap = resources.get(apiId);
  if (!resMap) return error('NotFoundException', 'Invalid API identifier specified', 404);
  const resource = resMap.get(resourceId);
  if (!resource) return error('NotFoundException', 'Invalid Resource identifier specified', 404);
  const api = apis.get(apiId);
  if (api?.rootResourceId === resourceId) return error('BadRequestException', 'The root resource cannot be deleted', 400);
  resMap.delete(resourceId);
  resources.set(apiId, resMap);
  return json({}, 202);
}

function putMethod(apiId: string, resourceId: string, httpMethod: string, req: ParsedApiRequest): ApiResponse {
  const resMap = resources.get(apiId);
  if (!resMap) return error('NotFoundException', 'Invalid API identifier specified', 404);
  const resource = resMap.get(resourceId);
  if (!resource) return error('NotFoundException', 'Invalid Resource identifier specified', 404);
  const body = req.body as Record<string, unknown>;
  const method = { httpMethod, authorizationType: String(body.authorizationType || 'NONE') };
  resource.resourceMethods![httpMethod] = method;
  resources.set(apiId, resMap);
  const integration = body.integration as Record<string, unknown> | undefined;
  if (integration) {
    integrations.set(`${apiId}/${resourceId}/${httpMethod}`, {
      type: String(integration.type ?? 'AWS_PROXY') as SdkIntegration['type'],
      uri: String(integration.uri ?? ''),
      httpMethod: String(integration.integrationHttpMethod ?? 'POST'),
    });
  }
  return json(method, 201);
}

function handleCreateDeployment(apiId: string, req: ParsedApiRequest): ApiResponse {
  try {
    const body = req.body as Record<string, unknown>;
    const dep = createDeployment(apiId, String(body.description || ''));
    return json({ id: dep.id, createdDate: dep.createdDate, description: dep.description }, 201);
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function getDeployments(apiId: string): ApiResponse {
  const depMap = deployments.get(apiId);
  if (!depMap) return error('NotFoundException', 'Invalid API identifier specified', 404);
  return json({ item: [...depMap.values()] });
}

function handleCreateStage(apiId: string, req: ParsedApiRequest): ApiResponse {
  try {
    const body = req.body as Record<string, unknown>;
    const stage = createStage(apiId, String(body.stageName || ''), String(body.deploymentId || ''));
    return json(stage, 201);
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function getStages(apiId: string): ApiResponse {
  const stageMap = stages.get(apiId);
  if (!stageMap) return error('NotFoundException', 'Invalid API identifier specified', 404);
  return json({ item: [...stageMap.values()] });
}

function getStage(apiId: string, stageName: string): ApiResponse {
  const stageMap = stages.get(apiId);
  if (!stageMap) return error('NotFoundException', 'Invalid API identifier specified', 404);
  const stage = stageMap.get(stageName);
  if (!stage) return error('NotFoundException', 'Invalid stage identifier specified', 404);
  return json(stage);
}

function putGatewayResponse(apiId: string, responseType: string, req: ParsedApiRequest): ApiResponse {
  const body = req.body as Record<string, unknown>;
  const key = `${apiId}/${responseType}`;
  gatewayResponses.set(key, {
    apiId,
    responseType,
    statusCode: body.statusCode as string | undefined,
    responseParameters: body.responseParameters as Record<string, string> | undefined,
    responseTemplates: body.responseTemplates as Record<string, string> | undefined,
  });
  return json({ responseType, statusCode: body.statusCode, responseParameters: body.responseParameters, responseTemplates: body.responseTemplates }, 201);
}

function getGatewayResponse(apiId: string, responseType: string): ApiResponse {
  const entry = gatewayResponses.get(`${apiId}/${responseType}`);
  if (!entry) return error('NotFoundException', 'Gateway response not found', 404);
  return json(entry);
}

function getGatewayResponses(apiId: string): ApiResponse {
  const items = [...gatewayResponses.values()].filter(r => r.apiId === apiId);
  return json({ items });
}

function deleteGatewayResponse(apiId: string, responseType: string): ApiResponse {
  gatewayResponses.delete(`${apiId}/${responseType}`);
  return json({}, 202);
}

export const apiGatewayService = defineMockService({
  name: 'apigateway',
  hostPatterns: ['apigateway.*.amazonaws.com'],
  protocol: 'rest-json',
  signingName: 'apigateway',
  handlers: {
    GetRestApis: () => getRestApis(),
    GetAccount: () => json({ cloudwatchRoleArn: apiGatewayAccount.cloudwatchRoleArn || '', throttleSettings: { burstLimit: 5000, rateLimit: 10000 } }),
    _default: route,
  },
});
