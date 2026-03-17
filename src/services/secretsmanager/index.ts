import { randomUUID } from 'node:crypto';
import type { MockServiceDefinition, ApiResponse, ParsedApiRequest } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import { jsonAmz11 as json, errorAmz11 as error } from '../response.js';
import { REGION, ACCOUNT_ID } from '../../config.js';
import type { SecretListEntry } from '@aws-sdk/client-secrets-manager';

export interface Secret extends Omit<SecretListEntry, 'CreatedDate' | 'LastChangedDate' | 'DeletedDate' | 'Tags'> {
  CreatedDate: string;
  LastChangedDate: string;
  DeletedDate?: string;
  SecretString?: string;
  SecretBinary?: string;
  VersionId: string;
  Tags: Array<{ Key: string; Value: string }>;
}

export const secrets = new PersistentMap<string, Secret>('secretsmanager-secrets');

export function randomSuffix(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function epochSeconds(iso: string): number {
  return new Date(iso).getTime() / 1000;
}

function findSecret(secretId: string): Secret | undefined {
  const byName = secrets.get(secretId);
  if (byName) return byName;
  for (const s of secrets.values()) {
    if (s.ARN === secretId) return s;
  }
  return undefined;
}

function secretMetadata(s: Secret): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    ARN: s.ARN,
    Name: s.Name,
    Description: s.Description,
    CreatedDate: epochSeconds(s.CreatedDate),
    LastChangedDate: epochSeconds(s.LastChangedDate),
    LastAccessedDate: epochSeconds(s.LastChangedDate),
    RotationEnabled: false,
    Tags: s.Tags,
    SecretVersionsToStages: s.SecretVersionsToStages,
  };
  if (s.DeletedDate) {
    meta.DeletedDate = epochSeconds(s.DeletedDate);
  }
  return meta;
}

function CreateSecret(req: ParsedApiRequest): ApiResponse {
  const { Name, SecretString, SecretBinary, Description, Tags } = req.body as {
    Name?: string;
    SecretString?: string;
    SecretBinary?: string;
    Description?: string;
    Tags?: Array<{ Key: string; Value: string }>;
  };
  if (!Name) return error('ValidationException', 'Name is required');
  if (secrets.has(Name)) return error('ResourceExistsException', `The secret ${Name} already exists.`);

  const versionId = randomUUID();
  const now = new Date().toISOString();
  const secret: Secret = {
    Name,
    ARN: `arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:${Name}-${randomSuffix()}`,
    Description: Description ?? '',
    SecretString: SecretString,
    SecretBinary: SecretBinary,
    VersionId: versionId,
    Tags: Tags ?? [],
    CreatedDate: now,
    LastChangedDate: now,
    SecretVersionsToStages: { [versionId]: ['AWSCURRENT'] },
  };
  secrets.set(Name, secret);
  return json({ ARN: secret.ARN, Name: secret.Name, VersionId: versionId });
}

function GetSecretValue(req: ParsedApiRequest): ApiResponse {
  const { SecretId } = req.body as { SecretId?: string };
  if (!SecretId) return error('ValidationException', 'SecretId is required');
  const s = findSecret(SecretId);
  if (!s || s.DeletedDate) {
    return error('ResourceNotFoundException', `Secrets Manager can't find the specified secret.`, 404);
  }
  const result: Record<string, unknown> = {
    ARN: s.ARN,
    Name: s.Name,
    VersionId: s.VersionId,
    VersionStages: s.SecretVersionsToStages?.[s.VersionId] ?? ['AWSCURRENT'],
    CreatedDate: epochSeconds(s.CreatedDate),
  };
  if (s.SecretString !== undefined) result.SecretString = s.SecretString;
  if (s.SecretBinary !== undefined) result.SecretBinary = s.SecretBinary;
  return json(result);
}

function ListSecrets(req: ParsedApiRequest): ApiResponse {
  const { MaxResults, NextToken } = req.body as { MaxResults?: number; NextToken?: string };
  const max = MaxResults ?? 100;
  const all = Array.from(secrets.values()).filter((s) => !s.DeletedDate);
  const start = NextToken ? parseInt(NextToken, 10) : 0;
  const page = all.slice(start, start + max);
  const nextToken = start + max < all.length ? String(start + max) : undefined;
  return json({
    SecretList: page.map(secretMetadata),
    ...(nextToken ? { NextToken: nextToken } : {}),
  });
}

function DescribeSecret(req: ParsedApiRequest): ApiResponse {
  const { SecretId } = req.body as { SecretId?: string };
  if (!SecretId) return error('ValidationException', 'SecretId is required');
  const s = findSecret(SecretId);
  if (!s) return error('ResourceNotFoundException', `Secrets Manager can't find the specified secret.`, 404);
  return json(secretMetadata(s));
}

function UpdateSecret(req: ParsedApiRequest): ApiResponse {
  const { SecretId, SecretString, SecretBinary, Description } = req.body as {
    SecretId?: string;
    SecretString?: string;
    SecretBinary?: string;
    Description?: string;
  };
  if (!SecretId) return error('ValidationException', 'SecretId is required');
  const s = findSecret(SecretId);
  if (!s || s.DeletedDate) {
    return error('ResourceNotFoundException', `Secrets Manager can't find the specified secret.`, 404);
  }
  if (SecretString !== undefined) s.SecretString = SecretString;
  if (SecretBinary !== undefined) s.SecretBinary = SecretBinary;
  if (Description !== undefined) s.Description = Description;
  const newVersionId = randomUUID();
  const oldStages = s.SecretVersionsToStages?.[s.VersionId];
  if (oldStages) {
    const idx = oldStages.indexOf('AWSCURRENT');
    if (idx !== -1) oldStages.splice(idx, 1);
    if (!oldStages.includes('AWSPREVIOUS')) oldStages.push('AWSPREVIOUS');
  }
  s.VersionId = newVersionId;
  s.SecretVersionsToStages = { ...s.SecretVersionsToStages, [newVersionId]: ['AWSCURRENT'] };
  s.LastChangedDate = new Date().toISOString();
  secrets.set(s.Name!, s);
  return json({ ARN: s.ARN, Name: s.Name, VersionId: newVersionId });
}

