import type { MockServiceDefinition, ApiResponse, ParsedApiRequest } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import { jsonAmz11 as json, errorAmz11 as error, ServiceError } from '../response.js';
import { REGION, ACCOUNT_ID } from '../../config.js';
import type { Parameter } from '@aws-sdk/client-ssm';

export interface SsmParameter extends Omit<Parameter, 'LastModifiedDate'> {
  LastModifiedDate: string;
  Description: string;
}

export const parameters = new PersistentMap<string, SsmParameter>('ssm-parameters');

export function putParameter(opts: {
  name: string;
  value: string;
  type?: 'String' | 'SecureString' | 'StringList';
  overwrite?: boolean;
  description?: string;
  dataType?: string;
}): SsmParameter {
  const existing = parameters.get(opts.name);
  if (existing && !opts.overwrite) {
    throw new ServiceError('ParameterAlreadyExists', 'The parameter already exists. To overwrite, set Overwrite to true.');
  }
  const version = existing ? existing.Version! + 1 : 1;
  const param: SsmParameter = {
    Name: opts.name,
    Value: opts.value,
    Type: opts.type ?? 'String',
    Version: version,
    ARN: `arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/${opts.name.replace(/^\//, '')}`,
    LastModifiedDate: new Date().toISOString(),
    DataType: opts.dataType ?? 'text',
    Description: opts.description ?? existing?.Description ?? '',
  };
  parameters.set(opts.name, param);
  return param;
}

export function deleteParameter(name: string): void {
  if (!parameters.has(name)) {
    throw new ServiceError('ParameterNotFound', `Parameter ${name} not found.`);
  }
  parameters.delete(name);
}

function epochSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function parameterOutput(p: SsmParameter): Record<string, unknown> {
  return {
    Name: p.Name,
    Type: p.Type,
    Value: p.Value,
    Version: p.Version,
    LastModifiedDate: epochSeconds(p.LastModifiedDate),
    ARN: p.ARN,
    DataType: p.DataType,
  };
}

function parameterMetadata(p: SsmParameter): Record<string, unknown> {
  return {
    Name: p.Name,
    Type: p.Type,
    LastModifiedDate: epochSeconds(p.LastModifiedDate),
    Version: p.Version,
    DataType: p.DataType,
    Description: p.Description,
  };
}

function PutParameter(req: ParsedApiRequest): ApiResponse {
  const { Name, Value, Type, Overwrite, Description, DataType } = req.body as {
    Name?: string;
    Value?: string;
    Type?: 'String' | 'SecureString' | 'StringList';
    Overwrite?: boolean;
    Description?: string;
    DataType?: string;
  };
  if (!Name) return error('ValidationException', 'Name is required');
  if (Value === undefined) return error('ValidationException', 'Value is required');
  try {
    const param = putParameter({ name: Name, value: Value, type: Type, overwrite: Overwrite, description: Description, dataType: DataType });
    return json({ Version: param.Version, Tier: 'Standard' });
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function GetParameter(req: ParsedApiRequest): ApiResponse {
  const { Name } = req.body as { Name?: string };
  if (!Name) return error('ValidationException', 'Name is required');
  const p = parameters.get(Name);
  if (!p) return error('ParameterNotFound', `Parameter ${Name} not found.`, 400);
  return json({ Parameter: parameterOutput(p) });
}

function GetParameters(req: ParsedApiRequest): ApiResponse {
  const { Names } = req.body as { Names?: string[] };
  if (!Names || Names.length === 0) return error('ValidationException', 'Names is required');
  const found: Record<string, unknown>[] = [];
  const invalid: string[] = [];
  for (const name of Names) {
    const p = parameters.get(name);
    if (p) {
      found.push(parameterOutput(p));
    } else {
      invalid.push(name);
    }
  }
  return json({ Parameters: found, InvalidParameters: invalid });
}

function GetParametersByPath(req: ParsedApiRequest): ApiResponse {
  const { Path, Recursive, MaxResults, NextToken } = req.body as {
    Path?: string;
    Recursive?: boolean;
    MaxResults?: number;
    NextToken?: string;
  };
  if (!Path) return error('ValidationException', 'Path is required');

  const normalizedPath = Path.endsWith('/') ? Path : Path + '/';
  const all = Array.from(parameters.values()).filter((p) => {
    if (!p.Name?.startsWith(normalizedPath)) return false;
    if (!Recursive) {
      const rest = p.Name.slice(normalizedPath.length);
      return !rest.includes('/');
    }
    return true;
  });

  const max = MaxResults ?? 10;
  const start = NextToken ? parseInt(NextToken, 10) : 0;
  const page = all.slice(start, start + max);
  const nextToken = start + max < all.length ? String(start + max) : undefined;

  return json({
    Parameters: page.map(parameterOutput),
    ...(nextToken ? { NextToken: nextToken } : {}),
  });
}

function DeleteParameter(req: ParsedApiRequest): ApiResponse {
  const { Name } = req.body as { Name?: string };
  if (!Name) return error('ValidationException', 'Name is required');
  try {
    deleteParameter(Name);
    return json({});
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function DescribeParameters(req: ParsedApiRequest): ApiResponse {
  const { MaxResults, NextToken } = req.body as { MaxResults?: number; NextToken?: string };
  const max = MaxResults ?? 50;
  const all = Array.from(parameters.values());
  const start = NextToken ? parseInt(NextToken, 10) : 0;
  const page = all.slice(start, start + max);
  const nextToken = start + max < all.length ? String(start + max) : undefined;

  return json({
    Parameters: page.map(parameterMetadata),
    ...(nextToken ? { NextToken: nextToken } : {}),
  });
}

export const ssmService: MockServiceDefinition = {
  name: 'ssm',
  hostPatterns: ['ssm.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'AmazonSSM',
  signingName: 'ssm',
  handlers: {
    PutParameter,
    GetParameter,
    GetParameters,
    GetParametersByPath,
    DeleteParameter,
    DescribeParameters,
    _default: () => json({}),
  },
};
