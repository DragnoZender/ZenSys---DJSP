import React, { useState, useEffect } from 'react';
import { Job, ScheduleType, JobStatus, CreateJobPayload, UpdateJobPayload } from '../types/job';
import { X, Calendar, Clock, Repeat, AlertCircle, CheckCircle2, Code2, Sparkles, RefreshCw } from 'lucide-react';
import cronstrue from 'cronstrue';

interface JobModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobToEdit?: Job | null;
  onSave: (payload: CreateJobPayload | UpdateJobPayload, isEdit: boolean, jobId?: string) => Promise<void>;
}

const CRON_PRESETS = [
  { label: 'Every 5 Mins', cron: '*/5 * * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Daily at Midnight', cron: '0 0 * * *' },
  { label: 'Daily at 12 PM', cron: '0 12 * * *' },
  { label: 'Weekly on Monday', cron: '0 0 * * 1' },
];

const PAYLOAD_TEMPLATES = [
  {
    name: 'HTTP Service Call',
    payload: JSON.stringify({
      targetUrl: 'https://api.internal.service/v1/sync',
      method: 'POST',
      headers: { 'X-Source': 'zensys-djsp' },
      body: { syncScope: 'full' }
    }, null, 2)
  },
  {
    name: 'S3 / Database Backup',
    payload: JSON.stringify({
      target: 's3://zensys-backups/pg-primary',
      compress: true,
      retentionDays: 30
    }, null, 2)
  },
  {
    name: 'Cache Eviction',
    payload: JSON.stringify({
      cluster: 'redis-edge-01',
      keysPattern: 'session:*',
      dryRun: false
    }, null, 2)
  }
];

