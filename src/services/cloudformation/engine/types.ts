export interface ResourceProvider {
  type: string;
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult | Promise<ProvisionResult>;
  update?(physicalId: string, logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult | Promise<ProvisionResult>;
  delete?(physicalId: string, context: ProvisionContext): void | Promise<void>;
}

export interface ProvisionContext {
  stackName: string;
  region: string;
  accountId: string;
  resolvedResources: Map<string, ResolvedResource>;
}

export interface ResolvedResource {
  physicalId: string;
  attributes: Record<string, string>;
}

export interface ProvisionResult {
  physicalId: string;
  attributes: Record<string, string>;
}

export interface ParsedTemplate {
  description: string;
  parameters: Record<string, ParameterDefinition>;
  conditions: Record<string, unknown>;
  resources: Record<string, ResourceDefinition>;
  outputs: Record<string, OutputDefinition>;
}

export interface ParameterDefinition {
  Type: string;
  Default?: string;
  Description?: string;
  AllowedValues?: string[];
}

export interface ResourceDefinition {
  Type: string;
  Properties: Record<string, unknown>;
  DependsOn?: string | string[];
  Condition?: string;
}

export interface OutputDefinition {
  Value: unknown;
  Description?: string;
  Export?: { Name: unknown };
  Condition?: string;
}
