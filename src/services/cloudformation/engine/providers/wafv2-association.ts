import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { webAclAssociations, loggingConfigs } from '../../../wafv2/index.js';

export const wafv2WebAclAssociationProvider: ResourceProvider = {
  type: 'AWS::WAFv2::WebACLAssociation',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const WebACLArn = properties.WebACLArn as string;
    const ResourceArn = properties.ResourceArn as string;
    const physicalId = ResourceArn || `${context.stackName}-${logicalId}-assoc`;
    webAclAssociations.set(physicalId, { WebACLArn, ResourceArn });
    return { physicalId, attributes: {} };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const WebACLArn = properties.WebACLArn as string;
    const ResourceArn = properties.ResourceArn as string;
    webAclAssociations.set(physicalId, { WebACLArn, ResourceArn });
    return { physicalId, attributes: {} };
  },
  delete(physicalId: string): void {
    webAclAssociations.delete(physicalId);
  },
};

export const wafv2LoggingConfigurationProvider: ResourceProvider = {
  type: 'AWS::WAFv2::LoggingConfiguration',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const ResourceArn = properties.ResourceArn as string;
    const LogDestinationConfigs = (properties.LogDestinationConfigs as string[]) || [];
    const physicalId = ResourceArn || `${context.stackName}-${logicalId}-logging`;
    loggingConfigs.set(physicalId, { ResourceArn, LogDestinationConfigs });
    return { physicalId, attributes: {} };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const ResourceArn = properties.ResourceArn as string;
    const LogDestinationConfigs = (properties.LogDestinationConfigs as string[]) || [];
    loggingConfigs.set(physicalId, { ResourceArn, LogDestinationConfigs });
    return { physicalId, attributes: {} };
  },
  delete(physicalId: string): void {
    loggingConfigs.delete(physicalId);
  },
};
