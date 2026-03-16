import type { MockServiceDefinition, ParsedApiRequest } from '../types.js';

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+');
  return new RegExp(`^${escaped}$`);
}

export function createResolver(
  services: MockServiceDefinition[],
): (urlPath: string, request: ParsedApiRequest) => { service: MockServiceDefinition; action: string } | null {
  const compiledPatterns = services.map((service) => ({
    service,
    regexes: service.hostPatterns.map(patternToRegex),
  }));

  return (urlPath: string, request: ParsedApiRequest) => {
    // /api/<hostname>/... → extract hostname
    const apiMatch = urlPath.match(/^\/api\/([^/]+)(?:\/(.+))?/);
    if (apiMatch) {
      const hostname = apiMatch[1];
      const pathAction = apiMatch[2] ?? '';
      for (const { service, regexes } of compiledPatterns) {
        for (const regex of regexes) {
          if (regex.test(hostname)) {
            const action = request.action || pathAction;
            return { service, action };
          }
        }
      }
    }

    // Fallback: match by X-Amz-Target prefix
    const amzTarget = request.headers['x-amz-target'];
    if (amzTarget) {
      const hashIdx = amzTarget.indexOf('#');
      const prefix = hashIdx >= 0 ? amzTarget.slice(0, hashIdx) : amzTarget.split('.').slice(0, -1).join('.');
      for (const { service } of compiledPatterns) {
        if (service.targetPrefix && service.targetPrefix === prefix) {
          return { service, action: request.action };
        }
      }
    }

    return null;
  };
}
