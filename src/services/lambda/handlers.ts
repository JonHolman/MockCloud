import type {
  InvocationType,
  CreateFunctionCommandInput,
  UpdateFunctionCodeCommandInput,
  UpdateFunctionConfigurationCommandInput,
  FunctionEventInvokeConfig,
} from '@aws-sdk/client-lambda';
import type { ParsedApiRequest, ApiResponse } from '../../types.js';
import {
  functions,
  publishedVersions,
  eventInvokeConfigs,
  permissions,
  eventSourceMappings,
  json,
  errorResponse,
  resourceNotFound,
  isoNow,
  lambdaEventInvokeConfigKey,
  deleteFunctionState,
  resolveFunctionTarget,
  resolveFunctionName,
  buildFunctionConfiguration,
  createFunction,
} from './state.js';
import { ServiceError } from '../response.js';
import { executeLambdaHandler } from './executor.js';
import { REGION, ACCOUNT_ID } from '../../config.js';

function getInvocationType(req: ParsedApiRequest): InvocationType {
  const requested = req.headers['x-amz-invocation-type'] ?? req.queryParams['InvocationType'] ?? 'RequestResponse';
  if (requested === 'Event' || requested === 'DryRun') {
    return requested;
  }
  return 'RequestResponse';
}

export function handleCreateFunction(req: ParsedApiRequest): ApiResponse {
  const body = req.body as unknown as CreateFunctionCommandInput;
  const name = body.FunctionName;
  if (!name) {
    return errorResponse('InvalidParameterValueException', 'Function name is required', 400);
  }
  try {
    const fn = createFunction({
      functionName: name,
      runtime: body.Runtime,
      role: body.Role,
      handler: body.Handler,
      description: body.Description ?? '',
      timeout: body.Timeout,
      memorySize: body.MemorySize,
      environment: body.Environment?.Variables,
      tags: body.Tags as Record<string, string>,
      s3Bucket: body.Code?.S3Bucket,
      s3Key: body.Code?.S3Key,
    });
    return json(buildFunctionConfiguration(fn));
  } catch (e) {
    if (e instanceof ServiceError) {
      return errorResponse(e.code, e.message, e.statusCode);
    }
    throw e;
  }
}

export function getFunction(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  return json({
    Configuration: buildFunctionConfiguration(fn),
    Code: { RepositoryType: 'S3', Location: '' },
    Tags: fn.tags,
  });
}

export function getFunctionConfiguration(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  return json(buildFunctionConfiguration(fn));
}

export function deleteFunction(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  if (!functions.has(resolved)) {
    return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  }
  deleteFunctionState(resolved);
  return { statusCode: 204, headers: { 'Content-Type': 'application/json' }, body: '' };
}

export function updateFunctionCode(req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  const body = req.body as unknown as UpdateFunctionCodeCommandInput;
  if (body.S3Bucket) fn.s3Bucket = body.S3Bucket;
  if (body.S3Key) fn.s3Key = body.S3Key;
  fn.lastModified = isoNow();
  fn.lastUpdateStatus = 'Successful';
  functions.set(resolved, fn);
  return json(buildFunctionConfiguration(fn));
}

export function updateFunctionConfiguration(req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  const body = req.body as unknown as UpdateFunctionConfigurationCommandInput;
  if (body.Runtime !== undefined) fn.runtime = body.Runtime!;
  if (body.Role !== undefined) fn.role = body.Role!;
  if (body.Handler !== undefined) fn.handler = body.Handler!;
  if (body.Description !== undefined) fn.description = body.Description ?? '';
  if (body.Timeout !== undefined) fn.timeout = body.Timeout ?? fn.timeout;
  if (body.MemorySize !== undefined) fn.memorySize = body.MemorySize ?? fn.memorySize;
  if (body.Environment !== undefined) fn.environment = { Variables: body.Environment?.Variables ?? {} };
  fn.lastModified = isoNow();
  fn.lastUpdateStatus = 'Successful';
  functions.set(resolved, fn);
  return json(buildFunctionConfiguration(fn));
}

export function listFunctions(): ApiResponse {
  return json({
    Functions: Array.from(functions.values()).map(buildFunctionConfiguration),
    NextMarker: null,
  });
}

