import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { resources, integrations } from '../../../apigateway/index.js';

export const apigatewayMethodProvider: ResourceProvider = {
  type: 'AWS::ApiGateway::Method',
  create(logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const restApiId = properties.RestApiId as string;
    const resourceId = properties.ResourceId as string;
    const httpMethod = properties.HttpMethod as string;
    const authorizationType = (properties.AuthorizationType as string) ?? 'NONE';

    const resMap = resources.get(restApiId);
    const resource = resMap?.get(resourceId);
    if (resource && resMap) {
      resource.resourceMethods![httpMethod] = { httpMethod, authorizationType };
      resources.set(restApiId, resMap);
    }

    const integration = properties.Integration as Record<string, unknown> | undefined;
    if (integration) {
      integrations.set(`${restApiId}/${resourceId}/${httpMethod}`, {
        type: String(integration.Type ?? 'AWS_PROXY') as import('@aws-sdk/client-api-gateway').IntegrationType,
        uri: String(integration.Uri ?? ''),
        httpMethod: String(integration.IntegrationHttpMethod ?? 'POST'),
      });
    }

    return {
      physicalId: `${restApiId}/${resourceId}/${httpMethod}`,
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const restApiId = properties.RestApiId as string;
    const resourceId = properties.ResourceId as string;
    const httpMethod = properties.HttpMethod as string;
    const authorizationType = (properties.AuthorizationType as string) ?? 'NONE';

    const resMap = resources.get(restApiId);
    const resource = resMap?.get(resourceId);
    if (resource && resMap) {
      resource.resourceMethods![httpMethod] = { httpMethod, authorizationType };
      resources.set(restApiId, resMap);
    }

    const integration = properties.Integration as Record<string, unknown> | undefined;
    if (integration) {
      integrations.set(`${restApiId}/${resourceId}/${httpMethod}`, {
        type: String(integration.Type ?? 'AWS_PROXY') as import('@aws-sdk/client-api-gateway').IntegrationType,
        uri: String(integration.Uri ?? ''),
        httpMethod: String(integration.IntegrationHttpMethod ?? 'POST'),
      });
    }

    return {
      physicalId,
      attributes: {},
    };
  },
};
