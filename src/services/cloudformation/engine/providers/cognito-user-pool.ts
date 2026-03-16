import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { pools, poolClients, poolUsers, createUserPool } from '../../../cognito-idp/index.js';

export const cognitoUserPoolProvider: ResourceProvider = {
  type: 'AWS::Cognito::UserPool',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const name = (properties.UserPoolName as string) ?? `${context.stackName}-${logicalId}`;
    const pool = createUserPool(name);

    return {
      physicalId: pool.id,
      attributes: {
        Arn: pool.arn,
        ProviderName: `cognito-idp.${context.region}.amazonaws.com/${pool.id}`,
        ProviderURL: `https://cognito-idp.${context.region}.amazonaws.com/${pool.id}`,
      },
    };
  },
  update(physicalId: string, logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const name = (properties.UserPoolName as string) ?? `${context.stackName}-${logicalId}`;
    const existing = pools.get(physicalId);
    if (existing) {
      existing.name = name;
      existing.lastModifiedDate = Date.now() / 1000;
      pools.set(physicalId, existing);
    }
    const arn = `arn:aws:cognito-idp:${context.region}:${context.accountId}:userpool/${physicalId}`;
    return {
      physicalId,
      attributes: {
        Arn: arn,
        ProviderName: `cognito-idp.${context.region}.amazonaws.com/${physicalId}`,
        ProviderURL: `https://cognito-idp.${context.region}.amazonaws.com/${physicalId}`,
      },
    };
  },
  delete(physicalId: string): void {
    pools.delete(physicalId);
    poolClients.delete(physicalId);
    poolUsers.delete(physicalId);
  },
};
