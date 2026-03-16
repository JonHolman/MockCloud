import type { ResolvedResource } from './types.js';

export interface IntrinsicContext {
  stackName: string;
  region: string;
  accountId: string;
  resolvedResources: Map<string, ResolvedResource>;
  parameters: Record<string, string>;
  conditions: Record<string, unknown>;
  evaluatedConditions: Record<string, boolean>;
  exports: Map<string, string>;
}

const PSEUDO_PARAMETERS: Record<string, (ctx: IntrinsicContext) => string> = {
  'AWS::StackName': (ctx) => ctx.stackName,
  'AWS::Region': (ctx) => ctx.region,
  'AWS::AccountId': (ctx) => ctx.accountId,
  'AWS::StackId': (ctx) =>
    `arn:aws:cloudformation:${ctx.region}:${ctx.accountId}:stack/${ctx.stackName}/00000000-0000-0000-0000-000000000000`,
  'AWS::Partition': () => 'aws',
  'AWS::NoValue': () => '',
  'AWS::URLSuffix': () => 'amazonaws.com',
};

export function resolveIntrinsic(value: unknown, context: IntrinsicContext): unknown {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveIntrinsic(item, context));
  }

  if (typeof value !== 'object') return String(value);

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 1) {
    const key = keys[0];
    const arg = obj[key];

    switch (key) {
      case 'Ref':
        return resolveRef(arg as string, context);
      case 'Fn::GetAtt':
        return resolveGetAtt(arg, context);
      case 'Fn::Sub':
        return resolveSub(arg, context);
      case 'Fn::Join':
        return resolveJoin(arg, context);
      case 'Fn::Select':
        return resolveSelect(arg, context);
      case 'Fn::If':
        return resolveIf(arg, context);
      case 'Fn::Equals':
        return resolveEquals(arg, context);
      case 'Fn::Split':
        return resolveSplit(arg, context);
      case 'Fn::ImportValue':
        return resolveImportValue(arg, context);
      case 'Fn::Not':
        return resolveNot(arg, context);
      case 'Fn::And':
        return resolveAnd(arg, context);
      case 'Fn::Or':
        return resolveOr(arg, context);
    }
  }

  const resolved: Record<string, unknown> = {};
  for (const k of keys) {
    resolved[k] = resolveIntrinsic(obj[k], context);
  }
  return resolved;
}

export function resolveValue(value: unknown, context: IntrinsicContext): string {
  const result = resolveIntrinsic(value, context);
  if (typeof result === 'object' && result !== null) {
    return JSON.stringify(result);
  }
  return String(result);
}

function resolveRef(logicalId: string, context: IntrinsicContext): string {
  const pseudo = PSEUDO_PARAMETERS[logicalId];
  if (pseudo) return pseudo(context);

  if (logicalId in context.parameters) {
    return context.parameters[logicalId];
  }

  const resource = context.resolvedResources.get(logicalId);
  if (resource) return resource.physicalId;

  throw new Error(`Ref to unknown resource or parameter: ${logicalId}`);
}

function resolveGetAtt(arg: unknown, context: IntrinsicContext): string {
  if (!Array.isArray(arg) || arg.length !== 2) {
    throw new Error('Fn::GetAtt requires an array of [logicalId, attributeName]');
  }
  const [logicalId, attrName] = arg as [string, string];
  const resource = context.resolvedResources.get(logicalId);
  if (!resource) {
    throw new Error(`Fn::GetAtt references unknown resource: ${logicalId}`);
  }
  const attrValue = resource.attributes[attrName];
  if (attrValue === undefined) {
    throw new Error(`Fn::GetAtt: resource ${logicalId} has no attribute ${attrName}`);
  }
  return attrValue;
}

function resolveSub(arg: unknown, context: IntrinsicContext): string {
  let template: string;
  let extraVars: Record<string, unknown> = {};

  if (typeof arg === 'string') {
    template = arg;
  } else if (Array.isArray(arg) && arg.length === 2) {
    template = arg[0] as string;
    extraVars = arg[1] as Record<string, unknown>;
  } else {
    throw new Error('Fn::Sub requires a string or [string, object]');
  }

  return template.replace(/\$\{([^}]+)}/g, (_match, varName: string) => {
    if (varName in extraVars) {
      return resolveValue(extraVars[varName], context);
    }
    if (varName.includes('.')) {
      const [logicalId, attrName] = varName.split('.');
      return resolveGetAtt([logicalId, attrName], context);
    }
    return resolveRef(varName, context);
  });
}

