import { randomUUID } from 'node:crypto';
import { isDatabaseConnected } from '../db.js';
import { NotificationModel, NotificationPreferenceModel, UserModel } from '../models/index.js';
import { db } from './memory.js';
import { deliverPushToUser, type PushDeliveryStatus } from './push.js';

export type NotificationInput = {
  userId?: string;
  guardId?: string;
  siteId?: string;
  tenantId?: string;
  title: string;
  body: string;
  kind: string;
  requestId?: string;
  deepLink?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  source?: string;
  dedupeKey?: string;
  requiresAcknowledgement?: boolean;
  quietHoursBypass?: boolean;
  expiresAt?: Date;
};

function notificationId() { return `notification_${randomUUID().slice(0, 8)}`; }
function clockMinutes(date: Date) { const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date); return Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value ?? 0); }
function isQuietHours(start?: string, end?: string, now = new Date()) {
  if (!start || !end) return false;
  const [startHour, startMinute] = start.split(':').map(Number); const [endHour, endMinute] = end.split(':').map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return false;
  const current = clockMinutes(now); const from = startHour * 60 + startMinute; const to = endHour * 60 + endMinute;
  return from === to ? false : from < to ? current >= from && current < to : current >= from || current < to;
}
async function resolveUserId(input: NotificationInput) {
  if (input.userId) return input.userId;
  if (!input.guardId) return undefined;
  if (isDatabaseConnected()) { const user: any = await UserModel.findOne({ guardId: input.guardId }).select({ _id: 1 }); return user?._id ? String(user._id) : undefined; }
  return db.users.find((user) => user.guardId === input.guardId)?.id;
}
async function preference(userId: string) {
  if (isDatabaseConnected()) return (await NotificationPreferenceModel.findOne({ userId }))?.toObject() as any;
  return db.notificationPreferences.find((item) => item.userId === userId);
}
async function delivery(userId: string | undefined, pref: any, input: NotificationInput): Promise<{ status: PushDeliveryStatus | 'DISABLED' | 'QUIET_HOURS'; attempts: number }> {
  if (pref && (!pref.enabled || pref.channels?.inApp === false)) return { status: 'DISABLED', attempts: 0 };
  if (pref?.categories && pref.categories[input.kind] === false) return { status: 'DISABLED', attempts: 0 };
  if (!input.quietHoursBypass && isQuietHours(pref?.quietHoursStart, pref?.quietHoursEnd)) return { status: 'QUIET_HOURS', attempts: 0 };
  if (pref?.channels?.push === false) return { status: 'DISABLED', attempts: 0 };
  const status = await deliverPushToUser(userId, { title: input.title, body: input.body, deepLink: input.deepLink });
  return { status, attempts: 1 };
}

export async function createNotification(input: NotificationInput) {
  const userId = await resolveUserId(input); if (!userId && !input.guardId) return undefined;
  const now = new Date();
  if (input.dedupeKey) {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const duplicate = isDatabaseConnected() ? await NotificationModel.findOne({ dedupeKey: input.dedupeKey, createdAt: { $gte: since } }) : db.notifications.find((item) => item.dedupeKey === input.dedupeKey && new Date(item.createdAt).getTime() >= since.getTime());
    if (duplicate) return duplicate;
  }
  const pref = userId ? await preference(userId) : undefined; const result = await delivery(userId, pref, input);
  const value: any = { tenantId: input.tenantId, userId, guardId: input.guardId, siteId: input.siteId, requestId: input.requestId, title: input.title, body: input.body, kind: input.kind, deepLink: input.deepLink, priority: input.priority ?? 'NORMAL', deliveryStatus: result.status, deliveryAttempts: result.attempts, lastDeliveryAt: result.attempts ? now : undefined, lastDeliveryError: ['FAILED', 'UNAVAILABLE'].includes(result.status) ? result.status : undefined, retryAt: ['FAILED', 'UNAVAILABLE', 'NO_SUBSCRIPTION'].includes(result.status) ? new Date(now.getTime() + 15 * 60000) : undefined, status: 'UNREAD', requiresAcknowledgement: input.requiresAcknowledgement === true, quietHoursBypass: input.quietHoursBypass === true, dedupeKey: input.dedupeKey, source: input.source, expiresAt: input.expiresAt, createdAt: now };
  if (isDatabaseConnected()) return NotificationModel.create({ _id: notificationId(), ...value });
  const record = { id: notificationId(), ...value, userId, createdAt: now.toISOString(), expiresAt: input.expiresAt?.toISOString() };
  db.notifications.unshift(record); return record;
}

export async function createNotifications(inputs: NotificationInput[]) { const created = []; for (const input of inputs) { const item = await createNotification(input); if (item) created.push(item); } return created; }

export async function retryNotifications(now = new Date()) {
  const records: any[] = isDatabaseConnected()
    ? await NotificationModel.find({ deliveryStatus: { $in: ['FAILED', 'UNAVAILABLE', 'NO_SUBSCRIPTION'] }, retryAt: { $lte: now } }).limit(200)
    : db.notifications.filter((item) => ['FAILED', 'UNAVAILABLE', 'NO_SUBSCRIPTION'].includes(String(item.deliveryStatus)) && item.retryAt && new Date(item.retryAt).getTime() <= now.getTime()).slice(0, 200);
  for (const item of records) {
    const pref = item.userId ? await preference(String(item.userId)) : undefined;
    const result = await delivery(item.userId ? String(item.userId) : undefined, pref, item);
    item.deliveryStatus = result.status; item.deliveryAttempts = Number(item.deliveryAttempts ?? 0) + result.attempts; item.lastDeliveryAt = result.attempts ? now : item.lastDeliveryAt; item.lastDeliveryError = ['FAILED', 'UNAVAILABLE'].includes(result.status) ? result.status : undefined; item.retryAt = new Date(now.getTime() + 15 * 60000);
    if (isDatabaseConnected()) await item.save(); else { item.lastDeliveryAt = result.attempts ? now.toISOString() : item.lastDeliveryAt; item.retryAt = item.retryAt.toISOString(); }
  }
  return records.length;
}
