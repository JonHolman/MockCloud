import { randomBytes } from 'node:crypto';
import type { MockServiceDefinition, ApiResponse, ParsedApiRequest } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import { jsonAmz11 as json, errorAmz11 as error, ServiceError } from '../response.js';
import {
  InitiateAuth, AdminInitiateAuth, RespondToAuthChallenge, AdminRespondToAuthChallenge,
  AdminSetUserPassword, SignUp, ConfirmSignUp, GlobalSignOut, GetUser,
} from './auth.js';
import { REGION, ACCOUNT_ID } from '../../config.js';
import type { UserPoolType, UserPoolClientType, UserType, AttributeType } from '@aws-sdk/client-cognito-identity-provider';

export interface StoredUserPool {
  id: string;
  name: string;
  arn: string;
  creationDate: number;
  lastModifiedDate: number;
  status: string;
  Domain?: string;
}

interface StoredUserPoolClient {
  clientId: string;
  clientName: string;
  userPoolId: string;
  creationDate: number;
  lastModifiedDate: number;
}

export interface StoredUser {
  username: string;
  attributes: AttributeType[];
  enabled: boolean;
  userStatus: string;
  userCreateDate: number;
  userLastModifiedDate: number;
  password?: string;
}

interface StoredUserPoolDomain {
  Domain: string;
  UserPoolId: string;
  CustomDomainConfig?: unknown;
}

export interface StoredIdentityProvider {
  ProviderName: string;
  ProviderType: string;
  UserPoolId: string;
  ProviderDetails: Record<string, string>;
  AttributeMapping?: Record<string, string>;
}

export const pools = new PersistentMap<string, StoredUserPool>('cognito-pools');
export const poolClients = new PersistentMap<string, StoredUserPoolClient[]>('cognito-pool-clients');
export const poolUsers = new PersistentMap<string, StoredUser[]>('cognito-pool-users');
export const userPoolDomains = new PersistentMap<string, StoredUserPoolDomain>('cognito-user-pool-domains');
export const identityProviders = new PersistentMap<string, StoredIdentityProvider>('cognito-identity-providers');

export function generatePoolId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(9);
  let suffix = '';
  for (let i = 0; i < 9; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `${REGION}_${suffix}`;
}

export function generateClientId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(26);
  let id = '';
  for (let i = 0; i < 26; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

export function createUserPool(name: string): StoredUserPool {
  const now = Date.now() / 1000;
  const id = generatePoolId();
  const pool: StoredUserPool = {
    id,
    name,
    arn: `arn:aws:cognito-idp:${REGION}:${ACCOUNT_ID}:userpool/${id}`,
    creationDate: now,
    lastModifiedDate: now,
    status: 'Enabled',
  };
  pools.set(id, pool);
  poolClients.set(id, []);
  poolUsers.set(id, []);
  return pool;
}

export function createUserPoolDomain(domain: string, userPoolId: string, customDomainConfig?: unknown): void {
  if (userPoolDomains.has(domain)) {
    throw new ServiceError('InvalidParameterException', `Domain ${domain} already exists.`);
  }
  if (!pools.has(userPoolId)) {
    throw new ServiceError('ResourceNotFoundException', `User pool ${userPoolId} does not exist.`, 404);
  }
  userPoolDomains.set(domain, { Domain: domain, UserPoolId: userPoolId, CustomDomainConfig: customDomainConfig });
  const pool = pools.get(userPoolId);
  if (pool) {
    pool.Domain = domain;
    pools.set(userPoolId, pool);
  }
}

export function createIdentityProvider(userPoolId: string, providerName: string, providerType: string, providerDetails: Record<string, string>, attributeMapping?: Record<string, string>): StoredIdentityProvider {
  if (!pools.has(userPoolId)) {
    throw new ServiceError('ResourceNotFoundException', `User pool ${userPoolId} does not exist.`, 404);
  }
  const key = `${userPoolId}/${providerName}`;
  if (identityProviders.has(key)) {
    throw new ServiceError('DuplicateProviderException', `Provider ${providerName} already exists for user pool ${userPoolId}.`);
  }
  const entry: StoredIdentityProvider = { ProviderName: providerName, ProviderType: providerType, UserPoolId: userPoolId, ProviderDetails: providerDetails, AttributeMapping: attributeMapping };
  identityProviders.set(key, entry);
  return entry;
}

function poolResponse(p: StoredUserPool): UserPoolType {
  return {
    Id: p.id,
    Name: p.name,
    Arn: p.arn,
    CreationDate: p.creationDate as unknown as Date,
    LastModifiedDate: p.lastModifiedDate as unknown as Date,
    Status: p.status as UserPoolType['Status'],
    ...(p.Domain ? { Domain: p.Domain } : {}),
  };
}

function clientResponse(c: StoredUserPoolClient): UserPoolClientType {
  return {
    ClientId: c.clientId,
    ClientName: c.clientName,
    UserPoolId: c.userPoolId,
    CreationDate: c.creationDate as unknown as Date,
    LastModifiedDate: c.lastModifiedDate as unknown as Date,
  };
}

function userResponse(u: StoredUser): UserType {
  return {
    Username: u.username,
    Attributes: u.attributes,
    Enabled: u.enabled,
    UserStatus: u.userStatus as UserType['UserStatus'],
    UserCreateDate: u.userCreateDate as unknown as Date,
    UserLastModifiedDate: u.userLastModifiedDate as unknown as Date,
  };
}

function CreateUserPool(req: ParsedApiRequest): ApiResponse {
  const { PoolName } = req.body;
  if (!PoolName) return error('ValidationException', 'PoolName is required');
  const pool = createUserPool(PoolName);
  return json({ UserPool: poolResponse(pool) });
}

function DescribeUserPool(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  const pool = pools.get(UserPoolId);
  if (!pool) return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  return json({ UserPool: poolResponse(pool) });
}

function ListUserPools(req: ParsedApiRequest): ApiResponse {
  const { MaxResults, NextToken } = req.body;
  const max = MaxResults ?? 60;
  const all = Array.from(pools.values());
  const start = NextToken ? parseInt(NextToken, 10) : 0;
  const page = all.slice(start, start + max);
  const nextToken = start + max < all.length ? String(start + max) : undefined;
  return json({
    UserPools: page.map((p) => ({
      Id: p.id,
      Name: p.name,
      CreationDate: p.creationDate,
      LastModifiedDate: p.lastModifiedDate,
      Status: p.status,
    })),
    ...(nextToken ? { NextToken: nextToken } : {}),
  });
}

function DeleteUserPool(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }
  pools.delete(UserPoolId);
  poolClients.delete(UserPoolId);
  poolUsers.delete(UserPoolId);
  return json({});
}

