import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { deployments, createDeployment } from '../../../apigateway/index.js';

export const apigatewayDeploymentProvider: ResourceProvider = {
  type: 'AWS::ApiGateway::Deployment',
  create(_logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const restApiId = properties.RestApiId as string;
    const description = (properties.Description as string) ?? '';

    const dep = createDeployment(restApiId, description);

    return {
      physicalId: dep.id,
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const restApiId = properties.RestApiId as string;
    const description = (properties.Description as string) ?? '';

    const depMap = deployments.get(restApiId);
    const existing = depMap?.get(physicalId);
    if (depMap && existing) {
      existing.description = description;
      deployments.set(restApiId, depMap);
    }

    return {
      physicalId,
      attributes: {},
    };
  },
};
