import type { ParsedApiRequest, ApiResponse } from '../../types.js';
import {
  stacks, changeSets, xml, xmlError, escapeXml,
  generateStackId, generateChangeSetId, nowISO,
  parseParams, parseCapabilities, parseTags, findStack,
  resolveTemplateBody,
  type StoredChangeSet,
} from './state.js';
import type { Change } from '@aws-sdk/client-cloudformation';
import { parseTemplate } from './engine/template-parser.js';
import { provision, ProvisionError, destroyProvisionedResources, validateSupportedTemplate } from './engine/provisioner.js';
import { randomUUID } from 'node:crypto';
import {
  buildExistingResourceMap,
  buildParameterRecord,
  resourcesToDeleteAfterSuccess,
  restoreStackSnapshot,
  snapshotStack,
  toPersistedOutputs,
  toPersistedResources,
} from './stack-ops.js';
import { REGION } from '../../config.js';

function buildChanges(
  changeSetType: string,
  stackTemplateBody: string,
  newTemplateBody: string,
): StoredChangeSet['changes'] {
  const newTemplate = parseTemplate(newTemplateBody);
  const oldResources = changeSetType === 'CREATE' ? {} : parseTemplate(stackTemplateBody).resources;
  const newResources = newTemplate.resources;
  const changes: StoredChangeSet['changes'] = [];
  const allKeys = new Set([...Object.keys(newResources), ...Object.keys(oldResources)]);

  for (const logicalId of allKeys) {
    const newRes = newResources[logicalId];
    const oldRes = oldResources[logicalId];
    if (newRes && !oldRes) {
      changes.push({ Type: 'Resource', ResourceChange: { Action: 'Add', LogicalResourceId: logicalId, ResourceType: newRes.Type, Replacement: 'False' } });
    } else if (!newRes && oldRes) {
      changes.push({ Type: 'Resource', ResourceChange: { Action: 'Remove', LogicalResourceId: logicalId, ResourceType: oldRes.Type, Replacement: 'False' } });
    } else if (newRes && oldRes) {
      if (newRes.Type !== oldRes.Type || JSON.stringify(newRes.Properties) !== JSON.stringify(oldRes.Properties)) {
        changes.push({ Type: 'Resource', ResourceChange: { Action: 'Modify', LogicalResourceId: logicalId, ResourceType: newRes.Type, Replacement: 'False' } });
      }
    }
  }

  return changes;
}

