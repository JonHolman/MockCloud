import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { pools as identityPools } from '../../../cognito-identity/index.js';

export const cognitoIdentityPoolRoleAttachmentProvider: ResourceProvider = {
  type: 'AWS::Cognito::IdentityPoolRoleAttachment',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const identityPoolId = properties.IdentityPoolId as string;
    const roles = properties.Roles as Record<string, string> | undefined;
    const roleMappings = properties.RoleMappings as Record<string, unknown> | undefined;

    if (identityPoolId) {
      const pool = identityPools.get(identityPoolId);
      if (pool) {
        if (roles) pool.roles = roles;
        if (roleMappings) pool.roleMappings = roleMappings;
        identityPools.set(identityPoolId, pool);
      }
    }

    return {
      physicalId: `${identityPoolId}-role-attachment`,
      attributes: {},
    };
  },
  update(physicalId: string, logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const identityPoolId = properties.IdentityPoolId as string;
    const roles = properties.Roles as Record<string, string> | undefined;
    const roleMappings = properties.RoleMappings as Record<string, unknown> | undefined;
    if (identityPoolId) {
      const pool = identityPools.get(identityPoolId);
      if (pool) {
        if (roles) pool.roles = roles;
        if (roleMappings) pool.roleMappings = roleMappings;
        identityPools.set(identityPoolId, pool);
      }
    }
    return {
      physicalId,
      attributes: {},
    };
  },
  delete(physicalId: string): void {
    const identityPoolId = physicalId.replace(/-role-attachment$/, '');
    const pool = identityPools.get(identityPoolId);
    if (!pool) return;
    pool.roles = {};
    pool.roleMappings = {};
    identityPools.set(identityPoolId, pool);
  },
};
