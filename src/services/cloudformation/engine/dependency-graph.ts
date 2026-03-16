import type { ResourceDefinition } from './types.js';

export function getCreationOrder(resources: Record<string, ResourceDefinition>): string[] {
  const resourceNames = new Set(Object.keys(resources));
  const adjacency = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const name of resourceNames) {
    adjacency.set(name, new Set());
    inDegree.set(name, 0);
  }

  for (const [name, definition] of Object.entries(resources)) {
    const deps = collectDependencies(definition, resourceNames);
    for (const dep of deps) {
      if (dep === name) continue;
      adjacency.get(dep)!.add(name);
      inDegree.set(name, inDegree.get(name)! + 1);
    }
  }

  return topologicalSort(resourceNames, adjacency, inDegree);
}

function collectDependencies(definition: ResourceDefinition, resourceNames: Set<string>): Set<string> {
  const deps = new Set<string>();

  if (definition.DependsOn) {
    const explicit = Array.isArray(definition.DependsOn)
      ? definition.DependsOn
      : [definition.DependsOn];
    for (const dep of explicit) {
      if (resourceNames.has(dep)) deps.add(dep);
    }
  }

  const implicit = findDependencies(definition.Properties, resourceNames);
  for (const dep of implicit) {
    deps.add(dep);
  }

  return deps;
}

function findDependencies(value: unknown, resourceNames: Set<string>): Set<string> {
  const deps = new Set<string>();

  if (value === null || value === undefined || typeof value !== 'object') {
    return deps;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      for (const dep of findDependencies(item, resourceNames)) {
        deps.add(dep);
      }
    }
    return deps;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 1 && keys[0] === 'Ref') {
    const ref = obj['Ref'];
    if (typeof ref === 'string' && resourceNames.has(ref)) {
      deps.add(ref);
    }
    return deps;
  }

  if (keys.length === 1 && keys[0] === 'Fn::GetAtt') {
    const attr = obj['Fn::GetAtt'];
    if (Array.isArray(attr) && attr.length >= 1 && typeof attr[0] === 'string' && resourceNames.has(attr[0])) {
      deps.add(attr[0]);
    }
    return deps;
  }

  if (keys.length === 1 && keys[0] === 'Fn::Sub') {
    const subArg = obj['Fn::Sub'];
    const template = typeof subArg === 'string' ? subArg : Array.isArray(subArg) ? String(subArg[0]) : '';
    for (const match of template.matchAll(/\$\{([^}]+)}/g)) {
      const varName = match[1];
      if (varName.includes('.')) {
        const logicalId = varName.split('.')[0];
        if (resourceNames.has(logicalId)) deps.add(logicalId);
      } else if (resourceNames.has(varName)) {
        deps.add(varName);
      }
    }
    if (Array.isArray(subArg) && subArg[1]) {
      for (const dep of findDependencies(subArg[1], resourceNames)) {
        deps.add(dep);
      }
    }
    return deps;
  }

  for (const k of keys) {
    for (const dep of findDependencies(obj[k], resourceNames)) {
      deps.add(dep);
    }
  }

  return deps;
}

function topologicalSort(
  nodes: Set<string>,
  adjacency: Map<string, Set<string>>,
  inDegree: Map<string, number>,
): string[] {
  const queue: string[] = [];
  for (const node of nodes) {
    if (inDegree.get(node) === 0) queue.push(node);
  }
  // Stable sort for deterministic output
  queue.sort();

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const neighbors = [...adjacency.get(current)!];
    neighbors.sort();
    for (const neighbor of neighbors) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
        queue.sort();
      }
    }
  }

  if (order.length !== nodes.size) {
    const remaining = [...nodes].filter((n) => !order.includes(n));
    throw new Error(`Circular dependency detected among resources: ${remaining.join(', ')}`);
  }

  return order;
}