export function createChangeSet(req: ParsedApiRequest): ApiResponse {
  const body = req.body;
  const stackName = body['StackName'] as string | undefined;
  const changeSetName = body['ChangeSetName'] as string | undefined;
  if (!stackName) return xmlError('ValidationError', 'StackName is required');
  if (!changeSetName) return xmlError('ValidationError', 'ChangeSetName is required');

  const existingStack = stacks.get(stackName);
  const changeSetType = (body['ChangeSetType'] as string) ?? 'UPDATE';
  if (!existingStack && changeSetType !== 'CREATE') {
    return xmlError('ValidationError', `Stack [${stackName}] does not exist`);
  }
  const templateBody = resolveTemplateBody(body, existingStack?.templateBody);
  const parsedParameters = parseParams(body, 'Parameters');
  const parsedTags = parseTags(body);
  let changes: StoredChangeSet['changes'];

  try {
    const template = parseTemplate(templateBody);
    const targetParameters = parsedParameters.length > 0
      ? parsedParameters.map((parameter) => ({ ...parameter }))
      : (existingStack?.parameters.map((parameter) => ({ ...parameter })) ?? []);
    validateSupportedTemplate(
      template,
      stackName,
      buildParameterRecord(template, targetParameters),
      REGION,
    );
    changes = buildChanges(
      changeSetType,
      existingStack?.templateBody ?? '{}',
      templateBody,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return xmlError('ValidationError', message);
  }

  let stack = existingStack;

  if (!stack && changeSetType === 'CREATE') {
    const now = nowISO();
    const stackId = generateStackId(stackName);
    stack = {
      stackName,
      stackId,
      stackStatus: 'REVIEW_IN_PROGRESS',
      stackStatusReason: '',
      creationTime: now,
      lastUpdatedTime: now,
      templateBody,
      parameters: parsedParameters,
      outputs: [],
      tags: parsedTags,
      capabilities: parseCapabilities(body),
      roleArn: body['RoleARN'] as string | undefined,
      resources: [],
      events: [],
    };
    stacks.set(stackName, stack);
  }

  if (!stack) return xmlError('ValidationError', `Stack [${stackName}] does not exist`);

  const changeSetId = generateChangeSetId(stackName, changeSetName);

  const hasChanges = changes.length > 0 || changeSetType === 'CREATE';
  const changeSet: StoredChangeSet = {
    changeSetName,
    changeSetId,
    stackId: stack.stackId,
    stackName,
    status: hasChanges ? 'CREATE_COMPLETE' : 'FAILED',
    statusReason: hasChanges ? 'Change set created' : "The submitted information didn't contain changes.",
    creationTime: nowISO(),
    templateBody,
    parameters: parsedParameters,
    tags: parsedTags,
    capabilities: parseCapabilities(body),
    roleArn: body['RoleARN'] as string | undefined,
    changes,
  };

  changeSets.set(changeSetId, changeSet);
  changeSets.set(`${stackName}:${changeSetName}`, changeSet);

  return xml('CreateChangeSet', `
    <Id>${escapeXml(changeSetId)}</Id>
    <StackId>${escapeXml(stack.stackId)}</StackId>
  `);
}

export function describeChangeSet(req: ParsedApiRequest): ApiResponse {
  const body = req.body;
  const changeSetName = body['ChangeSetName'] as string | undefined;
  const stackName = body['StackName'] as string | undefined;

  if (!changeSetName) return xmlError('ValidationError', 'ChangeSetName is required');

  const cs = changeSets.get(changeSetName)
    ?? (stackName ? changeSets.get(`${stackName}:${changeSetName}`) : undefined);

  if (!cs) return xmlError('ChangeSetNotFoundException', `ChangeSet [${changeSetName}] does not exist`);

  const changesXml = cs.changes.map(c => `<member>
    <Type>${escapeXml(c.Type ?? '')}</Type>
    <ResourceChange>
      <Action>${escapeXml(c.ResourceChange?.Action ?? '')}</Action>
      <LogicalResourceId>${escapeXml(c.ResourceChange?.LogicalResourceId ?? '')}</LogicalResourceId>
      <ResourceType>${escapeXml(c.ResourceChange?.ResourceType ?? '')}</ResourceType>
      <Replacement>${escapeXml(c.ResourceChange?.Replacement ?? '')}</Replacement>
    </ResourceChange>
  </member>`).join('');

  const paramsXml = cs.parameters.map(p =>
    `<member><ParameterKey>${escapeXml(p.ParameterKey ?? '')}</ParameterKey><ParameterValue>${escapeXml(p.ParameterValue ?? '')}</ParameterValue></member>`
  ).join('');

  const capsXml = cs.capabilities.map(c => `<member>${escapeXml(c)}</member>`).join('');

  return xml('DescribeChangeSet', `
    <ChangeSetName>${escapeXml(cs.changeSetName)}</ChangeSetName>
    <ChangeSetId>${escapeXml(cs.changeSetId)}</ChangeSetId>
    <StackId>${escapeXml(cs.stackId)}</StackId>
    <StackName>${escapeXml(cs.stackName)}</StackName>
    <Status>${cs.status}</Status>
    <StatusReason>${escapeXml(cs.statusReason)}</StatusReason>
    <CreationTime>${cs.creationTime}</CreationTime>
    <Parameters>${paramsXml}</Parameters>
    <Capabilities>${capsXml}</Capabilities>
    <Changes>${changesXml}</Changes>
  `);
}

export async function executeChangeSet(req: ParsedApiRequest): Promise<ApiResponse> {
  const body = req.body;
  const changeSetName = body['ChangeSetName'] as string | undefined;
  const stackName = body['StackName'] as string | undefined;

  if (!changeSetName) return xmlError('ValidationError', 'ChangeSetName is required');

  const cs = changeSets.get(changeSetName)
    ?? (stackName ? changeSets.get(`${stackName}:${changeSetName}`) : undefined);

  if (!cs) return xmlError('ChangeSetNotFoundException', `ChangeSet [${changeSetName}] does not exist`);
  if (cs.status !== 'CREATE_COMPLETE') {
    return xmlError('ValidationError', `ChangeSet [${cs.changeSetName}] cannot be executed in status ${cs.status}`);
  }

  const stack = stacks.get(cs.stackName);
  if (!stack) return xmlError('ValidationError', `Stack [${cs.stackName}] does not exist`);

  const now = nowISO();
  const isCreate = stack.stackStatus === 'REVIEW_IN_PROGRESS';
  const snapshot = snapshotStack(stack);
  const targetParameters = cs.parameters.length > 0 ? cs.parameters.map((parameter) => ({ ...parameter })) : snapshot.parameters;
  const targetTags = cs.tags.length > 0 ? cs.tags.map((tag) => ({ ...tag })) : snapshot.tags.map((tag) => ({ ...tag }));
  const targetCapabilities = cs.capabilities.length > 0 ? [...cs.capabilities] : [...snapshot.capabilities];
  const targetRoleArn = cs.roleArn ?? snapshot.roleArn;

  try {
    const template = parseTemplate(cs.templateBody);
    const result = await provision(
      template,
      cs.stackName,
      buildParameterRecord(template, targetParameters),
      REGION,
      isCreate ? undefined : buildExistingResourceMap(snapshot.resources),
    );

    if (!isCreate) {
      await destroyProvisionedResources(
        resourcesToDeleteAfterSuccess(snapshot.resources, result.resources),
        stack.stackName,
        REGION,
      );
    }

    stack.templateBody = cs.templateBody;
    stack.parameters = targetParameters;
    stack.tags = targetTags;
    stack.capabilities = targetCapabilities;
    stack.roleArn = targetRoleArn;
    stack.resources = toPersistedResources(result.resources, now);
    stack.outputs = toPersistedOutputs(result.outputs);
    stack.stackStatus = isCreate ? 'CREATE_COMPLETE' : 'UPDATE_COMPLETE';
    stack.stackStatusReason = '';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (isCreate) {
      if (err instanceof ProvisionError && err.resources.length > 0) {
        await destroyProvisionedResources(
          err.resources.map((resource) => ({
            physicalId: resource.physicalId,
            type: resource.type,
          })),
          stack.stackName,
          REGION,
        );
      }
      stack.resources = [];
      stack.outputs = [];
      stack.stackStatus = 'CREATE_FAILED';
      stack.stackStatusReason = message;
    } else {
      try {
        await restoreStackSnapshot(stack, snapshot, now);
        stack.stackStatus = 'UPDATE_ROLLBACK_COMPLETE';
        stack.stackStatusReason = message;
      } catch (restoreErr) {
        stack.stackStatus = 'UPDATE_ROLLBACK_FAILED';
        stack.stackStatusReason = `${message}; rollback failed: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`;
      }
    }
  }

  stack.lastUpdatedTime = now;
  stacks.set(cs.stackName, stack);
  cs.status = stack.stackStatus === 'CREATE_COMPLETE' || stack.stackStatus === 'UPDATE_COMPLETE'
    ? 'EXECUTE_COMPLETE'
    : 'EXECUTE_FAILED';
  cs.statusReason = stack.stackStatusReason || cs.statusReason;
  changeSets.set(cs.changeSetId, cs);
  changeSets.set(`${cs.stackName}:${cs.changeSetName}`, cs);

  return xml('ExecuteChangeSet', '');
}

export function listChangeSets(req: ParsedApiRequest): ApiResponse {
  const stackName = req.body['StackName'] as string | undefined;
  if (!stackName) return xmlError('ValidationError', 'StackName is required');

  const members: string[] = [];
  for (const [key, cs] of changeSets) {
    if (!key.includes(':')) continue;
    if (cs.stackName !== stackName) continue;
    members.push(`<member>
      <ChangeSetName>${escapeXml(cs.changeSetName)}</ChangeSetName>
      <ChangeSetId>${escapeXml(cs.changeSetId)}</ChangeSetId>
      <StackId>${escapeXml(cs.stackId)}</StackId>
      <StackName>${escapeXml(cs.stackName)}</StackName>
      <Status>${cs.status}</Status>
      <StatusReason>${escapeXml(cs.statusReason)}</StatusReason>
      <CreationTime>${cs.creationTime}</CreationTime>
    </member>`);
  }

  const content = members.length > 0
    ? `<Summaries>${members.join('')}</Summaries>`
    : '<Summaries/>';

  return xml('ListChangeSets', content);
}

export function listExports(_req: ParsedApiRequest): ApiResponse {
  const exports: string[] = [];

  for (const stack of stacks.values()) {
    if (stack.stackStatus === 'DELETE_COMPLETE') continue;
    for (const output of stack.outputs) {
      if (output.ExportName) {
        exports.push(`<member>
          <ExportingStackId>${escapeXml(stack.stackId)}</ExportingStackId>
          <Name>${escapeXml(output.ExportName)}</Name>
          <Value>${escapeXml(output.OutputValue ?? '')}</Value>
        </member>`);
      }
    }
  }

  return xml('ListExports', `<Exports>${exports.join('')}</Exports>`);
}

export function listImports(_req: ParsedApiRequest): ApiResponse {
  return xml('ListImports', '<Imports/>');
}