function CreateUserPoolClient(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, ClientName } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!ClientName) return error('ValidationException', 'ClientName is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }
  const now = Date.now() / 1000;
  const client: StoredUserPoolClient = {
    clientId: generateClientId(),
    clientName: ClientName,
    userPoolId: UserPoolId,
    creationDate: now,
    lastModifiedDate: now,
  };
  poolClients.set(UserPoolId, [...(poolClients.get(UserPoolId) ?? []), client]);
  return json({ UserPoolClient: clientResponse(client) });
}

function DescribeUserPoolClient(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, ClientId } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!ClientId) return error('ValidationException', 'ClientId is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }
  const clients = poolClients.get(UserPoolId) ?? [];
  const client = clients.find((c) => c.clientId === ClientId);
  if (!client) {
    return error('ResourceNotFoundException', `Client ${ClientId} not found.`, 404);
  }
  return json({ UserPoolClient: clientResponse(client) });
}

function ListUserPoolClients(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, MaxResults, NextToken } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }
  const max = MaxResults ?? 60;
  const all = poolClients.get(UserPoolId) ?? [];
  const start = NextToken ? parseInt(NextToken, 10) : 0;
  const page = all.slice(start, start + max);
  const nextToken = start + max < all.length ? String(start + max) : undefined;
  return json({
    UserPoolClients: page.map(clientResponse),
    ...(nextToken ? { NextToken: nextToken } : {}),
  });
}

function AdminCreateUser(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, Username, UserAttributes, TemporaryPassword } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!Username) return error('ValidationException', 'Username is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }
  const users = poolUsers.get(UserPoolId) ?? [];
  if (users.some((u) => u.username === Username)) {
    return error('UsernameExistsException', `User account already exists.`);
  }
  const now = Date.now() / 1000;
  const user: StoredUser = {
    username: Username,
    attributes: UserAttributes ?? [],
    enabled: true,
    userStatus: 'FORCE_CHANGE_PASSWORD',
    userCreateDate: now,
    userLastModifiedDate: now,
    password: TemporaryPassword,
  };
  poolUsers.set(UserPoolId, [...users, user]);
  return json({ User: userResponse(user) });
}

function AdminUpdateUserAttributes(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, Username, UserAttributes } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!Username) return error('ValidationException', 'Username is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }
  const users = poolUsers.get(UserPoolId) ?? [];
  const userIndex = users.findIndex((u) => u.username === Username);
  if (userIndex === -1) {
    return error('UserNotFoundException', `User does not exist.`, 404);
  }
  const user = users[userIndex];
  if (UserAttributes) {
    let updatedAttrs = [...user.attributes];
    for (const attr of UserAttributes) {
      const existingIndex = updatedAttrs.findIndex((a) => a.Name === attr.Name);
      if (existingIndex !== -1) {
        updatedAttrs = updatedAttrs.map((a, i) => i === existingIndex ? { ...a, Value: attr.Value } : a);
      } else {
        updatedAttrs = [...updatedAttrs, attr];
      }
    }
    const updatedUsers = users.map((u, i) => i === userIndex ? { ...u, attributes: updatedAttrs } : u);
    poolUsers.set(UserPoolId, updatedUsers);
  }
  return json({});
}

