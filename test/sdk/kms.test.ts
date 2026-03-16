import { describe, test, expect } from 'vitest';
import {
  CreateKeyCommand,
  DescribeKeyCommand,
  ListKeysCommand,
  CreateAliasCommand,
  ListAliasesCommand,
  EncryptCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import { createKMSClient } from './client-factory.js';

describe('KMS', () => {
  const client = createKMSClient();

  test('CRUD lifecycle with encrypt/decrypt', async () => {
    const timestamp = Date.now();

    const createResult = await client.send(new CreateKeyCommand({
      Description: 'test-key',
    }));
    expect(createResult.KeyMetadata).toBeTruthy();
    expect(createResult.KeyMetadata!.KeyId).toBeTruthy();
    const keyId = createResult.KeyMetadata!.KeyId!;

    const describeResult = await client.send(new DescribeKeyCommand({
      KeyId: keyId,
    }));
    expect(describeResult.KeyMetadata).toBeTruthy();
    expect(describeResult.KeyMetadata!.KeyId).toBe(keyId);
    expect(describeResult.KeyMetadata!.Description).toBe('test-key');

    const listResult = await client.send(new ListKeysCommand({}));
    expect(Array.isArray(listResult.Keys)).toBe(true);
    expect(listResult.Keys!.some(k => k.KeyId === keyId)).toBe(true);

    const aliasName = `alias/test-${timestamp}`;
    await client.send(new CreateAliasCommand({
      AliasName: aliasName,
      TargetKeyId: keyId,
    }));

    const aliasResult = await client.send(new ListAliasesCommand({}));
    expect(Array.isArray(aliasResult.Aliases)).toBe(true);
    expect(aliasResult.Aliases!.some(a => a.AliasName === aliasName)).toBe(true);

    const plaintext = Buffer.from('hello');
    const encryptResult = await client.send(new EncryptCommand({
      KeyId: keyId,
      Plaintext: plaintext,
    }));
    expect(encryptResult.CiphertextBlob).toBeTruthy();

    const decryptResult = await client.send(new DecryptCommand({
      CiphertextBlob: encryptResult.CiphertextBlob,
    }));
    expect(decryptResult.Plaintext).toBeTruthy();
    expect(Buffer.from(decryptResult.Plaintext!)).toEqual(plaintext);
  });

  test('DescribeKey on nonexistent key returns NotFoundException', async () => {
    try {
      await client.send(new DescribeKeyCommand({
        KeyId: 'nonexistent-key-xyz',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('NotFoundException');
    }
  });
});
