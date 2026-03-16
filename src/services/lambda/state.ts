import type { FunctionConfiguration } from '@aws-sdk/client-lambda';
import { PersistentMap } from '../../state/store.js';
import type { ApiResponse } from '../../types.js';
import { json, ServiceError } from '../response.js';
import { REGION, ACCOUNT_ID } from '../../config.js';

export { json };
export type { FunctionConfiguration };

export interface StoredFunction {
  functionName: string;
  functionArn: string;
  runtime: string;
  role: string;
  handler: string;
  codeSize: number;
  description: string;
  timeout: number;
  memorySize: number;
  lastModified: string;
  codeSha256: string;
  version: string;
  environment: { Variables: Record<string, string> };
  state: string;
  lastUpdateStatus: string;
  tags: Record<string, string>;
  s3Bucket?: string;
  s3Key?: string;
}

export interface StoredEventInvokeConfig {
  functionName: string;
  qualifier: string;
  functionArn: string;
  maximumRetryAttempts?: number;
  maximumEventAgeInSeconds?: number;
  destinationConfig?: Record<string, unknown>;
  lastModified: string;
}

export interface StoredPermission {
  id: string;
  functionName: string;
  functionArn: string;
  action: string;
  principal: string;
  sourceArn?: string;
  sourceAccount?: string;
  eventSourceToken?: string;
  functionUrlAuthType?: string;
  principalOrgId?: string;
}

export interface StoredEventSourceMapping {
  uuid: string;
  functionName: string;
  functionArn: string;
  eventSourceArn?: string;
  batchSize?: number;
  enabled: boolean;
  state: string;
  lastModified: string;
  startingPosition?: string;
}

export const functions = new PersistentMap<string, StoredFunction>('lambda-functions');
export const publishedVersions = new PersistentMap<string, StoredFunction>('lambda-published-versions');
export const eventInvokeConfigs = new PersistentMap<string, StoredEventInvokeConfig>('lambda-event-invoke-configs');
export const permissions = new PersistentMap<string, StoredPermission>('lambda-permissions');
export const eventSourceMappings = new PersistentMap<string, StoredEventSourceMapping>('lambda-event-source-mappings');

export const FAKE_CODE_SHA256 = '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=';

export function errorResponse(code: string, message: string, statusCode: number): ApiResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ __type: code, Message: message }),
  };
}

export function resourceNotFound(message: string): ApiResponse {
  return errorResponse('ResourceNotFoundException', message, 404);
}

