import { isDatabaseConnected } from '../db.js';
import { AttendanceModel, GuardModel, IncidentModel, PhotoPayrollModel, SiteModel } from '../models/index.js';
import { db } from './memory.js';
import { indiaBusinessDate } from '../../shared/time.js';
import { addBusinessDays, dutyDay, monthDutyDays, photoSalary, policyForDate, type DutyPhoto, type PhotoPolicy, type PhotoSalary } from '../../shared/photoDuty.js';
import type { SessionUser } from '../../shared/types.js';

export function recordObject(value: any): any {
  const item = value?.toObject ? value.toObject() : { ...value };
  item.id = String(item._id ?? item.id); delete item._id; delete item.__v;
  return item;
}
export async function scopedPhotoGuards(user: SessionUser, guardId?: string): Promise<any[]> {
  const filter: any = user.role === 'GUARD' ? { _id: user.guardId ?? '__none__' } : user.role === 'MAIN_SECURITY' ? { assignedSite: { $in: user.assignedSiteIds ?? [] } } : {};
  if (guardId) {
    if (user.role === 'GUARD' && user.guardId !== guardId) return [];
    filter._id = guardId;
  }
  return isDatabaseConnected() ? (await GuardModel.find(filter).lean()).map(recordObject) : db.guards.filter((g) => (!guardId || g.id === guardId) && (user.role === 'ADMIN' || user.role === 'GUARD' && g.id === user.guardId || user.role === 'MAIN_SECURITY' && user.assignedSiteIds?.includes(g.assignedSite ?? '')));
}
export function guardPolicies(guard: any): PhotoPolicy[] { return (guard.photoPolicyHistory ?? []) as PhotoPolicy[]; }
export function newPhotoPolicy(input: { shiftType: 'DAY' | 'NIGHT'; photoRate: number; siteId: string; active?: boolean }, now = new Date(), existing: readonly PhotoPolicy[] = []): PhotoPolicy[] {
  const effectiveFrom = existing.length ? addBusinessDays(indiaBusinessDate(now), 1) : indiaBusinessDate(now);
  const policy: PhotoPolicy = { ...input, active: input.active ?? true, configuredAt: now.toISOString(), effectiveFrom };
  // Multiple edits to a future policy replace that future entry, never past policies.
  return [...existing.filter((p) => p.effectiveFrom !== effectiveFrom), policy].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}
export async function photoRecords(guardIds: string[], from?: string, to?: string): Promise<DutyPhoto[]> {
  if (!guardIds.length) return [];
  const filter: any = { guardId: { $in: guardIds }, type: 'DUTY_PHOTO' };
  if (from || to) filter.businessDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const records: any[] = isDatabaseConnected() ? await AttendanceModel.find(filter).select('-photo').lean() : db.attendance.filter((r) => r.type === 'DUTY_PHOTO' && guardIds.includes(r.guardId) && (!from || (r.businessDate ?? '') >= from) && (!to || (r.businessDate ?? '') <= to));
  return records.map((r) => ({ ...recordObject(r), photo: `/api/photo-duty/photo/${String(r._id ?? r.id)}`, capturedAt: new Date(r.capturedAt).toISOString() }));
}
export async function currentPhotoDuty(guard: any, now = new Date()) {
  const today = indiaBusinessDate(now); const yesterday = addBusinessDays(today, -1);
  const photos = await photoRecords([guard.id], yesterday, today);
  const candidates = [yesterday, today, addBusinessDays(today, 1)].flatMap((date) => {
    const policy = policyForDate(guardPolicies(guard), date);
    if (!policy) return [];
    const entry = dutyDay(guard.id, date, policy, photos, now);
    if (!entry.requiredPhotos) return [];
    return [entry];
  });
  const previous = candidates.find((d) => d.businessDate === yesterday && d.shiftType === 'NIGHT' && !d.completed && now.getTime() < new Date(d.slots[3].closesAt).getTime());
  const day = previous ?? candidates.find((d) => d.businessDate === today) ?? candidates.find((d) => d.businessDate === addBusinessDays(today, 1));
  const site: any = day ? (isDatabaseConnected() ? await SiteModel.findById(day.siteId).lean() : db.sites.find((s) => s.id === day.siteId)) : undefined;
  return { day: day ? { ...day, guardName: guard.name, employeeCode: guard.employeeCode, siteName: site?.siteName } : undefined, configured: guardPolicies(guard).length > 0, active: Boolean(guard.assignedSite) && guard.employmentStatus === 'ACTIVE' && site?.status === 'ACTIVE', serverTime: now.toISOString() };
}
export async function photoMonth(guards: any[], month: number, year: number, now = new Date()) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const photos = await photoRecords(guards.map((g) => g.id), `${prefix}-01`, `${prefix}-31`);
  const byGuard = photosByGuard(photos);
  return guards.flatMap((guard) => monthDutyDays(guard.id, month, year, guardPolicies(guard), byGuard.get(guard.id) ?? [], now).map((d) => ({ ...d, guardName: guard.name, employeeCode: guard.employeeCode })));
}
function photosByGuard(photos: DutyPhoto[]) {
  const groups = new Map<string, DutyPhoto[]>();
  for (const photo of photos) { const items = groups.get(photo.guardId) ?? []; items.push(photo); groups.set(photo.guardId, items); }
  return groups;
}
export async function photoPayroll(guards: any[], now = new Date()): Promise<PhotoSalary[]> {
  const result: PhotoSalary[] = [];
  const earliest = guards.flatMap((g) => guardPolicies(g).map((p) => p.effectiveFrom)).sort()[0];
  if (!earliest) return result;
  const allPhotos = await photoRecords(guards.map((g) => g.id), earliest, indiaBusinessDate(now));
  const byGuard = photosByGuard(allPhotos);
  const paid: any[] = isDatabaseConnected() ? await PhotoPayrollModel.find({ guardId: { $in: guards.map((g) => g.id) } }).lean() : db.photoPayroll;
  for (const guard of guards) {
    const policies = guardPolicies(guard); if (!policies.length) continue;
    const start = new Date(`${policies[0].effectiveFrom.slice(0, 7)}-01T00:00:00Z`);
    const finalMonth = indiaBusinessDate(now).slice(0, 7);
    for (let date = start; date.toISOString().slice(0, 7) <= finalMonth; date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))) {
      const month = date.getUTCMonth() + 1; const year = date.getUTCFullYear();
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const photos = (byGuard.get(guard.id) ?? []).filter((p) => p.businessDate.startsWith(prefix));
      const days = monthDutyDays(guard.id, month, year, policies, photos, now);
      if (!days.length) continue;
      const salary = photoSalary(guard.id, month, year, days, now);
      const saved = paid.find((r) => String(r.guardId) === guard.id && r.month === month && r.year === year);
      result.push({ ...salary, ...(saved?.snapshot ?? {}), ...(saved ? { status: 'PAID' as const, workflowStatus: 'PAID' as const, paidAt: new Date(saved.paidAt).toISOString(), paymentReference: saved.paymentReference } : {}), guard: guard.name });
    }
  }
  return result.sort((a, b) => b.year - a.year || b.month - a.month || a.guardId.localeCompare(b.guardId));
}

