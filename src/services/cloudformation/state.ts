import { PersistentMap } from '../../state/store.js';
import type { ApiResponse, ParsedApiRequest } from '../../types.js';
import type { Parameter, Output, Tag, Change } from '@aws-sdk/client-cloudformation';
import { randomUUID } from 'node:crypto';
import { REGION, ACCOUNT_ID } from '../../config.js';
import { getObject as s3GetObject } from '../s3/index.js';
import { debug } from '../../util/logger.js';

export interface StoredStackResource {
  logicalResourceId: string;
  physicalResourceId: string;
  resourceType: string;
  resourceStatus: string;
  timestamp: string;
}

export interface StoredStackEvent {
  eventId: string;
  stackId: string;
  stackName: string;
  logicalResourceId: string;
  physicalResourceId: string;
  resourceType: string;
  resourceStatus: string;
  resourceStatusReason: string;
  timestamp: string;
}

export interface StoredStack {
  stackName: string;
  stackId: string;
  stackStatus: string;
  stackStatusReason: string;
  creationTime: string;
  lastUpdatedTime: string;
  templateBody: string;
  parameters: Parameter[];
  outputs: Output[];
  tags: Tag[];
  capabilities: string[];
  roleArn?: string;
  resources: StoredStackResource[];
  events: StoredStackEvent[];
}

export interface StoredChangeSet {
  changeSetName: string;
  changeSetId: string;
  stackId: string;
  stackName: string;
  status: string;
  statusReason: string;
  creationTime: string;
  templateBody: string;
  parameters: Parameter[];
  tags: Tag[];
  capabilities: string[];
  roleArn?: string;
  changes: Change[];
}

export const stacks = new PersistentMap<string, StoredStack>('cfn-stacks');
export const changeSets = new PersistentMap<string, StoredChangeSet>('cfn-changesets');

const NS = 'http://cloudformation.amazonaws.com/doc/2010-05-15/';
const REQUEST_ID = '00000000-0000-0000-0000-000000000000';

export function generateStackId(stackName: string): string {
  return `arn:aws:cloudformation:${REGION}:${ACCOUNT_ID}:stack/${stackName}/${randomUUID()}`;
}

export function generateChangeSetId(stackName: string, changeSetName: string): string {
  return `arn:aws:cloudformation:${REGION}:${ACCOUNT_ID}:changeSet/${changeSetName}/${randomUUID()}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function xml(action: string, resultBody: string): ApiResponse {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: `<${action}Response xmlns="${NS}">
  <${action}Result>${resultBody}</${action}Result>
  <ResponseMetadata><RequestId>${REQUEST_ID}</RequestId></ResponseMetadata>
</${action}Response>`,
  };
}

export function xmlError(code: string, message: string, statusCode = 400): ApiResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/xml' },
    body: `<ErrorResponse xmlns="${NS}">
  <Error><Type>Sender</Type><Code>${code}</Code><Message>${message}</Message></Error>
  <RequestId>${REQUEST_ID}</RequestId>
</ErrorResponse>`,
  };
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseParams(body: Record<string, unknown>, prefix: string): Parameter[] {
  const params: Parameter[] = [];
  for (let i = 1; ; i++) {
    const key = body[`${prefix}.member.${i}.ParameterKey`] as string | undefined;
    const value = body[`${prefix}.member.${i}.ParameterValue`] as string | undefined;
    if (!key) break;
    params.push({ ParameterKey: key, ParameterValue: value ?? '' });
  }
  return params;
}

export function parseTags(body: Record<string, unknown>): Tag[] {
  const tags: Tag[] = [];
  for (let i = 1; ; i++) {
    const key = body[`Tags.member.${i}.Key`] as string | undefined;
    const value = body[`Tags.member.${i}.Value`] as string | undefined;
    if (!key) break;
    tags.push({ Key: key, Value: value ?? '' });
  }
  return tags;
}

export function parseCapabilities(body: Record<string, unknown>): string[] {
  const caps: string[] = [];
  for (let i = 1; ; i++) {
    const cap = body[`Capabilities.member.${i}`] as string | undefined;
    if (!cap) break;
    caps.push(cap);
  }
  return caps;
}

export function parseStackStatusFilter(body: Record<string, unknown>): string[] {
  const filters: string[] = [];
  for (let i = 1; ; i++) {
    const f = body[`StackStatusFilter.member.${i}`] as string | undefined;
    if (!f) break;
    filters.push(f);
  }
  return filters;
}

export function resolveTemplateBody(body: Record<string, unknown>, fallback?: string): string {
  if (body['TemplateBody']) return body['TemplateBody'] as string;
  const templateUrl = body['TemplateURL'] as string | undefined;
  if (templateUrl) {
    try {
      const url = new URL(templateUrl);
      const pathParts = url.pathname.replace(/^\//, '').split('/');
      const bucketName = pathParts[0];
      const objectKey = pathParts.slice(1).join('/');
      const obj = s3GetObject(bucketName, objectKey);
      if (obj) return obj.body.toString('utf-8');
    } catch (err) {
      debug(`Failed to resolve TemplateURL ${templateUrl}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return fallback ?? '{}';
}