export function invalidParameter(message: string): ApiResponse {
  return errorResponse('InvalidParameterValueException', message, 400);
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function makeFunctionArn(name: string): string {
  return `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${name}`;
}

export function makeQualifiedFunctionArn(name: string, qualifier: string): string {
  return `${makeFunctionArn(name)}:${qualifier}`;
}

/**
 * Resolve a function identifier to a plain function name.
 * Accepts: plain name, full ARN, or versioned ARN (with :qualifier suffix).
 */
export function resolveFunctionName(identifier: string): string {
  if (!identifier.startsWith('arn:')) return identifier;
  // ARN format: arn:aws:lambda:region:account:function:name[:qualifier]
  const parts = identifier.split(':');
  // parts[6] is the function name, parts[7] (if present) is the qualifier
  return parts[6] ?? identifier;
}

export function resolveFunctionTarget(
  identifier: string,
  explicitQualifier?: string,
): { functionName: string; qualifier: string } {
  if (explicitQualifier) {
    return {
      functionName: resolveFunctionName(identifier),
      qualifier: explicitQualifier,
    };
  }

  if (!identifier.startsWith('arn:')) {
    const qualifierIdx = identifier.indexOf(':');
    if (qualifierIdx >= 0) {
      return {
        functionName: identifier.slice(0, qualifierIdx),
        qualifier: identifier.slice(qualifierIdx + 1),
      };
    }
    return {
      functionName: identifier,
      qualifier: '$LATEST',
    };
  }

  const parts = identifier.split(':');
  return {
    functionName: parts[6] ?? identifier,
    qualifier: parts[7] ?? '$LATEST',
  };
}

export function lambdaVersionKey(functionName: string, version: string): string {
  return `${functionName}:${version}`;
}

export function lambdaEventInvokeConfigKey(functionName: string, qualifier: string): string {
  return `${functionName}:${qualifier}`;
}

export function deleteFunctionState(functionName: string): void {
  functions.delete(functionName);

  for (const [key, version] of Array.from(publishedVersions.entries())) {
    if (version.functionName === functionName) {
      publishedVersions.delete(key);
    }
  }

  for (const [key, config] of Array.from(eventInvokeConfigs.entries())) {
    if (config.functionName === functionName) {
      eventInvokeConfigs.delete(key);
    }
  }

  for (const [key, permission] of Array.from(permissions.entries())) {
    if (permission.functionName === functionName) {
      permissions.delete(key);
    }
  }

  for (const [key, mapping] of Array.from(eventSourceMappings.entries())) {
    if (mapping.functionName === functionName) {
      eventSourceMappings.delete(key);
    }
  }
}

export interface CreateFunctionParams {
  functionName: string;
  runtime?: string;
  role?: string;
  handler?: string;
  description?: string;
  timeout?: number;
  memorySize?: number;
  environment?: Record<string, string>;
  tags?: Record<string, string>;
  s3Bucket?: string;
  s3Key?: string;
  codeSize?: number;
}

export function createFunction(params: CreateFunctionParams): StoredFunction {
  if (functions.has(params.functionName)) {
    throw new ServiceError('ResourceConflictException', `Function already exist: ${params.functionName}`, 409);
  }
  const fn: StoredFunction = {
    functionName: params.functionName,
    functionArn: makeFunctionArn(params.functionName),
    runtime: params.runtime ?? 'nodejs18.x',
    role: params.role ?? `arn:aws:iam::${ACCOUNT_ID}:role/lambda-role`,
    handler: params.handler ?? 'index.handler',
    codeSize: params.codeSize ?? 262144,
    description: params.description ?? '',
    timeout: params.timeout ?? 3,
    memorySize: params.memorySize ?? 128,
    lastModified: isoNow(),
    codeSha256: FAKE_CODE_SHA256,
    version: '$LATEST',
    environment: { Variables: params.environment ?? {} },
    state: 'Active',
    lastUpdateStatus: 'Successful',
    tags: params.tags ?? {},
    s3Bucket: params.s3Bucket,
    s3Key: params.s3Key,
  };
  functions.set(params.functionName, fn);
  return fn;
}

export function buildFunctionConfiguration(fn: StoredFunction): FunctionConfiguration {
  return {
    FunctionName: fn.functionName,
    FunctionArn: fn.functionArn,
    Runtime: fn.runtime as FunctionConfiguration['Runtime'],
    Role: fn.role,
    Handler: fn.handler,
    CodeSize: fn.codeSize,
    Description: fn.description,
    Timeout: fn.timeout,
    MemorySize: fn.memorySize,
    LastModified: fn.lastModified,
    CodeSha256: fn.codeSha256,
    Version: fn.version,
    Environment: fn.environment,
    State: fn.state as FunctionConfiguration['State'],
    LastUpdateStatus: fn.lastUpdateStatus as FunctionConfiguration['LastUpdateStatus'],
    RevisionId: 'a1b2c3d4-5678-90ab-cdef-EXAMPLE11111',
    TracingConfig: { Mode: 'PassThrough' },
    Architectures: ['x86_64'],
    PackageType: 'Zip',
    EphemeralStorage: { Size: 512 },
    SnapStart: { ApplyOn: 'None', OptimizationStatus: 'Off' },
    RuntimeVersionConfig: { RuntimeVersionArn: `arn:aws:lambda:${REGION}::runtime:${fn.runtime}` },
    Layers: [],
    VpcConfig: { SubnetIds: [], SecurityGroupIds: [], VpcId: '' },
    LoggingConfig: { LogFormat: 'Text', LogGroup: `/aws/lambda/${fn.functionName}` },
    DeadLetterConfig: {},
  };
}
