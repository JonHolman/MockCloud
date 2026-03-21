import type { IncomingMessage, ServerResponse } from 'node:http';

const DEFAULT_ALLOWED_HEADERS = [
  'Content-Type',
  'X-Amz-Target',
  'X-Amz-Date',
  'Authorization',
  'X-Amz-Security-Token',
  'X-Amz-User-Agent',
  'x-amz-content-sha256',
  'amz-sdk-invocation-id',
  'amz-sdk-request',
  'cache-control',
  'x-api-key',
];

export function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const requestedHeaders = [
    req.headers['access-control-request-headers'],
    req.headers['Access-Control-Request-Headers'],
  ]
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => value.trim())
    .filter(Boolean);
  const allowHeaders = Array.from(
    new Set([...DEFAULT_ALLOWED_HEADERS, ...requestedHeaders])
  );

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', allowHeaders.join(', '));
  res.setHeader('Access-Control-Expose-Headers', 'x-amzn-requestid, x-amz-request-id');
  res.setHeader('Access-Control-Max-Age', '86400');
}