export const JobModal: React.FC<JobModalProps> = ({
  isOpen,
  onClose,
  jobToEdit,
  onSave,
}) => {
  const isEdit = !!jobToEdit;

  const [name, setName] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('CRON');
  const [cronExpression, setCronExpression] = useState('0 0 12 * * ?');
  const [scheduleTime, setScheduleTime] = useState('');
  const [status, setStatus] = useState<JobStatus>('SCHEDULED');
  const [retries, setRetries] = useState(3);
  const [payload, setPayload] = useState('{\n  "service": "notifications",\n  "batchSize": 100\n}');
  const [meta, setMeta] = useState('{\n  "environment": "production"\n}');
  
  const [cronHumanized, setCronHumanized] = useState('');
  const [cronError, setCronError] = useState<string | null>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset form fields
  useEffect(() => {
    if (jobToEdit) {
      setName(jobToEdit.name);
      setScheduleType(jobToEdit.scheduleType);
      setCronExpression(jobToEdit.cronExpression || '0 0 12 * * ?');
      if (jobToEdit.scheduleTime) {
        // Convert ISO to local datetime-local input string
        try {
          const d = new Date(jobToEdit.scheduleTime);
          const localISO = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
          setScheduleTime(localISO);
        } catch {
          setScheduleTime('');
        }
      } else {
        setScheduleTime('');
      }
      setStatus(jobToEdit.status);
      setRetries(jobToEdit.retries);
      setPayload(jobToEdit.payload || '{}');
      setMeta(jobToEdit.meta || '{}');
    } else {
      setName('');
      setScheduleType('CRON');
      setCronExpression('0 0 12 * * ?');
      // Default future time (tomorrow 12:00)
      const tomorrow = new Date(Date.now() + 86400000);
      const localISO = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setScheduleTime(localISO);
      setStatus('SCHEDULED');
      setRetries(3);
      setPayload('{\n  "service": "notifications",\n  "batchSize": 100\n}');
      setMeta('{\n  "environment": "production"\n}');
    }
    setPayloadError(null);
    setMetaError(null);
  }, [jobToEdit, isOpen]);

  // Translate cron expression
  useEffect(() => {
    if (scheduleType === 'CRON' || scheduleType === 'INTERVAL') {
      if (!cronExpression.trim()) {
        setCronHumanized('');
        setCronError('Cron expression cannot be empty');
        return;
      }
      try {
        const text = cronstrue.toString(cronExpression.trim(), { throwExceptionOnParseError: true });
        setCronHumanized(text);
        setCronError(null);
      } catch (err: any) {
        setCronHumanized('');
        setCronError(err?.message || 'Invalid cron format (use standard 5-part or 6-part cron)');
      }
    } else {
      setCronHumanized('');
      setCronError(null);
    }
  }, [cronExpression, scheduleType]);

  const handlePrettifyPayload = () => {
    try {
      const parsed = JSON.parse(payload);
      setPayload(JSON.stringify(parsed, null, 2));
      setPayloadError(null);
    } catch (e: any) {
      setPayloadError(`Syntax error: ${e.message}`);
    }
  };

  const handlePrettifyMeta = () => {
    try {
      const parsed = JSON.parse(meta);
      setMeta(JSON.stringify(parsed, null, 2));
      setMetaError(null);
    } catch (e: any) {
      setMetaError(`Syntax error: ${e.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Validate payload JSON
    try {
      JSON.parse(payload);
      setPayloadError(null);
    } catch (e: any) {
      setPayloadError(`Invalid JSON payload: ${e.message}`);
      return;
    }

    // Validate meta JSON if provided
    if (meta.trim()) {
      try {
        JSON.parse(meta);
        setMetaError(null);
      } catch (e: any) {
        setMetaError(`Invalid JSON meta: ${e.message}`);
        return;
      }
    }

    // Validate schedule
    let finalScheduleTime: string | null = null;
    let finalCron: string | null = null;

    if (scheduleType === 'ONCE') {
      if (!scheduleTime) {
        alert('Please select execution date and time for ONE-TIME job.');
        return;
      }
      finalScheduleTime = new Date(scheduleTime).toISOString();
    } else {
      if (cronError || !cronExpression.trim()) {
        alert('Please fix the cron expression before submitting.');
        return;
      }
      finalCron = cronExpression.trim();
    }

    setIsSubmitting(true);
    try {
      if (isEdit && jobToEdit) {
        const updatePayload: UpdateJobPayload = {
          name: name.trim(),
          scheduleType,
          status,
          scheduleTime: finalScheduleTime,
          cronExpression: finalCron,
          payload,
          retries,
          meta: meta.trim() || undefined,
        };
        await onSave(updatePayload, true, jobToEdit.jobId);
      } else {
        const createPayload: CreateJobPayload = {
          name: name.trim(),
          scheduleType,
          scheduleTime: finalScheduleTime,
          cronExpression: finalCron,
          payload,
          retries,
          meta: meta.trim() || undefined,
        };
        await onSave(createPayload, false);
      }
      onClose();
    } catch (err: any) {
      alert(`Operation failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30">
                <Code2 className="w-4 h-4" />
              </span>
              {isEdit ? 'Configure & Edit Job' : 'Schedule New Job'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit ? `Modifying job ID ${jobToEdit?.jobId}` : 'Register a new distributed job with the ZenSys DJSP Gateway'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Job Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Job Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Daily Payment Reconciliation, Hourly Cache Warmer"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
            />
          </div>

          {/* Schedule Type Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Schedule Type
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setScheduleType('CRON')}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                  scheduleType === 'CRON'
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
                CRON Schedule
              </button>
              <button
                type="button"
                onClick={() => setScheduleType('ONCE')}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                  scheduleType === 'ONCE'
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                One-Time Run
              </button>
              <button
                type="button"
                onClick={() => setScheduleType('INTERVAL')}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                  scheduleType === 'INTERVAL'
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Interval
              </button>
            </div>
          </div>

          {/* Schedule Configuration Detail */}
          {scheduleType === 'CRON' || scheduleType === 'INTERVAL' ? (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  Cron Expression (5 or 6 fields)
                </label>
                <span className="text-[11px] text-slate-500 font-mono-code">
                  Sec Min Hour Day Mon Year
                </span>
              </div>
              <input
                type="text"
                required
                placeholder="0 0 12 * * ?"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-100 font-mono-code focus:outline-none focus:border-brand-500 transition-colors"
              />

              {/* Humanized translation */}
              {cronHumanized && (
                <div className="flex items-center gap-2 text-xs text-brand-300 bg-brand-500/10 px-3 py-2 rounded-lg border border-brand-500/20">
                  <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>Runs: <strong className="text-white">{cronHumanized}</strong></span>
                </div>
              )}

              {cronError && (
                <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 px-3 py-2 rounded-lg border border-rose-500/20">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{cronError}</span>
                </div>
              )}

              {/* Quick Presets */}
              <div className="pt-1">
                <span className="text-[11px] text-slate-500 block mb-1.5">Common Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setCronExpression(preset.cron)}
                      className="px-2.5 py-1 text-xs rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/50 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Scheduled Execution Date & Time
              </label>
              <input
                type="datetime-local"
                required
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-brand-500 transition-colors"
              />
              <p className="text-[11px] text-slate-500">
                Will be dispatched once at this exact timestamp (converted to ISO-8601 UTC on submission).
              </p>
            </div>
          )}

          {/* If Editing: Status Field */}
          {isEdit && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Job Lifecycle Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as JobStatus)}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-brand-500 transition-colors"
              >
                <option value="SCHEDULED">SCHEDULED (Active)</option>
                <option value="PAUSED">PAUSED (Suspended)</option>
                <option value="RUNNING">RUNNING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="FAILED_PERMANENTLY">FAILED_PERMANENTLY</option>
              </select>
            </div>
          )}

          {/* JSON Payload Editor */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span>Execution Payload (JSON)</span>
                <span className="text-rose-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrettifyPayload}
                  className="text-[11px] px-2 py-0.5 rounded text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 transition-colors"
                >
                  Format JSON
                </button>
              </div>
            </div>

            {/* Template shortcuts */}
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" /> Templates:
              </span>
              {PAYLOAD_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  type="button"
                  onClick={() => {
                    setPayload(tmpl.payload);
                    setPayloadError(null);
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white transition-colors"
                >
                  {tmpl.name}
                </button>
              ))}
            </div>

            <textarea
              rows={5}
              required
              value={payload}
              onChange={(e) => {
                setPayload(e.target.value);
                setPayloadError(null);
              }}
              className="w-full p-3 bg-slate-950 border border-slate-700/80 rounded-lg text-xs font-mono-code text-indigo-200 focus:outline-none focus:border-brand-500 transition-colors"
              placeholder='{\n  "key": "value"\n}'
            />
            {payloadError && (
              <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {payloadError}
              </p>
            )}
          </div>

          {/* Resilience & Retries Stepper */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Max Retries on Failure
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={retries}
                  onChange={(e) => setRetries(parseInt(e.target.value) || 0)}
                  className="w-24 px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-slate-100 font-mono-code focus:outline-none focus:border-brand-500 transition-colors"
                />
                <span className="text-xs text-slate-400">
                  (0 - 10 retries before Dead Letter Queue)
                </span>
              </div>
            </div>

            {/* Metadata / Tags */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Metadata & Tags (JSON)
                </label>
                <button
                  type="button"
                  onClick={handlePrettifyMeta}
                  className="text-[11px] px-2 py-0.5 rounded text-slate-400 hover:text-white bg-slate-800 transition-colors"
                >
                  Format
                </button>
              </div>
              <textarea
                rows={2}
                value={meta}
                onChange={(e) => {
                  setMeta(e.target.value);
                  setMetaError(null);
                }}
                className="w-full p-2 bg-slate-950 border border-slate-700/80 rounded-lg text-xs font-mono-code text-slate-300 focus:outline-none focus:border-brand-500 transition-colors"
                placeholder='{"environment": "production"}'
              />
              {metaError && (
                <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {metaError}
                </p>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !!cronError}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-medium text-xs hover:from-brand-500 hover:to-indigo-500 transition-all shadow-md shadow-brand-500/25 disabled:opacity-50"
            >
              {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isEdit ? 'Save Changes' : 'Create & Schedule Job'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
