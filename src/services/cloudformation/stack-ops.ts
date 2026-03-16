import type { ParsedApiRequest, ApiResponse } from '../../types.js';
import {
  stacks, xml, xmlError, escapeXml, generateStackId, nowISO,
  parseParams, parseTags, parseCapabilities, parseStackStatusFilter,
  findStack, stackMemberXml, stackParametersXml, stackOutputsXml,
  stackTagsXml, capabilitiesXml, resolveTemplateBody,
  type StoredStack,
} from './state.js';
import { randomUUID } from 'node:crypto';
import { parseTemplate } from './engine/template-parser.js';
import {
  provision,
  destroyProvisionedResources,
  ProvisionError,
  validateSupportedTemplate,
  type ProvisionedStack,
} from './engine/provisioner.js';
import { REGION } from '../../config.js';
import { debug } from '../../util/logger.js';

function errorMessage(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = err.errors.map(e => errorMessage(e)).join('; ');
    return inner || err.message || 'AggregateError';
  }
  return err instanceof Error ? err.message : String(err);
}

export interface StackSnapshot {
  templateBody: string;
  parameters: StoredStack['parameters'];
  outputs: StoredStack['outputs'];
  tags: StoredStack['tags'];
  capabilities: StoredStack['capabilities'];
  roleArn?: string;
  resources: StoredStack['resources'];
}

function addEvent(stack: StoredStack, status: string, reason: string): void {
  const now = nowISO();
  stack.events.unshift({
    eventId: randomUUID(),
    stackId: stack.stackId,
    stackName: stack.stackName,
    logicalResourceId: stack.stackName,
    physicalResourceId: stack.stackId,
    resourceType: 'AWS::CloudFormation::Stack',
    resourceStatus: status,
    resourceStatusReason: reason,
    timestamp: now,
  });
}

function cloneStackResources(resources: StoredStack['resources']): StoredStack['resources'] {
  return resources.map((resource) => ({ ...resource }));
}

function cloneStackOutputs(outputs: StoredStack['outputs']): StoredStack['outputs'] {
  return outputs.map((output) => ({ ...output }));
}

function cloneStackParameters(parameters: StoredStack['parameters']): StoredStack['parameters'] {
  return parameters.map((parameter) => ({ ...parameter }));
}

function cloneStackTags(tags: StoredStack['tags']): StoredStack['tags'] {
  return tags.map((tag) => ({ ...tag }));
}

function stackResourceKey(
  logicalId: string,
  resourceType: string,
  physicalId: string,
): string {
  return `${logicalId}\0${resourceType}\0${physicalId}`;
}

function provisionedResourceKey(resource: ProvisionedStack['resources'][number]): string {
  return stackResourceKey(resource.logicalId, resource.type, resource.physicalId);
}

function persistedResourceKey(resource: StoredStack['resources'][number]): string {
  return stackResourceKey(resource.logicalResourceId, resource.resourceType, resource.physicalResourceId);
}

export function snapshotStack(stack: StoredStack): StackSnapshot {
  return {
    templateBody: stack.templateBody,
    parameters: cloneStackParameters(stack.parameters),
    outputs: cloneStackOutputs(stack.outputs),
    tags: cloneStackTags(stack.tags),
    capabilities: [...stack.capabilities],
    roleArn: stack.roleArn,
    resources: cloneStackResources(stack.resources),
  };
}

export function buildExistingResourceMap(
  resources: StoredStack['resources'],
): Map<string, { physicalId: string; type: string }> {
  return new Map(resources.map((resource) => [
    resource.logicalResourceId,
    {
      physicalId: resource.physicalResourceId,
      type: resource.resourceType,
    },
  ]));
}

export function buildParameterRecord(
  template: ReturnType<typeof parseTemplate>,
  parameters: StoredStack['parameters'],
): Record<string, string> {
  const paramRecord: Record<string, string> = {};
  for (const parameter of parameters) {
    paramRecord[parameter.ParameterKey ?? ''] = parameter.ParameterValue ?? '';
  }
  for (const [key, def] of Object.entries(template.parameters)) {
    if (!(key in paramRecord) && def.Default !== undefined) {
      paramRecord[key] = def.Default;
    }
  }
  return paramRecord;
}

