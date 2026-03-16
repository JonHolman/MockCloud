import { describe, expect, test } from 'vitest';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { createSTSClient } from '../sdk/client-factory.js';

describe('NAWS e2e smoke', () => {
  test('serves console home and responds to STS', async () => {
    const endpoint = process.env.NAWS_TEST_ENDPOINT;
    expect(endpoint).toBeTruthy();

    const rootResponse = await fetch(`${endpoint}/`, { redirect: 'manual' });
    expect(rootResponse.status).toBe(302);
    expect(rootResponse.headers.get('location')).toBe('/console/home');

    const consoleResponse = await fetch(`${endpoint}/console/home`);
    expect(consoleResponse.status).toBe(200);
    const html = await consoleResponse.text();
    expect(html).toContain('window.__NAWS_LOCAL__ = true');
    expect(html).toContain('<div id="app"></div>');
    expect(html).not.toContain('http://localhost:4444');

    const blockedResponse = await fetch(`${endpoint}/health`);
    expect(blockedResponse.status).toBe(204);

    const sts = createSTSClient();
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    expect(identity).toMatchObject({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:user/naws-user',
      UserId: 'AIDANAWSEXAMPLEUSER',
    });
  });

  test('serves console home background support endpoints', async () => {
    const endpoint = process.env.NAWS_TEST_ENDPOINT;
    expect(endpoint).toBeTruthy();

    const postJson = async (path: string, body: unknown = {}) => {
      const response = await fetch(`${endpoint}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(200);
      return response.json();
    };

    const discoverEndpoint = await postJson('/api/us-east-1.ccs.console.api.aws/DiscoverEndpoint');
    expect(discoverEndpoint).toMatchObject({
      Endpoint: `${endpoint}/api/us-east-1.ccs.console.api.aws`,
      region: 'us-east-1',
    });

    await expect(postJson('/api/us-east-1.ccs.console.api.aws/GetCallerSettings')).resolves.toMatchObject({
      settings: [],
      callerSettings: {
        defaultRegion: 'us-east-1',
        favoriteRegion: 'us-east-1',
      },
    });
    await expect(postJson('/api/us-east-1.ccs.console.api.aws/GetCallerDashboard')).resolves.toMatchObject({
      cards: [],
      widgets: [],
    });
    await expect(postJson('/api/us-east-1.ccs.console.api.aws/BatchGetSetting')).resolves.toMatchObject({
      settings: [],
    });
    await expect(postJson('/api/us-east-1.ccs.console.api.aws/UpdateCallerRecents')).resolves.toMatchObject({
      recentItems: [],
    });
    await expect(postJson('/api/us-east-1.ccs.console.api.aws/UpdateCallerSettings')).resolves.toMatchObject({
      callerSettings: {
        defaultRegion: 'us-east-1',
      },
    });
    await expect(postJson('/api/health.us-east-1.amazonaws.com/')).resolves.toMatchObject({
      entities: [],
      events: [],
    });
    await expect(postJson('/api/health.us-east-2.amazonaws.com/')).resolves.toMatchObject({
      entities: [],
      events: [],
    });
    await expect(postJson('/api/cost-optimization-hub.us-east-1.amazonaws.com/')).resolves.toMatchObject({
      items: [],
    });
    await expect(postJson('/api/ce.us-east-1.amazonaws.com/')).resolves.toMatchObject({
      ResultsByTime: [],
    });

    const appRegistryResponse = await fetch(
      `${endpoint}/api/servicecatalog-appregistry.us-east-1.amazonaws.com/applications?maxResults=100`,
    );
    expect(appRegistryResponse.status).toBe(200);
    await expect(appRegistryResponse.json()).resolves.toMatchObject({
      applications: [],
    });

    const apertureResponse = await fetch(`${endpoint}/aperture/csat/prompt`);
    expect(apertureResponse.status).toBe(200);
    await expect(apertureResponse.json()).resolves.toMatchObject({});

    const iframeResponse = await fetch(
      `${endpoint}/assets/cdn/global.console.aws.amazon.com/lotus/csp/@amzn/awsconsole-concierge-search-lotus/2/iFrame.html`,
    );
    expect(iframeResponse.status).toBe(200);
    const iframeHtml = await iframeResponse.text();
    expect(iframeHtml).not.toContain('http://localhost:4444');
  });
});
