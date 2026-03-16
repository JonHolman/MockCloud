import { randomUUID, randomBytes } from 'node:crypto';
import { defineMockService } from '../service.js';
import type { ApiResponse, ParsedApiRequest } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import { jsonAmz11 as json, errorAmz11 as error, ServiceError } from '../response.js';
import { REGION, ACCOUNT_ID } from '../../config.js';
import type { KeyMetadata } from '@aws-sdk/client-kms';

export type KmsKey = Omit<KeyMetadata, 'CreationDate'> & { CreationDate: string };

export const keys = new PersistentMap<string, KmsKey>('kms-keys');
export const aliases = new PersistentMap<string, string>('kms-aliases');

function resolveKey(keyRef: string): KmsKey | undefined {
  const direct = keys.get(keyRef);
  if (direct) return direct;

  for (const k of keys.values()) {
    if (k.Arn === keyRef) return k;
  }

  if (keyRef.startsWith('alias/')) {
    const targetId = aliases.get(keyRef);
    if (targetId) return keys.get(targetId);
  }

  if (keyRef.startsWith('arn:')) {
    const aliasMatch = keyRef.match(/alias\/(.+)$/);
    if (aliasMatch) {
      const targetId = aliases.get('alias/' + aliasMatch[1]);
      if (targetId) return keys.get(targetId);
    }
  }

  return undefined;
}

export function createKey(params: {
  description?: string;
  keyUsage?: string;
  keySpec?: string;
  enabled?: boolean;
}): KmsKey {
  const keyId = randomUUID();
  const key: KmsKey = {
    KeyId: keyId,
    Arn: `arn:aws:kms:${REGION}:${ACCOUNT_ID}:key/${keyId}`,
    KeyState: (params.enabled === false) ? 'Disabled' : 'Enabled',
    CreationDate: new Date().toISOString(),
    Description: params.description ?? '',
    KeyUsage: (params.keyUsage ?? 'ENCRYPT_DECRYPT') as KmsKey['KeyUsage'],
    KeySpec: (params.keySpec ?? 'SYMMETRIC_DEFAULT') as KmsKey['KeySpec'],
    KeyManager: 'CUSTOMER',
    Enabled: params.enabled !== false,
  };
  keys.set(keyId, key);
  return key;
}

export function createAlias(aliasName: string, targetKeyId: string): void {
  if (aliases.has(aliasName)) {
    throw new ServiceError('AlreadyExistsException', `Alias ${aliasName} already exists.`);
  }
  const k = resolveKey(targetKeyId);
  if (!k) {
    throw new ServiceError('NotFoundException', `Key '${targetKeyId}' does not exist.`, 404);
  }
  aliases.set(aliasName, k.KeyId!);
}

function keyMetadata(k: KmsKey): Record<string, unknown> {
  return {
    AWSAccountId: ACCOUNT_ID,
    KeyId: k.KeyId,
    Arn: k.Arn,
    CreationDate: Math.floor(new Date(k.CreationDate).getTime() / 1000),
    Enabled: k.Enabled,
    Description: k.Description,
    KeyUsage: k.KeyUsage,
    KeyState: k.KeyState,
    KeySpec: k.KeySpec,
    CustomerMasterKeySpec: k.KeySpec,
    KeyManager: k.KeyManager,
    Origin: 'AWS_KMS',
    MultiRegion: false,
  };
}

function CreateKey(req: ParsedApiRequest): ApiResponse {
  const { Description, KeyUsage, KeySpec } = req.body as {
    Description?: string;
    KeyUsage?: string;
    KeySpec?: string;
  };
  const key = createKey({ description: Description, keyUsage: KeyUsage, keySpec: KeySpec });
  return json({ KeyMetadata: keyMetadata(key) });
}

