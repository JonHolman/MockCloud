import { describe, test, expect } from 'vitest';
import {
  CreateRestApiCommand,
  GetRestApisCommand,
  GetRestApiCommand,
  DeleteRestApiCommand,
} from '@aws-sdk/client-api-gateway';
import { createAPIGatewayClient } from './client-factory.js';

describe('API Gateway', () => {
  const client = createAPIGatewayClient();

  test('CRUD lifecycle works', async () => {
    const apiName = `test-api-${Date.now()}`;

    const createResult = await client.send(new CreateRestApiCommand({ name: apiName }));
    expect(createResult.id).toBeDefined();

    const listResult = await client.send(new GetRestApisCommand({}));
    const found = listResult.items?.find((api) => api.id === createResult.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe(apiName);

    await client.send(new DeleteRestApiCommand({ restApiId: createResult.id }));
  });

  test('GetRestApi on nonexistent API returns NotFoundException', async () => {
    try {
      await client.send(new GetRestApiCommand({ restApiId: 'nonexistent-api-xyz' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('NotFoundException');
    }
  });
});
