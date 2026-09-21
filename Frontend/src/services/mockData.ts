import { Job, JobRun } from '../types/job';

export const INITIAL_MOCK_JOBS: Job[] = [
  {
    jobId: '01J82N4XYZ0000000000000001',
    name: 'Database Backup Pipeline',
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
    lastRunStatus: 'SUCCESS',
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
    lastRunStatus: 'RUNNING',
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
    lastRunStatus: 'SUCCESS',
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
    lastRunStatus: 'SUCCESS',
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
    lastRunStatus: 'CANCELLED',
  },
  {
    jobId: '01J82N4XYZ0000000000000006',
    name: 'Legacy CRM Contact Synchronizer',
    scheduleType: 'INTERVAL',
    status: 'FAILED_PERMANENTLY',
    scheduleTime: null,
    cronExpression: null,
    payload: JSON.stringify({
      crmHost: 'https://crm-legacy.internal.lan',
      authMethod: 'oauth2_refresh',
      lastFailureReason: 'Max retries exhausted; sent to DLQ'
    }, null, 2),
    retries: 3,
    meta: JSON.stringify({
      intervalSeconds: 600,
      ticket: 'INFRA-9024',
      status: 'DLQ_DISPATCHED'
    }, null, 2),
    nextRunTime: null,
    lastPolledTime: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    lastRunStatus: 'FAILED',
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
    lastRunStatus: 'CANCELLED',
  }
];

export const INITIAL_MOCK_RUNS: JobRun[] = [
  {
    id: 104,
    runId: '01J82NRUN00000000000000001',
    jobId: '01J82N4XYZ0000000000000001',
    status: 'SUCCESS',
    startTime: '2026-09-20T02:00:00.100Z',
    endTime: '2026-09-20T02:00:04.350Z',
    modificationTime: '2026-09-20T02:00:04.352Z',
    executorId: 'executor-pod-us-east-4a',
    attemptNumber: 1,
    executionTimeMs: 4250,
    errorMsg: null
  },
  {
    id: 103,
    runId: '01J82NRUN00000000000000002',
    jobId: '01J82N4XYZ0000000000000001',
    status: 'FAILED',
    startTime: '2026-09-19T02:00:00.080Z',
    endTime: '2026-09-19T02:00:01.200Z',
    modificationTime: '2026-09-19T02:00:01.202Z',
    executorId: 'executor-pod-us-east-2b',
    attemptNumber: 1,
    executionTimeMs: 1120,
    errorMsg: 'S3BucketNotFoundException: Bucket \'backups\' was not reachable\n  at com.zensys.storage.S3Client.connect(S3Client.java:142)\n  at com.zensys.worker.BackupTask.execute(BackupTask.java:55)'
  },
  {
    id: 102,
    runId: '01J82NRUN00000000000000003',
    jobId: '01J82N4XYZ0000000000000002',
    status: 'RUNNING',
    startTime: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    endTime: null,
    modificationTime: new Date().toISOString(),
    executorId: 'executor-pod-worker-08',
    attemptNumber: 1,
    executionTimeMs: 1800000,
    errorMsg: null
  },
  {
    id: 101,
    runId: '01J82NRUN00000000000000004',
    jobId: '01J82N4XYZ0000000000000003',
    status: 'SUCCESS',
    startTime: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 37).toISOString(),
    modificationTime: new Date(Date.now() - 1000 * 60 * 37).toISOString(),
    executorId: 'executor-pod-us-west-1',
    attemptNumber: 1,
    executionTimeMs: 380,
    errorMsg: null
  },
  {
    id: 100,
    runId: '01J82NRUN00000000000000005',
    jobId: '01J82N4XYZ0000000000000004',
    status: 'SUCCESS',
    startTime: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 88).toISOString(),
    modificationTime: new Date(Date.now() - 1000 * 60 * 88).toISOString(),
    executorId: 'executor-fin-secure-02',
    attemptNumber: 1,
    executionTimeMs: 12400,
    errorMsg: null
  },
  {
    id: 99,
    runId: '01J82NRUN00000000000000006',
    jobId: '01J82N4XYZ0000000000000006',
    status: 'FAILED',
    startTime: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    modificationTime: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    executorId: 'executor-crm-legacy-01',
    attemptNumber: 3,
    executionTimeMs: 2450,
    errorMsg: 'SocketTimeoutException: Read timed out after 2000ms connecting to https://crm-legacy.internal.lan\n  at java.net.SocketInputStream.socketRead0(Native Method)\n  at com.zensys.worker.CrmWorker.syncBatch(CrmWorker.java:189)'
  },
  {
    id: 98,
    runId: '01J82NRUN00000000000000007',
    jobId: '01J82N4XYZ0000000000000006',
    status: 'TIMEOUT',
    startTime: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    modificationTime: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    executorId: 'executor-crm-legacy-01',
    attemptNumber: 2,
    executionTimeMs: 120000,
    errorMsg: 'JobExecutionTimeoutException: Run duration exceeded configured threshold of 120000ms'
  },
  {
    id: 97,
    runId: '01J82NRUN00000000000000008',
    jobId: '01J82N4XYZ0000000000000006',
    status: 'EXECUTOR_DIED',
    startTime: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 31).toISOString(),
    modificationTime: new Date(Date.now() - 1000 * 60 * 31).toISOString(),
    executorId: 'executor-crm-legacy-03',
    attemptNumber: 1,
    executionTimeMs: 15400,
    errorMsg: 'HeartbeatLostException: Worker pod terminated unexpectedly (OOMKilled exit code 137)'
  }
];