function DescribeKey(req: ParsedApiRequest): ApiResponse {
  const { KeyId } = req.body as { KeyId?: string };
  if (!KeyId) return error('ValidationException', 'KeyId is required');
  const k = resolveKey(KeyId);
  if (!k) return error('NotFoundException', `Key '${KeyId}' does not exist.`, 404);
  return json({ KeyMetadata: keyMetadata(k) });
}

function ListKeys(): ApiResponse {
  const result = Array.from(keys.values()).map((k) => ({
    KeyId: k.KeyId,
    KeyArn: k.Arn,
  }));
  return json({ Keys: result, Truncated: false });
}

function CreateAlias(req: ParsedApiRequest): ApiResponse {
  const { AliasName, TargetKeyId } = req.body as { AliasName?: string; TargetKeyId?: string };
  if (!AliasName) return error('ValidationException', 'AliasName is required');
  if (!TargetKeyId) return error('ValidationException', 'TargetKeyId is required');
  if (!AliasName.startsWith('alias/')) return error('ValidationException', 'AliasName must start with alias/');
  try {
    createAlias(AliasName, TargetKeyId);
    return json({});
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function DeleteAlias(req: ParsedApiRequest): ApiResponse {
  const { AliasName } = req.body as { AliasName?: string };
  if (!AliasName) return error('ValidationException', 'AliasName is required');
  if (!aliases.has(AliasName)) return error('NotFoundException', `Alias '${AliasName}' is not found.`, 404);
  aliases.delete(AliasName);
  return json({});
}

function ListAliases(): ApiResponse {
  const result = Array.from(aliases.entries()).map(([name, keyId]) => ({
    AliasName: name,
    AliasArn: `arn:aws:kms:${REGION}:${ACCOUNT_ID}:${name}`,
    TargetKeyId: keyId,
  }));
  return json({ Aliases: result, Truncated: false });
}

function EnableKey(req: ParsedApiRequest): ApiResponse {
  const { KeyId } = req.body as { KeyId?: string };
  if (!KeyId) return error('ValidationException', 'KeyId is required');
  const k = resolveKey(KeyId);
  if (!k) return error('NotFoundException', `Key '${KeyId}' does not exist.`, 404);
  k.KeyState = 'Enabled';
  k.Enabled = true;
  keys.set(k.KeyId!, k);
  return json({});
}

function DisableKey(req: ParsedApiRequest): ApiResponse {
  const { KeyId } = req.body as { KeyId?: string };
  if (!KeyId) return error('ValidationException', 'KeyId is required');
  const k = resolveKey(KeyId);
  if (!k) return error('NotFoundException', `Key '${KeyId}' does not exist.`, 404);
  k.KeyState = 'Disabled';
  k.Enabled = false;
  keys.set(k.KeyId!, k);
  return json({});
}

function Encrypt(req: ParsedApiRequest): ApiResponse {
  const { KeyId, Plaintext } = req.body as { KeyId?: string; Plaintext?: string };
  if (!KeyId) return error('ValidationException', 'KeyId is required');
  if (!Plaintext) return error('ValidationException', 'Plaintext is required');
  const k = resolveKey(KeyId);
  if (!k) return error('NotFoundException', `Key '${KeyId}' does not exist.`, 404);
  if (!k.Enabled) return error('DisabledException', `Key '${k.KeyId}' is disabled.`);

  const plaintextBytes = Buffer.from(Plaintext, 'base64');
  const prefixed = Buffer.concat([Buffer.from(`encrypted:${k.KeyId}:`), plaintextBytes]);
  const ciphertextBlob = prefixed.toString('base64');

  return json({
    CiphertextBlob: ciphertextBlob,
    KeyId: k.Arn,
    EncryptionAlgorithm: 'SYMMETRIC_DEFAULT',
  });
}

function Decrypt(req: ParsedApiRequest): ApiResponse {
  const { CiphertextBlob } = req.body as { CiphertextBlob?: string };
  if (!CiphertextBlob) return error('ValidationException', 'CiphertextBlob is required');

  const decoded = Buffer.from(CiphertextBlob, 'base64').toString('utf-8');
  const match = decoded.match(/^encrypted:([^:]+):([\s\S]*)$/);
  if (!match) return error('InvalidCiphertextException', 'The ciphertext is invalid.');

  const keyId = match[1];
  const k = keys.get(keyId);
  if (!k) return error('NotFoundException', `Key '${keyId}' does not exist.`, 404);

  const originalPlaintext = decoded.slice(`encrypted:${keyId}:`.length);
  const plaintextBase64 = Buffer.from(originalPlaintext, 'utf-8').toString('base64');

  return json({
    Plaintext: plaintextBase64,
    KeyId: k.Arn,
    EncryptionAlgorithm: 'SYMMETRIC_DEFAULT',
  });
}

function GenerateDataKey(req: ParsedApiRequest): ApiResponse {
  const { KeyId, KeySpec: spec } = req.body as { KeyId?: string; KeySpec?: string };
  if (!KeyId) return error('ValidationException', 'KeyId is required');
  const k = resolveKey(KeyId);
  if (!k) return error('NotFoundException', `Key '${KeyId}' does not exist.`, 404);
  if (!k.Enabled) return error('DisabledException', `Key '${k.KeyId}' is disabled.`);

  const keyLength = spec === 'AES_128' ? 16 : 32;
  const plaintextBytes = randomBytes(keyLength);
  const plaintextBase64 = plaintextBytes.toString('base64');

  const prefixed = Buffer.concat([Buffer.from(`encrypted:${k.KeyId}:`), plaintextBytes]);
  const ciphertextBase64 = prefixed.toString('base64');

  return json({
    CiphertextBlob: ciphertextBase64,
    Plaintext: plaintextBase64,
    KeyId: k.Arn,
  });
}

function GetKeyPolicy(req: ParsedApiRequest): ApiResponse {
  const { KeyId } = req.body as { KeyId?: string };
  if (!KeyId) return error('ValidationException', 'KeyId is required');
  const k = resolveKey(KeyId);
  if (!k) return error('NotFoundException', `Key '${KeyId}' does not exist.`, 404);
  return json({
    Policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { AWS: '*' }, Action: 'kms:*', Resource: '*' }],
    }),
  });
}

