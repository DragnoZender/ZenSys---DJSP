import React, { useState, useEffect } from 'react';
import { Job, ScheduleType, CreateJobPayload, UpdateJobPayload } from '../types/job';
import { StatusBadge } from './StatusBadge';
import {
  X,
  Calendar,
  Clock,
  Repeat,
  AlertCircle,
  CheckCircle2,
  Code2,
  RefreshCw,
  Copy,
  Check,
  CalendarClock,
  Sliders,
  ChevronRight,
  Plus,
  Minus,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import cronstrue from 'cronstrue';

interface JobModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobToEdit?: Job | null;
  onSave: (payload: CreateJobPayload | UpdateJobPayload, isEdit: boolean, jobId?: string) => Promise<void>;
}

type TabType = 'schedule' | 'payload' | 'metadata';

const CRON_PRESETS = [
  { label: 'Every 5 Mins', cron: '*/5 * * * *', desc: 'Runs every 5th minute' },
  { label: 'Every 15 Mins', cron: '*/15 * * * *', desc: 'Quarter-hourly execution' },
  { label: 'Hourly', cron: '0 * * * *', desc: 'At minute 0 of every hour' },
  { label: 'Daily at Midnight', cron: '0 0 * * *', desc: 'Every day at 00:00 UTC' },
  { label: 'Daily at 12 PM', cron: '0 12 * * *', desc: 'Every day at 12:00 PM' },
  { label: 'Weekdays at 9 AM', cron: '0 0 9 ? * MON-FRI', desc: 'Monday through Friday' },
  { label: 'Weekly on Monday', cron: '0 0 * * 1', desc: 'Every Monday at midnight' },
];

const INTERVAL_PRESETS = [
  { label: '30s', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '5 mins', seconds: 300 },
  { label: '15 mins', seconds: 900 },
  { label: '30 mins', seconds: 1800 },
  { label: '1 hour', seconds: 3600 },
  { label: '6 hours', seconds: 21600 },
  { label: '24 hours', seconds: 86400 },
];

const PAYLOAD_TEMPLATES = [
  {
    name: 'HTTP Service Call',
    icon: '🌐',
    payload: JSON.stringify(
      {
        targetUrl: 'https://api.internal.service/v1/sync',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Source': 'zensys-djsp'
        },
        body: {
          syncScope: 'full',
          notifyOnComplete: true
        }
      },
      null,
      2
    )
  },
  {
    name: 'Database Backup',
    icon: '🗄️',
    payload: JSON.stringify(
      {
        pipeline: 'pg-primary-backup',
        target: 's3://zensys-backups/pg-primary',
        compress: true,
        retentionDays: 30
      },
      null,
      2
    )
  },
  {
    name: 'Cache Eviction',
    icon: '⚡',
    payload: JSON.stringify(
      {
        cluster: 'redis-edge-01',
        keysPattern: 'session:*',
        dryRun: false
      },
      null,
      2
    )
  },
  {
    name: 'Minimal Task',
    icon: '📦',
    payload: JSON.stringify(
      {
        task: 'ping',
        version: '1.0'
      },
      null,
      2
    )
  }
];

const METADATA_TEMPLATES = [
  {
    name: 'Production Worker',
    json: JSON.stringify({ environment: 'production', cluster: 'us-east-4a', team: 'platform' }, null, 2)
  },
  {
    name: 'Staging Sandbox',
    json: JSON.stringify({ environment: 'staging', debug: true, team: 'engineering' }, null, 2)
  }
];

