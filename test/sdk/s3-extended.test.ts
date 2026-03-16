import { describe, test, expect } from 'vitest';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { createS3Client } from './client-factory.js';

async function streamToBuffer(stream: ReadableStream | NodeJS.ReadableStream | undefined): Promise<Buffer> {
  if (!stream) throw new Error('No stream');
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('S3 extended', () => {
  const client = createS3Client();

  test('ListBuckets returns existing buckets', async () => {
    const bucketName = `sdk-list-test-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    try {
      const result = await client.send(new ListBucketsCommand({}));
      expect(result.Buckets).toBeDefined();
      expect(result.Buckets!.some(b => b.Name === bucketName)).toBe(true);
    } finally {
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    }
  });

  test('HeadBucket returns 200 for existing bucket', async () => {
    const bucketName = `sdk-head-test-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    try {
      const result = await client.send(new HeadBucketCommand({ Bucket: bucketName }));
      expect(result.$metadata.httpStatusCode).toBe(200);
    } finally {
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    }
  });

  test('HeadBucket on nonexistent bucket throws', async () => {
    await expect(
      client.send(new HeadBucketCommand({ Bucket: 'nonexistent-head-bucket-xyz' })),
    ).rejects.toThrow();
  });

  test('CreateBucket rejects duplicate bucket names', async () => {
    const bucketName = `sdk-dup-bucket-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    try {
      await client.send(new CreateBucketCommand({ Bucket: bucketName }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('BucketAlreadyOwnedByYou');
    } finally {
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    }
  });

  test('DeleteBucket on non-empty bucket returns BucketNotEmpty', async () => {
    const bucketName = `sdk-notempty-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: 'file.txt',
      Body: Buffer.from('data'),
    }));

    try {
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('BucketNotEmpty');
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: 'file.txt' }));
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    }
  });

  test('HeadObject returns metadata for existing objects', async () => {
    const bucketName = `sdk-head-obj-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: 'doc.txt',
      Body: Buffer.from('hello world'),
      ContentType: 'text/plain',
    }));

    try {
      const result = await client.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: 'doc.txt',
      }));
      expect(result.ContentLength).toBe(11);
      expect(result.ContentType).toBe('text/plain');
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: 'doc.txt' }));
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    }
  });

  test('CopyObject copies between keys in the same bucket', async () => {
    const bucketName = `sdk-copy-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: 'source.txt',
      Body: Buffer.from('copy me'),
    }));

    try {
      await client.send(new CopyObjectCommand({
        Bucket: bucketName,
        Key: 'dest.txt',
        CopySource: `${bucketName}/source.txt`,
      }));

      const getResult = await client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: 'dest.txt',
      }));
      const body = await streamToBuffer(getResult.Body as NodeJS.ReadableStream);
      expect(body.toString()).toBe('copy me');
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: 'source.txt' }));
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: 'dest.txt' }));
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    }
  });

  test('ListObjectsV2 with prefix filters correctly', async () => {
    const bucketName = `sdk-prefix-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(new PutObjectCommand({ Bucket: bucketName, Key: 'docs/a.txt', Body: Buffer.from('a') }));
    await client.send(new PutObjectCommand({ Bucket: bucketName, Key: 'docs/b.txt', Body: Buffer.from('b') }));
    await client.send(new PutObjectCommand({ Bucket: bucketName, Key: 'images/c.png', Body: Buffer.from('c') }));

    try {
      const docsResult = await client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'docs/',
      }));
      expect(docsResult.KeyCount).toBe(2);
      expect(docsResult.Contents?.map(c => c.Key).sort()).toEqual(['docs/a.txt', 'docs/b.txt']);

      const imagesResult = await client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'images/',
      }));
      expect(imagesResult.KeyCount).toBe(1);
      expect(imagesResult.Contents?.[0]?.Key).toBe('images/c.png');
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: 'docs/a.txt' }));
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: 'docs/b.txt' }));
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: 'images/c.png' }));
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    }
  });
});
