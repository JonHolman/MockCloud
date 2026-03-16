import { randomUUID } from 'node:crypto';
import { defineMockService } from '../service.js';
import type { ApiResponse, ParsedApiRequest } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import { jsonAmz11 as json, errorAmz11 as error, ServiceError } from '../response.js';
import { REGION, ACCOUNT_ID } from '../../config.js';
import type { Rule, Target } from '@aws-sdk/client-eventbridge';

export type EventRule = Rule;
export type EventTarget = Target;

const BUS_ARN = `arn:aws:events:${REGION}:${ACCOUNT_ID}:event-bus/default`;

export const rules = new PersistentMap<string, EventRule>('eventbridge-rules');
export const targets = new PersistentMap<string, EventTarget[]>('eventbridge-targets');
const tags = new PersistentMap<string, Record<string, string>>('eventbridge-tags');

export function ruleArn(name: string): string {
  return `arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${name}`;
}

export function deleteRuleState(name: string): void {
  const rule = rules.get(name);
  rules.delete(name);
  targets.delete(name);
  if (rule) {
    tags.delete(rule.Arn!);
  }
}

export interface PutRuleParams {
  name: string;
  eventPattern?: string;
  scheduleExpression?: string;
  state?: 'ENABLED' | 'DISABLED';
  eventBusName?: string;
  description?: string;
  roleArn?: string;
}

export function putRule(params: PutRuleParams): EventRule {
  const existing = rules.get(params.name);
  const rule: EventRule = {
    Name: params.name,
    Arn: existing?.Arn ?? ruleArn(params.name),
    State: params.state ?? existing?.State ?? 'ENABLED',
    EventBusName: params.eventBusName ?? existing?.EventBusName ?? 'default',
    EventPattern: params.eventPattern ?? existing?.EventPattern,
    ScheduleExpression: params.scheduleExpression ?? existing?.ScheduleExpression,
    Description: params.description ?? existing?.Description,
    RoleArn: params.roleArn ?? existing?.RoleArn,
  };
  rules.set(params.name, rule);
  return rule;
}

export function deleteRule(name: string): void {
  if (!rules.has(name)) {
    throw new ServiceError('ResourceNotFoundException', `Rule ${name} does not exist.`, 404);
  }
  deleteRuleState(name);
}

function ruleOutput(r: EventRule): Record<string, unknown> {
  return {
    Name: r.Name,
    Arn: r.Arn,
    State: r.State,
    EventBusName: r.EventBusName,
    ...(r.EventPattern ? { EventPattern: r.EventPattern } : {}),
    ...(r.ScheduleExpression ? { ScheduleExpression: r.ScheduleExpression } : {}),
    ...(r.Description ? { Description: r.Description } : {}),
    ...(r.RoleArn ? { RoleArn: r.RoleArn } : {}),
  };
}

function PutRule(req: ParsedApiRequest): ApiResponse {
  const { Name, EventPattern, ScheduleExpression, State, EventBusName, Description, RoleArn } = req.body as {
    Name?: string;
    EventPattern?: string;
    ScheduleExpression?: string;
    State?: 'ENABLED' | 'DISABLED';
    EventBusName?: string;
    Description?: string;
    RoleArn?: string;
  };
  if (!Name) return error('ValidationException', 'Name is required');

  const rule = putRule({
    name: Name,
    eventPattern: EventPattern,
    scheduleExpression: ScheduleExpression,
    state: State,
    eventBusName: EventBusName,
    description: Description,
    roleArn: RoleArn,
  });
  return json({ RuleArn: rule.Arn });
}

function DescribeRule(req: ParsedApiRequest): ApiResponse {
  const { Name } = req.body as { Name?: string };
  if (!Name) return error('ValidationException', 'Name is required');
  const r = rules.get(Name);
  if (!r) return error('ResourceNotFoundException', `Rule ${Name} does not exist.`, 404);
  return json(ruleOutput(r));
}

function ListRules(req: ParsedApiRequest): ApiResponse {
  const { NamePrefix, EventBusName } = req.body as { NamePrefix?: string; EventBusName?: string };
  const bus = EventBusName ?? 'default';
  let result = Array.from(rules.values()).filter((r) => r.EventBusName === bus);
  if (NamePrefix) {
    result = result.filter((r) => r.Name!.startsWith(NamePrefix));
  }
  return json({ Rules: result.map(ruleOutput) });
}