export function toPersistedResources(
  resources: ProvisionedStack['resources'],
  timestamp: string,
): StoredStack['resources'] {
  return resources.map((resource) => ({
    logicalResourceId: resource.logicalId,
    physicalResourceId: resource.physicalId,
    resourceType: resource.type,
    resourceStatus: resource.status,
    timestamp,
  }));
}

export function toPersistedOutputs(outputs: ProvisionedStack['outputs']): StoredStack['outputs'] {
  return outputs.map((output) => ({
    OutputKey: output.key,
    OutputValue: output.value,
    Description: output.description,
    ExportName: output.exportName,
  }));
}

export function resourcesToDeleteAfterSuccess(
  previous: StoredStack['resources'],
  next: ProvisionedStack['resources'],
): Array<{ physicalId: string; type: string }> {
  const retained = new Set(next.map(provisionedResourceKey));
  return previous
    .filter((resource) => !retained.has(persistedResourceKey(resource)))
    .map((resource) => ({
      physicalId: resource.physicalResourceId,
      type: resource.resourceType,
    }));
}

async function cleanupFailedProvision(
  error: unknown,
  stackName: string,
  retainedResources: StoredStack['resources'] | ProvisionedStack['resources'] = [],
): Promise<void> {
  if (!(error instanceof ProvisionError) || error.resources.length === 0) return;

  const retained = new Set(
    retainedResources.map((resource) => {
      if ('logicalResourceId' in resource) {
        return persistedResourceKey(resource);
      }
      return provisionedResourceKey(resource);
    }),
  );

  await destroyProvisionedResources(
    error.resources
      .filter((resource) => !retained.has(provisionedResourceKey(resource)))
      .map((resource) => ({
        physicalId: resource.physicalId,
        type: resource.type,
      })),
    stackName,
    REGION,
  );
}

export async function restoreStackSnapshot(
  stack: StoredStack,
  snapshot: StackSnapshot,
  timestamp: string,
): Promise<ProvisionedStack> {
  const template = parseTemplate(snapshot.templateBody);
  const restored = await provision(
    template,
    stack.stackName,
    buildParameterRecord(template, snapshot.parameters),
    REGION,
    buildExistingResourceMap(snapshot.resources),
  );

  stack.templateBody = snapshot.templateBody;
  stack.parameters = cloneStackParameters(snapshot.parameters);
  stack.outputs = toPersistedOutputs(restored.outputs);
  stack.tags = cloneStackTags(snapshot.tags);
  stack.capabilities = [...snapshot.capabilities];
  stack.roleArn = snapshot.roleArn;
  stack.resources = toPersistedResources(restored.resources, timestamp);

  return restored;
}

export async function destroyStackResources(stack: StoredStack): Promise<void> {
  await destroyProvisionedResources(
    stack.resources.map((resource) => ({
      physicalId: resource.physicalResourceId,
      type: resource.resourceType,
    })),
    stack.stackName,
    REGION,
  );
  stack.resources = [];
  stack.outputs = [];
}

