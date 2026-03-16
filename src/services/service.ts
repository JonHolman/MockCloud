import type { MockServiceDefinition } from '../types.js';

export type { MockServiceDefinition };

export function defineMockService(def: MockServiceDefinition): MockServiceDefinition {
  return def;
}
