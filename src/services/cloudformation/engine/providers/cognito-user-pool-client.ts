import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { poolClients, generateClientId } from '../../../cognito-idp/index.js';

export const cognitoUserPoolClientProvider: ResourceProvider = {
  type: 'AWS::Cognito::UserPoolClient',
  create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const userPoolId = properties.UserPoolId as string;
    const clientName = (properties.ClientName as string) ?? `${context.stackName}-${logicalId}`;
    const clientId = generateClientId();
    const now = Date.now() / 1000;

    const client = {
      clientId,
      clientName,
      userPoolId,
      creationDate: now,
      lastModifiedDate: now,
    };

    const clients = poolClients.get(userPoolId);
    if (clients) {
      clients.push(client);
      poolClients.set(userPoolId, clients);
    } else {
      poolClients.set(userPoolId, [client]);
    }

    return {
      physicalId: clientId,
      attributes: {
        ClientId: clientId,
      },
    };
  },
  update(physicalId: string, logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): ProvisionResult {
    const userPoolId = properties.UserPoolId as string;
    const clientName = (properties.ClientName as string) ?? `${context.stackName}-${logicalId}`;
    for (const [poolId, clients] of poolClients.entries()) {
      const client = clients.find(c => c.clientId === physicalId);
      if (client) {
        client.clientName = clientName;
        client.userPoolId = userPoolId;
        client.lastModifiedDate = Date.now() / 1000;
        poolClients.set(poolId, clients);
        break;
      }
    }
    return {
      physicalId,
      attributes: { ClientId: physicalId },
    };
  },
  delete(physicalId: string): void {
    for (const [poolId, clients] of poolClients.entries()) {
      const nextClients = clients.filter((client) => client.clientId !== physicalId);
      if (nextClients.length === clients.length) continue;
      poolClients.set(poolId, nextClients);
      return;
    }
  },
};
