import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { apis, resources, deployments, stages, integrations, createRestApi } from '../../../apigateway/index.js';

export const apigatewayRestApiProvider: ResourceProvider = {
  type: 'AWS::ApiGateway::RestApi',
  create(logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const { api, rootResourceId } = createRestApi(
      (properties.Name as string) ?? '',
      (properties.Description as string) ?? '',
    );

    return {
      physicalId: api.id!,
      attributes: { RootResourceId: rootResourceId },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const api = apis.get(physicalId);
    if (api) {
      api.name = (properties.Name as string) ?? '';
      api.description = (properties.Description as string) ?? '';
      apis.set(physicalId, api);
    }

    const resMap = resources.get(physicalId);
    const rootResourceId = api?.rootResourceId ?? resMap?.keys().next().value ?? '';

    return {
      physicalId,
      attributes: { RootResourceId: rootResourceId },
    };
  },
  delete(physicalId: string): void {
    apis.delete(physicalId);
    resources.delete(physicalId);
    deployments.delete(physicalId);
    stages.delete(physicalId);
    for (const key of integrations.keys()) {
      if (key.startsWith(`${physicalId}/`)) {
        integrations.delete(key);
      }
    }
  },
};
