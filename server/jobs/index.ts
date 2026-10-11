import cron from 'node-cron';
import { isDatabaseConnected } from '../db.js';
import { AttendanceModel, DocumentModel, IncidentModel, RosterModel, SalaryModel, VerificationRequestModel } from '../models/index.js';
import { db } from '../services/memory.js';
import { createNotification, retryNotifications } from '../services/notifications.js';
import { indiaBusinessDate } from '../../shared/time.js';

async function documentExpiryReminders(now: Date) {
  const until = new Date(now.getTime() + 30 * 86400000); const dateKey = indiaBusinessDate(now);
  const documents: any[] = isDatabaseConnected() ? await DocumentModel.find({ expiresAt: { $gte: now, $lte: until }, status: { $ne: 'REJECTED' } }).limit(500) : db.documents.filter((item) => item.expiresAt && new Date(item.expiresAt).getTime() >= now.getTime() && new Date(item.expiresAt).getTime() <= until.getTime() && item.status !== 'REJECTED').slice(0, 500);
  for (const document of documents) await createNotification({ guardId: String(document.guardId), kind: 'DOCUMENT_EXPIRY', title: 'Document expiry reminder', body: `${String(document.type).replaceAll('_', ' ')} expires soon. Please upload a replacement.`, deepLink: '/guard/documents', source: 'EXPIRY_JOB', dedupeKey: `document-expiry:${String(document._id ?? document.id)}:${dateKey}`, priority: 'HIGH' });
}
async function attendanceMissingReminders(now: Date) {
  const date = indiaBusinessDate(now); const rosters: any[] = isDatabaseConnected() ? await RosterModel.find({ businessDate: date, status: { $in: ['SCHEDULED', 'ACKNOWLEDGED'] }, startAt: { $lte: new Date(now.getTime() - 30 * 60000) } }).limit(500) : db.rosters.filter((item) => item.businessDate === date && ['SCHEDULED', 'ACKNOWLEDGED'].includes(item.status) && new Date(item.startAt).getTime() <= now.getTime() - 30 * 60000).slice(0, 500);
  for (const roster of rosters) {
    const guardId = String(roster.guardId); const siteId = String(roster.siteId); const hasAttendance = isDatabaseConnected() ? await AttendanceModel.exists({ guardId, siteId, type: 'SHIFT_START', capturedAt: { $gte: new Date(now.getTime() - 18 * 60 * 60000) } }) : db.attendance.some((item) => item.guardId === guardId && item.siteId === siteId && item.type === 'SHIFT_START' && new Date(item.capturedAt).getTime() >= now.getTime() - 18 * 60 * 60000);
    if (!hasAttendance) await createNotification({ guardId, siteId: String(roster.siteId), kind: 'ATTENDANCE_MISSING', title: 'Attendance is pending', body: 'Your scheduled duty attendance has not been submitted yet.', deepLink: '/guard/attendance', source: 'ATTENDANCE_JOB', dedupeKey: `attendance-missing:${guardId}:${String(roster._id ?? roster.id)}:${date}`, priority: 'HIGH' });
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
export async function runNotificationJobs(now = new Date()) { await documentExpiryReminders(now); await attendanceMissingReminders(now); await incidentEscalationReminders(now); await payrollPublicationReminders(now); await retryNotifications(now); }

/** Expires verification requests only; it never converts notification failure into payroll absence. */
export function startJobs() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    if (isDatabaseConnected()) await VerificationRequestModel.updateMany({ status: { $ne: 'VERIFIED' }, expiresAt: { $lt: now } }, { $set: { status: 'EXPIRED' } });
    else db.verifications.forEach((item) => { if (item.status !== 'VERIFIED' && new Date(item.expiresAt).getTime() < now.getTime()) item.status = 'EXPIRED'; });
  });
  cron.schedule('*/15 * * * *', () => { void runNotificationJobs().catch((error) => console.error('Notification job failed.', error)); });
}
