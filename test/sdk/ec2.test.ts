import { describe, test, expect } from 'vitest';
import {
  DescribeRegionsCommand,
  DescribeAvailabilityZonesCommand,
  DescribeVpcsCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
} from '@aws-sdk/client-ec2';
import { createEC2Client } from './client-factory.js';

describe('EC2', () => {
  const client = createEC2Client();

  test('DescribeRegions returns regions', async () => {
    const result = await client.send(new DescribeRegionsCommand({}));
    expect(result.Regions).toBeDefined();
    expect(result.Regions!.length).toBeGreaterThanOrEqual(1);
  });

  test('DescribeAvailabilityZones returns zones', async () => {
    const result = await client.send(new DescribeAvailabilityZonesCommand({}));
    expect(result.AvailabilityZones).toBeDefined();
  });

  test('DescribeVpcs returns vpcs', async () => {
    const result = await client.send(new DescribeVpcsCommand({}));
    expect(result.Vpcs).toBeDefined();
  });

  test('DescribeSecurityGroups returns security groups', async () => {
    const result = await client.send(new DescribeSecurityGroupsCommand({}));
    expect(result.SecurityGroups).toBeDefined();
  });

  test('DescribeSubnets returns subnets', async () => {
    const result = await client.send(new DescribeSubnetsCommand({}));
    expect(result.Subnets).toBeDefined();
  });
});
