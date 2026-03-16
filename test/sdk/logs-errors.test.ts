import { describe, test, expect } from 'vitest';
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DeleteLogGroupCommand,
  DescribeLogStreamsCommand,
  PutLogEventsCommand,
  GetLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { createLogsClient } from './client-factory.js';

describe('CloudWatch Logs error paths', () => {
  const client = createLogsClient();

  test('DeleteLogGroup on nonexistent group returns ResourceNotFoundException', async () => {
    try {
      await client.send(new DeleteLogGroupCommand({ logGroupName: '/nonexistent/log-group-xyz' }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });

  test('CreateLogGroup rejects duplicate group names', async () => {
    const logGroupName = `/test/dup-group-${Date.now()}`;

    await client.send(new CreateLogGroupCommand({ logGroupName }));

    try {
      await client.send(new CreateLogGroupCommand({ logGroupName }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceAlreadyExistsException');
    } finally {
      await client.send(new DeleteLogGroupCommand({ logGroupName }));
    }
  });

  test('CreateLogStream on nonexistent group returns ResourceNotFoundException', async () => {
    try {
      await client.send(new CreateLogStreamCommand({
        logGroupName: '/nonexistent/group-for-stream-xyz',
        logStreamName: 'any-stream',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });

  test('DescribeLogStreams on nonexistent group returns ResourceNotFoundException', async () => {
    try {
      await client.send(new DescribeLogStreamsCommand({
        logGroupName: '/nonexistent/group-for-describe-xyz',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });

  test('PutLogEvents on nonexistent group returns ResourceNotFoundException', async () => {
    try {
      await client.send(new PutLogEventsCommand({
        logGroupName: '/nonexistent/group-for-put-xyz',
        logStreamName: 'any-stream',
        logEvents: [{ timestamp: Date.now(), message: 'test' }],
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });

  test('PutLogEvents on nonexistent stream returns ResourceNotFoundException', async () => {
    const logGroupName = `/test/put-events-no-stream-${Date.now()}`;

    await client.send(new CreateLogGroupCommand({ logGroupName }));

    try {
      await client.send(new PutLogEventsCommand({
        logGroupName,
        logStreamName: 'nonexistent-stream-xyz',
        logEvents: [{ timestamp: Date.now(), message: 'test' }],
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    } finally {
      await client.send(new DeleteLogGroupCommand({ logGroupName }));
    }
  });

  test('GetLogEvents on nonexistent stream returns ResourceNotFoundException', async () => {
    const logGroupName = `/test/get-events-no-stream-${Date.now()}`;

    await client.send(new CreateLogGroupCommand({ logGroupName }));

    try {
      await client.send(new GetLogEventsCommand({
        logGroupName,
        logStreamName: 'nonexistent-stream-xyz',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    } finally {
      await client.send(new DeleteLogGroupCommand({ logGroupName }));
    }
  });

  test('CreateLogStream rejects duplicate stream names', async () => {
    const logGroupName = `/test/dup-stream-${Date.now()}`;
    const logStreamName = 'duplicate-stream';

    await client.send(new CreateLogGroupCommand({ logGroupName }));

    try {
      await client.send(new CreateLogStreamCommand({ logGroupName, logStreamName }));

      await client.send(new CreateLogStreamCommand({ logGroupName, logStreamName }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceAlreadyExistsException');
    } finally {
      await client.send(new DeleteLogGroupCommand({ logGroupName }));
    }
  });
});
