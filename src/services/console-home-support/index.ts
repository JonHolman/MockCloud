import { json } from '../response.js';
import { defineMockService } from '../service.js';

export const consoleHomeSupportService = defineMockService({
  name: 'console-home-support',
  hostPatterns: [
    'health.*.amazonaws.com',
    'cost-optimization-hub.*.amazonaws.com',
    'servicecatalog-appregistry.*.amazonaws.com',
    'ce.*.amazonaws.com',
  ],
  protocol: 'rest-json',
  handlers: {
    _default: (req) => {
      if (req.path.includes('/applications')) {
        return json({
          applications: [],
          nextToken: null,
        });
      }

      if (req.path.includes('/api/health.')) {
        return json({
          entities: [],
          events: [],
          eventArns: [],
        });
      }

      if (req.path.includes('/api/cost-optimization-hub.')) {
        return json({
          items: [],
          nextToken: null,
        });
      }

      if (req.path.includes('/api/ce.')) {
        return json({
          ResultsByTime: [],
          DimensionValueAttributes: [],
        });
      }

      return json({});
    },
  },
});