export async function createStack(req: ParsedApiRequest): Promise<ApiResponse> {
  const body = req.body;
  const stackName = body['StackName'] as string | undefined;
  if (!stackName) return xmlError('ValidationError', 'StackName is required');
  if (stacks.has(stackName)) {
    const existing = stacks.get(stackName)!;
    if (existing.stackStatus !== 'DELETE_COMPLETE') {
      return xmlError('AlreadyExistsException', `Stack [${stackName}] already exists`);
    }
  }

  const now = nowISO();
  const stackId = generateStackId(stackName);
  const templateBody = resolveTemplateBody(body);
  let template: ReturnType<typeof parseTemplate>;
  try {
    template = parseTemplate(templateBody);
    validateSupportedTemplate(
      template,
      stackName,
      buildParameterRecord(template, parseParams(body, 'Parameters')),
      REGION,
    );
  } catch (err) {
    return xmlError('ValidationError', errorMessage(err));
  }

  const stack: StoredStack = {
    stackName,
    stackId,
    stackStatus: 'CREATE_IN_PROGRESS',
    stackStatusReason: 'User Initiated',
    creationTime: now,
    lastUpdatedTime: now,
    templateBody,
    parameters: parseParams(body, 'Parameters'),
    outputs: [],
    tags: parseTags(body),
    capabilities: parseCapabilities(body),
    roleArn: body['RoleARN'] as string | undefined,
    resources: [],
    events: [],
  };

  addEvent(stack, 'CREATE_IN_PROGRESS', 'User Initiated');

  try {
    const result = await provision(
      template,
      stackName,
      buildParameterRecord(template, stack.parameters),
      REGION,
    );

    stack.resources = toPersistedResources(result.resources, now);
    stack.outputs = toPersistedOutputs(result.outputs);

    for (const r of result.resources) {
      stack.events.unshift({
        eventId: randomUUID(),
        stackId,
        stackName,
        logicalResourceId: r.logicalId,
        physicalResourceId: r.physicalId,
        resourceType: r.type,
        resourceStatus: 'CREATE_COMPLETE',
        resourceStatusReason: '',
        timestamp: now,
      });
    }

    stack.stackStatus = 'CREATE_COMPLETE';
    stack.stackStatusReason = '';
    addEvent(stack, 'CREATE_COMPLETE', '');
  } catch (err) {
    await cleanupFailedProvision(err, stack.stackName);
    stack.resources = [];
    stack.outputs = [];
    stack.stackStatus = 'CREATE_FAILED';
    stack.stackStatusReason = errorMessage(err);
    addEvent(stack, 'CREATE_FAILED', stack.stackStatusReason);
  }

  stacks.set(stackName, stack);
  return xml('CreateStack', `<StackId>${escapeXml(stackId)}</StackId>`);
}

export async function updateStack(req: ParsedApiRequest): Promise<ApiResponse> {
  const body = req.body;
  const stack = findStack(body);
  if (!stack) return xmlError('ValidationError', `Stack [${body['StackName']}] does not exist`);

  const newTemplateBody = resolveTemplateBody(body);
  const targetTemplateBody = newTemplateBody !== '{}' ? newTemplateBody : stack.templateBody;
  let template: ReturnType<typeof parseTemplate>;
  const newParams = parseParams(body, 'Parameters');
  const targetParameters = newParams.length > 0 ? cloneStackParameters(newParams) : cloneStackParameters(stack.parameters);
  try {
    template = parseTemplate(targetTemplateBody);
    validateSupportedTemplate(
      template,
      stack.stackName,
      buildParameterRecord(template, targetParameters),
      REGION,
    );
  } catch (err) {
    return xmlError('ValidationError', errorMessage(err));
  }
  const now = nowISO();
  const snapshot = snapshotStack(stack);
  const newTags = parseTags(body);
  const targetTags = newTags.length > 0 ? cloneStackTags(newTags) : cloneStackTags(stack.tags);
  const newCaps = parseCapabilities(body);
  const targetCapabilities = newCaps.length > 0 ? [...newCaps] : [...stack.capabilities];
  const targetRoleArn = (body['RoleARN'] as string | undefined) ?? stack.roleArn;

  addEvent(stack, 'UPDATE_IN_PROGRESS', 'User Initiated');

  try {
    const result = await provision(
      template,
      stack.stackName,
      buildParameterRecord(template, targetParameters),
      REGION,
      buildExistingResourceMap(snapshot.resources),
    );

    await destroyProvisionedResources(
      resourcesToDeleteAfterSuccess(snapshot.resources, result.resources),
      stack.stackName,
      REGION,
    );

    stack.templateBody = targetTemplateBody;
    stack.parameters = targetParameters;
    stack.tags = targetTags;
    stack.capabilities = targetCapabilities;
    stack.roleArn = targetRoleArn;
    stack.resources = toPersistedResources(result.resources, now);
    stack.outputs = toPersistedOutputs(result.outputs);

    for (const r of result.resources) {
      stack.events.unshift({
        eventId: randomUUID(),
        stackId: stack.stackId,
        stackName: stack.stackName,
        logicalResourceId: r.logicalId,
        physicalResourceId: r.physicalId,
        resourceType: r.type,
        resourceStatus: 'UPDATE_COMPLETE',
        resourceStatusReason: '',
        timestamp: now,
      });
    }

    stack.stackStatus = 'UPDATE_COMPLETE';
    stack.stackStatusReason = '';
    addEvent(stack, 'UPDATE_COMPLETE', '');
  } catch (err) {
    const message = errorMessage(err);
    try {
      const restored = await restoreStackSnapshot(stack, snapshot, now);
      await cleanupFailedProvision(err, stack.stackName, restored.resources);
      stack.stackStatus = 'UPDATE_ROLLBACK_COMPLETE';
      stack.stackStatusReason = message;
      addEvent(stack, 'UPDATE_ROLLBACK_COMPLETE', message);
    } catch (restoreErr) {
      await cleanupFailedProvision(err, stack.stackName, snapshot.resources);
      stack.templateBody = snapshot.templateBody;
      stack.parameters = cloneStackParameters(snapshot.parameters);
      stack.outputs = cloneStackOutputs(snapshot.outputs);
      stack.tags = cloneStackTags(snapshot.tags);
      stack.capabilities = [...snapshot.capabilities];
      stack.roleArn = snapshot.roleArn;
      stack.resources = cloneStackResources(snapshot.resources);
      stack.stackStatus = 'UPDATE_ROLLBACK_FAILED';
      stack.stackStatusReason = `${message}; rollback failed: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`;
      addEvent(stack, 'UPDATE_ROLLBACK_FAILED', stack.stackStatusReason);
    }
  }

  stack.lastUpdatedTime = now;
  stacks.set(stack.stackName, stack);
  return xml('UpdateStack', `<StackId>${escapeXml(stack.stackId)}</StackId>`);
}

