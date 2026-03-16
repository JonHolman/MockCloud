import type { IncomingMessage } from 'node:http';
import type { ParsedApiRequest } from '../types.js';

function readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function decodeAwsChunked(buf: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const lineEnd = buf.indexOf('\r\n', offset);
    if (lineEnd === -1) break;
    const line = buf.subarray(offset, lineEnd).toString('utf-8');
    const semiIdx = line.indexOf(';');
    const hexSize = semiIdx >= 0 ? line.slice(0, semiIdx) : line;
    const chunkSize = parseInt(hexSize, 16);
    if (isNaN(chunkSize) || chunkSize === 0) break;
    const dataStart = lineEnd + 2;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > buf.length) break;
    chunks.push(buf.subarray(dataStart, dataEnd));
    offset = dataEnd + 2;
  }
  return Buffer.concat(chunks);
}

function parseHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(', ');
    }
  }
  return headers;
}

export async function parseApiRequest(req: IncomingMessage): Promise<ParsedApiRequest> {
  let rawBodyBuffer = await readBodyBuffer(req);
  const contentEncoding = req.headers['content-encoding'] ?? '';
  if (contentEncoding.includes('aws-chunked')) {
    rawBodyBuffer = decodeAwsChunked(rawBodyBuffer);
  }
  const rawBodyStr = rawBodyBuffer.toString('utf-8');
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const queryParams: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    queryParams[key] = value;
  }

  const headers = parseHeaders(req);
  let action = '';

  const amzTarget = headers['x-amz-target'];
  if (amzTarget) {
    const hashIdx = amzTarget.indexOf('#');
    if (hashIdx >= 0) {
      action = amzTarget.slice(hashIdx + 1);
    } else {
      const parts = amzTarget.split('.');
      action = parts[parts.length - 1];
    }
  }

  if (!action && queryParams['Action']) {
    action = queryParams['Action'];
  }

  const contentType = headers['content-type'] ?? '';
  let body: Record<string, unknown> = {};

  if (contentType.includes('json') || contentType.includes('amz-json') ||
      (contentType.includes('text/plain') && rawBodyStr.startsWith('{'))) {
    try {
      body = rawBodyStr ? JSON.parse(rawBodyStr) : {};
    } catch {
      body = {};
    }
  } else if (contentType.includes('x-www-form-urlencoded') || (!contentType && rawBodyStr.includes('Action='))) {
    const params = new URLSearchParams(rawBodyStr);
    for (const [key, value] of params.entries()) {
      body[key] = value;
    }
    if (!action && typeof body['Action'] === 'string') {
      action = body['Action'];
    }
  }

  return {
    action,
    body,
    rawBody: rawBodyBuffer,
    headers,
    queryParams,
    path: url.pathname,
    method: req.method ?? 'GET',
  };
}