export const JobModal: React.FC<JobModalProps> = ({
  isOpen,
  onClose,
  jobToEdit,
  onSave,
}) => {
  const isEdit = !!jobToEdit;

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>('schedule');

  // Form states
  const [name, setName] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('CRON');
  const [cronExpression, setCronExpression] = useState('0 0 12 * * ?');
  const [intervalSeconds, setIntervalSeconds] = useState(300);
  const [scheduleTime, setScheduleTime] = useState('');
  const [retries, setRetries] = useState(3);
  const [payload, setPayload] = useState('{\n  "service": "notifications",\n  "batchSize": 100\n}');
  const [meta, setMeta] = useState('{\n  "environment": "production"\n}');

  // Validation states
  const [cronHumanized, setCronHumanized] = useState('');
  const [cronError, setCronError] = useState<string | null>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Micro-interaction feedbacks
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [formattedFeedback, setFormattedFeedback] = useState<string | null>(null);

  // Synchronize state when opening or switching edited job
  useEffect(() => {
    if (jobToEdit) {
      setName(jobToEdit.name);
      setScheduleType(jobToEdit.scheduleType);
      setCronExpression(jobToEdit.cronExpression || '0 0 12 * * ?');
      if (jobToEdit.scheduleTime) {
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
      setRetries(jobToEdit.retries);
      setPayload(jobToEdit.payload || '{\n  "service": "notifications"\n}');
      setMeta(jobToEdit.meta || '{\n  "environment": "production"\n}');

      let parsedInterval = 300;
      if (jobToEdit.meta) {
        try {
          const m = JSON.parse(jobToEdit.meta);
          if (m.intervalSeconds) parsedInterval = Number(m.intervalSeconds);
          else if (m.interval) parsedInterval = Number(m.interval);
        } catch {
          const match =
            jobToEdit.meta.match(/"intervalSeconds"\s*:\s*(\d+)/) ||
            jobToEdit.meta.match(/"interval"\s*:\s*(\d+)/);
          if (match) parsedInterval = Number(match[1]);
        }
      }
      setIntervalSeconds(parsedInterval || 300);
    } else {
      setName('');
      setScheduleType('CRON');
      setCronExpression('0 0 12 * * ?');
      setIntervalSeconds(300);
      const tomorrow = new Date(Date.now() + 86400000);
      const localISO = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setScheduleTime(localISO);
      setRetries(3);
      setPayload('{\n  "service": "notifications",\n  "batchSize": 100\n}');
      setMeta('{\n  "environment": "production"\n}');
    }

    setActiveTab('schedule');
    setPayloadError(null);
    setMetaError(null);
    setModalError(null);
  }, [jobToEdit, isOpen]);

  // Validate CRON on change
  useEffect(() => {
    if (scheduleType === 'CRON') {
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
        setCronError(err?.message || 'Invalid cron expression');
      }
    } else {
      setCronHumanized('');
      setCronError(null);
    }
  }, [cronExpression, scheduleType]);

  // Live JSON validation for payload
  useEffect(() => {
    if (!payload.trim()) {
      setPayloadError('Payload JSON cannot be empty');
      return;
    }
    try {
      JSON.parse(payload);
      setPayloadError(null);
    } catch (e: any) {
      setPayloadError(e.message);
    }
  }, [payload]);

  // Live JSON validation for metadata
  useEffect(() => {
    if (!meta.trim()) {
      setMetaError(null);
      return;
    }
    try {
      JSON.parse(meta);
      setMetaError(null);
    } catch (e: any) {
      setMetaError(e.message);
    }
  }, [meta]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrettifyPayload = () => {
    try {
      const parsed = JSON.parse(payload);
      setPayload(JSON.stringify(parsed, null, 2));
      setPayloadError(null);
      setFormattedFeedback('payload');
      setTimeout(() => setFormattedFeedback(null), 1800);
    } catch (e: any) {
      setPayloadError(`Syntax error: ${e.message}`);
    }
  };

  const handlePrettifyMeta = () => {
    try {
      const parsed = JSON.parse(meta);
      setMeta(JSON.stringify(parsed, null, 2));
      setMetaError(null);
      setFormattedFeedback('meta');
      setTimeout(() => setFormattedFeedback(null), 1800);
    } catch (e: any) {
      setMetaError(`Syntax error: ${e.message}`);
    }
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(payload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Helper for quick date increments
  const setQuickDate = (minutesOffset: number) => {
    const d = new Date(Date.now() + minutesOffset * 60000);
    const localISO = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduleTime(localISO);
  };

  const setTomorrowMorning = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const localISO = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduleTime(localISO);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setActiveTab('schedule');
      return;
    }

    if (payloadError) {
      setActiveTab('payload');
      return;
    }

    if (metaError) {
      setActiveTab('metadata');
      return;
    }

    let finalScheduleTime: string | null = null;
    let finalCron: string | null = null;
    let finalMeta = meta.trim();

    if (scheduleType === 'ONCE') {
      if (!scheduleTime) {
        setActiveTab('schedule');
        setModalError('Please select date and time for ONE-TIME execution.');
        return;
      }
      finalScheduleTime = new Date(scheduleTime).toISOString();
    } else if (scheduleType === 'CRON') {
      if (cronError || !cronExpression.trim()) {
        setActiveTab('schedule');
        setModalError('Please resolve cron expression error.');
        return;
      }
      finalCron = cronExpression.trim();
    } else if (scheduleType === 'INTERVAL') {
      finalCron = null;
      finalScheduleTime = null;
      const sec = Math.max(1, Number(intervalSeconds) || 60);
      try {
        const metaObj = finalMeta ? JSON.parse(finalMeta) : {};
        metaObj.intervalSeconds = sec;
        finalMeta = JSON.stringify(metaObj, null, 2);
      } catch {
        finalMeta = JSON.stringify({ intervalSeconds: sec }, null, 2);
      }
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      if (isEdit && jobToEdit) {
        const updatePayload: UpdateJobPayload = {
          name: name.trim(),
          scheduleType,
          status: jobToEdit.status,
          scheduleTime: finalScheduleTime,
          cronExpression: finalCron,
          payload,
          retries,
          meta: finalMeta || undefined,
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
          meta: finalMeta || undefined,
        };
        await onSave(createPayload, false);
      }
      onClose();
    } catch (err: any) {
      setModalError(err.message || 'Server rejected the operation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = !payloadError && !metaError && (!cronError || scheduleType !== 'CRON') && !!name.trim();

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl lg:max-w-4xl bg-panel-surface border border-panel-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-panel-border flex items-center justify-between bg-panel-bg/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-hostinger-600/15 text-hostinger-400 border border-hostinger-600/25">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {isEdit ? 'Configure & Edit Job' : 'Schedule New Distributed Job'}
                </h2>
                {isEdit ? (
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono-code bg-hostinger-600/20 text-hostinger-300 border border-hostinger-600/30">
                      ID: {jobToEdit?.jobId.substring(0, 14)}...
                    </span>
                    {jobToEdit && <StatusBadge status={jobToEdit.status} size="sm" />}
                  </div>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                    New Job
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEdit
                  ? `Update dispatch triggers and payload for job: ${jobToEdit?.name}`
                  : 'Register a high-precision distributed task across worker pods'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-panel-subtle transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="px-6 pt-2.5 border-b border-panel-border bg-panel-bg/40 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2">
            {/* Tab 1: Schedule & Basics */}
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'schedule'
                  ? 'border-hostinger-500 text-white bg-panel-subtle/70'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Repeat className="w-3.5 h-3.5 text-hostinger-400" />
              <span>1. Schedule & Basics</span>
            </button>

            {/* Tab 2: Execution Payload */}
            <button
              type="button"
              onClick={() => setActiveTab('payload')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'payload'
                  ? 'border-hostinger-500 text-white bg-panel-subtle/70'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-hostinger-400" />
              <span>2. Execution Payload</span>
              {payloadError ? (
                <span className="w-2 h-2 rounded-full bg-rose-500" title="Invalid JSON" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Valid JSON" />
              )}
            </button>

            {/* Tab 3: Metadata & Settings */}
            <button
              type="button"
              onClick={() => setActiveTab('metadata')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'metadata'
                  ? 'border-hostinger-500 text-white bg-panel-subtle/70'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-hostinger-400" />
              <span>3. Metadata & Retries</span>
              {metaError && (
                <span className="w-2 h-2 rounded-full bg-rose-500" title="Invalid Metadata JSON" />
              )}
            </button>
          </div>

          <span className="text-[11px] text-slate-500 font-mono-code hidden sm:inline">
            Step {activeTab === 'schedule' ? '1 of 3' : activeTab === 'payload' ? '2 of 3' : '3 of 3'}
          </span>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Server Error Banner */}
          {modalError && (
            <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-rose-200 block">Operation Rejected by Server</span>
                <span className="text-rose-300 mt-0.5 block font-mono-code leading-relaxed">{modalError}</span>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 1: SCHEDULE & BASICS                                      */}
          {/* ============================================================ */}
          {activeTab === 'schedule' && (
            <div className="space-y-5 animate-in fade-in duration-100">
              {/* Job Name Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Job Name <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {name.length}/80 chars
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={80}
                  placeholder="e.g. Daily Payment Reconciliation, Hourly Cache Warmer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-panel-bg border border-panel-border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-hostinger-500 focus:ring-1 focus:ring-hostinger-500 transition-colors"
                />
                <p className="text-[11px] text-slate-500">
                  Descriptive unique identifier for operational dashboards and alert notifications.
                </p>
              </div>

              {/* Schedule Mode Selector Cards */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                  Schedule Mode <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* CRON Card */}
                  <div
                    onClick={() => setScheduleType('CRON')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      scheduleType === 'CRON'
                        ? 'border-hostinger-500 bg-hostinger-600/10 shadow-xs'
                        : 'border-panel-border bg-panel-bg hover:border-panel-muted text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Repeat className={`w-4 h-4 ${scheduleType === 'CRON' ? 'text-hostinger-400' : 'text-slate-400'}`} />
                        <span className={`text-xs font-bold ${scheduleType === 'CRON' ? 'text-white' : 'text-slate-300'}`}>
                          CRON
                        </span>
                      </div>
                      {scheduleType === 'CRON' && (
                        <span className="w-2 h-2 rounded-full bg-hostinger-400 ring-4 ring-hostinger-400/20" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Calendar-based recurrence pattern using standard 5 or 6-field cron syntax.
                    </p>
                  </div>

                  {/* INTERVAL Card */}
                  <div
                    onClick={() => {
                      setScheduleType('INTERVAL');
                      try {
                        const m = meta ? JSON.parse(meta) : {};
                        if (!m.intervalSeconds && !m.interval) {
                          m.intervalSeconds = intervalSeconds || 300;
                          setMeta(JSON.stringify(m, null, 2));
                        }
                      } catch {
                        setMeta(JSON.stringify({ intervalSeconds: intervalSeconds || 300 }, null, 2));
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      scheduleType === 'INTERVAL'
                        ? 'border-hostinger-500 bg-hostinger-600/10 shadow-xs'
                        : 'border-panel-border bg-panel-bg hover:border-panel-muted text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Clock className={`w-4 h-4 ${scheduleType === 'INTERVAL' ? 'text-hostinger-400' : 'text-slate-400'}`} />
                        <span className={`text-xs font-bold ${scheduleType === 'INTERVAL' ? 'text-white' : 'text-slate-300'}`}>
                          Interval
                        </span>
                      </div>
                      {scheduleType === 'INTERVAL' && (
                        <span className="w-2 h-2 rounded-full bg-hostinger-400 ring-4 ring-hostinger-400/20" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Repeats periodically after a fixed duration from previous completion.
                    </p>
                  </div>

                  {/* ONE-TIME Card */}
                  <div
                    onClick={() => setScheduleType('ONCE')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      scheduleType === 'ONCE'
                        ? 'border-hostinger-500 bg-hostinger-600/10 shadow-xs'
                        : 'border-panel-border bg-panel-bg hover:border-panel-muted text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Calendar className={`w-4 h-4 ${scheduleType === 'ONCE' ? 'text-hostinger-400' : 'text-slate-400'}`} />
                        <span className={`text-xs font-bold ${scheduleType === 'ONCE' ? 'text-white' : 'text-slate-300'}`}>
                          One-Time Run
                        </span>
                      </div>
                      {scheduleType === 'ONCE' && (
                        <span className="w-2 h-2 rounded-full bg-hostinger-400 ring-4 ring-hostinger-400/20" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Executes exactly once at a scheduled future date & time, then concludes.
                    </p>
                  </div>
                </div>
              </div>

              {/* Dynamic Schedule Configurator */}
              {/* 1. CRON Builder */}
              {scheduleType === 'CRON' && (
                <div className="p-4 rounded-xl bg-panel-bg border border-panel-border space-y-3.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                      <span>Cron Expression</span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        (Quartz / Spring format)
                      </span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono-code">
                      Sec &middot; Min &middot; Hour &middot; Day &middot; Mon &middot; Year
                    </span>
                  </div>

                  <input
                    type="text"
                    required
                    placeholder="0 0 12 * * ?"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    className="w-full px-3.5 py-2 bg-panel-surface border border-panel-border rounded-lg text-sm font-mono-code text-white focus:outline-none focus:border-hostinger-500 transition-colors"
                  />

                  {/* Human Translation Banner */}
                  {cronHumanized && (
                    <div className="flex items-center gap-2.5 text-xs text-emerald-300 bg-emerald-500/10 px-3.5 py-2 rounded-lg border border-emerald-500/20">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Calculated Schedule: <strong className="text-white">{cronHumanized}</strong>
                      </span>
                    </div>
                  )}

                  {cronError && (
                    <div className="flex items-center gap-2.5 text-xs text-rose-300 bg-rose-500/10 px-3.5 py-2 rounded-lg border border-rose-500/20">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{cronError}</span>
                    </div>
                  )}

                  {/* Presets Chips */}
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
                      Quick Presets:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {CRON_PRESETS.map((preset) => {
                        const isSelected = cronExpression === preset.cron;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setCronExpression(preset.cron)}
                            className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-hostinger-600 text-white border-hostinger-600 font-medium'
                                : 'bg-panel-subtle hover:bg-panel-border text-slate-300 border-panel-border hover:text-white'
                            }`}
                            title={preset.desc}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. INTERVAL Builder */}
              {scheduleType === 'INTERVAL' && (
                <div className="p-4 rounded-xl bg-panel-bg border border-panel-border space-y-3.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200">
                      Interval Duration
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono-code">
                      Stored in metadata.intervalSeconds
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={1}
                        required
                        value={intervalSeconds}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setIntervalSeconds(val);
                          try {
                            const m = meta ? JSON.parse(meta) : {};
                            m.intervalSeconds = val;
                            setMeta(JSON.stringify(m, null, 2));
                          } catch {}
                        }}
                        className="w-full px-3.5 py-2 bg-panel-surface border border-panel-border rounded-lg text-sm font-mono-code text-white focus:outline-none focus:border-hostinger-500 transition-colors"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                        seconds
                      </span>
                    </div>

                    <div className="px-3 py-2 rounded-lg bg-panel-surface border border-panel-border text-xs text-slate-300 font-medium whitespace-nowrap">
                      {intervalSeconds >= 86400
                        ? `${(intervalSeconds / 86400).toFixed(1)} days`
                        : intervalSeconds >= 3600
                        ? `${(intervalSeconds / 3600).toFixed(1)} hours`
                        : intervalSeconds >= 60
                        ? `${(intervalSeconds / 60).toFixed(1)} minutes`
                        : `${intervalSeconds} seconds`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-xs text-hostinger-300 bg-hostinger-600/10 px-3.5 py-2 rounded-lg border border-hostinger-600/20">
                    <Clock className="w-4 h-4 text-hostinger-400 shrink-0" />
                    <span>
                      Runs automatically every{' '}
                      <strong className="text-white">
                        {intervalSeconds >= 60 ? `${(intervalSeconds / 60).toFixed(1)} mins` : `${intervalSeconds}s`}
                      </strong>{' '}
                      after the preceding run finishes execution.
                    </span>
                  </div>

                  {/* Interval Presets */}
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
                      Common Cadences:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {INTERVAL_PRESETS.map((preset) => {
                        const isSelected = intervalSeconds === preset.seconds;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setIntervalSeconds(preset.seconds);
                              try {
                                const m = meta ? JSON.parse(meta) : {};
                                m.intervalSeconds = preset.seconds;
                                setMeta(JSON.stringify(m, null, 2));
                              } catch {}
                            }}
                            className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-hostinger-600 text-white border-hostinger-600 font-semibold'
                                : 'bg-panel-subtle hover:bg-panel-border text-slate-300 border-panel-border hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. ONE-TIME Builder */}
              {scheduleType === 'ONCE' && (
                <div className="p-4 rounded-xl bg-panel-bg border border-panel-border space-y-3.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200">
                      Scheduled Execution Date & Time
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono-code">
                      ISO-8601 UTC
                    </span>
                  </div>

                  <input
                    type="datetime-local"
                    required
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3.5 py-2 bg-panel-surface border border-panel-border rounded-lg text-sm text-white focus:outline-none focus:border-hostinger-500 transition-colors"
                  />

                  {/* Quick Time Helpers */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 mr-1">Quick Set:</span>
                    <button
                      type="button"
                      onClick={() => setQuickDate(10)}
                      className="px-2 py-0.5 text-xs rounded bg-panel-subtle hover:bg-panel-border text-slate-300 border border-panel-border transition-colors cursor-pointer"
                    >
                      +10 Mins
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate(60)}
                      className="px-2 py-0.5 text-xs rounded bg-panel-subtle hover:bg-panel-border text-slate-300 border border-panel-border transition-colors cursor-pointer"
                    >
                      +1 Hour
                    </button>
                    <button
                      type="button"
                      onClick={setTomorrowMorning}
                      className="px-2 py-0.5 text-xs rounded bg-panel-subtle hover:bg-panel-border text-slate-300 border border-panel-border transition-colors cursor-pointer"
                    >
                      Tomorrow 9:00 AM
                    </button>
                  </div>

                  {scheduleTime && (
                    <p className="text-[11px] text-slate-400 font-mono-code">
                      UTC Target: {new Date(scheduleTime).toISOString()}
                    </p>
                  )}
                </div>
              )}

              {/* Edit Mode: Read-only Lifecycle Status Information */}
              {isEdit && jobToEdit && (
                <div className="p-3.5 rounded-xl bg-panel-bg border border-panel-border flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
                      Job Lifecycle Status
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Managed by the distributed execution engine. Use Pause/Resume actions to modify state.
                    </p>
                  </div>
                  <div className="shrink-0 pl-3">
                    <StatusBadge status={jobToEdit.status} />
                  </div>
                </div>
              )}

              {/* Bottom helper CTA */}
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Ready to specify task payload?
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('payload')}
                  className="flex items-center gap-1 text-xs font-semibold text-hostinger-400 hover:text-hostinger-300 cursor-pointer transition-colors"
                >
                  <span>Configure Execution Payload</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: EXECUTION PAYLOAD (JSON)                               */}
          {/* ============================================================ */}
          {activeTab === 'payload' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              {/* Quick Template Injectors */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-panel-bg border border-panel-border">
                <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-hostinger-400" />
                  <span>Insert Template:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PAYLOAD_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      type="button"
                      onClick={() => {
                        setPayload(tmpl.payload);
                        setPayloadError(null);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-panel-subtle hover:bg-panel-border text-slate-300 hover:text-white border border-panel-border transition-colors cursor-pointer"
                    >
                      <span>{tmpl.icon}</span>
                      <span>{tmpl.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payload Editor Area */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Task Payload (JSON) <span className="text-rose-400">*</span>
                    </label>
                    {payloadError ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        <AlertCircle className="w-3 h-3" /> Syntax Error
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" /> Valid JSON
                      </span>
                    )}
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopyPayload}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-panel-bg hover:bg-panel-subtle text-slate-300 hover:text-white border border-panel-border transition-colors cursor-pointer"
                    >
                      {copiedPayload ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedPayload ? 'Copied' : 'Copy'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrettifyPayload}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-hostinger-600/15 hover:bg-hostinger-600/25 text-hostinger-300 hover:text-white border border-hostinger-600/30 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-hostinger-400" />
                      <span>{formattedFeedback === 'payload' ? 'Formatted!' : 'Format JSON'}</span>
                    </button>
                  </div>
                </div>

                <div className="relative rounded-xl border border-panel-border bg-[#07090e] overflow-hidden focus-within:border-hostinger-500 transition-colors">
                  <textarea
                    rows={12}
                    required
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    className="w-full p-4 bg-transparent text-xs font-mono-code text-slate-200 focus:outline-none leading-relaxed resize-y selection:bg-hostinger-600"
                    placeholder='{\n  "service": "notifications",\n  "batchSize": 100\n}'
                    spellCheck={false}
                  />
                </div>

                {payloadError && (
                  <p className="text-xs text-rose-400 flex items-center gap-1.5 font-mono-code">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{payloadError}</span>
                  </p>
                )}

                <p className="text-[11px] text-slate-500">
                  Serialized into execution jobs dispatched to consumer worker nodes (Spring Cloud Task / Celery runner).
                </p>
              </div>

              {/* Navigation help */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveTab('schedule')}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Schedule</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('metadata')}
                  className="flex items-center gap-1 text-xs font-semibold text-hostinger-400 hover:text-hostinger-300 cursor-pointer transition-colors"
                >
                  <span>Continue to Metadata & Retries</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: METADATA & RETRIES                                     */}
          {/* ============================================================ */}
          {activeTab === 'metadata' && (
            <div className="space-y-5 animate-in fade-in duration-100">
              {/* Max Retries Configuration */}
              <div className="p-4 rounded-xl bg-panel-bg border border-panel-border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-200 block">
                    Max Retries on Failure
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Retry attempts before forwarding to Dead Letter Queue (DLQ).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1 mr-1">
                    {[0, 1, 3, 5, 10].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setRetries(val)}
                        className={`px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer ${
                          retries === val
                            ? 'bg-hostinger-600 text-white border-hostinger-600 font-semibold'
                            : 'bg-panel-subtle hover:bg-panel-border text-slate-300 border-panel-border hover:text-white'
                        }`}
                      >
                        {val === 0 ? '0 (None)' : val === 3 ? '3 (Default)' : val}
                      </button>
                    ))}
                  </div>

                  {/* Stepper with - and + */}
                  <div className="flex items-center bg-panel-surface border border-panel-border rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setRetries((prev) => Math.max(0, prev - 1))}
                      disabled={retries <= 0}
                      className="p-1.5 rounded hover:bg-panel-subtle text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      title="Decrease retries"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={retries}
                      onChange={(e) => setRetries(Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-10 text-center bg-transparent font-mono-code text-xs font-bold text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setRetries((prev) => Math.min(10, prev + 1))}
                      disabled={retries >= 10}
                      className="p-1.5 rounded hover:bg-panel-subtle text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      title="Increase retries"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Metadata JSON Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Operational Metadata (JSON)
                    </label>
                    {metaError ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        Invalid
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">
                        Optional configuration tags
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {METADATA_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.name}
                        type="button"
                        onClick={() => {
                          setMeta(tmpl.json);
                          setMetaError(null);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-panel-bg hover:bg-panel-subtle text-slate-400 hover:text-white border border-panel-border transition-colors cursor-pointer"
                      >
                        {tmpl.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handlePrettifyMeta}
                      className="text-xs px-2.5 py-1 rounded bg-panel-bg hover:bg-panel-subtle text-slate-300 hover:text-white border border-panel-border transition-colors cursor-pointer"
                    >
                      {formattedFeedback === 'meta' ? 'Formatted!' : 'Format'}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-panel-border bg-[#07090e] overflow-hidden focus-within:border-hostinger-500 transition-colors">
                  <textarea
                    rows={5}
                    value={meta}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMeta(val);
                      if (scheduleType === 'INTERVAL') {
                        try {
                          const m = JSON.parse(val);
                          if (m.intervalSeconds) setIntervalSeconds(Number(m.intervalSeconds));
                          else if (m.interval) setIntervalSeconds(Number(m.interval));
                        } catch {
                          const match =
                            val.match(/"intervalSeconds"\s*:\s*(\d+)/) ||
                            val.match(/"interval"\s*:\s*(\d+)/);
                          if (match) setIntervalSeconds(Number(match[1]));
                        }
                      }
                    }}
                    className="w-full p-3.5 bg-transparent text-xs font-mono-code text-slate-200 focus:outline-none leading-relaxed resize-y selection:bg-hostinger-600"
                    placeholder='{\n  "environment": "production"\n}'
                    spellCheck={false}
                  />
                </div>

                {metaError && (
                  <p className="text-xs text-rose-400 flex items-center gap-1.5 font-mono-code">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{metaError}</span>
                  </p>
                )}
              </div>

              {/* Navigation help */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveTab('payload')}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Payload</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* FIXED MODAL FOOTER (Never Cut Off or Pushed Down)            */}
        {/* ============================================================ */}
        <div className="px-6 py-3.5 border-t border-panel-border bg-panel-bg/95 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Summary Badge */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono-code">
            <span className="w-1.5 h-1.5 rounded-full bg-hostinger-400" />
            <span>
              {scheduleType === 'CRON'
                ? `CRON: ${cronHumanized || cronExpression}`
                : scheduleType === 'INTERVAL'
                ? `Interval: every ${intervalSeconds}s`
                : `One-Time: ${scheduleTime ? 'Set' : 'Unset'}`}
            </span>
            <span>&bull;</span>
            <span>{retries} Retries</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-panel-subtle transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {activeTab !== 'metadata' && !isEdit ? (
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'schedule') setActiveTab('payload');
                  else if (activeTab === 'payload') setActiveTab('metadata');
                }}
                className="hidden sm:inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white rounded-lg bg-panel-subtle hover:bg-panel-border border border-panel-border transition-colors cursor-pointer"
              >
                <span>Next Step</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isSubmitting || !isFormValid}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-hostinger-600 hover:bg-hostinger-700 text-white font-semibold text-xs transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isEdit ? 'Save Changes' : 'Schedule Job'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
