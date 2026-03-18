import { describe, expect, test } from 'vitest';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { createSTSClient } from '../sdk/client-factory.js';

describe('MockCloud e2e smoke', () => {
  test('serves console home and responds to STS', async () => {
    const endpoint = process.env.MOCKCLOUD_TEST_ENDPOINT;
    expect(endpoint).toBeTruthy();

    const rootResponse = await fetch(`${endpoint}/`, { redirect: 'manual' });
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.headers.get('content-type')).toContain('text/html');
    const rootHtml = await rootResponse.text();
    expect(rootHtml).toContain('<title>MockCloud Console</title>');
    expect(rootHtml).toContain('<div id="root"></div>');
    expect(rootHtml).toContain('src="/assets/');

    const clientRouteResponse = await fetch(`${endpoint}/cloudformation`, { redirect: 'manual' });
    expect(clientRouteResponse.status).toBe(200);
    expect(clientRouteResponse.headers.get('content-type')).toContain('text/html');
    const clientRouteHtml = await clientRouteResponse.text();
    expect(clientRouteHtml).toContain('<div id="root"></div>');

    const blockedResponse = await fetch(`${endpoint}/health`);
    expect(blockedResponse.status).toBe(204);

    const sts = createSTSClient();
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    expect(identity).toMatchObject({
      Account: '000000000000',
      Arn: 'arn:aws:iam::000000000000:user/mockcloud-user',
      UserId: 'AIDANAWSEXAMPLEUSER',
    });
  });

});
