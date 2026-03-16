import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { keys, aliases, createKey, createAlias } from '../../../kms/index.js';

export const kmsKeyProvider: ResourceProvider = {
  type: 'AWS::KMS::Key',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const key = createKey({
      description: properties.Description as string | undefined,
      keyUsage: properties.KeyUsage as string | undefined,
      keySpec: properties.KeySpec as string | undefined,
      enabled: properties.Enabled as boolean | undefined,
    });

    return {
      physicalId: key.KeyId!,
      attributes: { Arn: key.Arn!, KeyId: key.KeyId! },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const key = keys.get(physicalId);
    if (!key) throw new Error(`KMS Key ${physicalId} not found`);

    key.Description = (properties.Description as string) ?? '';
    key.Enabled = properties.Enabled !== false;
    key.KeyState = key.Enabled ? 'Enabled' : 'Disabled';
    keys.set(physicalId, key);

    return {
      physicalId,
      attributes: { Arn: key.Arn!, KeyId: key.KeyId! },
    };
  },
  delete(physicalId: string): void {
    keys.delete(physicalId);
    for (const [aliasName, keyId] of aliases.entries()) {
      if (keyId === physicalId) {
        aliases.delete(aliasName);
      }
    }
  },
};

export const kmsAliasProvider: ResourceProvider = {
  type: 'AWS::KMS::Alias',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const aliasName = properties.AliasName as string;
    const targetKeyId = properties.TargetKeyId as string;
    createAlias(aliasName, targetKeyId);
    return {
      physicalId: aliasName,
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const targetKeyId = properties.TargetKeyId as string;
    const resolved = keys.get(targetKeyId);
    const actualKeyId = resolved?.KeyId ?? targetKeyId;
    aliases.set(physicalId, actualKeyId);
    return { physicalId, attributes: {} };
  },
  delete(physicalId: string): void {
    aliases.delete(physicalId);
  },
};
