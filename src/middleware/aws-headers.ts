import type { ServerResponse } from 'node:http';
import { generateRequestId } from '../util/request-id.js';

export function applyAwsHeaders(res: ServerResponse): void {
  const requestId = generateRequestId();
  res.setHeader('x-amzn-requestid', requestId);
  res.setHeader('x-amz-request-id', requestId);
  res.setHeader('Date', new Date().toUTCString());
}
