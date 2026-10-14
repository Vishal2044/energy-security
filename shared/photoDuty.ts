import { indiaBusinessDate } from './time.js';

export type DutyShift = 'DAY' | 'NIGHT';
export type PhotoPolicy = {
  effectiveFrom: string;
  configuredAt: string;
  shiftType: DutyShift;
  photoRate: number;
  siteId: string;
  active: boolean;
};
export type DutyPhoto = {
  id: string; businessDate: string; slotIndex: number; guardId: string;
  capturedAt: string; photo?: string; photoRate: number; siteId: string;
};
export type PhotoSlot = {
  index: number; opensAt: string; closesAt: string;
  status: 'UPCOMING' | 'OPEN' | 'MISSED' | 'RECEIVED' | 'NOT_REQUIRED';
  attendance?: DutyPhoto;
};
export type PhotoDutyDay = {
  guardId: string; guardName?: string; employeeCode?: string;
  businessDate: string; shiftType: DutyShift; siteId: string; siteName?: string;
  photoRate: number; slots: PhotoSlot[]; receivedPhotos: number; missedPhotos: number;
  requiredPhotos: number; earnings: number; deduction: number; completed: boolean;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'PRESENT' | 'PARTIAL' | 'ABSENT';
};
export type PhotoSalary = {
  id: string; guardId: string; guard?: string; month: number; year: number;
  attendanceDays: number; completeDays: number; partialDays: number; absentDays: number;
  receivedPhotos: number; missedPhotos: number; requiredPhotos: number;
  baseSalary: number; deductions: number; finalSalary: number; netPayable: number;
  status: 'PENDING' | 'PAID'; workflowStatus: 'ACCRUING' | 'READY' | 'PAID';
  paidAt?: string; paymentReference?: string; calculationPolicyVersion: 'PHOTO_V1';
  periodClosed: boolean;
};

const PHOTO_SLOT_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const PHOTO_WINDOW_MS = 2 * 60 * 60 * 1000;
export function addBusinessDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}
export function policyForDate(policies: readonly PhotoPolicy[], date: string): PhotoPolicy | undefined {
  return [...policies].filter((p) => p.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.configuredAt.localeCompare(a.configuredAt))[0];
}
export function dutyDay(guardId: string, businessDate: string, policy: PhotoPolicy, photos: readonly DutyPhoto[], now: Date): PhotoDutyDay {
  const start = new Date(`${businessDate}T${policy.shiftType === 'DAY' ? '08' : '20'}:00:00+05:30`).getTime();
  const slots: PhotoSlot[] = Array.from({ length: 4 }, (_, index) => {
    const opens = start + index * PHOTO_SLOT_INTERVAL_MS;
    const closes = opens + PHOTO_WINDOW_MS;
    const attendance = photos.find((p) => p.guardId === guardId && p.businessDate === businessDate && p.slotIndex === index);
    const required = policy.active && closes > new Date(policy.configuredAt).getTime();
    const status: PhotoSlot['status'] = attendance ? 'RECEIVED' : !required ? 'NOT_REQUIRED' : now.getTime() >= closes ? 'MISSED' : now.getTime() >= opens ? 'OPEN' : 'UPCOMING';
    return { index, opensAt: new Date(opens).toISOString(), closesAt: new Date(closes).toISOString(), status, attendance };
  });
  const received = slots.filter((s) => s.status === 'RECEIVED');
  const missed = slots.filter((s) => s.status === 'MISSED');
  const requiredPhotos = slots.filter((s) => s.status !== 'NOT_REQUIRED').length;
  const completed = slots.every((s) => ['MISSED', 'RECEIVED', 'NOT_REQUIRED'].includes(s.status));
  return {
    guardId, businessDate, shiftType: policy.shiftType, siteId: policy.siteId, photoRate: policy.photoRate, slots,
    receivedPhotos: received.length, missedPhotos: missed.length, requiredPhotos,
    earnings: received.reduce((sum, s) => sum + Math.round((s.attendance?.photoRate ?? policy.photoRate) * 100), 0) / 100,
    deduction: missed.length * Math.round(policy.photoRate * 100) / 100, completed,
    status: completed ? !received.length ? 'ABSENT' : received.length === 4 ? 'PRESENT' : 'PARTIAL' : received.length ? 'IN_PROGRESS' : 'SCHEDULED',
  };
}
export function monthDutyDays(guardId: string, month: number, year: number, policies: readonly PhotoPolicy[], photos: readonly DutyPhoto[], now: Date): PhotoDutyDay[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = indiaBusinessDate(now);
  const days: PhotoDutyDay[] = [];
  for (let day = 1; day <= last; day += 1) {
    const date = `${prefix}-${String(day).padStart(2, '0')}`;
    if (date > today) break;
    const policy = policyForDate(policies, date);
    if (!policy) continue;
    const entry = dutyDay(guardId, date, policy, photos, now);
    if (entry.requiredPhotos) days.push(entry);
  }
  return days;
}
export function photoSalary(guardId: string, month: number, year: number, days: readonly PhotoDutyDay[], now: Date): PhotoSalary {
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  // Wait for the final night duty's 08:00 IST slot to close on the following date.
  const finalSlotClosesAt = new Date(`${addBusinessDays(endDate, 1)}T08:00:00+05:30`).getTime() + PHOTO_WINDOW_MS;
  const periodClosed = now.getTime() >= finalSlotClosesAt;
  const earnings = days.reduce((sum, d) => sum + Math.round(d.earnings * 100), 0) / 100;
  const deductions = days.reduce((sum, d) => sum + Math.round(d.deduction * 100), 0) / 100;
  return {
    id: `photo_${guardId}_${year}_${month}`, guardId, month, year,
    attendanceDays: days.filter((d) => d.receivedPhotos > 0).length,
    completeDays: days.filter((d) => d.status === 'PRESENT').length,
    partialDays: days.filter((d) => d.status === 'PARTIAL').length,
    absentDays: days.filter((d) => d.status === 'ABSENT').length,
    receivedPhotos: days.reduce((sum, d) => sum + d.receivedPhotos, 0),
    missedPhotos: days.reduce((sum, d) => sum + d.missedPhotos, 0),
    requiredPhotos: days.reduce((sum, d) => sum + d.requiredPhotos, 0),
    baseSalary: (Math.round(earnings * 100) + Math.round(deductions * 100)) / 100, deductions, finalSalary: earnings, netPayable: earnings,
    status: 'PENDING', workflowStatus: periodClosed ? 'READY' : 'ACCRUING', periodClosed, calculationPolicyVersion: 'PHOTO_V1',
  };
}