function resolveJoin(arg: unknown, context: IntrinsicContext): string {
  if (!Array.isArray(arg) || arg.length !== 2) {
    throw new Error('Fn::Join requires [delimiter, [values]]');
  }
  const [delimiter, rawValues] = arg;
  let values = resolveIntrinsic(rawValues, context);
  if (typeof values === 'string') {
    values = [values];
  }
  if (!Array.isArray(values)) {
    throw new Error('Fn::Join second argument must be an array or string');
  }
  return values.map((v) => resolveValue(v, context)).join(String(delimiter));
}

function resolveSelect(arg: unknown, context: IntrinsicContext): unknown {
  if (!Array.isArray(arg) || arg.length !== 2) {
    throw new Error('Fn::Select requires [index, [values]]');
  }
  const [rawIndex, rawValues] = arg;
  const index = Number(resolveIntrinsic(rawIndex, context));
  const values = resolveIntrinsic(rawValues, context);
  if (!Array.isArray(values)) {
    throw new Error('Fn::Select second argument must resolve to an array');
  }
  if (index < 0 || index >= values.length) {
    throw new Error(`Fn::Select index ${index} out of bounds (array length ${values.length})`);
  }
  return values[index];
}

function resolveIf(arg: unknown, context: IntrinsicContext): unknown {
  if (!Array.isArray(arg) || arg.length !== 3) {
    throw new Error('Fn::If requires [conditionName, trueValue, falseValue]');
  }
  const [conditionName, trueValue, falseValue] = arg;
  if (typeof conditionName !== 'string') {
    throw new Error('Fn::If condition name must be a string');
  }
  const conditionResult = context.evaluatedConditions[conditionName];
  if (conditionResult === undefined) {
    throw new Error(`Fn::If references unknown condition: ${conditionName}`);
  }
  return resolveIntrinsic(conditionResult ? trueValue : falseValue, context);
}

function resolveEquals(arg: unknown, context: IntrinsicContext): string {
  if (!Array.isArray(arg) || arg.length !== 2) {
    throw new Error('Fn::Equals requires [value1, value2]');
  }
  const a = resolveValue(arg[0], context);
  const b = resolveValue(arg[1], context);
  return a === b ? 'true' : 'false';
}

function resolveSplit(arg: unknown, context: IntrinsicContext): string[] {
  if (!Array.isArray(arg) || arg.length !== 2) {
    throw new Error('Fn::Split requires [delimiter, string]');
  }
  const delimiter = resolveValue(arg[0], context);
  const source = resolveValue(arg[1], context);
  return source.split(delimiter);
}

function resolveImportValue(arg: unknown, context: IntrinsicContext): string {
  const exportName = resolveValue(arg, context);
  const value = context.exports.get(exportName);
  if (value === undefined) {
    throw new Error(`Fn::ImportValue: export '${exportName}' not found`);
  }
  return value;
}

function resolveNot(arg: unknown, context: IntrinsicContext): string {
  if (!Array.isArray(arg) || arg.length !== 1) {
    throw new Error('Fn::Not requires [condition]');
  }
  const val = resolveValue(arg[0], context);
  return val === 'true' ? 'false' : 'true';
}

function resolveAnd(arg: unknown, context: IntrinsicContext): string {
  if (!Array.isArray(arg) || arg.length < 2) {
    throw new Error('Fn::And requires at least 2 conditions');
  }
  for (const cond of arg) {
    if (resolveValue(cond, context) !== 'true') return 'false';
  }
  return 'true';
}

function resolveOr(arg: unknown, context: IntrinsicContext): string {
  if (!Array.isArray(arg) || arg.length < 2) {
    throw new Error('Fn::Or requires at least 2 conditions');
  }
  for (const cond of arg) {
    if (resolveValue(cond, context) === 'true') return 'true';
  }
  return 'false';
}

export function evaluateConditions(
  conditions: Record<string, unknown>,
  context: IntrinsicContext,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [name, expression] of Object.entries(conditions)) {
    const resolved = resolveValue(expression, context);
    result[name] = resolved === 'true';
  }
  return result;
}
