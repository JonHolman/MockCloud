import { describe, test, expect } from 'vitest';
import { ListUsersCommand, ListRolesCommand, GetRoleCommand } from '@aws-sdk/client-iam';
import { createIAMClient } from './client-factory.js';

describe('IAM', () => {
  const client = createIAMClient();

  test('ListUsers returns an array', async () => {
    const result = await client.send(new ListUsersCommand({}));
    expect(result.Users).toBeDefined();
    expect(Array.isArray(result.Users)).toBe(true);
  });

  test('ListRoles returns an array', async () => {
    const result = await client.send(new ListRolesCommand({}));
    expect(result.Roles).toBeDefined();
    expect(Array.isArray(result.Roles)).toBe(true);
  });

  test('GetRole on nonexistent role returns NoSuchEntity', async () => {
    try {
      await client.send(new GetRoleCommand({ RoleName: 'nonexistent-role-xyz' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('NoSuchEntityException');
    }
  });
});
