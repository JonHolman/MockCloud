import { defineMockService } from '../service.js';
import type { ApiResponse } from '../../types.js';

const NS = 'http://monitoring.amazonaws.com/doc/2010-08-01/';
const REQUEST_ID = '00000000-0000-0000-0000-000000000000';

function xml(action: string, resultBody: string): ApiResponse {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: `<${action}Response xmlns="${NS}"><${action}Result>${resultBody}</${action}Result><ResponseMetadata><RequestId>${REQUEST_ID}</RequestId></ResponseMetadata></${action}Response>`,
  };
}

export const monitoringService = defineMockService({
  name: 'monitoring',
  hostPatterns: ['monitoring.*.amazonaws.com'],
  protocol: 'query',
  signingName: 'monitoring',
  handlers: {
    DescribeAlarms: () => xml('DescribeAlarms', '<MetricAlarms/><CompositeAlarms/>'),
    DescribeAlarmsForMetric: () => xml('DescribeAlarmsForMetric', '<MetricAlarms/>'),
    DescribeAnomalyDetectors: () => xml('DescribeAnomalyDetectors', '<AnomalyDetectors/>'),
    ListDashboards: () => xml('ListDashboards', '<DashboardEntries/>'),
    GetDashboard: () =>
      xml(
        'GetDashboard',
        '<DashboardName></DashboardName><DashboardBody>{}</DashboardBody><DashboardArn></DashboardArn>',
      ),
    ListMetrics: () => xml('ListMetrics', '<Metrics/>'),
    GetMetricData: () => ({
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: `<GetMetricDataResponse xmlns="http://monitoring.amazonaws.com/doc/2010-08-01/"><GetMetricDataResult><MetricDataResults/><Messages/></GetMetricDataResult><ResponseMetadata><RequestId>00000000-0000-0000-0000-000000000000</RequestId></ResponseMetadata></GetMetricDataResponse>`,
    }),
    DescribeInsightRules: () => xml('DescribeInsightRules', '<InsightRules/>'),
    ListTagsForResource: () => xml('ListTagsForResource', '<Tags/>'),
    _default: (req) => xml(req.action || 'Response', ''),
  },
});
