import { beforeEach, describe, expect, test } from 'vitest';
import type { ProvisionContext } from '../../src/services/cloudformation/engine/types.js';
import { apigatewayStageProvider } from '../../src/services/cloudformation/engine/providers/apigateway-stage.js';
import { stages } from '../../src/services/apigateway/index.js';

const context: ProvisionContext = {
  stackName: 'unit-apigateway-stage-stack',
  region: 'us-east-1',
  accountId: '000000000000',
  resolvedResources: new Map(),
};

describe('apigatewayStageProvider', () => {
  beforeEach(() => {
    stages.clear();
    stages.set('api-1', new Map());
    stages.set('api-2', new Map());
  });

  test('uses api-specific physical ids for same-named stages', async () => {
    const first = await apigatewayStageProvider.create('FirstStage', {
      RestApiId: 'api-1',
      StageName: 'prod',
      DeploymentId: 'dep-1',
    }, context);
    const second = await apigatewayStageProvider.create('SecondStage', {
      RestApiId: 'api-2',
      StageName: 'prod',
      DeploymentId: 'dep-2',
    }, context);

    expect(first.physicalId).toBe('api-1/prod');
    expect(second.physicalId).toBe('api-2/prod');
  });

  test('updates the stage selected by the physical id', async () => {
    await apigatewayStageProvider.create('Stage', {
      RestApiId: 'api-1',
      StageName: 'prod',
      DeploymentId: 'dep-1',
    }, context);

    await apigatewayStageProvider.update!(
      'api-1/prod',
      'Stage',
      {
        RestApiId: 'api-1',
        StageName: 'prod',
        DeploymentId: 'dep-2',
      },
      context,
    );

    expect(stages.get('api-1')?.get('prod')?.deploymentId).toBe('dep-2');
  });
});
