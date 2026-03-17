import { randomUUID } from 'node:crypto';
import type { MockServiceDefinition } from '../../types.js';
import { jsonAmz11 as json } from '../response.js';
import { PersistentMap } from '../../state/store.js';
import { REGION, ACCOUNT_ID } from '../../config.js';

export const malwareProtectionPlans = new PersistentMap<string, { MalwareProtectionPlanId: string; Arn: string; Role?: string; ProtectedResource?: unknown }>('guardduty-malware-protection-plans');

export const guardDutyService: MockServiceDefinition = {
  name: 'guardduty',
  hostPatterns: ['guardduty.*.amazonaws.com'],
  protocol: 'rest-json',
  signingName: 'guardduty',
  handlers: {
    _default: (req) => {
      const path = req.path;
      const method = req.method;

      const idMatch = path.match(/\/malware-protection-plan\/([^/]+)$/);

      if (path.endsWith('/malware-protection-plan') && method === 'POST') {
        const body = req.body as Record<string, unknown>;
        const id = randomUUID();
        const arn = `arn:aws:guardduty:${REGION}:${ACCOUNT_ID}:malware-protection-plan/${id}`;
        malwareProtectionPlans.set(id, {
          MalwareProtectionPlanId: id,
          Arn: arn,
          Role: body.Role as string | undefined,
          ProtectedResource: body.ProtectedResource,
        });
        return json({ MalwareProtectionPlanId: id });
      }

      if (path.endsWith('/malware-protection-plan') && method === 'GET') {
        return json({ MalwareProtectionPlans: [...malwareProtectionPlans.values()] });
      }

      if (idMatch && method === 'GET') {
        const plan = malwareProtectionPlans.get(idMatch[1]);
        if (plan) return json(plan);
        return json({});
      }

      if (idMatch && method === 'DELETE') {
        malwareProtectionPlans.delete(idMatch[1]);
        return json({});
      }

      return json({});
    },
  },
};
