import { describe, test, expect } from 'vitest';
import {
  PutParameterCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  DescribeParametersCommand,
  DeleteParameterCommand,
} from '@aws-sdk/client-ssm';
import { createSSMClient } from './client-factory.js';

describe('SSM', () => {
  const client = createSSMClient();

  test('CRUD lifecycle', async () => {
    const paramName = `/test/param-${Date.now()}`;

    const putResult = await client.send(new PutParameterCommand({
      Name: paramName,
      Value: 'test-value',
      Type: 'String',
    }));
    expect(putResult.Version).toBeTruthy();

    const getResult = await client.send(new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    }));
    expect(getResult.Parameter?.Value).toBe('test-value');
    expect(getResult.Parameter?.Name).toBe(paramName);

    const pathResult = await client.send(new GetParametersByPathCommand({
      Path: '/test/',
    }));
    expect(pathResult.Parameters?.some(p => p.Name === paramName)).toBe(true);

    const describeResult = await client.send(new DescribeParametersCommand({}));
    expect(describeResult.Parameters?.some(p => p.Name === paramName)).toBe(true);

    await client.send(new DeleteParameterCommand({ Name: paramName }));
  });

  test('GetParameter on nonexistent param returns ParameterNotFound', async () => {
    try {
      await client.send(new GetParameterCommand({
        Name: '/nonexistent/param-xyz',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ParameterNotFound');
    }
  });
});