function AdminGetUser(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, Username } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!Username) return error('ValidationException', 'Username is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }
  const users = poolUsers.get(UserPoolId) ?? [];
  const user = users.find((u) => u.username === Username);
  if (!user) {
    return error('UserNotFoundException', `User does not exist.`, 404);
  }
  return json(userResponse(user));
}

function ListUsers(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, Limit, PaginationToken } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }
  const max = Limit ?? 60;
  const all = poolUsers.get(UserPoolId) ?? [];
  const start = PaginationToken ? parseInt(PaginationToken, 10) : 0;
  const page = all.slice(start, start + max);
  const nextToken = start + max < all.length ? String(start + max) : undefined;
  return json({
    Users: page.map(userResponse),
    ...(nextToken ? { PaginationToken: nextToken } : {}),
  });
}

function CreateUserPoolDomain(req: ParsedApiRequest): ApiResponse {
  const { Domain, UserPoolId, CustomDomainConfig } = req.body;
  if (!Domain) return error('ValidationException', 'Domain is required');
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  try {
    createUserPoolDomain(Domain, UserPoolId, CustomDomainConfig);
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
  return json({});
}

function DescribeUserPoolDomain(req: ParsedApiRequest): ApiResponse {
  const { Domain } = req.body;
  if (!Domain) return error('ValidationException', 'Domain is required');
  const domain = userPoolDomains.get(Domain);
  if (!domain) return json({ DomainDescription: {} });
  return json({
    DomainDescription: {
      Domain: domain.Domain,
      UserPoolId: domain.UserPoolId,
      Status: 'ACTIVE',
      CustomDomainConfig: domain.CustomDomainConfig,
    },
  });
}

function DeleteUserPoolDomain(req: ParsedApiRequest): ApiResponse {
  const { Domain } = req.body;
  if (!Domain) return error('ValidationException', 'Domain is required');
  const domainEntry = userPoolDomains.get(Domain);
  if (domainEntry) {
    const pool = pools.get(domainEntry.UserPoolId);
    if (pool) {
      delete pool.Domain;
      pools.set(domainEntry.UserPoolId, pool);
    }
  }
  userPoolDomains.delete(Domain);
  return json({});
}

function CreateIdentityProvider(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, ProviderName, ProviderType, ProviderDetails, AttributeMapping } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!ProviderName) return error('ValidationException', 'ProviderName is required');
  if (!ProviderType) return error('ValidationException', 'ProviderType is required');
  try {
    const entry = createIdentityProvider(UserPoolId, ProviderName, ProviderType, ProviderDetails ?? {}, AttributeMapping);
    const now = Date.now() / 1000;
    return json({
      IdentityProvider: {
        ...entry,
        CreationDate: now,
        LastModifiedDate: now,
      },
    });
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function ListIdentityProviders(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, MaxResults, NextToken } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!pools.has(UserPoolId)) return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  const max = MaxResults ?? 60;
  const all = [...identityProviders.values()].filter(p => p.UserPoolId === UserPoolId);
  const start = NextToken ? parseInt(NextToken, 10) : 0;
  const page = all.slice(start, start + max);
  const nextToken = start + max < all.length ? String(start + max) : undefined;
  return json({
    Providers: page.map(p => ({ ProviderName: p.ProviderName, ProviderType: p.ProviderType, CreationDate: Date.now() / 1000, LastModifiedDate: Date.now() / 1000 })),
    ...(nextToken ? { NextToken: nextToken } : {}),
  });
}

function DeleteIdentityProvider(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, ProviderName } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!ProviderName) return error('ValidationException', 'ProviderName is required');
  identityProviders.delete(`${UserPoolId}/${ProviderName}`);
  return json({});
}

export const cognitoIdpService: MockServiceDefinition = {
  name: 'cognito-idp',
  hostPatterns: ['cognito-idp.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'AWSCognitoIdentityProviderService',
  signingName: 'cognito-idp',
  handlers: {
    CreateUserPool,
    DescribeUserPool,
    ListUserPools,
    DeleteUserPool,
    CreateUserPoolClient,
    DescribeUserPoolClient,
    ListUserPoolClients,
    AdminCreateUser,
    AdminGetUser,
    AdminUpdateUserAttributes,
    ListUsers,
    InitiateAuth,
    AdminInitiateAuth,
    RespondToAuthChallenge,
    AdminRespondToAuthChallenge,
    AdminSetUserPassword,
    SignUp,
    ConfirmSignUp,
    GlobalSignOut,
    GetUser,
    CreateUserPoolDomain,
    DescribeUserPoolDomain,
    DeleteUserPoolDomain,
    CreateIdentityProvider,
    ListIdentityProviders,
    DeleteIdentityProvider,
    _default: () => json({}),
  },
};
