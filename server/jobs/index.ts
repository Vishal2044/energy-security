import { currentPhotoDuty, scopedPhotoGuards } from '../services/photoDuty.js';
import cron from 'node-cron';
import { isDatabaseConnected } from '../db.js';
import { IncidentModel, SalaryModel } from '../models/index.js';
import { db } from '../services/memory.js';
import { createNotification, retryNotifications } from '../services/notifications.js';
import { indiaBusinessDate } from '../../shared/time.js';
import { env } from '../config/env.js';

async function photoSlotReminders(now: Date) {
  const guards = await scopedPhotoGuards({ id: 'notification-job', name: 'Duty reminders', email: '', role: 'ADMIN' });
  for (const guard of guards) {
    if (guard.employmentStatus !== 'ACTIVE') continue;
    const duty = await currentPhotoDuty(guard, now); const slot = duty.day?.slots.find((s) => s.status === 'OPEN');
    if (!duty.active || !slot || !duty.day) continue;
    await createNotification({ guardId: guard.id, siteId: duty.day.siteId, kind: 'DUTY_PHOTO', title: 'Live duty photo due', body: 'Take and send your live photo before the two-hour window closes.', deepLink: '/guard', source: 'PHOTO_DUTY_JOB', dedupeKey: `photo-slot:${guard.id}:${duty.day.businessDate}:${slot.index}`, priority: 'HIGH' });
  }
}
async function incidentEscalationReminders(now: Date) {
  const incidents: any[] = isDatabaseConnected() ? await IncidentModel.find({ status: { $in: ['OPEN', 'ACKNOWLEDGED'] }, dueAt: { $lte: now } }).limit(500) : db.incidents.filter((item) => ['OPEN', 'ACKNOWLEDGED'].includes(item.status) && item.dueAt && new Date(item.dueAt).getTime() <= now.getTime()).slice(0, 500);
  for (const incident of incidents) if (incident.assignedOfficerId) await createNotification({ userId: String(incident.assignedOfficerId), siteId: String(incident.siteId), kind: 'INCIDENT_ESCALATION', title: 'Incident escalation', body: 'An incident is overdue and needs attention.', deepLink: `/incidents/${String(incident._id ?? incident.id)}`, source: 'INCIDENT_JOB', dedupeKey: `incident-escalation:${String(incident._id ?? incident.id)}:${indiaBusinessDate(now)}`, priority: 'EMERGENCY', requiresAcknowledgement: true, quietHoursBypass: true });
}
async function payrollPublicationReminders(now: Date) {
  const salaries: any[] = isDatabaseConnected() ? await SalaryModel.find({ workflowStatus: { $in: ['PAID', 'RECONCILED'] }, paidAt: { $gte: new Date(now.getTime() - 24 * 60 * 60000) } }).limit(500) : db.salaries.filter((item) => ['PAID', 'RECONCILED'].includes(String(item.workflowStatus ?? item.status)) && item.paidAt && new Date(item.paidAt).getTime() >= now.getTime() - 24 * 60 * 60000).slice(0, 500);
  for (const salary of salaries) await createNotification({ guardId: String(salary.guardId), kind: 'PAYROLL_PUBLISHED', title: 'Salary record published', body: `Your salary record for ${salary.month}/${salary.year} is available.`, deepLink: '/guard/salary', source: 'PAYROLL_JOB', dedupeKey: `payroll-published:${String(salary._id ?? salary.id)}`, priority: 'NORMAL' });
}
export async function runNotificationJobs(now = new Date()) { await photoSlotReminders(now); await incidentEscalationReminders(now); await payrollPublicationReminders(now); await retryNotifications(now); }

/** Absence and earnings are derived from expired photo slots; no approval job is needed. */
export function startJobs() {
  let running = false;
  const run = async () => {
    if (running || (env.nodeEnv === 'production' && !isDatabaseConnected())) return;
    running = true;
    try { await runNotificationJobs(); }
    catch (error) { console.error('Notification job failed.', error); }
    finally { running = false; }
  };
  // Re-check current reminders on startup after a restart or free-service wake-up.
  void run();
  return cron.schedule('*/15 * * * *', () => { void run(); });
}