function ListGrants(req: ParsedApiRequest): ApiResponse {
  const { KeyId } = req.body as { KeyId?: string };
  if (!KeyId) return error('ValidationException', 'KeyId is required');
  const k = resolveKey(KeyId);
  if (!k) return error('NotFoundException', `Key '${KeyId}' does not exist.`, 404);
  return json({ Grants: [], Truncated: false });
}

function GetKeyRotationStatus(req: ParsedApiRequest): ApiResponse {
  const { KeyId } = req.body as { KeyId?: string };
  if (!KeyId) return error('ValidationException', 'KeyId is required');
  const k = resolveKey(KeyId);
  if (!k) return error('NotFoundException', `Key '${KeyId}' does not exist.`, 404);
  return json({ KeyRotationEnabled: false });
}

function ListResourceTags(req: ParsedApiRequest): ApiResponse {
  const { KeyId } = req.body as { KeyId?: string };
  if (!KeyId) return error('ValidationException', 'KeyId is required');
  const k = resolveKey(KeyId);
  if (!k) return error('NotFoundException', `Key '${KeyId}' does not exist.`, 404);
  return json({ Tags: [], Truncated: false });
}

export const kmsService = defineMockService({
  name: 'kms',
  hostPatterns: ['kms.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'TrentService',
  signingName: 'kms',
  handlers: {
    CreateKey,
    DescribeKey,
    ListKeys,
    CreateAlias,
    DeleteAlias,
    ListAliases,
    EnableKey,
    DisableKey,
    Encrypt,
    Decrypt,
    GenerateDataKey,
    GetKeyPolicy,
    ListGrants,
    GetKeyRotationStatus,
    ListResourceTags,
    _default: () => json({}),
  },
});
