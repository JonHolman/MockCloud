import { describe, test, expect } from 'vitest';
import {
  CreateIdentityPoolCommand,
  DescribeIdentityPoolCommand,
  ListIdentityPoolsCommand,
  DeleteIdentityPoolCommand,
} from '@aws-sdk/client-cognito-identity';
import { createCognitoIdentityClient } from './client-factory.js';

describe('CognitoIdentity', () => {
  const client = createCognitoIdentityClient();

  test('CRUD lifecycle', async () => {
    const poolName = `test-id-pool-${Date.now()}`;

    const createResult = await client.send(new CreateIdentityPoolCommand({
      IdentityPoolName: poolName,
      AllowUnauthenticatedIdentities: true,
    }));
    const poolId = createResult.IdentityPoolId;
    expect(poolId).toBeTruthy();
    expect(createResult.IdentityPoolName).toBe(poolName);

    const describeResult = await client.send(new DescribeIdentityPoolCommand({
      IdentityPoolId: poolId,
    }));
    expect(describeResult.IdentityPoolId).toBe(poolId);
    expect(describeResult.IdentityPoolName).toBe(poolName);
    expect(describeResult.AllowUnauthenticatedIdentities).toBe(true);

    const listResult = await client.send(new ListIdentityPoolsCommand({
      MaxResults: 10,
    }));
    expect(Array.isArray(listResult.IdentityPools)).toBe(true);
    expect(listResult.IdentityPools!.some(p => p.IdentityPoolId === poolId)).toBe(true);

    await client.send(new DeleteIdentityPoolCommand({
      IdentityPoolId: poolId,
    }));
  });

  test('DescribeIdentityPool on nonexistent pool returns ResourceNotFoundException', async () => {
    try {
      await client.send(new DescribeIdentityPoolCommand({
        IdentityPoolId: 'nonexistent-pool',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });
});
