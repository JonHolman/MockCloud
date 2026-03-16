import { describe, test, expect } from 'vitest';
import {
  CreateRestApiCommand,
  GetRestApiCommand,
  GetResourcesCommand,
  CreateResourceCommand,
  CreateDeploymentCommand,
  GetDeploymentsCommand,
  CreateStageCommand,
  GetStagesCommand,
  DeleteRestApiCommand,
} from '@aws-sdk/client-api-gateway';
import { createAPIGatewayClient } from './client-factory.js';

describe('API Gateway extended', () => {
  const client = createAPIGatewayClient();

  test('Full API lifecycle: create API, resource, deployment, stage', async () => {
    const apiName = `test-full-api-${Date.now()}`;

    const createApi = await client.send(new CreateRestApiCommand({ name: apiName }));
    const apiId = createApi.id!;
    expect(createApi.name).toBe(apiName);

    try {
      const getApi = await client.send(new GetRestApiCommand({ restApiId: apiId }));
      expect(getApi.name).toBe(apiName);
      expect(getApi.rootResourceId).toBeTruthy();
      const rootResourceId = getApi.rootResourceId!;

      const resourcesResult = await client.send(new GetResourcesCommand({ restApiId: apiId }));
      expect(resourcesResult.items?.length).toBe(1);
      expect(resourcesResult.items?.[0]?.path).toBe('/');

      const createResource = await client.send(new CreateResourceCommand({
        restApiId: apiId,
        parentId: rootResourceId,
        pathPart: 'items',
      }));
      expect(createResource.pathPart).toBe('items');
      expect(createResource.path).toBe('/items');

      const resourcesAfter = await client.send(new GetResourcesCommand({ restApiId: apiId }));
      expect(resourcesAfter.items?.length).toBe(2);

      const createDeployment = await client.send(new CreateDeploymentCommand({
        restApiId: apiId,
        description: 'test deployment',
      }));
      expect(createDeployment.id).toBeTruthy();
      const deploymentId = createDeployment.id!;

      const deploymentsResult = await client.send(new GetDeploymentsCommand({ restApiId: apiId }));
      expect(deploymentsResult.items?.some(d => d.id === deploymentId)).toBe(true);

      const createStage = await client.send(new CreateStageCommand({
        restApiId: apiId,
        stageName: 'prod',
        deploymentId,
      }));
      expect(createStage.stageName).toBe('prod');

      const stagesResult = await client.send(new GetStagesCommand({ restApiId: apiId }));
      expect(stagesResult.item?.some(s => s.stageName === 'prod')).toBe(true);
    } finally {
      await client.send(new DeleteRestApiCommand({ restApiId: apiId }));
    }
  });

  test('DeleteRestApi on nonexistent API returns NotFoundException', async () => {
    try {
      await client.send(new DeleteRestApiCommand({ restApiId: 'nonexistent-api-crud-xyz' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('NotFoundException');
    }
  });
});
