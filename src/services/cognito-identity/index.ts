import { randomUUID } from 'node:crypto';
import type { MockServiceDefinition, ApiResponse, ParsedApiRequest } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import { jsonAmz11 as json, errorAmz11 as error } from '../response.js';
import { REGION } from '../../config.js';

export interface IdentityPool {
  id: string;
  name: string;
  allowUnauthenticatedIdentities: boolean;
  roles: Record<string, string>;
  roleMappings: Record<string, unknown>;
  creationDate: string;
}

export const pools = new PersistentMap<string, IdentityPool>('cognito-identity-pools');

function poolResponse(p: IdentityPool): Record<string, unknown> {
  return {
    IdentityPoolId: p.id,
    IdentityPoolName: p.name,
    AllowUnauthenticatedIdentities: p.allowUnauthenticatedIdentities,
  };
}

function CreateIdentityPool(req: ParsedApiRequest): ApiResponse {
  const { IdentityPoolName, AllowUnauthenticatedIdentities } = req.body as {
    IdentityPoolName?: string;
    AllowUnauthenticatedIdentities?: boolean;
  };
  if (!IdentityPoolName) return error('ValidationException', 'IdentityPoolName is required');
  const id = `${REGION}:${randomUUID()}`;
  const pool: IdentityPool = {
    id,
    name: IdentityPoolName,
    allowUnauthenticatedIdentities: AllowUnauthenticatedIdentities ?? false,
    roles: {},
    roleMappings: {},
    creationDate: new Date().toISOString(),
  };
  pools.set(id, pool);
  return json(poolResponse(pool));
}

function DescribeIdentityPool(req: ParsedApiRequest): ApiResponse {
  const { IdentityPoolId } = req.body as { IdentityPoolId?: string };
  if (!IdentityPoolId) return error('ValidationException', 'IdentityPoolId is required');
  const pool = pools.get(IdentityPoolId);
  if (!pool) return error('ResourceNotFoundException', `IdentityPool '${IdentityPoolId}' not found.`, 404);
  return json(poolResponse(pool));
}

function ListIdentityPools(req: ParsedApiRequest): ApiResponse {
  const { MaxResults, NextToken } = req.body as { MaxResults?: number; NextToken?: string };
  const max = MaxResults ?? 60;
  const all = Array.from(pools.values());
  const start = NextToken ? parseInt(NextToken, 10) : 0;
  const page = all.slice(start, start + max);
  const nextToken = start + max < all.length ? String(start + max) : undefined;
  return json({
    IdentityPools: page.map((p) => ({
      IdentityPoolId: p.id,
      IdentityPoolName: p.name,
    })),
    ...(nextToken ? { NextToken: nextToken } : {}),
  });
}

function DeleteIdentityPool(req: ParsedApiRequest): ApiResponse {
  const { IdentityPoolId } = req.body as { IdentityPoolId?: string };
  if (!IdentityPoolId) return error('ValidationException', 'IdentityPoolId is required');
  if (!pools.has(IdentityPoolId)) {
    return error('ResourceNotFoundException', `IdentityPool '${IdentityPoolId}' not found.`, 404);
  }
  pools.delete(IdentityPoolId);
  return json({});
}

function UpdateIdentityPool(req: ParsedApiRequest): ApiResponse {
  const { IdentityPoolId, IdentityPoolName, AllowUnauthenticatedIdentities } = req.body as {
    IdentityPoolId?: string;
    IdentityPoolName?: string;
    AllowUnauthenticatedIdentities?: boolean;
  };
  if (!IdentityPoolId) return error('ValidationException', 'IdentityPoolId is required');
  const pool = pools.get(IdentityPoolId);
  if (!pool) return error('ResourceNotFoundException', `IdentityPool '${IdentityPoolId}' not found.`, 404);
  if (IdentityPoolName !== undefined) pool.name = IdentityPoolName;
  if (AllowUnauthenticatedIdentities !== undefined) pool.allowUnauthenticatedIdentities = AllowUnauthenticatedIdentities;
  pools.set(IdentityPoolId, pool);
  return json(poolResponse(pool));
}

function GetId(req: ParsedApiRequest): ApiResponse {
  const { IdentityPoolId } = req.body as { IdentityPoolId?: string };
  if (!IdentityPoolId) return error('ValidationException', 'IdentityPoolId is required');
  return json({ IdentityId: `${REGION}:${randomUUID()}` });
}

function GetCredentialsForIdentity(req: ParsedApiRequest): ApiResponse {
  const { IdentityId } = req.body as { IdentityId?: string };
  if (!IdentityId) return error('ValidationException', 'IdentityId is required');
  return json({
    IdentityId,
    Credentials: {
      AccessKeyId: 'ASIAIOSFODNN7EXAMPLE',
      SecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      SessionToken: 'FwoGZXIvYXdzEBAaDHqa0AP1RfCpS5p6kiLsAf2VhcGVjGQ3UrHEMu',
      Expiration: Math.floor(Date.now() / 1000) + 3600,
    },
  });
}

function GetIdentityPoolRoles(req: ParsedApiRequest): ApiResponse {
  const { IdentityPoolId } = req.body as { IdentityPoolId?: string };
  if (!IdentityPoolId) return error('ValidationException', 'IdentityPoolId is required');
  const pool = pools.get(IdentityPoolId);
  if (!pool) return error('ResourceNotFoundException', `IdentityPool '${IdentityPoolId}' not found.`, 404);
  const result: Record<string, unknown> = {
    IdentityPoolId: pool.id,
    Roles: pool.roles,
  };
  if (pool.roleMappings && Object.keys(pool.roleMappings).length > 0) {
    result.RoleMappings = pool.roleMappings;
  }
  return json(result);
}

function SetIdentityPoolRoles(req: ParsedApiRequest): ApiResponse {
  const { IdentityPoolId, Roles, RoleMappings } = req.body as {
    IdentityPoolId?: string;
    Roles?: Record<string, string>;
    RoleMappings?: Record<string, unknown>;
  };
  if (!IdentityPoolId) return error('ValidationException', 'IdentityPoolId is required');
  const pool = pools.get(IdentityPoolId);
  if (!pool) return error('ResourceNotFoundException', `IdentityPool '${IdentityPoolId}' not found.`, 404);
  if (Roles) pool.roles = Roles;
  if (RoleMappings) pool.roleMappings = RoleMappings;
  pools.set(IdentityPoolId, pool);
  return json({});
}

export const cognitoIdentityService: MockServiceDefinition = {
  name: 'cognito-identity',
  hostPatterns: ['cognito-identity.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'AWSCognitoIdentityService',
  signingName: 'cognito-identity',
  handlers: {
    CreateIdentityPool,
    DescribeIdentityPool,
    ListIdentityPools,
    DeleteIdentityPool,
    UpdateIdentityPool,
    GetId,
    GetCredentialsForIdentity,
    GetIdentityPoolRoles,
    SetIdentityPoolRoles,
    _default: () => json({}),
  },
};
