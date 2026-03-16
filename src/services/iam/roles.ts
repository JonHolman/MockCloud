import type { ApiHandler } from '../../types.js';
import {
  type StoredRole,
  getRolesStore,
  createRole,
  deleteRole,
  xml,
  iamError,
  NS,
  META,
} from './types.js';
import { ServiceError } from '../response.js';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function roleFieldsXml(r: StoredRole): string {
  return `<Path>${r.Path}</Path>
      <RoleName>${r.RoleName}</RoleName>
      <RoleId>${r.RoleId}</RoleId>
      <Arn>${r.Arn}</Arn>
      <CreateDate>${r.CreateDate}</CreateDate>
      <AssumeRolePolicyDocument>${encodeURIComponent(r.AssumeRolePolicyDocument)}</AssumeRolePolicyDocument>
      ${r.Description ? `<Description>${r.Description}</Description>` : ''}`;
}

function roleXml(r: StoredRole): string {
  return `<Role>${roleFieldsXml(r)}</Role>`;
}

export const CreateRole: ApiHandler = (req) => {
  const name = str(req.body['RoleName']);
  if (!name) return iamError('ValidationError', 'RoleName is required');

  try {
    const role = createRole({
      roleName: name,
      path: str(req.body['Path']) || '/',
      assumeRolePolicyDocument: str(req.body['AssumeRolePolicyDocument']),
      description: str(req.body['Description']),
    });
    return xml(`<CreateRoleResponse xmlns="${NS}">
  <CreateRoleResult>${roleXml(role)}</CreateRoleResult>
  ${META}
</CreateRoleResponse>`);
  } catch (e) {
    if (e instanceof ServiceError) return iamError(e.code, e.message, e.statusCode);
    throw e;
  }
};

export const GetRole: ApiHandler = (req) => {
  const roles = getRolesStore();
  const name = str(req.body['RoleName']);
  const role = roles.get(name);
  if (!role) return iamError('NoSuchEntity', `Role ${name} not found.`, 404);

  return xml(`<GetRoleResponse xmlns="${NS}">
  <GetRoleResult>${roleXml(role)}</GetRoleResult>
  ${META}
</GetRoleResponse>`);
};

export const ListRoles: ApiHandler = () => {
  const roles = getRolesStore();
  const members = Array.from(roles.values()).map((r) => `<member>${roleFieldsXml(r)}</member>`).join('');

  return xml(`<ListRolesResponse xmlns="${NS}">
  <ListRolesResult><Roles>${members}</Roles><IsTruncated>false</IsTruncated></ListRolesResult>
  ${META}
</ListRolesResponse>`);
};

export const DeleteRole: ApiHandler = (req) => {
  const name = str(req.body['RoleName']);
  try {
    deleteRole(name);
    return xml(`<DeleteRoleResponse xmlns="${NS}">
  <DeleteRoleResult/>
  ${META}
</DeleteRoleResponse>`);
  } catch (e) {
    if (e instanceof ServiceError) return iamError(e.code, e.message, e.statusCode);
    throw e;
  }
};

export const PutRolePolicy: ApiHandler = (req) => {
  const roles = getRolesStore();
  const roleName = str(req.body['RoleName']);
  const role = roles.get(roleName);
  if (!role) return iamError('NoSuchEntity', `Role ${roleName} not found.`, 404);

  const policyName = str(req.body['PolicyName']);
  if (!policyName) return iamError('ValidationError', 'PolicyName is required');
  const policyDocument = str(req.body['PolicyDocument']);
  role.inlinePolicies.set(policyName, policyDocument);
  roles.set(roleName, role);

  return xml(`<PutRolePolicyResponse xmlns="${NS}">
  <PutRolePolicyResult/>
  ${META}
</PutRolePolicyResponse>`);
};