export async function deleteStack(req: ParsedApiRequest): Promise<ApiResponse> {
  const body = req.body;
  const stack = findStack(body);
  if (!stack) return xml('DeleteStack', '');

  await destroyStackResources(stack);
  stack.stackStatus = 'DELETE_COMPLETE';
  stack.stackStatusReason = '';
  stack.lastUpdatedTime = nowISO();
  addEvent(stack, 'DELETE_IN_PROGRESS', 'User Initiated');
  addEvent(stack, 'DELETE_COMPLETE', '');
  stacks.set(stack.stackName, stack);

  return xml('DeleteStack', '');
}

export function describeStacks(req: ParsedApiRequest): ApiResponse {
  const body = req.body;
  const nameFilter = body['StackName'] as string | undefined;

  let results: StoredStack[];
  if (nameFilter) {
    const arnName = nameFilter.startsWith('arn:') ? nameFilter.split('/')[1] : undefined;
    const stack = stacks.get(nameFilter) ?? stacks.get(arnName ?? '') ?? [...stacks.values()].find(s => s.stackId === nameFilter);
    if (!stack || stack.stackStatus === 'DELETE_COMPLETE') {
      return xmlError('ValidationError', `Stack with id ${nameFilter} does not exist`);
    }
    results = [stack];
  } else {
    results = [...stacks.values()].filter(s => s.stackStatus !== 'DELETE_COMPLETE');
  }

  const membersXml = results.map(stackMemberXml).join('');
  return xml('DescribeStacks', `<Stacks>${membersXml}</Stacks>`);
}

export function listStacks(req: ParsedApiRequest): ApiResponse {
  const body = req.body;
  const statusFilter = parseStackStatusFilter(body);

  let results = [...stacks.values()];
  if (statusFilter.length > 0) {
    results = results.filter(s => statusFilter.includes(s.stackStatus));
  }

  const summaries = results.map(s => `<member>
    <StackName>${escapeXml(s.stackName)}</StackName>
    <StackId>${escapeXml(s.stackId)}</StackId>
    <StackStatus>${s.stackStatus}</StackStatus>
    <CreationTime>${s.creationTime}</CreationTime>
    <LastUpdatedTime>${s.lastUpdatedTime}</LastUpdatedTime>
  </member>`).join('');

  return xml('ListStacks', `<StackSummaries>${summaries}</StackSummaries>`);
}

