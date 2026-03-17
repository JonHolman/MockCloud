import type { MockServiceDefinition } from '../../types.js';
import { json } from './state.js';
import {
  handleCreateFunction,
  getFunction,
  getFunctionConfiguration,
  deleteFunction,
  updateFunctionCode,
  updateFunctionConfiguration,
  listFunctions,
  invokeFunction,
  listVersionsByFunction,
  listTags,
  getAccountSettings,
  getPolicy,
  getFunctionUrlConfig,
  listEventSourceMappings,
  listAliases,
  getFunctionConcurrency,
  listProvisionedConcurrencyConfigs,
  getFunctionEventInvokeConfig,
  listFunctionEventInvokeConfigs,
  getFunctionCodeSigningConfig,
  listCodeSigningConfigs,
} from './handlers.js';

async function routeRequest(req: import('../../types.js').ParsedApiRequest): Promise<import('../../types.js').ApiResponse> {
  const restPath = req.path.replace(/^\/api\/[^/]+/, '') || '/';
  const method = req.method;
  const segments = restPath.split('/').filter(Boolean);

  if (segments[0] === '2015-03-31' && segments[1] === 'functions') {
    const functionName = segments[2] ? decodeURIComponent(segments[2]) : undefined;
    const subResource = segments[3];

    if (!functionName) {
      if (method === 'GET') return listFunctions();
      if (method === 'POST') return handleCreateFunction(req);
    }

    if (functionName && !subResource) {
      if (method === 'GET') return getFunction(req, functionName);
      if (method === 'DELETE') return deleteFunction(req, functionName);
    }

    if (functionName && subResource === 'configuration') {
      if (method === 'GET') return getFunctionConfiguration(req, functionName);
      if (method === 'PUT') return updateFunctionConfiguration(req, functionName);
    }

    if (functionName && subResource === 'code' && method === 'PUT') {
      return updateFunctionCode(req, functionName);
    }

    if (functionName && subResource === 'invocations' && method === 'POST') {
      return invokeFunction(req, functionName);
    }

    if (functionName && subResource === 'versions' && method === 'GET') {
      return listVersionsByFunction(req, functionName);
    }

    if (functionName && subResource === 'policy' && method === 'GET') {
      return getPolicy(req, functionName);
    }

    if (functionName && subResource === 'url' && method === 'GET') {
      return getFunctionUrlConfig(req, functionName);
    }

    if (functionName && subResource === 'aliases' && method === 'GET') {
      return listAliases(req, functionName);
    }
  }

  if (segments[0] === '2015-03-31' && segments[1] === 'event-source-mappings' && method === 'GET') {
    return listEventSourceMappings(req);
  }

  if (segments[0] === '2017-03-31' && segments[1] === 'tags') {
    const arn = decodeURIComponent(segments.slice(2).join('/'));
    if (method === 'GET') return listTags(req, arn);
  }

  if (segments[1] === 'account-settings' && method === 'GET') {
    return getAccountSettings();
  }

  if (segments[1] === 'functions' && segments[2]) {
    const functionName = decodeURIComponent(segments[2]);
    const subResource = segments[3];
    const nestedSubResource = segments[4];

    if (subResource === 'concurrency' && method === 'GET') {
      return getFunctionConcurrency(req, functionName);
    }
    if (subResource === 'provisioned-concurrency' && method === 'GET') {
      return listProvisionedConcurrencyConfigs(req, functionName);
    }
    if (subResource === 'event-invoke-config' && nestedSubResource === 'list' && method === 'GET') {
      return listFunctionEventInvokeConfigs(req, functionName);
    }
    if (subResource === 'event-invoke-config' && method === 'GET') {
      return getFunctionEventInvokeConfig(req, functionName);
    }
    if (subResource === 'event-invoke-configs' && method === 'GET') {
      return listFunctionEventInvokeConfigs(req, functionName);
    }
    if (subResource === 'code-signing-config' && method === 'GET') {
      return getFunctionCodeSigningConfig(req, functionName);
    }
  }

  if (segments[1] === 'code-signing-configs' && method === 'GET') {
    return listCodeSigningConfigs();
  }

  return json({});
}

export const lambdaService: MockServiceDefinition = {
  name: 'lambda',
  hostPatterns: ['lambda.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'AWSLambda',
  signingName: 'lambda',
  handlers: {
    GetAccountSettings: () => getAccountSettings(),
    ListFunctions20150331: () => listFunctions(),
    _default: (req) => routeRequest(req),
  },
};
