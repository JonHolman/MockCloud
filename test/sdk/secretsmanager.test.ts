import { describe, test, expect } from 'vitest';
import { ListSecretsCommand, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient } from './client-factory.js';

describe('SecretsManager', () => {
  const client = createSecretsManagerClient();

  test('ListSecrets returns an array', async () => {
    const result = await client.send(new ListSecretsCommand({}));
    expect(result.SecretList).toBeDefined();
    expect(Array.isArray(result.SecretList)).toBe(true);
  });

  test('GetSecretValue on nonexistent secret returns ResourceNotFoundException', async () => {
    try {
      await client.send(new GetSecretValueCommand({ SecretId: 'nonexistent-secret-xyz' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });
});
