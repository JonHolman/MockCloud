import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { userPoolDomains, pools, createUserPoolDomain } from '../../../cognito-idp/index.js';

export const cognitoUserPoolDomainProvider: ResourceProvider = {
  type: 'AWS::Cognito::UserPoolDomain',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const domain = (properties.Domain as string) ?? `${context.stackName}-${logicalId}`.toLowerCase();
    const userPoolId = properties.UserPoolId as string;

    createUserPoolDomain(domain, userPoolId, properties.CustomDomainConfig);

    return {
      physicalId: domain,
      attributes: {
        DomainName: `${domain}.auth.${context.region}.amazoncognito.com`,
      },
    };
  },
  update(physicalId: string, logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const domain = (properties.Domain as string) ?? physicalId;
    const userPoolId = properties.UserPoolId as string;

    userPoolDomains.set(domain, {
      Domain: domain,
      UserPoolId: userPoolId,
      CustomDomainConfig: properties.CustomDomainConfig,
    });

    const pool = pools.get(userPoolId);
    if (pool) {
      pool.Domain = domain;
      pools.set(userPoolId, pool);
    }

    return {
      physicalId,
      attributes: {
        DomainName: `${domain}.auth.${context.region}.amazoncognito.com`,
      },
    };
  },
  delete(physicalId: string): void {
    const domainEntry = userPoolDomains.get(physicalId);
    if (domainEntry) {
      const pool = pools.get(domainEntry.UserPoolId);
      if (pool) {
        delete pool.Domain;
        pools.set(domainEntry.UserPoolId, pool);
      }
    }
    userPoolDomains.delete(physicalId);
  },
};
