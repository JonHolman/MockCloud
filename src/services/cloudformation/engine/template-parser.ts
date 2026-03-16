import type { ParsedTemplate } from './types.js';
import { parse as parseYaml } from 'yaml';
import type { ScalarTag, CollectionTag } from 'yaml';

function scalarTag(tag: string, fn: (value: string) => unknown): ScalarTag {
  return { tag, resolve: (value: string) => fn(value) };
}

function seqTag(tag: string, fn: (value: unknown[]) => unknown): CollectionTag {
  return {
    tag,
    collection: 'seq' as const,
    resolve(value) { return fn((value as { toJSON(): unknown[] }).toJSON()); },
  };
}

const cfCustomTags: Array<ScalarTag | CollectionTag> = [
  scalarTag('!Ref', v => ({ Ref: v })),
  scalarTag('!Condition', v => ({ Condition: v })),
  scalarTag('!ImportValue', v => ({ 'Fn::ImportValue': v })),
  scalarTag('!Sub', v => ({ 'Fn::Sub': v })),
  seqTag('!Sub', v => ({ 'Fn::Sub': v })),
  scalarTag('!GetAtt', v => ({ 'Fn::GetAtt': v.split('.') })),
  seqTag('!GetAtt', v => ({ 'Fn::GetAtt': v })),
  seqTag('!Join', v => ({ 'Fn::Join': v })),
  seqTag('!Select', v => ({ 'Fn::Select': v })),
  seqTag('!If', v => ({ 'Fn::If': v })),
  seqTag('!Equals', v => ({ 'Fn::Equals': v })),
  seqTag('!Split', v => ({ 'Fn::Split': v })),
  seqTag('!Not', v => ({ 'Fn::Not': v })),
  seqTag('!And', v => ({ 'Fn::And': v })),
  seqTag('!Or', v => ({ 'Fn::Or': v })),
];

export function parseTemplate(templateBody: string): ParsedTemplate {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(templateBody) as Record<string, unknown>;
  } catch {
    try {
      raw = parseYaml(templateBody, { customTags: cfCustomTags }) as Record<string, unknown>;
    } catch (yamlErr) {
      const message = yamlErr instanceof Error ? yamlErr.message : String(yamlErr);
      throw new Error(`Template is not valid JSON or YAML: ${message}`);
    }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Template must be a JSON or YAML object');
  }

  const resources = raw['Resources'];
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
    throw new Error('Template must contain a Resources section with at least one resource');
  }

  if (Object.keys(resources).length === 0) {
    throw new Error('Resources section must contain at least one resource');
  }

  const parameters = raw['Parameters'];
  if (parameters !== undefined && (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters))) {
    throw new Error('Parameters section must be an object');
  }

  const conditions = raw['Conditions'];
  if (conditions !== undefined && (typeof conditions !== 'object' || conditions === null || Array.isArray(conditions))) {
    throw new Error('Conditions section must be an object');
  }

  const outputs = raw['Outputs'];
  if (outputs !== undefined && (typeof outputs !== 'object' || outputs === null || Array.isArray(outputs))) {
    throw new Error('Outputs section must be an object');
  }

  return {
    description: typeof raw['Description'] === 'string' ? raw['Description'] : '',
    parameters: (parameters ?? {}) as ParsedTemplate['parameters'],
    conditions: (conditions ?? {}) as Record<string, unknown>,
    resources: resources as ParsedTemplate['resources'],
    outputs: (outputs ?? {}) as ParsedTemplate['outputs'],
  };
}
