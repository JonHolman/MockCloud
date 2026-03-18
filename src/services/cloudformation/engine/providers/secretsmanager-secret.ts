import { randomInt } from 'node:crypto';
import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { PersistentMap } from '../../../../state/store.js';
import { createSecret, findSecret, updateSecret, deleteSecretById, onSecretDeleted } from '../../../secretsmanager/index.js';
import { info } from '../../../../util/logger.js';

interface GenerateSecretStringOptions {
  ExcludeCharacters?: string;
  ExcludeLowercase?: boolean;
  ExcludeNumbers?: boolean;
  ExcludePunctuation?: boolean;
  ExcludeUppercase?: boolean;
  GenerateStringKey?: string;
  IncludeSpace?: boolean;
  PasswordLength?: number;
  RequireEachIncludedType?: boolean;
  SecretStringTemplate?: string;
}

interface SecretProviderState {
  description: string;
  tags: Array<{ Key: string; Value: string }>;
  secretString?: string;
  generateSecretString?: string;
}

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const PUNCTUATION = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const secretProviderState = new PersistentMap<string, SecretProviderState>('cfn-secretsmanager-secret-provider-state');
onSecretDeleted((arn) => secretProviderState.delete(arn));

function generatePassword(opts: GenerateSecretStringOptions): string {
  const length = opts.PasswordLength ?? 32;
  const requireEach = opts.RequireEachIncludedType ?? true;
  const exclude = new Set(opts.ExcludeCharacters ?? '');

  const pools: string[] = [];
  if (!opts.ExcludeLowercase) pools.push(LOWERCASE);
  if (!opts.ExcludeUppercase) pools.push(UPPERCASE);
  if (!opts.ExcludeNumbers) pools.push(DIGITS);
  if (!opts.ExcludePunctuation) pools.push(PUNCTUATION);
  if (opts.IncludeSpace) pools.push(' ');

  const filteredPools = pools.map((p) => [...p].filter((c) => !exclude.has(c)).join('')).filter((p) => p.length > 0);
  const allChars = filteredPools.join('');
  if (allChars.length === 0) {
    throw new Error('InvalidParameterException: Unable to generate password: no characters available');
  }

  const pick = (chars: string) => chars[randomInt(chars.length)];

  if (requireEach && filteredPools.length <= length) {
    const required = filteredPools.map((pool) => pick(pool));
    const remaining = Array.from({ length: length - required.length }, () => pick(allChars));
    const chars = [...required, ...remaining];
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  return Array.from({ length }, () => pick(allChars)).join('');
}

function resolveSecretString(properties: Record<string, unknown>): string | undefined {
  if (properties.SecretString !== undefined) return properties.SecretString as string;

  const gen = properties.GenerateSecretString as GenerateSecretStringOptions | undefined;
  if (!gen) return undefined;

  const password = generatePassword(gen);

  if (gen.SecretStringTemplate && gen.GenerateStringKey) {
    const template = JSON.parse(gen.SecretStringTemplate);
    template[gen.GenerateStringKey] = password;
    return JSON.stringify(template);
  }

  return password;
}

function normalizeTags(value: unknown): Array<{ Key: string; Value: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((tag) => {
    const next = tag as { Key?: unknown; Value?: unknown };
    return {
      Key: String(next.Key ?? ''),
      Value: String(next.Value ?? ''),
    };
  });
}

function buildProviderState(properties: Record<string, unknown>): SecretProviderState {
  return {
    description: (properties.Description as string) ?? '',
    tags: normalizeTags(properties.Tags),
    secretString: typeof properties.SecretString === 'string' ? properties.SecretString : undefined,
    generateSecretString: properties.GenerateSecretString === undefined
      ? undefined
      : JSON.stringify(properties.GenerateSecretString),
  };
}

export const secretsmanagerSecretProvider: ResourceProvider = {
  type: 'AWS::SecretsManager::Secret',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const name = (properties.Name as string) ?? `${context.stackName}-${logicalId}`;
    const state = buildProviderState(properties);
    const secret = createSecret(name, {
      secretString: resolveSecretString(properties),
      description: state.description,
      tags: state.tags,
    });
    const arn = secret.ARN as string;
    secretProviderState.set(arn, state);
    return { physicalId: arn, attributes: { Id: arn } };
  },
  update(physicalId: string, logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const secret = findSecret(physicalId);
    if (!secret) {
      throw new Error(`Secrets Manager secret ${physicalId} not found`);
    }

    const newName = (properties.Name as string) ?? `${context.stackName}-${logicalId}`;
    if (newName !== secret.Name) {
      const nextState = buildProviderState(properties);
      const newSecret = createSecret(newName, {
        secretString: resolveSecretString(properties),
        description: nextState.description,
        tags: nextState.tags,
      });
      const arn = newSecret.ARN as string;
      secretProviderState.set(arn, nextState);
      return { physicalId: arn, attributes: { Id: arn } };
    }

    const previousState = secretProviderState.get(physicalId);
    const nextState = buildProviderState(properties);
    const updates: {
      secretString?: string;
      description?: string;
      tags?: Array<{ Key: string; Value: string }>;
    } = {};

    if (!previousState || previousState.description !== nextState.description) {
      updates.description = nextState.description;
    }

    if (!previousState || JSON.stringify(previousState.tags) !== JSON.stringify(nextState.tags)) {
      updates.tags = nextState.tags;
    }

    if (nextState.secretString !== undefined) {
      if (nextState.secretString !== secret.SecretString) {
        updates.secretString = nextState.secretString;
      }
    } else if (
      nextState.generateSecretString !== undefined
      && previousState
      && (
        previousState.generateSecretString !== nextState.generateSecretString
        || previousState.secretString !== undefined
      )
    ) {
      updates.secretString = resolveSecretString(properties);
    }

    updateSecret(physicalId, updates);
    secretProviderState.set(physicalId, nextState);

    return { physicalId, attributes: { Id: physicalId } };
  },
  delete(physicalId: string): void {
    try {
      deleteSecretById(physicalId);
      secretProviderState.delete(physicalId);
    } catch (e) { info(`[SecretsManager] failed to delete secret ${physicalId}: ${e}`); }
  },
};