export async function photoOperations(user: SessionUser, now = new Date()) {
  const guards = await scopedPhotoGuards(user);
  const today = indiaBusinessDate(now); const yesterday = addBusinessDays(today, -1);
  const photos = await photoRecords(guards.map((g) => g.id), addBusinessDays(today, -7), today);
  const siteFilter = user.role === 'ADMIN' ? {} : { _id: { $in: user.assignedSiteIds ?? [] } };
  const sites: any[] = isDatabaseConnected() ? await SiteModel.find(siteFilter).lean() : db.sites.filter((s) => user.role === 'ADMIN' || user.assignedSiteIds?.includes(s.id));
  const incidentFilter = { status: { $in: ['OPEN', 'ACKNOWLEDGED', 'REOPENED'] }, ...(user.role === 'ADMIN' ? {} : { siteId: { $in: user.assignedSiteIds ?? [] } }) };
  const incidents: any[] = isDatabaseConnected() ? await IncidentModel.find(incidentFilter).select('siteId category severity priority status').lean() : db.incidents.filter((i) => ['OPEN', 'ACKNOWLEDGED', 'REOPENED'].includes(i.status) && (user.role === 'ADMIN' || user.assignedSiteIds?.includes(i.siteId)));
  const days = guards.filter((g) => g.employmentStatus === 'ACTIVE').flatMap((guard) => {
    const candidates = [yesterday, today].flatMap((date) => {
      const policy = policyForDate(guardPolicies(guard), date); if (!policy) return [];
      const day = dutyDay(guard.id, date, policy, photos, now); return day.requiredPhotos ? [day] : [];
    });
    const previous = candidates.find((d) => d.shiftType === 'NIGHT' && d.businessDate === yesterday && now.getTime() < new Date(d.slots[3].closesAt).getTime());
    const day = previous ?? candidates.find((d) => d.businessDate === today);
    return day ? [{ ...day, guardName: guard.name, employeeCode: guard.employeeCode }] : [];
  });
  const siteRows = sites.filter((s) => s.status === 'ACTIVE').map((site) => {
    const id = String(site._id ?? site.id); const siteDays = days.filter((d) => d.siteId === id);
    const rostered = siteDays.length; const expectedCoverage = Number(site.requiredShiftCoverage ?? site.approvedGuardStrength ?? rostered);
    return { siteCode: site.siteCode, siteName: site.siteName, assignedGuards: guards.filter((g) => g.assignedSite === id && g.employmentStatus === 'ACTIVE').length, expectedCoverage, rostered, attendanceSubmitted: siteDays.filter((d) => d.receivedPhotos > 0).length, pendingAttendance: siteDays.filter((d) => !d.receivedPhotos).length, shortage: Math.max(0, expectedCoverage - rostered), receivedPhotos: siteDays.reduce((n, d) => n + d.receivedPhotos, 0), missedPhotos: siteDays.reduce((n, d) => n + d.missedPhotos, 0), openIncidents: incidents.filter((i) => String(i.siteId) === id).length };
  });
  return {
    businessDate: today, days,
    summary: { sites: siteRows.length, rostered: days.length, attendanceSubmitted: days.filter((d) => d.receivedPhotos > 0).length, pendingAttendance: days.filter((d) => !d.receivedPhotos).length, receivedPhotos: days.reduce((n, d) => n + d.receivedPhotos, 0), missedPhotos: days.reduce((n, d) => n + d.missedPhotos, 0), absentGuards: days.filter((d) => d.status === 'ABSENT').length, unconfiguredGuards: guards.filter((g) => g.employmentStatus === 'ACTIVE' && !guardPolicies(g).length).length, openIncidents: incidents.length },
    sites: siteRows,
    trend: Array.from({ length: 7 }, (_, i) => { const date = addBusinessDays(today, i - 6); return { day: date.slice(5), value: photos.filter((p) => p.businessDate === date).length }; }),
    recentPhotos: [...photos].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 4).map((p) => ({ ...p, guard: guards.find((g) => g.id === p.guardId)?.name })),
  };
}