export function findStack(body: Record<string, unknown>): StoredStack | undefined {
  const name = body['StackName'] as string | undefined;
  if (!name) return undefined;
  const arnName = name.startsWith('arn:') ? name.split('/')[1] : undefined;
  return stacks.get(name) ?? stacks.get(arnName ?? '') ?? [...stacks.values()].find(s => s.stackId === name);
}

export function stackOutputsXml(outputs: StoredStack['outputs']): string {
  if (outputs.length === 0) return '<Outputs/>';
  const members = outputs.map(o => {
    let m = `<member><OutputKey>${escapeXml(o.OutputKey ?? '')}</OutputKey><OutputValue>${escapeXml(o.OutputValue ?? '')}</OutputValue>`;
    if (o.Description) m += `<Description>${escapeXml(o.Description)}</Description>`;
    if (o.ExportName) m += `<ExportName>${escapeXml(o.ExportName)}</ExportName>`;
    m += '</member>';
    return m;
  }).join('');
  return `<Outputs>${members}</Outputs>`;
}

export function stackParametersXml(params: StoredStack['parameters']): string {
  if (params.length === 0) return '<Parameters/>';
  const members = params.map(p =>
    `<member><ParameterKey>${escapeXml(p.ParameterKey ?? '')}</ParameterKey><ParameterValue>${escapeXml(p.ParameterValue ?? '')}</ParameterValue></member>`
  ).join('');
  return `<Parameters>${members}</Parameters>`;
}

export function stackTagsXml(tags: StoredStack['tags']): string {
  if (tags.length === 0) return '<Tags/>';
  const members = tags.map(t =>
    `<member><Key>${escapeXml(t.Key ?? '')}</Key><Value>${escapeXml(t.Value ?? '')}</Value></member>`
  ).join('');
  return `<Tags>${members}</Tags>`;
}

export function capabilitiesXml(caps: string[]): string {
  if (caps.length === 0) return '<Capabilities/>';
  const members = caps.map(c => `<member>${escapeXml(c)}</member>`).join('');
  return `<Capabilities>${members}</Capabilities>`;
}

export function stackMemberXml(stack: StoredStack): string {
  return `<member>
    <StackName>${escapeXml(stack.stackName)}</StackName>
    <StackId>${escapeXml(stack.stackId)}</StackId>
    <StackStatus>${stack.stackStatus}</StackStatus>
    <StackStatusReason>${escapeXml(stack.stackStatusReason)}</StackStatusReason>
    <CreationTime>${stack.creationTime}</CreationTime>
    <LastUpdatedTime>${stack.lastUpdatedTime}</LastUpdatedTime>
    ${stackParametersXml(stack.parameters)}
    ${stackOutputsXml(stack.outputs)}
    ${stackTagsXml(stack.tags)}
    ${capabilitiesXml(stack.capabilities)}
    ${stack.roleArn ? `<RoleARN>${escapeXml(stack.roleArn)}</RoleARN>` : ''}
  </member>`;
}
