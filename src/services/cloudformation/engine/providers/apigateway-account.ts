import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { setApiGatewayAccount, gatewayResponses } from '../../../apigateway/index.js';

export const apigatewayAccountProvider: ResourceProvider = {
  type: 'AWS::ApiGateway::Account',
  create(_logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    setApiGatewayAccount({ cloudwatchRoleArn: properties.CloudWatchRoleArn as string });
    return { physicalId: `${context.stackName}-ApiGatewayAccount`, attributes: {} };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    setApiGatewayAccount({ cloudwatchRoleArn: properties.CloudWatchRoleArn as string });
    return { physicalId, attributes: {} };
  },
  delete(): void {
    setApiGatewayAccount({});
  },
};

export const apigatewayGatewayResponseProvider: ResourceProvider = {
  type: 'AWS::ApiGateway::GatewayResponse',
  create(_logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const RestApiId = properties.RestApiId as string;
    const ResponseType = properties.ResponseType as string;
    const key = `${RestApiId}/${ResponseType}`;
    gatewayResponses.set(key, {
      apiId: RestApiId,
      responseType: ResponseType,
      statusCode: properties.StatusCode as string | undefined,
      responseParameters: properties.ResponseParameters as Record<string, string> | undefined,
      responseTemplates: properties.ResponseTemplates as Record<string, string> | undefined,
    });
    return { physicalId: key, attributes: {} };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const RestApiId = properties.RestApiId as string;
    const ResponseType = properties.ResponseType as string;
    gatewayResponses.set(physicalId, {
      apiId: RestApiId,
      responseType: ResponseType,
      statusCode: properties.StatusCode as string | undefined,
      responseParameters: properties.ResponseParameters as Record<string, string> | undefined,
      responseTemplates: properties.ResponseTemplates as Record<string, string> | undefined,
    });
    return { physicalId, attributes: {} };
  },
  delete(physicalId: string): void {
    gatewayResponses.delete(physicalId);
  },
};

