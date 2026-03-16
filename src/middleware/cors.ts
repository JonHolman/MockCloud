import type { ServerResponse } from 'node:http';

export function applyCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Amz-Target, X-Amz-Date, Authorization, X-Amz-Security-Token, X-Amz-User-Agent, x-amz-content-sha256, amz-sdk-invocation-id, amz-sdk-request, cache-control, x-api-key',
  );
  res.setHeader('Access-Control-Expose-Headers', 'x-amzn-requestid, x-amz-request-id');
  res.setHeader('Access-Control-Max-Age', '86400');
}
