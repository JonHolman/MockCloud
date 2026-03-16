import type { ResourceProvider, ProvisionResult } from '../types.js';
import { getOidcProvidersStore, createOidcProvider } from '../../../iam/types.js';

export const iamOidcProviderProvider: ResourceProvider = {
  type: 'AWS::IAM::OIDCProvider',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const provider = createOidcProvider(
      properties.Url as string,
      (properties.ClientIdList as string[]) ?? [],
      (properties.ThumbprintList as string[]) ?? [],
    );

    return {
      physicalId: provider.Arn,
      attributes: { Arn: provider.Arn },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const store = getOidcProvidersStore();
    const existing = store.get(physicalId);
    if (existing) {
      existing.ClientIDList = (properties.ClientIdList as string[]) ?? existing.ClientIDList;
      existing.ThumbprintList = (properties.ThumbprintList as string[]) ?? existing.ThumbprintList;
      store.set(physicalId, existing);
    }

    return {
      physicalId,
      attributes: { Arn: physicalId },
    };
  },
  delete(physicalId: string): void {
    getOidcProvidersStore().delete(physicalId);
  },
};
