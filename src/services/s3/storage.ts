import { resolve, dirname } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync, existsSync } from 'node:fs';
import { PersistentMap } from '../../state/store.js';

const DATA_DIR = resolve('data/s3');

export interface S3ObjectMeta {
  key: string;
  contentType: string;
  etag: string;
  lastModified: string;
  size: number;
  metadata: Record<string, string>;
}

export interface S3Object extends S3ObjectMeta {
  body: Buffer;
}

const meta = new PersistentMap<string, S3ObjectMeta>('s3-objects');

function compositeKey(bucket: string, key: string): string {
  return `${bucket}\0${key}`;
}

function bodyPath(bucket: string, key: string): string {
  const suffix = key.endsWith('/') ? key + 'index' : key;
  return resolve(DATA_DIR, bucket, suffix);
}

export function putObject(bucket: string, key: string, body: Buffer, opts: Omit<S3ObjectMeta, 'key' | 'size'>): void {
  const filePath = bodyPath(bucket, key);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, body);
  meta.set(compositeKey(bucket, key), { ...opts, key, size: body.length });
}

export function getObject(bucket: string, key: string): S3Object | undefined {
  const m = meta.get(compositeKey(bucket, key));
  if (!m) return undefined;
  const filePath = bodyPath(bucket, key);
  if (!existsSync(filePath)) return undefined;
  return { ...m, body: readFileSync(filePath) };
}

export function getObjectMeta(bucket: string, key: string): S3ObjectMeta | undefined {
  return meta.get(compositeKey(bucket, key));
}

export function deleteObject(bucket: string, key: string): boolean {
  const ck = compositeKey(bucket, key);
  if (!meta.has(ck)) return false;
  meta.delete(ck);
  const filePath = bodyPath(bucket, key);
  if (existsSync(filePath)) unlinkSync(filePath);
  return true;
}

export function listObjects(bucket: string, prefix?: string): S3ObjectMeta[] {
  const bucketPrefix = bucket + '\0';
  const results: S3ObjectMeta[] = [];
  for (const [ck, m] of meta.entries()) {
    if (!ck.startsWith(bucketPrefix)) continue;
    if (prefix && !m.key.startsWith(prefix)) continue;
    results.push(m);
  }
  return results;
}

export function deleteBucketObjects(bucket: string): void {
  const bucketPrefix = bucket + '\0';
  const keysToDelete: string[] = [];
  for (const ck of meta.keys()) {
    if (ck.startsWith(bucketPrefix)) keysToDelete.push(ck);
  }
  for (const ck of keysToDelete) {
    const m = meta.get(ck)!;
    meta.delete(ck);
    const filePath = bodyPath(bucket, m.key);
    if (existsSync(filePath)) unlinkSync(filePath);
  }
  const bucketDir = resolve(DATA_DIR, bucket);
  if (existsSync(bucketDir)) rmSync(bucketDir, { recursive: true });
}

export function clearS3Storage(): void {
  meta.clear();
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true });
}
