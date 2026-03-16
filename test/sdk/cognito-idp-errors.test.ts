import { describe, test, expect } from 'vitest';
import {
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CreateUserPoolClientCommand,
  DescribeUserPoolClientCommand,
  ListUserPoolClientsCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { createCognitoIdpClient } from './client-factory.js';

describe('CognitoIDP error paths and extended operations', () => {
  const client = createCognitoIdpClient();

  test('AdminCreateUser rejects duplicate usernames', async () => {
    const createPool = await client.send(new CreateUserPoolCommand({ PoolName: `dup-user-pool-${Date.now()}` }));
    const poolId = createPool.UserPool!.Id!;

    try {
      await client.send(new AdminCreateUserCommand({ UserPoolId: poolId, Username: 'duplicate@test.com' }));

      await client.send(new AdminCreateUserCommand({ UserPoolId: poolId, Username: 'duplicate@test.com' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('UsernameExistsException');
    } finally {
      await client.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
    }
  });

  test('AdminGetUser on nonexistent user returns UserNotFoundException', async () => {
    const createPool = await client.send(new CreateUserPoolCommand({ PoolName: `no-user-pool-${Date.now()}` }));
    const poolId = createPool.UserPool!.Id!;

    try {
      await client.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: 'nonexistent@test.com' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('UserNotFoundException');
    } finally {
      await client.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
    }
  });

  test('DeleteUserPool on nonexistent pool returns ResourceNotFoundException', async () => {
    try {
      await client.send(new DeleteUserPoolCommand({ UserPoolId: 'nonexistent-pool-id' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });

  test('AdminCreateUser on nonexistent pool returns ResourceNotFoundException', async () => {
    try {
      await client.send(new AdminCreateUserCommand({
        UserPoolId: 'nonexistent-pool-id',
        Username: 'user@test.com',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });

  test('DescribeUserPoolClient returns client details', async () => {
    const createPool = await client.send(new CreateUserPoolCommand({ PoolName: `client-pool-${Date.now()}` }));
    const poolId = createPool.UserPool!.Id!;

    try {
      const createClient = await client.send(new CreateUserPoolClientCommand({
        UserPoolId: poolId,
        ClientName: 'test-client',
      }));
      const clientId = createClient.UserPoolClient!.ClientId!;

      const describeResult = await client.send(new DescribeUserPoolClientCommand({
        UserPoolId: poolId,
        ClientId: clientId,
      }));
      expect(describeResult.UserPoolClient?.ClientId).toBe(clientId);
      expect(describeResult.UserPoolClient?.ClientName).toBe('test-client');
    } finally {
      await client.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
    }
  });

  test('ListUserPoolClients returns clients for a pool', async () => {
    const createPool = await client.send(new CreateUserPoolCommand({ PoolName: `list-clients-pool-${Date.now()}` }));
    const poolId = createPool.UserPool!.Id!;

    try {
      await client.send(new CreateUserPoolClientCommand({ UserPoolId: poolId, ClientName: 'client-a' }));
      await client.send(new CreateUserPoolClientCommand({ UserPoolId: poolId, ClientName: 'client-b' }));

      const listResult = await client.send(new ListUserPoolClientsCommand({ UserPoolId: poolId }));
      expect(listResult.UserPoolClients?.length).toBe(2);
    } finally {
      await client.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
    }
  });

  test('ListUsers returns users in a pool', async () => {
    const createPool = await client.send(new CreateUserPoolCommand({ PoolName: `list-users-pool-${Date.now()}` }));
    const poolId = createPool.UserPool!.Id!;

    try {
      await client.send(new AdminCreateUserCommand({ UserPoolId: poolId, Username: 'user1@test.com' }));
      await client.send(new AdminCreateUserCommand({ UserPoolId: poolId, Username: 'user2@test.com' }));

      const listResult = await client.send(new ListUsersCommand({ UserPoolId: poolId }));
      expect(listResult.Users?.length).toBe(2);
      expect(listResult.Users?.map(u => u.Username).sort()).toEqual(['user1@test.com', 'user2@test.com']);
    } finally {
      await client.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
    }
  });
});
