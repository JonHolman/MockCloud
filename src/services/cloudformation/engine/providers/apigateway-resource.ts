import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { resources, createResource } from '../../../apigateway/index.js';

export const apigatewayResourceProvider: ResourceProvider = {
  type: 'AWS::ApiGateway::Resource',
  create(_logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const restApiId = properties.RestApiId as string;
    const parentId = properties.ParentId as string;
    const pathPart = properties.PathPart as string;

    const resource = createResource(restApiId, parentId, pathPart);

    return {
      physicalId: resource.id!,
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const restApiId = properties.RestApiId as string;
    const parentId = properties.ParentId as string;
    const pathPart = properties.PathPart as string;

    const resMap = resources.get(restApiId);
    if (resMap) {
      const parent = resMap.get(parentId);
      const parentPath = parent?.path ?? '/';
      const fullPath = parentPath === '/' ? `/${pathPart}` : `${parentPath}/${pathPart}`;

      resMap.set(physicalId, {
        id: physicalId,
        parentId,
        pathPart,
        path: fullPath,
        resourceMethods: resMap.get(physicalId)?.resourceMethods ?? {},
      });
      resources.set(restApiId, resMap);
    }

    return {
      physicalId,
      attributes: {},
    };
  },
};
