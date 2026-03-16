import { randomUUID } from 'node:crypto';
import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { pools as identityPools, type IdentityPool } from '../../../cognito-identity/index.js';

export const cognitoIdentityPoolProvider: ResourceProvider = {
  type: 'AWS::Cognito::IdentityPool',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const name = (properties.IdentityPoolName as string) ?? `${context.stackName}-${logicalId}`;
    const allowUnauth = (properties.AllowUnauthenticatedIdentities as boolean) ?? false;
    const id = `${context.region}:${randomUUID()}`;

    const pool: IdentityPool = {
      id,
      name,
      allowUnauthenticatedIdentities: allowUnauth,
      roles: {},
      roleMappings: {},
      creationDate: new Date().toISOString(),
    };

    identityPools.set(id, pool);

    return {
      physicalId: id,
      attributes: {
        IdentityPoolId: id,
        Name: name,
      },
    };
  },
  update(physicalId: string, logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const name = (properties.IdentityPoolName as string) ?? `${context.stackName}-${logicalId}`;
    const allowUnauth = (properties.AllowUnauthenticatedIdentities as boolean) ?? false;
    const existing = identityPools.get(physicalId);
    if (existing) {
      existing.name = name;
      existing.allowUnauthenticatedIdentities = allowUnauth;
      identityPools.set(physicalId, existing);
    }
    return {
      physicalId,
      attributes: {
        IdentityPoolId: physicalId,
        Name: name,
      },
    };
  },
  delete(physicalId: string): void {
    identityPools.delete(physicalId);
  },
};
