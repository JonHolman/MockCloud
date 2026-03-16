import type { ApiHandler } from '../../types.js';
import {
  type StoredPolicy,
  getPoliciesStore,
  generatePolicyId,
  policyArn,
  xml,
  iamError,
  NS,
  META,
} from './types.js';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function policyFieldsXml(p: StoredPolicy): string {
  return `<PolicyName>${p.PolicyName}</PolicyName>
      <PolicyId>${p.PolicyId}</PolicyId>
      <Arn>${p.Arn}</Arn>
      <Path>${p.Path}</Path>
      <DefaultVersionId>${p.DefaultVersionId}</DefaultVersionId>
      <AttachmentCount>${p.AttachmentCount}</AttachmentCount>
      <PermissionsBoundaryUsageCount>0</PermissionsBoundaryUsageCount>
      <IsAttachable>true</IsAttachable>
      <CreateDate>${p.CreateDate}</CreateDate>
      <UpdateDate>${p.CreateDate}</UpdateDate>`;
}

function policyXml(p: StoredPolicy): string {
  return `<Policy>${policyFieldsXml(p)}</Policy>`;
}

export const CreatePolicy: ApiHandler = (req) => {
  const policies = getPoliciesStore();
  const name = str(req.body['PolicyName']);
  if (!name) return iamError('ValidationError', 'PolicyName is required');

  const path = str(req.body['Path']) || '/';
  const arn = policyArn(path, name);
  if (policies.has(arn)) return iamError('EntityAlreadyExists', `Policy ${name} already exists.`, 409);

  const doc = str(req.body['PolicyDocument']);
  const versions = new Map<string, string>();
  versions.set('v1', doc);

  const policy: StoredPolicy = {
    PolicyName: name,
    PolicyId: generatePolicyId(),
    Arn: arn,
    Path: path,
    DefaultVersionId: 'v1',
    versions,
    CreateDate: new Date().toISOString(),
    AttachmentCount: 0,
  };
  policies.set(arn, policy);

  return xml(`<CreatePolicyResponse xmlns="${NS}">
  <CreatePolicyResult>${policyXml(policy)}</CreatePolicyResult>
  ${META}
</CreatePolicyResponse>`);
};

export const GetPolicy: ApiHandler = (req) => {
  const policies = getPoliciesStore();
  const arn = str(req.body['PolicyArn']);
  const policy = policies.get(arn);
  if (!policy) return iamError('NoSuchEntity', `Policy ${arn} not found.`, 404);

  return xml(`<GetPolicyResponse xmlns="${NS}">
  <GetPolicyResult>${policyXml(policy)}</GetPolicyResult>
  ${META}
</GetPolicyResponse>`);
};

export const ListPolicies: ApiHandler = () => {
  const policies = getPoliciesStore();
  const members = Array.from(policies.values()).map((p) => `<member>${policyFieldsXml(p)}</member>`).join('');

  return xml(`<ListPoliciesResponse xmlns="${NS}">
  <ListPoliciesResult><Policies>${members}</Policies><IsTruncated>false</IsTruncated></ListPoliciesResult>
  ${META}
</ListPoliciesResponse>`);
};

export const DeletePolicy: ApiHandler = (req) => {
  const policies = getPoliciesStore();
  const arn = str(req.body['PolicyArn']);
  if (!policies.has(arn)) return iamError('NoSuchEntity', `Policy ${arn} not found.`, 404);
  policies.delete(arn);

  return xml(`<DeletePolicyResponse xmlns="${NS}">
  <DeletePolicyResult/>
  ${META}
</DeletePolicyResponse>`);
};

export const GetPolicyVersion: ApiHandler = (req) => {
  const policies = getPoliciesStore();
  const arn = str(req.body['PolicyArn']);
  const policy = policies.get(arn);
  if (!policy) return iamError('NoSuchEntity', `Policy ${arn} not found.`, 404);

  const versionId = str(req.body['VersionId']);
  const doc = policy.versions.get(versionId);
  if (doc === undefined) return iamError('NoSuchEntity', `Version ${versionId} not found.`, 404);

  return xml(`<GetPolicyVersionResponse xmlns="${NS}">
  <GetPolicyVersionResult>
    <PolicyVersion>
      <Document>${encodeURIComponent(doc)}</Document>
      <VersionId>${versionId}</VersionId>
      <IsDefaultVersion>${versionId === policy.DefaultVersionId}</IsDefaultVersion>
      <CreateDate>${policy.CreateDate}</CreateDate>
    </PolicyVersion>
  </GetPolicyVersionResult>
  ${META}
</GetPolicyVersionResponse>`);
};

export const CreatePolicyVersion: ApiHandler = (req) => {
  const policies = getPoliciesStore();
  const arn = str(req.body['PolicyArn']);
  const policy = policies.get(arn);
  if (!policy) return iamError('NoSuchEntity', `Policy ${arn} not found.`, 404);

  const doc = str(req.body['PolicyDocument']);
  const versionNum = policy.versions.size + 1;
  const versionId = `v${versionNum}`;
  policy.versions.set(versionId, doc);

  const setAsDefault = str(req.body['SetAsDefault']);
  if (setAsDefault !== 'false') {
    policy.DefaultVersionId = versionId;
  }
  policies.set(arn, policy);

  return xml(`<CreatePolicyVersionResponse xmlns="${NS}">
  <CreatePolicyVersionResult>
    <PolicyVersion>
      <Document>${encodeURIComponent(doc)}</Document>
      <VersionId>${versionId}</VersionId>
      <IsDefaultVersion>${versionId === policy.DefaultVersionId}</IsDefaultVersion>
      <CreateDate>${new Date().toISOString()}</CreateDate>
    </PolicyVersion>
  </CreatePolicyVersionResult>
  ${META}
</CreatePolicyVersionResponse>`);
};
