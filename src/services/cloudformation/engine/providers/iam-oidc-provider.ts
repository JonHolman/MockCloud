import type { ResourceProvider, ProvisionResult } from '../types.js';
import { oidcProviderArn, logOidcNoOp } from '../../../iam/types.js';

export const iamOidcProviderProvider: ResourceProvider = {
  type: 'AWS::IAM::OIDCProvider',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const url = properties.Url as string;
    const arn = oidcProviderArn(url);
    logOidcNoOp(url);

    return {
      physicalId: arn,
      attributes: { Arn: arn },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    logOidcNoOp(properties.Url as string);
    return {
      physicalId,
      attributes: { Arn: physicalId },
    };
  },
  delete(_physicalId: string): void {},
};
