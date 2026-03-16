import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { putParameter, deleteParameter } from '../../../ssm/index.js';
import { ServiceError } from '../../../response.js';

export const ssmParameterProvider: ResourceProvider = {
  type: 'AWS::SSM::Parameter',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const name = (properties.Name as string) ?? `/${context.stackName}/${logicalId}`;
    const type = (properties.Type as string) ?? 'String';
    const value = properties.Value as string;

    putParameter({
      name,
      value,
      type: type as 'String' | 'SecureString' | 'StringList',
      overwrite: true,
      description: (properties.Description as string) ?? '',
      dataType: (properties.DataType as string) ?? 'text',
    });

    return {
      physicalId: name,
      attributes: { Type: type, Value: value },
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const type = (properties.Type as string) ?? 'String';
    const value = properties.Value as string;

    putParameter({
      name: physicalId,
      value,
      type: type as 'String' | 'SecureString' | 'StringList',
      overwrite: true,
      description: (properties.Description as string) ?? '',
      dataType: (properties.DataType as string) ?? 'text',
    });

    return {
      physicalId,
      attributes: { Type: type, Value: value },
    };
  },
  delete(physicalId: string): void {
    try {
      deleteParameter(physicalId);
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    }
  },
};
