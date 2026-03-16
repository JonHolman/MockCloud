import { describe, test, expect } from 'vitest';
import {
  CreateTableCommand,
  DescribeEndpointsCommand,
  PutItemCommand,
  GetItemCommand,
  ScanCommand,
  DeleteTableCommand,
} from '@aws-sdk/client-dynamodb';
import { createDynamoDBClient, getTestEndpoint } from './client-factory.js';

describe('DynamoDB', () => {
  const client = createDynamoDBClient();

  test('CRUD lifecycle', async () => {
    const tableName = `sdk-test-${Date.now()}`;

    const createResult = await client.send(new CreateTableCommand({
      TableName: tableName,
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }));
    expect(createResult.TableDescription?.TableName).toBe(tableName);
    expect(createResult.TableDescription?.TableStatus).toBe('ACTIVE');

    await client.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: 'user-1' },
        name: { S: 'Alice' },
        age: { N: '30' },
      },
    }));

    const getResult = await client.send(new GetItemCommand({
      TableName: tableName,
      Key: { pk: { S: 'user-1' } },
    }));
    expect(getResult.Item?.pk?.S).toBe('user-1');
    expect(getResult.Item?.name?.S).toBe('Alice');
    expect(getResult.Item?.age?.N).toBe('30');

    const scanResult = await client.send(new ScanCommand({
      TableName: tableName,
    }));
    expect(scanResult.Count).toBe(1);
    expect(scanResult.Items?.[0]?.pk?.S).toBe('user-1');

    const deleteResult = await client.send(new DeleteTableCommand({
      TableName: tableName,
    }));
    expect(deleteResult.TableDescription?.TableName).toBe(tableName);
  });

  test('DescribeEndpoints returns the active server address', async () => {
    const result = await client.send(new DescribeEndpointsCommand({}));
    expect(result.Endpoints?.[0]?.Address).toBe(new URL(getTestEndpoint()).host);
  });

  test('GetItem from nonexistent table returns ResourceNotFoundException', async () => {
    try {
      await expect(
        client.send(new GetItemCommand({
          TableName: 'nonexistent-table-xyz',
          Key: { pk: { S: 'any-key' } },
        })),
      ).rejects.toThrow();

      await client.send(new GetItemCommand({
        TableName: 'nonexistent-table-xyz',
        Key: { pk: { S: 'any-key' } },
      }));
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });
});
