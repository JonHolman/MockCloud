import { describe, test, expect } from 'vitest';
import {
  CreateLogGroupCommand,
  DescribeLogGroupsCommand,
  CreateLogStreamCommand,
  DescribeLogStreamsCommand,
  PutLogEventsCommand,
  GetLogEventsCommand,
  DeleteLogGroupCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { createLogsClient } from './client-factory.js';

describe('CloudWatch Logs', () => {
  const client = createLogsClient();

  test('CRUD lifecycle', async () => {
    const logGroupName = `/test/logs-${Date.now()}`;
    const logStreamName = 'test-stream';

    await client.send(new CreateLogGroupCommand({ logGroupName }));

    const describeGroups = await client.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName }));
    expect(describeGroups.logGroups?.some(g => g.logGroupName === logGroupName)).toBe(true);

    await client.send(new CreateLogStreamCommand({ logGroupName, logStreamName }));

    const describeStreams = await client.send(new DescribeLogStreamsCommand({ logGroupName }));
    expect(describeStreams.logStreams?.some(s => s.logStreamName === logStreamName)).toBe(true);

    await client.send(new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents: [{ timestamp: Date.now(), message: 'test' }],
    }));

    const getEvents = await client.send(new GetLogEventsCommand({ logGroupName, logStreamName }));
    expect(getEvents.events && getEvents.events.length > 0).toBe(true);
    expect(getEvents.events![0].message).toBe('test');

    await client.send(new DeleteLogGroupCommand({ logGroupName }));
  });
});