export async function invokeFunction(req: ParsedApiRequest, functionName: string): Promise<ApiResponse> {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  const invocationType = getInvocationType(req);

  if (invocationType === 'DryRun') {
    return {
      statusCode: 204,
      headers: {
        'X-Amz-Executed-Version': '$LATEST',
      },
      body: '',
    };
  }

  let event: unknown = {};
  if (req.rawBody.length > 0) {
    try {
      event = JSON.parse(req.rawBody.toString('utf-8'));
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Type: 'InvalidRequestContentException', Message: 'Could not parse request body into json' }),
      };
    }
  }

  if (invocationType === 'Event') {
    if (fn.s3Bucket && fn.s3Key) {
      void executeLambdaHandler(fn, event).catch(() => undefined);
    }
    return {
      statusCode: 202,
      headers: {
        'X-Amz-Executed-Version': '$LATEST',
      },
      body: '',
    };
  }

  if (!fn.s3Bucket || !fn.s3Key) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Executed-Version': '$LATEST',
      },
      body: '{}',
    };
  }

  const outcome = await executeLambdaHandler(fn, event);

  if (outcome.error) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Function-Error': 'Unhandled',
        'X-Amz-Executed-Version': '$LATEST',
      },
      body: JSON.stringify(outcome.error),
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Executed-Version': '$LATEST',
    },
    body: JSON.stringify(outcome.result),
  };
}

export function listVersionsByFunction(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  const versions = Array.from(publishedVersions.values())
    .filter((version) => version.functionName === resolved)
    .sort((left, right) => Number(left.version) - Number(right.version));
  return json({
    Versions: [
      buildFunctionConfiguration(fn),
      ...versions.map((version) => buildFunctionConfiguration(version)),
    ],
    NextMarker: null,
  });
}

export function listTags(_req: ParsedApiRequest, arn: string): ApiResponse {
  const fn = Array.from(functions.values()).find((f) => f.functionArn === arn);
  if (!fn) return resourceNotFound(`Resource not found: ${arn}`);
  return json({ Tags: fn.tags });
}

export function getAccountSettings(): ApiResponse {
  return json({
    AccountLimit: {
      TotalCodeSize: 80530636800,
      CodeSizeUnzipped: 262144000,
      CodeSizeZipped: 52428800,
      ConcurrentExecutions: 1000,
      UnreservedConcurrentExecutions: 1000,
    },
    AccountUsage: { TotalCodeSize: 0, FunctionCount: functions.size },
  });
}

export function getPolicy(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  const statements = Array.from(permissions.values())
    .filter((permission) => permission.functionName === resolved)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((permission) => {
      const statement: Record<string, unknown> = {
        Sid: permission.id,
        Effect: 'Allow',
        Action: permission.action,
        Resource: permission.functionArn,
      };

      if (permission.principal === '*') {
        statement.Principal = '*';
      } else if (permission.principal.includes('.amazonaws.com')) {
        statement.Principal = { Service: permission.principal };
      } else {
        statement.Principal = { AWS: permission.principal };
      }

      const condition: Record<string, Record<string, string>> = {};
      if (permission.sourceArn) {
        condition.ArnLike = { 'AWS:SourceArn': permission.sourceArn };
      }
      if (permission.sourceAccount) {
        condition.StringEquals = {
          ...(condition.StringEquals ?? {}),
          'AWS:SourceAccount': permission.sourceAccount,
        };
      }
      if (permission.eventSourceToken) {
        condition.StringEquals = {
          ...(condition.StringEquals ?? {}),
          'lambda:EventSourceToken': permission.eventSourceToken,
        };
      }
      if (permission.functionUrlAuthType) {
        condition.StringEquals = {
          ...(condition.StringEquals ?? {}),
          'lambda:FunctionUrlAuthType': permission.functionUrlAuthType,
        };
      }
      if (permission.principalOrgId) {
        condition.StringEquals = {
          ...(condition.StringEquals ?? {}),
          'aws:PrincipalOrgID': permission.principalOrgId,
        };
      }
      if (Object.keys(condition).length > 0) {
        statement.Condition = condition;
      }

      return statement;
    });
  return json({
    Policy: JSON.stringify({ Version: '2012-10-17', Id: 'default', Statement: statements }),
    RevisionId: 'a1b2c3d4-5678-90ab-cdef-EXAMPLE11111',
  });
}

