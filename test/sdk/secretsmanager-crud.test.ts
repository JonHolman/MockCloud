import { describe, test, expect } from 'vitest';
import {
  CreateSecretCommand,
  GetSecretValueCommand,
  DescribeSecretCommand,
  UpdateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient } from './client-factory.js';

describe('SecretsManager CRUD', () => {
  const client = createSecretsManagerClient();

  test('Full secret lifecycle: create, get, update, delete', async () => {
    const secretName = `test-secret-${Date.now()}`;

    const createResult = await client.send(new CreateSecretCommand({
      Name: secretName,
      SecretString: 'initial-value',
      Description: 'test secret',
    }));
    expect(createResult.ARN).toContain(secretName);
    expect(createResult.Name).toBe(secretName);
    expect(createResult.VersionId).toBeTruthy();

    const getResult = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
    expect(getResult.SecretString).toBe('initial-value');
    expect(getResult.Name).toBe(secretName);
    expect(getResult.VersionId).toBeTruthy();

    const describeResult = await client.send(new DescribeSecretCommand({ SecretId: secretName }));
    expect(describeResult.Name).toBe(secretName);
    expect(describeResult.ARN).toContain(secretName);

    const updateResult = await client.send(new UpdateSecretCommand({
      SecretId: secretName,
      SecretString: 'updated-value',
    }));
    expect(updateResult.Name).toBe(secretName);
    expect(updateResult.VersionId).toBeTruthy();
    expect(updateResult.VersionId).not.toBe(createResult.VersionId);

    const getAfterUpdate = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
    expect(getAfterUpdate.SecretString).toBe('updated-value');

    const listResult = await client.send(new ListSecretsCommand({}));
    expect(listResult.SecretList?.some(s => s.Name === secretName)).toBe(true);

    await client.send(new DeleteSecretCommand({ SecretId: secretName }));

    try {
      await client.send(new GetSecretValueCommand({ SecretId: secretName }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });

  test('CreateSecret rejects duplicate names', async () => {
    const secretName = `test-dup-secret-${Date.now()}`;

    await client.send(new CreateSecretCommand({
      Name: secretName,
      SecretString: 'value1',
    }));

    try {
      await client.send(new CreateSecretCommand({
        Name: secretName,
        SecretString: 'value2',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceExistsException');
    } finally {
      await client.send(new DeleteSecretCommand({ SecretId: secretName }));
    }
  });

  test('PutSecretValue updates the secret value and version', async () => {
    const secretName = `test-put-secret-${Date.now()}`;

    const createResult = await client.send(new CreateSecretCommand({
      Name: secretName,
      SecretString: 'original',
    }));

    try {
      const putResult = await client.send(new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: 'replaced',
      }));
      expect(putResult.VersionId).toBeTruthy();
      expect(putResult.VersionId).not.toBe(createResult.VersionId);

      const getResult = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
      expect(getResult.SecretString).toBe('replaced');
    } finally {
      await client.send(new DeleteSecretCommand({ SecretId: secretName }));
    }
  });

  test('UpdateSecret with only Description updates metadata without creating a new version', async () => {
    const secretName = `test-description-secret-${Date.now()}`;

    const createResult = await client.send(new CreateSecretCommand({
      Name: secretName,
      SecretString: 'original',
      Description: 'before',
    }));

    try {
      const beforeValue = await client.send(new GetSecretValueCommand({ SecretId: secretName }));

      const updateResult = await client.send(new UpdateSecretCommand({
        SecretId: secretName,
        Description: 'after',
      }));

      const afterValue = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
      const afterDescribe = await client.send(new DescribeSecretCommand({ SecretId: secretName }));

      expect(updateResult.Name).toBe(secretName);
      expect(updateResult.VersionId).toBeUndefined();
      expect(afterValue.VersionId).toBe(beforeValue.VersionId);
      expect(afterValue.VersionId).toBe(createResult.VersionId);
      expect(afterDescribe.Description).toBe('after');
      expect(Object.keys(afterDescribe.VersionIdsToStages ?? {})).toHaveLength(1);
    } finally {
      await client.send(new DeleteSecretCommand({ SecretId: secretName }));
    }
  });

  test('UpdateSecret on nonexistent secret returns ResourceNotFoundException', async () => {
    try {
      await client.send(new UpdateSecretCommand({
        SecretId: 'nonexistent-secret-update-xyz',
        SecretString: 'value',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });

  test('DeleteSecret on nonexistent secret returns ResourceNotFoundException', async () => {
    try {
      await client.send(new DeleteSecretCommand({
        SecretId: 'nonexistent-secret-delete-xyz',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });
});
