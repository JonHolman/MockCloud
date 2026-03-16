import type { IncomingMessage, ServerResponse } from 'node:http';

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => Promise<void>,
) => Promise<void>;

export interface ServerConfig {
  port: number;
  region: string;
  verbose: boolean;
}

export interface MockServiceDefinition {
  name: string;
  hostPatterns: string[];
  protocol: 'query' | 'json' | 'rest-xml' | 'rest-json';
  targetPrefix?: string;
  signingName?: string;
  handlers: Record<string, ApiHandler>;
}

export type ApiHandler = (req: ParsedApiRequest) => ApiResponse | Promise<ApiResponse>;

export interface ParsedApiRequest {
  action: string;
  body: Record<string, any>;
  rawBody: Buffer;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  path: string;
  method: string;
}

export interface ApiResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  bodyBuffer?: Buffer;
}

