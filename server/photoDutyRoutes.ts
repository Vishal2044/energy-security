import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { isDatabaseConnected } from './db.js';
import { AttendanceModel, AuditLogModel, PhotoPayrollModel, SiteModel } from './models/index.js';
import { db, audit } from './services/memory.js';
import { analyzeAttendancePhoto } from './services/imageAnalysis.js';
import { MAX_ATTENDANCE_PHOTO_BASE64_LENGTH } from '../shared/attendance.js';
import { currentPhotoDuty, photoMonth, photoOperations, photoPayroll, scopedPhotoGuards } from './services/photoDuty.js';
import { memoryPage, requestedPage } from './services/pagination.js';
import { indiaBusinessDate } from '../shared/time.js';

export const photoDutyRouter = express.Router();
const monthSchema = z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int().min(2020).max(2100) });
const captureSchema = z.object({ photo: z.string().max(MAX_ATTENDANCE_PHOTO_BASE64_LENGTH).regex(/^data:image\/jpeg;base64,/), captureToken: z.string().max(2048), clientRecordId: z.string().uuid() }).strict();
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

photoDutyRouter.get('/photo-duty/operations', async (req, res, next) => {
  try {
    if (req.user?.role === 'GUARD') return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return res.json({ success: true, data: await photoOperations(req.user!) });
  } catch (error) { next(error); }
});