export const GetRolePolicy: ApiHandler = (req) => {
  const roles = getRolesStore();
  const roleName = str(req.body['RoleName']);
  const role = roles.get(roleName);
  if (!role) return iamError('NoSuchEntity', `Role ${roleName} not found.`, 404);

  const policyName = str(req.body['PolicyName']);
  const doc = role.inlinePolicies.get(policyName);
  if (doc === undefined) return iamError('NoSuchEntity', `Policy ${policyName} not found on role ${roleName}.`, 404);

  return xml(`<GetRolePolicyResponse xmlns="${NS}">
  <GetRolePolicyResult>
    <RoleName>${roleName}</RoleName>
    <PolicyName>${policyName}</PolicyName>
    <PolicyDocument>${encodeURIComponent(doc)}</PolicyDocument>
  </GetRolePolicyResult>
  ${META}
</GetRolePolicyResponse>`);
};

export const DeleteRolePolicy: ApiHandler = (req) => {
  const roles = getRolesStore();
  const roleName = str(req.body['RoleName']);
  const role = roles.get(roleName);
  if (!role) return iamError('NoSuchEntity', `Role ${roleName} not found.`, 404);

  const policyName = str(req.body['PolicyName']);
  if (!policyName) return iamError('ValidationError', 'PolicyName is required');
  if (!role.inlinePolicies.has(policyName)) return iamError('NoSuchEntity', `Policy ${policyName} not found on role ${roleName}.`, 404);
  role.inlinePolicies.delete(policyName);
  roles.set(roleName, role);

  return xml(`<DeleteRolePolicyResponse xmlns="${NS}">
  <DeleteRolePolicyResult/>
  ${META}
</DeleteRolePolicyResponse>`);
};

export const ListRolePolicies: ApiHandler = (req) => {
  const roles = getRolesStore();
  const roleName = str(req.body['RoleName']);
  const role = roles.get(roleName);
  if (!role) return iamError('NoSuchEntity', `Role ${roleName} not found.`, 404);

  const members = Array.from(role.inlinePolicies.keys()).map((n) => `<member>${n}</member>`).join('');

  return xml(`<ListRolePoliciesResponse xmlns="${NS}">
  <ListRolePoliciesResult><PolicyNames>${members}</PolicyNames><IsTruncated>false</IsTruncated></ListRolePoliciesResult>
  ${META}
</ListRolePoliciesResponse>`);
};

export const AttachRolePolicy: ApiHandler = (req) => {
  const roles = getRolesStore();
  const roleName = str(req.body['RoleName']);
  const role = roles.get(roleName);
  if (!role) return iamError('NoSuchEntity', `Role ${roleName} not found.`, 404);

  const policyArn = str(req.body['PolicyArn']);
  if (!policyArn) return iamError('ValidationError', 'PolicyArn is required');
  if (!role.attachedPolicies.includes(policyArn)) {
    role.attachedPolicies.push(policyArn);
    roles.set(roleName, role);
  }

  return xml(`<AttachRolePolicyResponse xmlns="${NS}">
  <AttachRolePolicyResult/>
  ${META}
</AttachRolePolicyResponse>`);
};

export const ListAttachedRolePolicies: ApiHandler = (req) => {
  const roles = getRolesStore();
  const roleName = str(req.body['RoleName']);
  const role = roles.get(roleName);
  if (!role) return iamError('NoSuchEntity', `Role ${roleName} not found.`, 404);

  const members = role.attachedPolicies
    .map((arn) => {
      const name = arn.split('/').pop() ?? arn;
      return `<member><PolicyName>${name}</PolicyName><PolicyArn>${arn}</PolicyArn></member>`;
    })
    .join('');

  return xml(`<ListAttachedRolePoliciesResponse xmlns="${NS}">
  <ListAttachedRolePoliciesResult><AttachedPolicies>${members}</AttachedPolicies><IsTruncated>false</IsTruncated></ListAttachedRolePoliciesResult>
  ${META}
</ListAttachedRolePoliciesResponse>`);
};

export const UpdateAssumeRolePolicy: ApiHandler = (req) => {
  const roles = getRolesStore();
  const roleName = str(req.body['RoleName']);
  const role = roles.get(roleName);
  if (!role) return iamError('NoSuchEntity', `Role ${roleName} not found.`, 404);

  role.AssumeRolePolicyDocument = str(req.body['PolicyDocument']);
  roles.set(roleName, role);

  return xml(`<UpdateAssumeRolePolicyResponse xmlns="${NS}">
  <UpdateAssumeRolePolicyResult/>
  ${META}
</UpdateAssumeRolePolicyResponse>`);
};