function DeleteRule(req: ParsedApiRequest): ApiResponse {
  const { Name } = req.body as { Name?: string };
  if (!Name) return error('ValidationException', 'Name is required');
  try {
    deleteRule(Name);
    return json({});
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function EnableRule(req: ParsedApiRequest): ApiResponse {
  const { Name } = req.body as { Name?: string };
  if (!Name) return error('ValidationException', 'Name is required');
  const r = rules.get(Name);
  if (!r) return error('ResourceNotFoundException', `Rule ${Name} does not exist.`, 404);
  r.State = 'ENABLED';
  rules.set(Name, r);
  return json({});
}

function DisableRule(req: ParsedApiRequest): ApiResponse {
  const { Name } = req.body as { Name?: string };
  if (!Name) return error('ValidationException', 'Name is required');
  const r = rules.get(Name);
  if (!r) return error('ResourceNotFoundException', `Rule ${Name} does not exist.`, 404);
  r.State = 'DISABLED';
  rules.set(Name, r);
  return json({});
}

function PutTargets(req: ParsedApiRequest): ApiResponse {
  const { Rule, Targets } = req.body as { Rule?: string; Targets?: EventTarget[] };
  if (!Rule) return error('ValidationException', 'Rule is required');
  if (!rules.has(Rule)) return error('ResourceNotFoundException', `Rule ${Rule} does not exist.`, 404);
  if (!Targets || Targets.length === 0) return error('ValidationException', 'Targets is required');

  const existing = targets.get(Rule) ?? [];
  for (const t of Targets) {
    const idx = existing.findIndex((e) => e.Id === t.Id);
    if (idx >= 0) {
      existing[idx] = t;
    } else {
      existing.push(t);
    }
  }
  targets.set(Rule, existing);
  return json({ FailedEntryCount: 0, FailedEntries: [] });
}

function ListTargetsByRule(req: ParsedApiRequest): ApiResponse {
  const { Rule } = req.body as { Rule?: string };
  if (!Rule) return error('ValidationException', 'Rule is required');
  if (!rules.has(Rule)) return error('ResourceNotFoundException', `Rule ${Rule} does not exist.`, 404);
  return json({ Targets: targets.get(Rule) ?? [] });
}

function RemoveTargets(req: ParsedApiRequest): ApiResponse {
  const { Rule, Ids } = req.body as { Rule?: string; Ids?: string[] };
  if (!Rule) return error('ValidationException', 'Rule is required');
  if (!rules.has(Rule)) return error('ResourceNotFoundException', `Rule ${Rule} does not exist.`, 404);
  if (!Ids || Ids.length === 0) return error('ValidationException', 'Ids is required');

  const existing = targets.get(Rule) ?? [];
  const idSet = new Set(Ids);
  targets.set(Rule, existing.filter((t) => !idSet.has(t.Id!)));
  return json({ FailedEntryCount: 0, FailedEntries: [] });
}

function DescribeEventBus(): ApiResponse {
  return json({ Name: 'default', Arn: BUS_ARN });
}

function ListEventBuses(): ApiResponse {
  return json({ EventBuses: [{ Name: 'default', Arn: BUS_ARN }] });
}

function PutEvents(req: ParsedApiRequest): ApiResponse {
  const { Entries } = req.body as { Entries?: unknown[] };
  const count = Entries?.length ?? 0;
  const resultEntries = Array.from({ length: count }, () => ({ EventId: randomUUID() }));
  return json({ FailedEntryCount: 0, Entries: resultEntries });
}

function TagResource(req: ParsedApiRequest): ApiResponse {
  const { ResourceARN, Tags: inputTags } = req.body as {
    ResourceARN?: string;
    Tags?: Array<{ Key: string; Value: string }>;
  };
  if (!ResourceARN) return error('ValidationException', 'ResourceARN is required');
  if (!inputTags || inputTags.length === 0) return error('ValidationException', 'Tags is required');

  const existing = tags.get(ResourceARN) ?? {};
  for (const t of inputTags) {
    existing[t.Key] = t.Value;
  }
  tags.set(ResourceARN, existing);
  return json({});
}

function ListTagsForResource(req: ParsedApiRequest): ApiResponse {
  const { ResourceARN } = req.body as { ResourceARN?: string };
  if (!ResourceARN) return error('ValidationException', 'ResourceARN is required');
  const resourceTags = tags.get(ResourceARN) ?? {};
  const tagList = Object.entries(resourceTags).map(([Key, Value]) => ({ Key, Value }));
  return json({ Tags: tagList });
}

export const eventbridgeService = defineMockService({
  name: 'eventbridge',
  hostPatterns: ['events.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'AWSEvents',
  signingName: 'events',
  handlers: {
    PutRule,
    DescribeRule,
    ListRules,
    DeleteRule,
    EnableRule,
    DisableRule,
    PutTargets,
    ListTargetsByRule,
    RemoveTargets,
    DescribeEventBus,
    ListEventBuses,
    PutEvents,
    TagResource,
    ListTagsForResource,
    ListConnections: () => json({ Connections: [] }),
    ListApiDestinations: () => json({ ApiDestinations: [] }),
    _default: () => json({}),
  },
});
