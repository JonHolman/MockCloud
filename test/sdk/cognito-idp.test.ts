import { describe, test, expect } from 'vitest';
import {
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  CreateUserPoolClientCommand,
  ListUserPoolsCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  DeleteUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { createCognitoIdpClient } from './client-factory.js';

describe('CognitoIDP', () => {
  const client = createCognitoIdpClient();

  test('CRUD lifecycle', async () => {
    const poolName = `test-pool-${Date.now()}`;

    const createPoolResult = await client.send(new CreateUserPoolCommand({
      PoolName: poolName,
    }));
    const poolId = createPoolResult.UserPool?.Id;
    expect(poolId).toBeTruthy();
    expect(createPoolResult.UserPool?.Name).toBe(poolName);

    const describeResult = await client.send(new DescribeUserPoolCommand({
      UserPoolId: poolId,
    }));
    expect(describeResult.UserPool?.Id).toBe(poolId);
    expect(describeResult.UserPool?.Name).toBe(poolName);

    const createClientResult = await client.send(new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientName: 'test-client',
    }));
    expect(createClientResult.UserPoolClient).toBeTruthy();
    expect(createClientResult.UserPoolClient!.ClientId).toBeTruthy();

    const listResult = await client.send(new ListUserPoolsCommand({
      MaxResults: 10,
    }));
    expect(Array.isArray(listResult.UserPools)).toBe(true);
    expect(listResult.UserPools!.some(p => p.Id === poolId)).toBe(true);

    const createUserResult = await client.send(new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: 'testuser@example.com',
    }));
    expect(createUserResult.User).toBeTruthy();
    expect(createUserResult.User!.Username).toBe('testuser@example.com');

    const getUserResult = await client.send(new AdminGetUserCommand({
      UserPoolId: poolId,
      Username: 'testuser@example.com',
    }));
    expect(getUserResult.Username).toBe('testuser@example.com');

    await client.send(new DeleteUserPoolCommand({
      UserPoolId: poolId,
    }));
  });

  test('DescribeUserPool on nonexistent pool returns ResourceNotFoundException', async () => {
    try {
      await client.send(new DescribeUserPoolCommand({
        UserPoolId: 'nonexistent-pool',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });
});