export function getFunctionUrlConfig(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  return errorResponse('ResourceNotFoundException', `No function URL configuration found for function: ${resolved}`, 404);
}

export function listEventSourceMappings(req: ParsedApiRequest): ApiResponse {
  const requestedFunction = req.queryParams.FunctionName
    ? resolveFunctionName(req.queryParams.FunctionName)
    : undefined;
  const requestedSourceArn = req.queryParams.EventSourceArn;

  const mappings = Array.from(eventSourceMappings.values())
    .filter((mapping) => !requestedFunction || mapping.functionName === requestedFunction)
    .filter((mapping) => !requestedSourceArn || mapping.eventSourceArn === requestedSourceArn)
    .sort((left, right) => left.uuid.localeCompare(right.uuid))
    .map((mapping) => {
      const lastModified = Date.parse(mapping.lastModified);
      return {
        UUID: mapping.uuid,
        FunctionArn: mapping.functionArn,
        EventSourceArn: mapping.eventSourceArn,
        BatchSize: mapping.batchSize,
        State: mapping.state,
        StateTransitionReason: 'USER_INITIATED',
        LastModified: Number.isFinite(lastModified) ? lastModified / 1000 : undefined,
        StartingPosition: mapping.startingPosition,
      };
    });

  return json({ EventSourceMappings: mappings });
}

export function listAliases(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  return json({ Aliases: [] });
}

export function getFunctionConcurrency(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  return json({});
}

export function listProvisionedConcurrencyConfigs(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  return json({ ProvisionedConcurrencyConfigs: [], NextMarker: null });
}

function buildEventInvokeConfigResponse(functionName: string, qualifier: string): Omit<FunctionEventInvokeConfig, 'LastModified'> & { LastModified?: number } | undefined {
  const config = eventInvokeConfigs.get(lambdaEventInvokeConfigKey(functionName, qualifier));
  if (!config) return undefined;
  const lastModified = Date.parse(config.lastModified);
  return {
    FunctionArn: config.functionArn,
    MaximumRetryAttempts: config.maximumRetryAttempts,
    MaximumEventAgeInSeconds: config.maximumEventAgeInSeconds,
    DestinationConfig: config.destinationConfig as FunctionEventInvokeConfig['DestinationConfig'] ?? {},
    LastModified: Number.isFinite(lastModified) ? lastModified / 1000 : undefined,
  };
}

export function getFunctionEventInvokeConfig(req: ParsedApiRequest, functionName: string): ApiResponse {
  const target = resolveFunctionTarget(functionName, req.queryParams['Qualifier']);
  const fn = functions.get(target.functionName);
  if (!fn) {
    return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${target.functionName}`);
  }
  const config = buildEventInvokeConfigResponse(target.functionName, target.qualifier);
  if (!config) {
    return errorResponse('ResourceNotFoundException', `No event invoke config found for function: ${target.functionName}`, 404);
  }
  return json(config);
}

export function listFunctionEventInvokeConfigs(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  const configs = Array.from(eventInvokeConfigs.values())
    .filter((config) => config.functionName === resolved)
    .sort((left, right) => left.qualifier.localeCompare(right.qualifier))
    .map((config) => ({
      FunctionArn: config.functionArn,
      MaximumRetryAttempts: config.maximumRetryAttempts,
      MaximumEventAgeInSeconds: config.maximumEventAgeInSeconds,
      DestinationConfig: config.destinationConfig ?? {},
      LastModified: Date.parse(config.lastModified) / 1000,
    }));
  return json({ FunctionEventInvokeConfigs: configs, NextMarker: null });
}

export function getFunctionCodeSigningConfig(_req: ParsedApiRequest, functionName: string): ApiResponse {
  const resolved = resolveFunctionName(functionName);
  const fn = functions.get(resolved);
  if (!fn) return resourceNotFound(`Function not found: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${resolved}`);
  return errorResponse('ResourceNotFoundException', `No code signing config found for function: ${resolved}`, 404);
}

export function listCodeSigningConfigs(): ApiResponse {
  return json({ CodeSigningConfigs: [], NextMarker: null });
}