export function describeStackEvents(req: ParsedApiRequest): ApiResponse {
  const body = req.body;
  const stack = findStack(body);
  if (!stack) return xmlError('ValidationError', `Stack [${body['StackName']}] does not exist`);

  const eventsXml = stack.events.map(e => `<member>
    <EventId>${escapeXml(e.eventId)}</EventId>
    <StackId>${escapeXml(e.stackId)}</StackId>
    <StackName>${escapeXml(e.stackName)}</StackName>
    <LogicalResourceId>${escapeXml(e.logicalResourceId)}</LogicalResourceId>
    <PhysicalResourceId>${escapeXml(e.physicalResourceId)}</PhysicalResourceId>
    <ResourceType>${escapeXml(e.resourceType)}</ResourceType>
    <ResourceStatus>${e.resourceStatus}</ResourceStatus>
    <ResourceStatusReason>${escapeXml(e.resourceStatusReason)}</ResourceStatusReason>
    <Timestamp>${e.timestamp}</Timestamp>
  </member>`).join('');

  return xml('DescribeStackEvents', `<StackEvents>${eventsXml}</StackEvents>`);
}

export function describeStackResources(req: ParsedApiRequest): ApiResponse {
  const body = req.body;
  const stack = findStack(body);
  if (!stack) return xml('DescribeStackResources', '<StackResources/>');

  const resourcesXml = stack.resources.map(r => `<member>
    <LogicalResourceId>${escapeXml(r.logicalResourceId)}</LogicalResourceId>
    <PhysicalResourceId>${escapeXml(r.physicalResourceId)}</PhysicalResourceId>
    <ResourceType>${escapeXml(r.resourceType)}</ResourceType>
    <ResourceStatus>${r.resourceStatus}</ResourceStatus>
    <Timestamp>${r.timestamp}</Timestamp>
  </member>`).join('');

  return xml('DescribeStackResources', `<StackResources>${resourcesXml}</StackResources>`);
}

export function listStackResources(req: ParsedApiRequest): ApiResponse {
  const body = req.body;
  const stack = findStack(body);
  if (!stack) return xmlError('ValidationError', `Stack [${body['StackName']}] does not exist`);

  const summaries = stack.resources.map(r => `<member>
    <LogicalResourceId>${escapeXml(r.logicalResourceId)}</LogicalResourceId>
    <PhysicalResourceId>${escapeXml(r.physicalResourceId)}</PhysicalResourceId>
    <ResourceType>${escapeXml(r.resourceType)}</ResourceType>
    <ResourceStatus>${r.resourceStatus}</ResourceStatus>
    <LastUpdatedTimestamp>${r.timestamp}</LastUpdatedTimestamp>
  </member>`).join('');

  return xml('ListStackResources', `<StackResourceSummaries>${summaries}</StackResourceSummaries>`);
}

export function getTemplate(req: ParsedApiRequest): ApiResponse {
  const body = req.body;
  const stack = findStack(body);
  if (!stack) return xmlError('ValidationError', `Stack [${body['StackName']}] does not exist`);

  return xml('GetTemplate', `<TemplateBody>${escapeXml(stack.templateBody)}</TemplateBody>`);
}

export function validateTemplate(_req: ParsedApiRequest): ApiResponse {
  return xml('ValidateTemplate', `<Parameters/><Description/><Capabilities/><CapabilitiesReason/>`);
}

export function getTemplateSummary(req: ParsedApiRequest): ApiResponse {
  const body = req.body;
  let templateBody = body['TemplateBody'] as string | undefined;

  if (!templateBody) {
    const stack = findStack(body);
    if (stack) templateBody = stack.templateBody;
  }

  let description = '';
  let parameters = '<Parameters/>';

  if (templateBody) {
    try {
      const template = parseTemplate(templateBody);
      if (template.description) description = template.description;
      if (Object.keys(template.parameters).length > 0) {
        const paramMembers = Object.entries(template.parameters).map(
          ([key, val]) => `<member>
            <ParameterKey>${escapeXml(key)}</ParameterKey>
            <ParameterType>${escapeXml(val.Type ?? 'String')}</ParameterType>
            <DefaultValue>${escapeXml(String(val.Default ?? ''))}</DefaultValue>
            <Description>${escapeXml(val.Description ?? '')}</Description>
          </member>`
        ).join('');
        parameters = `<Parameters>${paramMembers}</Parameters>`;
      }
    } catch (err) {
      debug(`getTemplateSummary parse error: ${err instanceof Error ? err.message : err}`);
    }
  }

  return xml('GetTemplateSummary', `
    <Description>${escapeXml(description)}</Description>
    ${parameters}
    <ResourceTypes/>
    <Version>2010-09-09</Version>
  `);
}