function DeleteSecret(req: ParsedApiRequest): ApiResponse {
  const { SecretId } = req.body as { SecretId?: string };
  if (!SecretId) return error('ValidationException', 'SecretId is required');
  const s = findSecret(SecretId);
  if (!s) return error('ResourceNotFoundException', `Secrets Manager can't find the specified secret.`, 404);
  s.DeletedDate = new Date().toISOString();
  secrets.set(s.Name!, s);
  return json({ ARN: s.ARN, Name: s.Name, DeletionDate: epochSeconds(s.DeletedDate) });
}

function PutSecretValue(req: ParsedApiRequest): ApiResponse {
  const { SecretId, SecretString, SecretBinary } = req.body as {
    SecretId?: string;
    SecretString?: string;
    SecretBinary?: string;
  };
  if (!SecretId) return error('ValidationException', 'SecretId is required');
  const s = findSecret(SecretId);
  if (!s || s.DeletedDate) {
    return error('ResourceNotFoundException', `Secrets Manager can't find the specified secret.`, 404);
  }
  if (SecretString !== undefined) s.SecretString = SecretString;
  if (SecretBinary !== undefined) s.SecretBinary = SecretBinary;
  const newVersionId = randomUUID();
  const oldStages = s.SecretVersionsToStages?.[s.VersionId];
  if (oldStages) {
    const idx = oldStages.indexOf('AWSCURRENT');
    if (idx !== -1) oldStages.splice(idx, 1);
    if (!oldStages.includes('AWSPREVIOUS')) oldStages.push('AWSPREVIOUS');
  }
  s.VersionId = newVersionId;
  s.SecretVersionsToStages = { ...s.SecretVersionsToStages, [newVersionId]: ['AWSCURRENT'] };
  s.LastChangedDate = new Date().toISOString();
  secrets.set(s.Name!, s);
  return json({
    ARN: s.ARN,
    Name: s.Name,
    VersionId: newVersionId,
    VersionStages: ['AWSCURRENT'],
  });
}

function TagResource(req: ParsedApiRequest): ApiResponse {
  const { SecretId, Tags } = req.body as {
    SecretId?: string;
    Tags?: Array<{ Key: string; Value: string }>;
  };
  if (!SecretId) return error('ValidationException', 'SecretId is required');
  const s = findSecret(SecretId);
  if (!s) return error('ResourceNotFoundException', `Secrets Manager can't find the specified secret.`, 404);
  if (Tags) {
    for (const tag of Tags) {
      const existing = s.Tags.find((t) => t.Key === tag.Key);
      if (existing) {
        existing.Value = tag.Value;
      } else {
        s.Tags.push(tag);
      }
    }
    secrets.set(s.Name!, s);
  }
  return json({});
}

function RestoreSecret(req: ParsedApiRequest): ApiResponse {
  const { SecretId } = req.body as { SecretId?: string };
  if (!SecretId) return error('ValidationException', 'SecretId is required');
  const s = findSecret(SecretId);
  if (!s) return error('ResourceNotFoundException', `Secrets Manager can't find the specified secret.`, 404);
  if (!s.DeletedDate) return error('InvalidRequestException', 'Secret is not deleted.');
  delete s.DeletedDate;
  secrets.set(s.Name!, s);
  return json({ ARN: s.ARN, Name: s.Name });
}

function GetResourcePolicy(req: ParsedApiRequest): ApiResponse {
  const { SecretId } = req.body as { SecretId?: string };
  if (!SecretId) return error('ValidationException', 'SecretId is required');
  const s = findSecret(SecretId);
  if (!s) return error('ResourceNotFoundException', `Secrets Manager can't find the specified secret.`, 404);
  return json({ Name: s.Name, ARN: s.ARN, ResourcePolicy: null });
}

function ListSecretVersionIds(req: ParsedApiRequest): ApiResponse {
  const { SecretId } = req.body as { SecretId?: string };
  if (!SecretId) return error('ValidationException', 'SecretId is required');
  const s = findSecret(SecretId);
  if (!s) return error('ResourceNotFoundException', `Secrets Manager can't find the specified secret.`, 404);
  const versions = Object.entries(s.SecretVersionsToStages ?? {}).map(([id, stages]) => ({
    VersionId: id,
    VersionStages: stages,
    CreatedDate: epochSeconds(s.LastChangedDate),
  }));
  return json({ ARN: s.ARN, Name: s.Name, Versions: versions });
}

export const secretsmanagerService: MockServiceDefinition = {
  name: 'secretsmanager',
  hostPatterns: ['secretsmanager.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'secretsmanager',
  signingName: 'secretsmanager',
  handlers: {
    CreateSecret,
    GetSecretValue,
    ListSecrets,
    DescribeSecret,
    UpdateSecret,
    DeleteSecret,
    PutSecretValue,
    TagResource,
    RestoreSecret,
    GetResourcePolicy,
    ListSecretVersionIds,
    _default: () => json({}),
  },
};
