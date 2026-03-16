import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { createIdentityProvider, identityProviders } from '../../../cognito-idp/index.js';

export const cognitoUserPoolIdentityProviderProvider: ResourceProvider = {
  type: 'AWS::Cognito::UserPoolIdentityProvider',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const providerName = (properties.ProviderName as string) ?? `${context.stackName}-${logicalId}`;
    const userPoolId = properties.UserPoolId as string;

    createIdentityProvider(
      userPoolId,
      providerName,
      (properties.ProviderType as string) ?? 'OIDC',
      (properties.ProviderDetails as Record<string, string>) ?? {},
      properties.AttributeMapping as Record<string, string> | undefined,
    );

    return {
      physicalId: `${userPoolId}/${providerName}`,
      attributes: {
        ProviderName: providerName,
      },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const providerName = physicalId.split('/').pop() ?? physicalId;
    const userPoolId = physicalId.split('/')[0] ?? '';

    identityProviders.set(physicalId, {
      ProviderName: providerName,
      ProviderType: (properties.ProviderType as string) ?? 'OIDC',
      UserPoolId: userPoolId,
      ProviderDetails: (properties.ProviderDetails as Record<string, string>) ?? {},
      AttributeMapping: properties.AttributeMapping as Record<string, string> | undefined,
    });

    return {
      physicalId,
      attributes: {
        ProviderName: providerName,
      },
    };
  },
  delete(physicalId: string): void {
    identityProviders.delete(physicalId);
  },
};
