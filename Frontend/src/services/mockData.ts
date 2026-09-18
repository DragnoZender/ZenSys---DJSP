import { Job } from '../types/job';

export const INITIAL_MOCK_JOBS: Job[] = [
  {
    jobId: '01J82N4XYZ0000000000000001',
    name: 'Production Database Backup Pipeline',
    scheduleType: 'CRON',
    status: 'SCHEDULED',
    scheduleTime: null,
    cronExpression: '0 0 2 * * ?',
    payload: JSON.stringify({
      target: 's3://zensys-backups-us-east-1/pg-cluster',
      compress: true,
      encryptionKeyId: 'arn:aws:kms:us-east-1:123456789:key/backup',
      retentionDays: 30
    }, null, 2),
    retries: 3,
    meta: JSON.stringify({
      environment: 'production',
      priority: 'P0',
      owner: 'infra-team'
    }, null, 2),
    nextRunTime: new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString(),
    lastPolledTime: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    jobId: '01J82N4XYZ0000000000000002',
    name: 'ElasticSearch Cluster Re-index (v2.4)',
    scheduleType: 'ONCE',
    status: 'RUNNING',
    scheduleTime: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    cronExpression: null,
    payload: JSON.stringify({
      sourceIndex: 'products_v1',
      targetIndex: 'products_v2',
      batchSize: 5000,
      autoSwitchAlias: true
    }, null, 2),
    retries: 2,
    meta: JSON.stringify({
      environment: 'production',
      priority: 'P1',
      triggeredBy: 'alex.chen@zensys.io'
    }, null, 2),
    nextRunTime: null,
    lastPolledTime: new Date().toISOString(),
  },
  {
    jobId: '01J82N4XYZ0000000000000003',
    name: 'Hourly Edge Cache Pre-warmer',
    scheduleType: 'CRON',
    status: 'SCHEDULED',
    scheduleTime: null,
    cronExpression: '0 0 * * * ?',
    payload: JSON.stringify({
      service: 'user-profile-api',
      endpoints: ['/v1/featured', '/v1/categories', '/v1/pricing-tiers'],
      concurrency: 10
    }, null, 2),
    retries: 3,
    meta: JSON.stringify({
      team: 'platform',
      tier: 'gold'
    }, null, 2),
    nextRunTime: new Date(Date.now() + 1000 * 60 * 22).toISOString(),
    lastPolledTime: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
  },
  {
    jobId: '01J82N4XYZ0000000000000004',
    name: 'Stripe Daily Settlement & Reconciliation',
    scheduleType: 'CRON',
    status: 'COMPLETED',
    scheduleTime: null,
    cronExpression: '0 30 6 * * ?',
    payload: JSON.stringify({
      merchantAccountId: 'acct_1032D924e3',
      exportFormat: 'parquet',
      destination: 'snowflake://finance.reports'
    }, null, 2),
    retries: 5,
    meta: JSON.stringify({
      compliance: 'SOX',
      alertChannel: '#finance-ops'
    }, null, 2),
    nextRunTime: new Date(Date.now() + 1000 * 60 * 60 * 10).toISOString(),
    lastPolledTime: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    jobId: '01J82N4XYZ0000000000000005',
    name: 'Weekly User Inactive Archival Batch',
    scheduleType: 'CRON',
    status: 'PAUSED',
    scheduleTime: null,
    cronExpression: '0 0 0 ? * SUN',
    payload: JSON.stringify({
      inactivityThresholdDays: 365,
      dryRun: false,
      notifyBeforeArchive: true
    }, null, 2),
    retries: 3,
    meta: JSON.stringify({
      gdprCompliant: true
    }, null, 2),
    nextRunTime: null,
    lastPolledTime: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    jobId: '01J82N4XYZ0000000000000006',
    name: 'Legacy CRM Contact Synchronizer',
    scheduleType: 'INTERVAL',
    status: 'FAILED_PERMANENTLY',
    scheduleTime: null,
    cronExpression: '*/10 * * * *',
    payload: JSON.stringify({
      crmHost: 'https://crm-legacy.internal.lan',
      authMethod: 'oauth2_refresh',
      lastFailureReason: 'Connection timed out after 3 retries (504 Gateway Timeout)'
    }, null, 2),
    retries: 3,
    meta: JSON.stringify({
      ticket: 'INFRA-9024',
      status: 'DLQ_DISPATCHED'
    }, null, 2),
    nextRunTime: null,
    lastPolledTime: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    jobId: '01J82N4XYZ0000000000000007',
    name: 'Flash Sale Inventory Sync Engine',
    scheduleType: 'ONCE',
    status: 'CANCELLED',
    scheduleTime: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    cronExpression: null,
    payload: JSON.stringify({
      event: 'black-friday-flash-deal-1',
      regions: ['us-west-2', 'eu-central-1']
    }, null, 2),
    retries: 1,
    meta: JSON.stringify({
      cancelReason: 'Superseded by event pipeline v2'
    }, null, 2),
    nextRunTime: null,
    lastPolledTime: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  }
];
