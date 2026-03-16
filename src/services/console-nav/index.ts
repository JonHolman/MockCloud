import { defineMockService } from '../service.js';
import { json } from '../response.js';

export const consoleNavService = defineMockService({
  name: 'console-nav',
  hostPatterns: ['console.aws.amazon.com', '*.console.aws.amazon.com'],
  protocol: 'json',
  handlers: {
    _default: (req) => {
      const path = req.path.toLowerCase();
      if (path.includes('recently-visited') || path.includes('recent'))
        return json({ recentItems: [] });
      if (path.includes('favorite'))
        return json({ favorites: [] });
      if (path.includes('notification'))
        return json({ notifications: [] });
      if (path.includes('feature') || path.includes('flag'))
        return json({ features: {} });
      if (path.includes('health'))
        return json({ openIssues: 0, notifications: [] });
      if (path.includes('search'))
        return json({ items: [], totalCount: 0 });
      return json({});
    },
  },
});