photoDutyRouter.get('/photo-duty/current', async (req, res, next) => {
  try {
    const guard = (await scopedPhotoGuards(req.user!))[0];
    if (!guard || req.user?.role !== 'GUARD') return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return res.json({ success: true, data: await currentPhotoDuty(guard) });
  } catch (error) { next(error); }
});
photoDutyRouter.get('/photo-duty/days', async (req, res, next) => {
  try {
    const today = indiaBusinessDate(new Date());
    const parsed = monthSchema.safeParse({ month: req.query.month ?? Number(today.slice(5, 7)), year: req.query.year ?? Number(today.slice(0, 4)) });
    if (!parsed.success) return res.status(400).json({ success: false, error: 'INVALID_PERIOD' });
    const guards = await scopedPhotoGuards(req.user!, typeof req.query.guardId === 'string' ? req.query.guardId : undefined);
    const days = (await photoMonth(guards, parsed.data.month, parsed.data.year)).sort((a, b) => b.businessDate.localeCompare(a.businessDate) || a.guardId.localeCompare(b.guardId));
    const result = memoryPage(days, requestedPage(req.query));
    const summary = { workedDays: days.filter((d) => d.receivedPhotos > 0).length, completeDays: days.filter((d) => d.status === 'PRESENT').length, absentDays: days.filter((d) => d.status === 'ABSENT').length, receivedPhotos: days.reduce((n, d) => n + d.receivedPhotos, 0), missedPhotos: days.reduce((n, d) => n + d.missedPhotos, 0), earnings: days.reduce((n, d) => n + d.earnings, 0), deductions: days.reduce((n, d) => n + d.deduction, 0) };
    return res.json({ success: true, data: { days: result.records, pagination: result.pagination, summary, serverTime: new Date().toISOString() } });
  } catch (error) { next(error); }
});
photoDutyRouter.post('/photo-duty/capture-session', async (req, res, next) => {
  try {
    if (req.user?.role !== 'GUARD') return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    const guard = (await scopedPhotoGuards(req.user!))[0];
    if (!guard) return res.status(404).json({ success: false, error: 'GUARD_NOT_FOUND' });
    const current = await currentPhotoDuty(guard); const slot = current.day?.slots.find((s) => s.status === 'OPEN');
    if (!current.active || !slot || !current.day) return res.status(409).json({ success: false, error: 'PHOTO_WINDOW_CLOSED' });
    const expiresAt = Math.min(Date.now() + 120000, new Date(slot.closesAt).getTime());
    const captureToken = jwt.sign({ purpose: 'DUTY_CAMERA', guardId: guard.id, userId: req.user.id, businessDate: current.day.businessDate, slotIndex: slot.index, siteId: current.day.siteId, photoRate: current.day.photoRate, exp: Math.floor(expiresAt / 1000) }, env.accessSecret, { algorithm: 'HS256', issuer: 'dg-duty-camera', audience: 'dg-duty-photo' });
    return res.json({ success: true, data: { captureToken, expiresAt: new Date(expiresAt).toISOString(), slot } });
  } catch (error) { next(error); }
});
photoDutyRouter.post('/photo-duty/capture', async (req, res, next) => {
  try {
    if (req.user?.role !== 'GUARD') return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    const parsed = captureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'INVALID_CAPTURE' });
    let token: jwt.JwtPayload;
    try {
      const verified = jwt.verify(parsed.data.captureToken, env.accessSecret, { algorithms: ['HS256'], issuer: 'dg-duty-camera', audience: 'dg-duty-photo' });
      if (typeof verified === 'string') throw new Error('INVALID_TOKEN');
      token = verified;
    } catch { return res.status(409).json({ success: false, error: 'CAPTURE_EXPIRED' }); }
    if (token.purpose !== 'DUTY_CAMERA' || token.guardId !== req.user.guardId || token.userId !== req.user.id) return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    const guard = (await scopedPhotoGuards(req.user!))[0];
    if (!guard) return res.status(404).json({ success: false, error: 'GUARD_NOT_FOUND' });
    const attendanceId = `duty_${guard.id}_${token.businessDate}_${token.slotIndex}`;
    const existing: any = isDatabaseConnected() ? await AttendanceModel.findById(attendanceId) : db.attendance.find((a) => a.id === attendanceId);
    if (existing) return res.status(existing.clientRecordId === parsed.data.clientRecordId ? 200 : 409).json({ success: existing.clientRecordId === parsed.data.clientRecordId, error: existing.clientRecordId === parsed.data.clientRecordId ? undefined : 'PHOTO_ALREADY_RECEIVED', data: { attendance: { id: attendanceId } } });
    const current = await currentPhotoDuty(guard); const slot = current.day?.slots[token.slotIndex];
    if (!current.active || !current.day || current.day.businessDate !== token.businessDate || current.day.siteId !== token.siteId || !slot || slot.status !== 'OPEN') return res.status(409).json({ success: false, error: 'PHOTO_WINDOW_CLOSED' });
    const site: any = isDatabaseConnected() ? await SiteModel.findById(token.siteId) : db.sites.find((s) => s.id === token.siteId);
    if (!site || site.status !== 'ACTIVE') return res.status(409).json({ success: false, error: 'SITE_UNAVAILABLE' });
    const analysis = analyzeAttendancePhoto(parsed.data.photo, undefined, true);
    if (!analysis.photoWidth || !analysis.photoHeight || analysis.photoWidth < 160 || analysis.photoHeight < 160) return res.status(400).json({ success: false, error: 'INVALID_CAMERA_IMAGE' });
    const now = new Date();
    // Decode/analysis time must not permit submission after the server deadline.
    if (now.getTime() >= new Date(slot.closesAt).getTime() || now.getTime() >= token.exp! * 1000) return res.status(409).json({ success: false, error: 'PHOTO_WINDOW_CLOSED' });
    const value = { guardId: guard.id, siteId: current.day.siteId, businessDate: current.day.businessDate, slotIndex: slot.index, shiftType: current.day.shiftType, photoRate: current.day.photoRate, type: 'DUTY_PHOTO' as const, status: 'RECORDED' as const, capturedAt: now.toISOString(), receivedAt: now.toISOString(), clientRecordId: parsed.data.clientRecordId, photo: parsed.data.photo, captureSource: 'LIVE_CAMERA', ...analysis };
    if (isDatabaseConnected()) {
      try { await AttendanceModel.create({ _id: attendanceId, ...value }); }
      catch (error: any) {
        if (error?.code !== 11000) throw error;
        const saved = await AttendanceModel.findById(attendanceId);
        if (!saved) return res.status(409).json({ success: false, error: 'CLIENT_RECORD_CONFLICT' });
        if (saved?.clientRecordId !== parsed.data.clientRecordId) return res.status(409).json({ success: false, error: 'PHOTO_ALREADY_RECEIVED' });
      }
    } else {
      if (db.attendance.some((a) => a.id === attendanceId)) return res.status(409).json({ success: false, error: 'PHOTO_ALREADY_RECEIVED' });
      if (db.attendance.some((a) => a.clientRecordId === parsed.data.clientRecordId)) return res.status(409).json({ success: false, error: 'CLIENT_RECORD_CONFLICT' });
      db.attendance.push({ id: attendanceId, ...value });
    }
    return res.status(201).json({ success: true, data: { attendance: { id: attendanceId, capturedAt: value.capturedAt } } });
  } catch (error) {
    if (error instanceof Error && ['INVALID_IMAGE_DATA', 'IMAGE_DIMENSIONS_INVALID'].includes(error.message)) return res.status(400).json({ success: false, error: 'INVALID_CAMERA_IMAGE' });
    next(error);
  }
});
photoDutyRouter.get('/photo-duty/photo/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id); const attendance: any = isDatabaseConnected() ? await AttendanceModel.findById(id) : db.attendance.find((a) => a.id === id);
    if (!attendance || attendance.type !== 'DUTY_PHOTO') return res.status(404).json({ success: false, error: 'PHOTO_NOT_FOUND' });
    const match = /^data:image\/jpeg;base64,(.+)$/s.exec(attendance.photo ?? '');
    if (!match) return res.status(404).json({ success: false, error: 'PHOTO_NOT_FOUND' });
    return res.type('jpeg').set('Cache-Control', 'private, no-store').send(Buffer.from(match[1], 'base64'));
  } catch (error) { next(error); }
});
photoDutyRouter.get('/photo-payroll', async (req, res, next) => {
  try {
    const guards = await scopedPhotoGuards(req.user!, typeof req.query.guardId === 'string' ? req.query.guardId : undefined);
    const salaries = await photoPayroll(guards); const result = memoryPage(salaries, requestedPage(req.query));
    return res.json({ success: true, data: { salaries: result.records, pagination: result.pagination, summary: { latest: salaries[0], totalNet: salaries.reduce((sum, s) => sum + s.netPayable, 0) } } });
  } catch (error) { next(error); }
});
photoDutyRouter.post('/photo-payroll/credit/:id', async (req, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    const reference = z.string().trim().min(3).max(120).safeParse(req.body?.paymentReference);
    if (!reference.success) return res.status(400).json({ success: false, error: 'PAYMENT_REFERENCE_REQUIRED' });
    const id = String(req.params.id); const salary = (await photoPayroll(await scopedPhotoGuards(req.user!))).find((s) => s.id === id);
    if (!salary) return res.status(404).json({ success: false, error: 'SALARY_NOT_FOUND' });
    if (!salary.periodClosed || salary.status === 'PAID') return res.status(409).json({ success: false, error: salary.status === 'PAID' ? 'SALARY_ALREADY_PAID' : 'PAY_PERIOD_OPEN' });
    const value = { guardId: salary.guardId, month: salary.month, year: salary.year, paidAt: new Date(), paidBy: req.user.id, paymentReference: reference.data, snapshot: salary };
    if (isDatabaseConnected()) {
      try { await PhotoPayrollModel.create({ _id: id, ...value }); }
      catch (error: any) { if (error?.code === 11000) return res.status(409).json({ success: false, error: 'SALARY_ALREADY_PAID' }); throw error; }
    } else {
      if (db.photoPayroll.some((p) => p.id === id)) return res.status(409).json({ success: false, error: 'SALARY_ALREADY_PAID' });
      db.photoPayroll.push({ id, ...value, paidAt: value.paidAt.toISOString() });
    }
    const metadata = { guardId: salary.guardId, amount: salary.netPayable };
    if (isDatabaseConnected()) await AuditLogModel.create({ _id: `audit_${randomUUID()}`, actor: req.user.id, action: 'PHOTO_SALARY_CREDIT_RECORDED', entityType: 'PhotoPayroll', entityId: id, metadata, at: new Date() });
    else audit(req.user.id, 'PHOTO_SALARY_CREDIT_RECORDED', 'PhotoPayroll', id, metadata);
    return res.json({ success: true, data: { salary: { ...salary, status: 'PAID', paidAt: value.paidAt.toISOString() } } });
  } catch (error) { next(error); }
});
photoDutyRouter.get('/photo-payroll/payslip/:id', async (req, res, next) => {
  try {
    const salary = (await photoPayroll(await scopedPhotoGuards(req.user!))).find((s) => s.id === String(req.params.id));
    if (!salary || salary.status !== 'PAID') return res.status(404).json({ success: false, error: 'PAYSLIP_NOT_FOUND' });
    return res.type('html').set('Cache-Control', 'private, no-store').send(`<!doctype html><html><head><meta charset="utf-8"><title>Photo duty payslip</title></head><body><h1>Salary payslip</h1><p>${escapeHtml(salary.guard)} · ${salary.month}/${salary.year}</p><p>Worked days: ${salary.attendanceDays} · Complete: ${salary.completeDays} · Partial: ${salary.partialDays} · Absent: ${salary.absentDays}</p><p>Received photos: ${salary.receivedPhotos} · Missed: ${salary.missedPhotos}</p><p>Missed photo deduction: ₹${salary.deductions}</p><h2>Credited: ₹${salary.netPayable}</h2><p>Reference: ${escapeHtml(salary.paymentReference)} · ${escapeHtml(salary.paidAt)}</p></body></html>`);
  } catch (error) { next(error); }
});
