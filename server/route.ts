import { photoDutyRouter } from './photoDutyRoutes.js';
import { newPhotoPolicy, guardPolicies } from './services/photoDuty.js';
import { mongoPage, memoryPage, requestedPage } from './services/pagination.js';
import { paginationFor } from '../shared/pagination.js';
import express from "express";
import multer from "multer";
import { z } from "zod";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { isDatabaseConnected } from "./db.js";
import {
  ActivityModel,
  AttendanceModel,
  AttendanceCorrectionModel,
  LeaveRequestModel,
  OvertimeModel,
  ReplacementModel,
  RosterModel,
  AuditLogModel,
  DocumentModel,
  GuardModel,
  IncidentModel,
  NotificationModel,
  NotificationPreferenceModel,
  PushSubscriptionModel,
  SalaryModel,
  SessionModel,
  ShiftModel,
  SiteModel,
  UserModel,
  VerificationRequestModel,
} from "./models/index.js";
import {
  addActivity,
  audit,
  db,
  newId,
  type AttendanceRecord,
  type AttendanceCorrectionRecord,
  type GuardRecord,
  type LeaveRequestRecord,
  type OvertimeRecord,
  type ReplacementRecord,
  type RosterRecord,
  type ShiftRecord,
  type SiteRecord,
} from "./services/memory.js";
import {
  clearSession,
  createRefreshSession,
  listRefreshSessions,
  refreshTokenFromRequest,
  requireAuth,
  requireRoles,
  revokeAllRefreshSessions,
  revokeRefreshSession,
  rotateRefreshSession,
  setSession,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "./services/auth.js";
import { clearLoginFailures, loginGate, recordLoginFailure } from "./services/loginSecurity.js";
import { deleteLocalUpload, saveLocalUpload, isStoredUpload, sendStoredUpload } from "./services/storage.js";
import { analyzeAttendancePhoto, hammingDistance, reviewFlag, type AttendanceReviewFlag } from "./services/imageAnalysis.js";
import { deliverPushToUser } from "./services/push.js";
import { createNotification, createNotifications } from "./services/notifications.js";
import { ROLES, type AttendanceType } from "../shared/types.js";
import { attendancePayloadSchema, MAX_ATTENDANCE_PHOTO_BASE64_LENGTH, type AttendancePayload } from "../shared/attendance.js";
import { canAccessSite, canReadOperational, canReadOwnedPrivate, canReadPrivate, canReadProfile, canManageGuard, canReadDocument } from "../shared/permissions.js";
import { indiaBusinessDate, indiaDayUtcRange } from "../shared/time.js";
import { createAuthorizationMiddleware } from "./authorization/middleware.js";
import { matchRoutePolicy, type ResourceKind } from "./authorization/routes.js";
import type { SessionUser } from "../shared/types.js";

export const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) =>
    callback(
      null,
      file.mimetype === "application/pdf" || file.mimetype.startsWith("image/"),
    ),
});
const routeParam = (value: string | string[]) =>
  Array.isArray(value) ? value[0] : value;
const usingMongo = () => isDatabaseConnected();
const makeId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;
const optionalLatitude = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.union([z.null(), z.coerce.number().finite().min(-90).max(90)]),
).optional();
const optionalLongitude = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.union([z.null(), z.coerce.number().finite().min(-180).max(180)]),
).optional();
const optionalGeofenceRadius = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.union([z.null(), z.coerce.number().finite().positive().max(100000)]),
).optional();
const coordinatesArePaired = (latitude: number | null | undefined, longitude: number | null | undefined) =>
  (latitude === undefined) === (longitude === undefined);
const object = (value: any): any => {
  const item =
    typeof value?.toObject === "function" ? value.toObject() : { ...value };
  if (item._id !== undefined) {
    item.id = String(item._id);
    delete item._id;
  }
  return item;
};
const objects = (values: any[]) => values.map(object);
const publicAttendance = (value: any) => {
  const item = object(value);
  if (item.reviewDueAt && item.status === "MANUAL_REVIEW") item.reviewDelayed = new Date(item.reviewDueAt).getTime() < Date.now();
  delete item.photoMetadata;
  delete item.latitude;
  delete item.longitude;
  delete item.accuracy;
  delete item.gpsAccuracy;
  delete item.locationTimestamp;
  delete item.gpsTimestamp;
  delete item.distanceFromSiteMeters;
  delete item.geofenceStatus;
  delete item.locationStatus;
  return item;
};
const publicAttendances = (values: any[]) => values.map(publicAttendance);
const safeGuard = (guard: any, viewer?: SessionUser) => {
  const item = object(guard);
  const { profilePhoto, ...safeItem } = item;
  if (viewer?.role === "MAIN_SECURITY" && !canManageGuard(viewer, { siteId: item.assignedSite })) return {
    id: item.id, employeeCode: item.employeeCode, name: item.name, nameGujarati: item.nameGujarati,
    mobile: item.mobile, assignedSite: item.assignedSite, employmentStatus: item.employmentStatus,
    profilePhotoUrl: profilePhoto ? `/api/guards/${item.id}/photo` : undefined,
  };
  return {
    ...safeItem,
    profilePhotoUrl: profilePhoto
      ? `/api/guards/${safeItem.id}/photo`
      : undefined,
    bank: {
      ...(safeItem.bank ?? {}),
      accountNumber: String(safeItem.bank?.accountNumber ?? "")
        .slice(-4)
        .padStart(String(safeItem.bank?.accountNumber ?? "").length, "•"),
    },
  };
};
const withAssignedSiteDetails = (
  guard: any,
  siteLookup: Map<
    string,
    { siteCode: string; siteName: string; mapLink?: string }
  >,
  viewer?: SessionUser,
) => {
  const item = safeGuard(guard, viewer);
  const details = item.assignedSite
    ? siteLookup.get(String(item.assignedSite))
    : undefined;
  return details ? { ...item, assignedSiteDetails: details } : item;
};
const safeUser = (user: any) => ({
  id: String(user.id ?? user._id),
  email: user.email,
  name: user.name,
  role: user.role,
  guardId: user.role === "GUARD" ? user.guardId : undefined,
  profilePhotoUrl: user.profilePhoto
    ? `/api/users/${String(user.id ?? user._id)}/photo`
    : undefined,
  preferredLanguage: user.preferredLanguage,
  passwordChangeRequired: user.passwordChangeRequired === true,
  assignedSiteIds: user.role === "MAIN_SECURITY" ? [...(user.assignedSiteIds ?? [])] : [],
});
const maskSensitive = (value: unknown) => {
  const text = String(value ?? "");
  return text ? `${"•".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}` : "";
};
const safeTeamUser = (user: any) => ({
  ...safeUser(user),
  active: user.active !== false,
  assignedSiteIds: user.role === "MAIN_SECURITY" ? [...(user.assignedSiteIds ?? [])] : [],
  accessRevision: user.accessRevision ?? 0,
});
const csv = (rows: string[][]) =>
  rows
    .map((row) =>
      row.map((value) => {
        const text = String(value ?? "");
        const formulaLike = /^[=+@]/.test(text) || /^-\s*[=+@-]/.test(text);
        const safe = formulaLike ? `'${text}` : text;
        return `"${safe.replaceAll('"', '""')}"`;
      }).join(","),
    )
    .join("\n");

async function findUser(email: string) {
  // Older manually-created Mongo users may not have the `active` field yet.
  // Treat missing active as enabled, but always reject an explicit false.
  if (usingMongo()) return UserModel.findOne({ email: email.toLowerCase() });
  return db.users.find(
    (user) => user.email.toLowerCase() === email.toLowerCase() && user.active,
  );
}
async function findGuard(id?: string) {
  if (!id) return undefined;
  if (usingMongo()) return GuardModel.findById(id);
  return db.guards.find((guard) => guard.id === id);
}
async function findUserForGuard(guardId: string) {
  if (usingMongo()) return UserModel.findOne({ guardId, role: "GUARD" });
  return db.users.find((user) => user.guardId === guardId && user.role === "GUARD");
}
async function findSite(id?: string) {
  if (!id) return undefined;
  if (usingMongo()) return SiteModel.findById(id);
  return db.sites.find((site) => site.id === id);
}
async function guardForUser(user: Express.Request["user"]) {
  return findGuard(user?.guardId);
}
function dateRange() {
  return indiaDayUtcRange(new Date());
}
function parseAttendancePayload(req: express.Request) {
  const body = req.body ?? {};
  return attendancePayloadSchema.safeParse(body);
}
function validationDetails(error: z.ZodError) {
  return {
    fields: error.issues.map((issue) => ({
      field: issue.path.length ? issue.path.join(".") : "payload",
      message: issue.message,
    })),
  };
}
function recordId(value: any) {
  return String(value?._id ?? value?.id ?? value ?? "");
}
function denyGuardOtherThan(user: Express.Request["user"], id: string) {
  return user?.role === "GUARD" && user.guardId !== id;
}
function guardIdForUser(user: Express.Request["user"]) {
  return user?.role === "GUARD" && user.guardId ? String(user.guardId) : "";
}
function shiftStatus(item: any) {
  return String(item.status ?? "");
}
async function findActiveShift(guardId: string) {
  if (usingMongo())
    return ShiftModel.findOne({ guardId, status: "ACTIVE" }).sort({
      startedAt: -1,
    });
  return db.shifts.find(
    (shift) => shift.guardId === guardId && shift.status === "ACTIVE",
  );
}
async function findShift(id?: string) {
  if (!id) return undefined;
  if (usingMongo()) return ShiftModel.findById(id);
  return db.shifts.find((shift) => shift.id === id);
}
function activeVerificationFilter(guardId: string) {
  return {
    guardId,
    status: { $in: ["NOTIFICATION_PENDING", "SENT", "OPENED"] },
    expiresAt: { $gt: new Date() },
  };
}
async function findActiveVerification(guardId: string) {
  if (usingMongo())
    return VerificationRequestModel.findOne(
      activeVerificationFilter(guardId),
    ).sort({ requestCreatedAt: -1 });
  const now = Date.now();
  return db.verifications.find(
    (item) =>
      item.guardId === guardId &&
      ["NOTIFICATION_PENDING", "SENT", "OPENED"].includes(item.status) &&
      new Date(item.expiresAt).getTime() > now,
  );
}
function attendanceState(records: any[], active: any, completed: any) {
  if (active) return "ACTIVE";
  if (completed) return "COMPLETED";
  return records.some(
    (item) => item.type === "SHIFT_START" && item.status === "VERIFIED",
  )
    ? "COMPLETED"
    : "NOT_STARTED";
}
async function recordAudit(
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  if (usingMongo())
    await AuditLogModel.create({
      _id: makeId("audit"),
      actor,
      action,
      entityType,
      entityId,
      metadata,
      at: new Date(),
    });
  else audit(actor, action, entityType, entityId, metadata);
}

async function analyzeAttendanceEvidence(photo: string, perceptualHash: string | undefined, guardId: string, siteId: string, receivedAt: Date) {
  const analysis = analyzeAttendancePhoto(photo, perceptualHash);
  const previous: any[] = usingMongo()
    ? await AttendanceModel.find({ $or: [{ photoHash: analysis.photoHash }, { photoPerceptualHash: { $exists: true } }] }).sort({ capturedAt: -1 }).limit(750)
    : db.attendance.slice(0, 750);
  const exactMatches = previous.filter((item) => item.photoHash && item.photoHash === analysis.photoHash);
  const similarMatches = previous.flatMap((item) => {
    const distance = hammingDistance(analysis.photoPerceptualHash, item.photoPerceptualHash);
    if (distance === undefined || distance > 12 || String(item._id ?? item.id) === "") return [];
    return [{ id: String(item._id ?? item.id), distance, score: Math.round((1 - distance / (analysis.photoPerceptualHash!.length * 4)) * 100) / 100, guardId: String(item.guardId), siteId: String(item.siteId), capturedAt: item.capturedAt }];
  }).filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 10);
  const flags: AttendanceReviewFlag[] = [];
  if (exactMatches.length) flags.push(reviewFlag("EXACT_DUPLICATE", "HIGH", "The exact same image bytes were previously submitted.", exactMatches.slice(0, 5).map((item) => String(item._id ?? item.id))));
  if (exactMatches.length >= 2 || similarMatches.length >= 5) flags.push(reviewFlag("REUSE_BATCH_PATTERN", "HIGH", "The image matches a repeated submission pattern across multiple attendance records."));
  if (similarMatches.length) flags.push(reviewFlag("SIMILAR_PREVIOUS_PHOTO", "MEDIUM", "This image is visually similar to an earlier attendance image. Review the evidence; similarity alone is not a rejection reason.", similarMatches.map((item) => item.id)));
  const repeatedAcrossContext = exactMatches.some((item) => String(item.guardId) !== guardId || String(item.siteId) !== siteId) || similarMatches.some((item) => item.guardId !== guardId || item.siteId !== siteId);
  if (repeatedAcrossContext) flags.push(reviewFlag("REPEATED_ACROSS_CONTEXT", "HIGH", "The image or a visually similar image appears under another guard or site."));
  const overlapping = previous.find((item) => String(item.guardId) === guardId && Math.abs(new Date(item.receivedAt ?? item.capturedAt).getTime() - receivedAt.getTime()) <= 10 * 60 * 1000);
  if (overlapping) flags.push(reviewFlag("OVERLAPPING_SUBMISSION", "MEDIUM", "Another attendance submission for this guard is within ten minutes of this server receipt.", [String(overlapping._id ?? overlapping.id)]));
  if (analysis.exifCapturedAt && Math.abs(new Date(analysis.exifCapturedAt).getTime() - receivedAt.getTime()) > 48 * 60 * 60 * 1000) flags.push(reviewFlag("EXIF_TIME_MISMATCH", "LOW", "Embedded image time differs materially from server receipt time. Embedded metadata is untrusted."));
  return { analysis, flags, similarMatches, reviewDueAt: new Date(receivedAt.getTime() + 24 * 60 * 60 * 1000) };
}

function operationalFilter(req: express.Request): Record<string, unknown> {
  if (req.user?.role === "ADMIN") return {};
  if (req.user?.role === "MAIN_SECURITY") return { siteId: { $in: req.user.assignedSiteIds ?? [] } };
  return { guardId: { $in: req.user?.guardId ? [req.user.guardId] : [] } };
}
function visibleOperation(req: express.Request, item: any) {
  return canReadOperational(req.user, { guardId: item.guardId ? String(item.guardId) : undefined, siteId: item.siteId ? String(item.siteId) : undefined });
}
function visibleGuard(req: express.Request, guard: any) {
  return canReadOperational(req.user, { guardId: recordId(guard), siteId: guard.assignedSite ? String(guard.assignedSite) : undefined });
}
function notificationFilter(req: express.Request): Record<string, unknown> {
  if (req.user?.role === "ADMIN") return {};
  return { $or: [
    { userId: req.user?.id },
    ...(req.user?.role === "GUARD" && req.user.guardId ? [{ guardId: req.user.guardId }] : []),
    ...(req.user?.role === "MAIN_SECURITY" ? [{ siteId: { $in: req.user.assignedSiteIds ?? [] } }] : []),
  ] };
}
async function loadAuthorizationResource(kind: ResourceKind, id: string) {
  if (kind === "site") {
    const site = await findSite(id); return site ? { siteId: recordId(site) } : undefined;
  }
  if (["guard", "guardSalary", "guardDocuments"].includes(kind)) {
    const guard: any = await findGuard(id);
    return guard ? { guardId: recordId(guard), siteId: guard.assignedSite ? String(guard.assignedSite) : undefined } : undefined;
  }
  if (kind === "profile" || kind === "user") {
    let user: any = usingMongo() ? await UserModel.findById(id) : db.users.find((item) => item.id === id);
    let guard: any = user?.role === "GUARD" && user.guardId ? await findGuard(String(user.guardId)) : undefined;
    if (!user && kind === "profile") {
      guard = await findGuard(id);
      if (guard?.userId) user = usingMongo() ? await UserModel.findById(String(guard.userId)) : db.users.find((item) => item.id === String(guard.userId));
      if (guard && (!user || user.role !== "GUARD" || (user.guardId && String(user.guardId) !== recordId(guard)))) user = await findUserForGuard(recordId(guard));
    }
    return user ? { userId: recordId(user), guardId: guard ? recordId(guard) : undefined, siteId: guard?.assignedSite ? String(guard.assignedSite) : undefined } : undefined;
  }
  const item: any = kind === "attendance" ? (usingMongo() ? await AttendanceModel.findById(id) : db.attendance.find((item) => item.id === id))
    : kind === "incident" ? (usingMongo() ? await IncidentModel.findById(id) : db.incidents.find((item) => item.id === id))
    : kind === "verification" ? (usingMongo() ? await VerificationRequestModel.findById(id) : db.verifications.find((item) => item.id === id))
    : kind === "notification" ? (usingMongo() ? await NotificationModel.findById(id) : db.notifications.find((item) => item.id === id))
    : kind === "salary" ? (usingMongo() ? await SalaryModel.findById(id) : db.salaries.find((item) => item.id === id))
    : (usingMongo() ? await DocumentModel.findById(id) : db.documents.find((item) => item.id === id));
  const relatedGuard: any = ["salary", "document", "documentDownload"].includes(kind) && item?.guardId ? await findGuard(String(item.guardId)) : undefined;
  return item ? { guardId: item.guardId ? String(item.guardId) : undefined, userId: item.userId ? String(item.userId) : undefined, siteId: item.siteId ? String(item.siteId) : relatedGuard?.assignedSite ? String(relatedGuard.assignedSite) : undefined } : undefined;
}

router.use((req, res, next) => {
  try { if (matchRoutePolicy(req.method, req.path)?.policy.public) return next(); }
  catch { return res.status(400).json({ success: false, error: "INVALID_PATH" }); }
  return requireAuth(req, res, next);
});
router.use(createAuthorizationMiddleware({ loadResource: loadAuthorizationResource, audit: recordAudit }));
router.use(photoDutyRouter);
function generatedGuardEmail(employeeCode: string) {
  return `guard.${employeeCode.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@dgenergy.local`;
}
function generatedGuardPassword(_employeeCode?: string) {
  return randomBytes(18).toString("base64url");
}
async function nextEmployeeCode() {
  const codes = usingMongo()
    ? (await GuardModel.find().select({ employeeCode: 1 })).map(
        (guard: any) => guard.employeeCode,
      )
    : db.guards.map((guard) => guard.employeeCode);
  const next =
    codes.reduce(
      (max, value) =>
        Math.max(max, Number(String(value).match(/(\d+)$/)?.[1] ?? 0)),
      0,
    ) + 1;
  return `DG-${String(next).padStart(3, "0")}`;
}

router.get("/users/:id/access-history", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const target: any = usingMongo() ? await UserModel.findById(id) : db.users.find((item) => item.id === id);
    if (!target) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });
    const actions = ["ACCESS_CHANGE_REQUESTED", "ACCESS_CHANGED", "TEAM_MEMBER_UPDATED", "TEAM_MEMBER_CREATED", "GUARD_CREATED", "USER_CREATED", "PASSWORD_CHANGED"];
    const page = requestedPage(req.query);
    const filter = { entityType: "User", entityId: id, action: { $in: actions } };
    const result = usingMongo() ? await mongoPage(AuditLogModel, filter, { at: -1, _id: -1 }, page, 100) : memoryPage(db.audits.filter((item) => item.entityType === "User" && item.entityId === id && actions.includes(item.action)).slice().sort((a,b) => new Date(b.at).getTime() - new Date(a.at).getTime() || b.id.localeCompare(a.id)), page, 100);
    return res.json({ success: true, data: { history: objects(result.records), ...(result.pagination ? { pagination: result.pagination } : {}) } });
  } catch (error) { return next(error); }
});

router.patch("/users/:id/access", requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({
      assignedSiteIds: z.array(z.string().trim().min(1).max(200)).max(500).refine((ids) => new Set(ids).size === ids.length),
      expectedRevision: z.number().int().nonnegative(),
      justification: z.string().trim().min(8).max(500),
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "INVALID_ACCESS_CHANGE", details: validationDetails(parsed.error) });
    const id = routeParam(req.params.id);
    const user: any = usingMongo() ? await UserModel.findById(id) : db.users.find((item) => item.id === id);
    if (!user || user.role !== "MAIN_SECURITY") return res.status(404).json({ success: false, error: "TEAM_MEMBER_NOT_FOUND" });
    const { expectedRevision, justification } = parsed.data;
    const assignedSiteIds = [...parsed.data.assignedSiteIds].sort();
    if ((user.accessRevision ?? 0) !== expectedRevision) return res.status(409).json({ success: false, error: "ACCESS_CHANGED_RELOAD" });
    const validSites = usingMongo()
      ? await SiteModel.countDocuments({ _id: { $in: assignedSiteIds } })
      : db.sites.filter((site) => assignedSiteIds.includes(site.id)).length;
    if (validSites !== assignedSiteIds.length) return res.status(400).json({ success: false, error: "INVALID_ASSIGNED_SITES" });
    const before = { assignedSiteIds: [...(user.assignedSiteIds ?? [])], revision: user.accessRevision ?? 0 };
    await recordAudit(req.user!.id, "ACCESS_CHANGE_REQUESTED", "User", id, { before, assignedSiteIds, justification });
    let updated: any;
    if (usingMongo()) {
      updated = await UserModel.findOneAndUpdate({
        _id: id, role: "MAIN_SECURITY",
        ...(expectedRevision === 0 ? { $or: [{ accessRevision: 0 }, { accessRevision: { $exists: false } }] } : { accessRevision: expectedRevision }),
      }, { $set: { assignedSiteIds }, $inc: { accessRevision: 1 } }, { new: true, runValidators: true });
      if (!updated) return res.status(409).json({ success: false, error: "ACCESS_CHANGED_RELOAD" });
    } else {
      // Recheck after the awaited audit to avoid concurrent lost updates.
      if ((user.accessRevision ?? 0) !== expectedRevision) return res.status(409).json({ success: false, error: "ACCESS_CHANGED_RELOAD" });
      user.assignedSiteIds = assignedSiteIds; user.accessRevision = expectedRevision + 1; updated = user;
    }
    await recordAudit(req.user!.id, "ACCESS_CHANGED", "User", id, { before, after: { assignedSiteIds, revision: updated.accessRevision }, justification });
    return res.json({ success: true, data: { user: safeTeamUser(updated) } });
  } catch (error) { return next(error); }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const parsed = z
      .object({ email: z.string().email(), password: z.string().min(6) })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ success: false, error: "INVALID_LOGIN" });
    const email = parsed.data.email.toLowerCase();
    const loginKey = `${req.ip}:${email}`;
    const gate = loginGate(loginKey);
    if (!gate.allowed) {
      res.setHeader("Retry-After", String(gate.retryAfter));
      await recordAudit("anonymous", "LOGIN_BLOCKED", "Auth", "login");
      return res.status(429).json({ success: false, error: "LOGIN_RATE_LIMITED" });
    }
    const user: any = await findUser(email);
    if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      res.setHeader("Retry-After", String(Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 1000)));
      return res.status(429).json({ success: false, error: "LOGIN_RATE_LIMITED" });
    }
    const passwordValid = Boolean(user?.passwordHash) && await verifyPassword(parsed.data.password, user.passwordHash);
    if (
      !user ||
      user.active === false ||
      !ROLES.includes(user.role) ||
      !user.passwordHash ||
      !passwordValid
    ) {
      const failure = recordLoginFailure(loginKey);
      if (user) {
        user.failedLoginCount = Number(user.failedLoginCount ?? 0) + 1;
        if (failure.blocked) {
          const lockedUntil = new Date(Date.now() + failure.retryAfter * 1000);
          user.lockedUntil = usingMongo() ? lockedUntil : lockedUntil.toISOString();
        }
        if (usingMongo()) await user.save();
      }
      await recordAudit("anonymous", "LOGIN_FAILED", "Auth", "login");
      if (failure.blocked) {
        res.setHeader("Retry-After", String(failure.retryAfter));
        return res.status(429).json({ success: false, error: "LOGIN_RATE_LIMITED" });
      }
      return res.status(401).json({ success: false, error: "INVALID_CREDENTIALS" });
    }
    clearLoginFailures(loginKey);
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = usingMongo() ? new Date() : new Date().toISOString();
    if (usingMongo()) await user.save();
    const session = {
      id: String(user._id ?? user.id),
      email: user.email,
      name: user.name,
      role: user.role,
      guardId: user.role === "GUARD" ? user.guardId : undefined,
      profilePhotoUrl: user.profilePhoto
        ? `/api/users/${String(user._id ?? user.id)}/photo`
        : undefined,
      preferredLanguage: user.preferredLanguage,
      passwordChangeRequired: user.passwordChangeRequired === true,
      assignedSiteIds: user.role === "MAIN_SECURITY" ? [...(user.assignedSiteIds ?? [])] : [],
    };
    const refresh = await createRefreshSession(session.id, req);
    setSession(res, signAccessToken(session), refresh.raw);
    if (usingMongo())
      await AuditLogModel.create({
        _id: makeId("audit"),
        actor: session.id,
        action: "LOGIN",
        entityType: "User",
        entityId: session.id,
        at: new Date(),
      });
    else audit(session.id, "LOGIN", "User", session.id);
    return res.json({ success: true, data: { user: session } });
  } catch (error) {
    return next(error);
  }
});
router.post("/auth/logout", async (req, res, next) => {
  try {
    const refresh = refreshTokenFromRequest(req);
    await revokeRefreshSession(refresh);
    if (refresh) await recordAudit("session", "LOGOUT", "Auth", "session");
    clearSession(res);
    return res.json({ success: true });
  } catch (error) { return next(error); }
});
router.post("/auth/refresh", async (req, res, next) => {
  try {
    const refresh = refreshTokenFromRequest(req);
    if (!refresh) {
      const legacyAccess = req.cookies?.dg_access;
      if (legacyAccess) {
        try {
          const claims: any = verifyAccessToken(legacyAccess);
          const account: any = isDatabaseConnected() ? await UserModel.findById(claims.id) : db.users.find((item) => item.id === claims.id);
          if (account) {
            const nextRefresh = await createRefreshSession(String(account._id ?? account.id), req);
            setSession(res, signAccessToken({ ...claims }), nextRefresh.raw);
            return res.json({ success: true, data: { user: claims } });
          }
        } catch { /* expired legacy access cookie; fall through */ }
      }
      clearSession(res);
      return res.status(401).json({ success: false, error: "SESSION_EXPIRED" });
    }
    const rotated = await rotateRefreshSession(refresh, req);
    if (!rotated) { clearSession(res); return res.status(401).json({ success: false, error: "SESSION_EXPIRED" }); }
    const account: any = isDatabaseConnected() ? await UserModel.findById(rotated.userId) : db.users.find((item) => item.id === rotated.userId);
    if (!account || account.active === false) { await revokeAllRefreshSessions(rotated.userId); clearSession(res); return res.status(401).json({ success: false, error: "SESSION_EXPIRED" }); }
    const session = {
      id: String(account._id ?? account.id), email: account.email, name: account.name, role: account.role,
      guardId: account.role === "GUARD" ? account.guardId : undefined,
      profilePhotoUrl: account.profilePhoto ? `/api/users/${String(account._id ?? account.id)}/photo` : undefined,
      preferredLanguage: account.preferredLanguage,
      assignedSiteIds: account.role === "MAIN_SECURITY" ? [...(account.assignedSiteIds ?? [])] : [],
      passwordChangeRequired: account.passwordChangeRequired === true,
    } as any;
    setSession(res, signAccessToken(session), rotated.refreshToken);
    return res.json({ success: true, data: { user: session } });
  } catch (error) {
    if (error instanceof Error && error.message === "REFRESH_TOKEN_REUSE") {
      clearSession(res);
      await recordAudit("session", "REFRESH_TOKEN_REUSE", "Auth", "session");
      return res.status(401).json({ success: false, error: "SESSION_REVOKED" });
    }
    return next(error);
  }
});
router.post("/auth/logout-all", requireAuth, async (req, res, next) => {
  try { await revokeAllRefreshSessions(req.user!.id); clearSession(res); await recordAudit(req.user!.id, "LOGOUT_ALL", "Auth", req.user!.id); return res.json({ success: true }); }
  catch (error) { return next(error); }
});
router.get("/auth/sessions", requireAuth, async (req, res, next) => {
  try { return res.json({ success: true, data: { sessions: await listRefreshSessions(req.user!.id) } }); }
  catch (error) { return next(error); }
});
router.delete("/auth/sessions/:id", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    if (isDatabaseConnected()) await SessionModel.updateOne({ _id: id, userId: req.user!.id }, { $set: { revokedAt: new Date() } });
    else { const item = db.sessions.find((session) => session.id === id && session.userId === req.user!.id); if (item) item.revokedAt = new Date().toISOString(); }
    await recordAudit(req.user!.id, "SESSION_REVOKED", "Auth", id);
    return res.json({ success: true });
  } catch (error) { return next(error); }
});
router.get("/auth/me", requireAuth, async (req, res, next) => {
  try {
    const guard = await guardForUser(req.user);
    const currentUser = usingMongo()
      ? await UserModel.findById(req.user?.id)
      : db.users.find((item) => item.id === req.user?.id);
    return res.json({
      success: true,
      data: {
        user: currentUser ? safeUser(currentUser) : req.user,
        guard: guard ? safeGuard(guard) : undefined,
      },
    });
  } catch (error) {
    return next(error);
  }
});
router.post("/auth/change-password", requireAuth, async (req, res, next) => {
  try {
    const parsed = z
      .object({
        currentPassword: z.string().min(6),
        newPassword: z.string().min(6).max(128),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ success: false, error: "INVALID_PASSWORD" });
    const user: any = usingMongo()
      ? await UserModel.findById(req.user?.id)
      : db.users.find((item) => item.id === req.user?.id);
    if (
      !user ||
      !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))
    )
      return res
        .status(400)
        .json({ success: false, error: "CURRENT_PASSWORD_INVALID" });
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    if (usingMongo()) {
      user.passwordHash = passwordHash;
      user.passwordChangeRequired = false;
      await user.save();
    } else { user.passwordHash = passwordHash; user.passwordChangeRequired = false; }
    await recordAudit(
      String(req.user?.id),
      "PASSWORD_CHANGED",
      "User",
      String(req.user?.id),
    );
    return res.json({ success: true, data: { changed: true } });
  } catch (error) {
    return next(error);
  }
});

router.get(
  "/users",
  requireAuth,
  requireRoles("ADMIN"),
  async (_req, res, next) => {
    try {
      const page = requestedPage(_req.query);
      const filter = _req.query.role ? { role: String(_req.query.role) } : {};
      const result = usingMongo()
        ? await mongoPage(UserModel, filter, { role: 1, name: 1, _id: 1 }, page)
        : memoryPage(db.users.filter((user) => !filter.role || user.role === filter.role).slice().sort((a,b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), page);
      const users = result.records;
      return res.json({
        success: true,
        data: { users: users.map(safeTeamUser), ...(result.pagination ? { pagination: result.pagination } : {}) },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/users/next-employee-code",
  requireAuth,
  requireRoles("ADMIN", "MAIN_SECURITY"),
  async (_req, res, next) => {
    try {
      return res.json({
        success: true,
        data: { employeeCode: await nextEmployeeCode() },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/users",
  requireAuth,
  requireRoles("ADMIN", "MAIN_SECURITY"),
  upload.fields([
    { name: "userPhoto", maxCount: 1 },
    { name: "aadharDocument", maxCount: 1 },
    { name: "bankPassbook", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const parsed = z
        .object({
          role: z.enum(["MAIN_SECURITY", "GUARD"]),
          fullName: z.string().min(2),
          mobile: z.string().min(8),
          alternateMobile: z.string().min(8),
          email: z.string().email(),
          aadharNumber: z.string().min(4),
          bankName: z.string().min(2),
          branchName: z.string().min(2),
          bankAccountNumber: z.string().min(4),
          ifscCode: z.string().min(4),
          password: z.string().min(6).max(128),
          confirmPassword: z.string().min(6).max(128),
          assignedSite: z.string().optional(),
          monthlySalary: z.coerce.number().nonnegative().optional(),
          dutyShift: z.enum(["DAY", "NIGHT"]).optional(),
          photoRate: z.coerce.number().finite().min(0).max(100000).multipleOf(0.01).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({
            success: false,
            error: "INVALID_USER",
            details: validationDetails(parsed.error),
          });
      if (parsed.data.password !== parsed.data.confirmPassword)
        return res
          .status(400)
          .json({ success: false, error: "PASSWORD_MISMATCH" });
      if (req.user?.role === "MAIN_SECURITY" && (parsed.data.role !== "GUARD" || !canAccessSite(req.user, parsed.data.assignedSite))) return res.status(403).json({ success: false, error: "FORBIDDEN" });
      if (parsed.data.role === "GUARD" && (!parsed.data.assignedSite || !parsed.data.dutyShift || parsed.data.photoRate === undefined)) return res.status(400).json({ success: false, error: "GUARD_PHOTO_POLICY_REQUIRED" });
      if (parsed.data.assignedSite && (await findSite(parsed.data.assignedSite))?.status !== "ACTIVE") return res.status(400).json({ success: false, error: "SITE_NOT_FOUND" });
      const photoPolicy = parsed.data.assignedSite && parsed.data.dutyShift && parsed.data.photoRate !== undefined ? { dutyShift: parsed.data.dutyShift, photoRate: parsed.data.photoRate, photoPolicyHistory: newPhotoPolicy({ siteId: parsed.data.assignedSite, shiftType: parsed.data.dutyShift, photoRate: parsed.data.photoRate }) } : {};
      const employeeCode =
        parsed.data.role === "GUARD" ? await nextEmployeeCode() : undefined;
      const email = parsed.data.email.toLowerCase();
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const bank = {
        bankName: parsed.data.bankName,
        branchName: parsed.data.branchName,
        accountNumber: parsed.data.bankAccountNumber,
        ifscCode: parsed.data.ifscCode,
      };
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const uploadFields = [
        ["userPhoto", "USER_PHOTO"],
        ["aadharDocument", "AADHAAR"],
        ["bankPassbook", "BANK_PASSBOOK"],
      ] as const;
      const savedUploads = [] as Array<{ type: string; saved: Awaited<ReturnType<typeof saveLocalUpload>> }>;
      try {
        for (const [field, type] of uploadFields) {
          const file = files?.[field]?.[0];
          if (file) savedUploads.push({ type, saved: await saveLocalUpload(file) });
        }
      } catch (error) {
        await Promise.allSettled(savedUploads.map(({ saved }) => deleteLocalUpload(saved.storageKey)));
        throw error;
      }
      if (usingMongo()) {
        if (await UserModel.exists({ email })) {
          await Promise.allSettled(savedUploads.map(({ saved }) => deleteLocalUpload(saved.storageKey)));
          return res
            .status(409)
            .json({ success: false, error: "EMAIL_ALREADY_EXISTS" });
        }
        let guard: any;
        let createdUserId: string | undefined;
        try {
          if (parsed.data.role === "GUARD") {
            if (await GuardModel.exists({ employeeCode })) {
              await Promise.allSettled(savedUploads.map(({ saved }) => deleteLocalUpload(saved.storageKey)));
              return res
                .status(409)
                .json({
                  success: false,
                  error: "EMPLOYEE_CODE_ALREADY_EXISTS",
                });
            }
            guard = await GuardModel.create({
              _id: makeId("guard"),
              name: parsed.data.fullName,
              employeeCode,
              mobile: parsed.data.mobile,
              alternateMobile: parsed.data.alternateMobile,
              assignedSite: parsed.data.assignedSite || undefined,
              nameGujarati: parsed.data.fullName,
              village: "",
              district: "Devbhumi Dwarka",
              employmentStatus: "ACTIVE",
              monthlySalary: parsed.data.monthlySalary ?? 0,
              ...photoPolicy,
              preferredLanguage: "gu",
              documentCount: savedUploads.length,
              bank,
              profilePhoto: savedUploads.find(
                (item) => item.type === "USER_PHOTO",
              )?.saved.storageKey,
            });
          }
          const user: any = await UserModel.create({
            _id: makeId("user"),
            email,
            passwordHash,
            name: parsed.data.fullName,
            role: parsed.data.role,
            guardId: guard?._id,
            mobile: parsed.data.mobile,
            alternateMobile: parsed.data.alternateMobile,
            aadharNumber: parsed.data.aadharNumber,
            bank,
            profilePhoto: savedUploads.find(
              (item) => item.type === "USER_PHOTO",
            )?.saved.storageKey,
            preferredLanguage: parsed.data.role === "GUARD" ? "gu" : "en",
            active: true,
          });
          createdUserId = String(user._id);
          if (guard) {
            guard.userId = user._id;
            await guard.save();
            if (parsed.data.assignedSite)
              await SiteModel.updateOne(
                { _id: parsed.data.assignedSite },
                { $addToSet: { assignedGuards: guard._id } },
              );
          }
          if (savedUploads.length)
            await DocumentModel.insertMany(
              savedUploads.map(({ type, saved }) => ({
                _id: makeId("doc"),
                guardId: guard?._id,
                userId: user._id,
                type,
                originalName: saved.originalName,
                storageKey: saved.storageKey,
                mimeType: saved.mimeType,
                size: saved.size,
                uploadedBy: req.user?.id ?? "",
                uploadedAt: new Date(),
                status: "APPROVED",
              })),
            );
          await recordAudit(
            String(req.user?.id),
            parsed.data.role === "GUARD"
              ? "GUARD_CREATED"
              : "TEAM_MEMBER_CREATED",
            "User",
            String(user._id),
            { role: user.role, employeeCode },
          );
          return res
            .status(201)
            .json({
              success: true,
              data: { user: safeTeamUser(user), employeeCode },
            });
        } catch (error) {
          if (createdUserId) {
            await DocumentModel.deleteMany({ userId: createdUserId });
            await UserModel.deleteOne({ _id: createdUserId });
          }
          if (guard?._id) await GuardModel.deleteOne({ _id: guard._id });
          await Promise.allSettled(savedUploads.map(({ saved }) => deleteLocalUpload(saved.storageKey)));
          throw error;
        }
      }
      if (db.users.some((user) => user.email.toLowerCase() === email)) {
        await Promise.allSettled(savedUploads.map(({ saved }) => deleteLocalUpload(saved.storageKey)));
        return res
          .status(409)
          .json({ success: false, error: "EMAIL_ALREADY_EXISTS" });
      }
      const guard =
        parsed.data.role === "GUARD"
          ? {
              id: newId("guard"),
              employeeCode: employeeCode!,
              name: parsed.data.fullName,
              nameGujarati: parsed.data.fullName,
              mobile: parsed.data.mobile,
              alternateMobile: parsed.data.alternateMobile,
              village: "",
              district: "Devbhumi Dwarka",
              assignedSite: parsed.data.assignedSite || undefined,
              employmentStatus: "ACTIVE" as const,
              monthlySalary: parsed.data.monthlySalary ?? 0,
              ...photoPolicy,
              preferredLanguage: "gu" as const,
              documentCount: savedUploads.length,
              profilePhoto: savedUploads.find(
                (item) => item.type === "USER_PHOTO",
              )?.saved.storageKey,
              bank,
            }
          : undefined;
      const user = {
        id: newId("user"),
        email,
        passwordHash,
        name: parsed.data.fullName,
        role: parsed.data.role,
        guardId: guard?.id,
        mobile: parsed.data.mobile,
        alternateMobile: parsed.data.alternateMobile,
        aadharNumber: parsed.data.aadharNumber,
        bank,
        profilePhoto: savedUploads.find((item) => item.type === "USER_PHOTO")
          ?.saved.storageKey,
        preferredLanguage:
          parsed.data.role === "GUARD" ? ("gu" as const) : ("en" as const),
        active: true,
      };
      if (guard) {
        db.guards.push(guard);
        if (guard.assignedSite)
          db.sites
            .find((site) => site.id === guard.assignedSite)
            ?.assignedGuards.push(guard.id);
      }
      db.users.push(user);
      savedUploads.forEach(({ type, saved }) =>
        db.documents.unshift({
          id: newId("doc"),
          guardId: guard?.id,
          userId: user.id,
          type,
          originalName: saved.originalName,
          storageKey: saved.storageKey,
          mimeType: saved.mimeType,
          size: saved.size,
          uploadedBy: req.user?.id ?? "",
          uploadedAt: new Date().toISOString(),
          status: "APPROVED" as const,
        }),
      );
      audit(
        String(req.user?.id),
        parsed.data.role === "GUARD" ? "GUARD_CREATED" : "TEAM_MEMBER_CREATED",
        "User",
        user.id,
        { role: user.role, employeeCode },
      );
      return res
        .status(201)
        .json({
          success: true,
          data: { user: safeTeamUser(user), employeeCode },
        });
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/users/:id/photo", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const user: any = usingMongo()
      ? await UserModel.findById(id)
      : db.users.find((item) => item.id === id);
    const guard = user?.role === "GUARD" && user.guardId ? await findGuard(String(user.guardId)) : undefined;
    const storedPath = String(user?.profilePhoto ?? guard?.profilePhoto ?? "");
    const validStorageKey = isStoredUpload(storedPath);
    if (
      !user ||
      !storedPath ||
      !validStorageKey
    )
      return res
        .status(404)
        .json({ success: false, error: "PROFILE_PHOTO_NOT_FOUND" });
    return await sendStoredUpload(res, storedPath);
  } catch (error) {
    return next(error);
  }
});

router.get("/profiles/:id", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    let user: any = usingMongo()
      ? await UserModel.findById(id)
      : db.users.find((item) => item.id === id);
    let guard: any;
    if (!user) {
      guard = await findGuard(id);
      if (guard?.userId)
        user = usingMongo()
          ? await UserModel.findById(String(guard.userId))
          : db.users.find((item) => item.id === String(guard.userId));
      if (guard && (!user || user.role !== "GUARD" || (user.guardId && String(user.guardId) !== recordId(guard)))) user = await findUserForGuard(recordId(guard));
    }
    if (!user)
      return res
        .status(404)
        .json({ success: false, error: "PROFILE_NOT_FOUND" });
    if (!guard && user.role === "GUARD" && user.guardId) guard = await findGuard(String(user.guardId));
    const userId = String(user.id ?? user._id);
    const guardId = guard ? String(guard.id ?? guard._id) : "";
    const privateProfile = canReadPrivate(req.user, { userId, guardId, siteId: guard?.assignedSite });
    const assignedSite = guard?.assignedSite
      ? await findSite(String(guard.assignedSite))
      : undefined;
    const assignedSiteObject = assignedSite ? object(assignedSite) : undefined;
    const page = requestedPage(req.query);
    const documentFilter = guardId ? { guardId } : { userId };
    const documentResult = !privateProfile ? { records: [] as any[], pagination: undefined } : usingMongo() ? await mongoPage(DocumentModel, documentFilter, { uploadedAt: -1, _id: -1 }, page) : memoryPage(db.documents.filter((item) => Boolean(guardId && item.guardId === guardId) || item.userId === userId).slice().sort((a,b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime() || b.id.localeCompare(a.id)), page);
    const documents = documentResult.records.map((item: any) => { const { storageKey, ...value } = object(item); return { ...value, previewUrl: `/api/documents/${value.id}/preview` }; });
    if (!privateProfile) return res.json({ success: true, data: {
      scope: "OPERATIONS_ONLY",
      user: { ...safeTeamUser(user), email: "", assignedSiteIds: [], accessRevision: undefined },
      guard: guard ? safeGuard(guard, req.user) : undefined,
      profile: {
        role: user.role, active: user.active !== false, mobile: guard?.mobile ?? "",
        nameGujarati: guard?.nameGujarati, employeeCode: guard?.employeeCode,
        assignedSite: guard?.assignedSite, assignedSiteId: guard?.assignedSite,
        assignedSiteCode: assignedSiteObject?.siteCode, assignedSiteName: assignedSiteObject?.siteName,
        employmentStatus: guard?.employmentStatus,
      }, documents: [],
    } });
    const guardObject = guard ? object(guard) : undefined;
    const bank = user.bank ?? guardObject?.bank ?? {};
    return res.json({
      success: true,
      data: {
        user: safeTeamUser(user),
        guard: guard ? safeGuard(guard) : undefined,
        profile: {
          role: user.role,
          active: user.active !== false,
          mobile: user.mobile ?? guard?.mobile ?? "",
          alternateMobile: user.alternateMobile ?? guard?.alternateMobile ?? "",
          aadharNumber: maskSensitive(user.aadharNumber),
          bank: {
            bankName: bank.bankName ?? "",
            branchName: bank.branchName ?? "",
            accountNumber: maskSensitive(bank.accountNumber),
            ifscCode: bank.ifscCode ?? "",
          },
          address: guard?.address ?? "",
          nameGujarati: guard?.nameGujarati ?? "",
          village: guard?.village ?? "",
          taluka: guard?.taluka ?? "",
          district: guard?.district ?? "",
          employeeCode: guard?.employeeCode ?? "",
          assignedSite: guard?.assignedSite ?? "",
          assignedSiteId: guard?.assignedSite ?? "",
          assignedSiteCode: assignedSiteObject?.siteCode ?? "",
          assignedSiteName: assignedSiteObject?.siteName ?? "",
          joiningDate: guard?.joiningDate ?? "",
          monthlySalary: guard?.monthlySalary ?? undefined,
          dutyShift: guard?.dutyShift,
          photoRate: guard?.photoRate,
          preferredLanguage: user.preferredLanguage ?? guard?.preferredLanguage ?? "en",
          employmentStatus: guard?.employmentStatus ?? (user.active === false ? "INACTIVE" : "ACTIVE"),
        },
        documents,
        ...(documentResult.pagination ? { pagination: documentResult.pagination } : {}),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  "/users/:id",
  requireAuth,
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      if (id === req.user?.id)
        return res
          .status(400)
          .json({ success: false, error: "PRIMARY_ADMIN_CANNOT_BE_CHANGED" });
      const parsed = z
        .object({
          name: z.string().min(2).optional(),
          active: z.boolean().optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ success: false, error: "INVALID_TEAM_MEMBER" });
      if (usingMongo()) {
        const user: any = await UserModel.findOne({
          _id: id,
          role: "MAIN_SECURITY",
        });
        if (!user)
          return res
            .status(404)
            .json({ success: false, error: "TEAM_MEMBER_NOT_FOUND" });
        Object.assign(user, parsed.data);
        await user.save();
        await recordAudit(
          String(req.user?.id),
          "TEAM_MEMBER_UPDATED",
          "User",
          id,
          parsed.data,
        );
        return res.json({ success: true, data: { user: safeTeamUser(user) } });
      }
      const user = db.users.find(
        (item) => item.id === id && item.role === "MAIN_SECURITY",
      );
      if (!user)
        return res
          .status(404)
          .json({ success: false, error: "TEAM_MEMBER_NOT_FOUND" });
      Object.assign(user, parsed.data);
      audit(
        String(req.user?.id),
        "TEAM_MEMBER_UPDATED",
        "User",
        id,
        parsed.data,
      );
      return res.json({ success: true, data: { user: safeTeamUser(user) } });
    } catch (error) {
      return next(error);
    }
  },
);

function trendFor(records: any[], days: number) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - index - 1) * 86400000);
    const key = date.toISOString().slice(0, 10);
    return {
      day: new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
      }).format(date),
      value: records.filter(
        (item) => new Date(item.capturedAt).toISOString().slice(0, 10) === key,
      ).length,
    };
  });
}

function siteCoverage(sites: any[], records: any[]) {
  return sites.map((site) => {
    const assigned = (site.assignedGuards ?? []).map(String);
    const present = new Set(
      records
        .filter((item) => String(item.siteId) === String(site._id ?? site.id))
        .map((item) => String(item.guardId)),
    );
    return {
      site: site.siteCode,
      attendance: assigned.length
        ? Math.round(
            (assigned.filter((id: string) => present.has(id)).length /
              assigned.length) *
              100,
          )
        : 0,
    };
  });
}

router.get(
  "/dashboard",
  requireAuth,
  requireRoles("MAIN_SECURITY", "ADMIN"),
  async (_req, res, next) => {
    try {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const weekStart = new Date(start.getTime() - 6 * 86400000);
      if (_req.user?.role === "MAIN_SECURITY") {
        const ids = _req.user.assignedSiteIds ?? [];
        const scope = operationalFilter(_req);
        const [sites, guards, shifts, requests, incidents, attendanceRows] = usingMongo()
          ? await Promise.all([
              SiteModel.find({ _id: { $in: ids }, status: "ACTIVE" }).lean(),
              GuardModel.find({ assignedSite: { $in: ids }, employmentStatus: "ACTIVE" }).lean(),
              ShiftModel.find({ ...scope, status: "ACTIVE" }).lean(),
              VerificationRequestModel.find(scope).lean(),
              IncidentModel.find({ ...scope, status: "OPEN" }).lean(),
              AttendanceModel.find({ ...scope, type: "SHIFT_START", status: "VERIFIED", capturedAt: { $gte: weekStart } }).select({ guardId: 1, siteId: 1, capturedAt: 1 }).lean(),
            ])
          : [
              db.sites.filter((site) => ids.includes(site.id) && site.status === "ACTIVE"),
              db.guards.filter((guard) => visibleGuard(_req, guard) && guard.employmentStatus === "ACTIVE"),
              db.shifts.filter((shift) => visibleOperation(_req, shift) && shift.status === "ACTIVE"),
              db.verifications.filter((item) => visibleOperation(_req, item)),
              db.incidents.filter((item) => visibleOperation(_req, item) && item.status === "OPEN"),
              db.attendance.filter((item) => visibleOperation(_req, item) && item.type === "SHIFT_START" && item.status === "VERIFIED" && new Date(item.capturedAt) >= weekStart),
            ];
        const scopedGuardIds = guards.map((guard: any) => recordId(guard));
        const [pendingDocumentReviews, expiringDocuments, payrollReview] = usingMongo()
          ? await Promise.all([
              DocumentModel.countDocuments({ guardId: { $in: scopedGuardIds }, status: "PENDING" }),
              DocumentModel.countDocuments({ guardId: { $in: scopedGuardIds }, expiresAt: { $gte: new Date(), $lte: new Date(Date.now() + 30 * 86400000) }, status: { $ne: "REJECTED" } }),
              SalaryModel.countDocuments({ guardId: { $in: scopedGuardIds }, workflowStatus: { $in: ["DRAFT", "REVIEW", "PENDING"] } }),
            ])
          : [db.documents.filter((item) => scopedGuardIds.includes(String(item.guardId)) && (item.status ?? "PENDING") === "PENDING").length, db.documents.filter((item) => scopedGuardIds.includes(String(item.guardId)) && item.expiresAt && new Date(item.expiresAt).getTime() >= Date.now() && new Date(item.expiresAt).getTime() <= Date.now() + 30 * 86400000 && item.status !== "REJECTED").length, db.salaries.filter((item) => scopedGuardIds.includes(item.guardId) && ["DRAFT", "REVIEW", "PENDING"].includes(String(item.workflowStatus ?? item.status))).length];
        return res.json({ success: true, data: {
          totalGuards: guards.length, onDuty: shifts.length, notStarted: Math.max(0, guards.length - shifts.length),
          verificationPending: requests.filter((item: any) => ["NOTIFICATION_PENDING", "SENT", "OPENED"].includes(item.status) && new Date(item.expiresAt) > new Date()).length,
          missedVerification: requests.filter((item: any) => item.status === "MISSED" && new Date(item.requestCreatedAt) >= start).length,
          openIncidents: incidents.length, activeSites: sites.length, pendingSalaries: payrollReview, pendingDocumentReviews, expiringDocuments, payrollReview, teamMembers: 0,
          trend: trendFor(objects(attendanceRows), 7), siteStats: siteCoverage(sites, objects(attendanceRows)), activities: [],
        } });
      }
      if (usingMongo()) {
        const [
          guards,
          onDuty,
          verificationPending,
          missedVerification,
          openIncidents,
          activeSites,
          pendingSalaries,
          activities,
          sites,
          attendance,
          pendingDocumentReviews,
          expiringDocuments,
          payrollReview,
        ] = await Promise.all([
          GuardModel.countDocuments({ employmentStatus: "ACTIVE" }),
          ShiftModel.countDocuments({ status: "ACTIVE" }),
          VerificationRequestModel.countDocuments({
            status: { $in: ["NOTIFICATION_PENDING", "SENT", "OPENED"] },
            expiresAt: { $gt: new Date() },
          }),
          VerificationRequestModel.countDocuments({
            status: "MISSED",
            requestCreatedAt: { $gte: start },
          }),
          IncidentModel.countDocuments({ status: "OPEN" }),
          SiteModel.countDocuments({ status: "ACTIVE" }),
          SalaryModel.countDocuments({ status: "PENDING" }),
          ActivityModel.find().sort({ at: -1 }).limit(8),
          SiteModel.find({ status: "ACTIVE" }).limit(8),
          AttendanceModel.find({
            type: "SHIFT_START",
            status: "VERIFIED",
            capturedAt: { $gte: weekStart },
          }).select({ guardId: 1, siteId: 1, capturedAt: 1 }),
          DocumentModel.countDocuments({ status: "PENDING" }),
          DocumentModel.countDocuments({ expiresAt: { $gte: new Date(), $lte: new Date(Date.now() + 30 * 86400000) }, status: { $ne: "REJECTED" } }),
          SalaryModel.countDocuments({ workflowStatus: { $in: ["DRAFT", "REVIEW", "PENDING"] } }),
        ]);
        const attendanceRows = objects(attendance);
        return res.json({
          success: true,
          data: {
            totalGuards: guards,
            onDuty,
            notStarted: Math.max(0, guards - onDuty),
            verificationPending,
            missedVerification,
            openIncidents,
            activeSites,
            pendingSalaries,
            pendingDocumentReviews,
            expiringDocuments,
            payrollReview,
            teamMembers: await UserModel.countDocuments({
              role: "MAIN_SECURITY",
              active: true,
            }),
            trend: trendFor(attendanceRows, 7),
            siteStats: siteCoverage(sites, attendanceRows),
            activities: objects(activities),
          },
        });
      }
      const activeGuards = db.guards.filter(
        (guard) => guard.employmentStatus === "ACTIVE",
      );
      const activeShifts = db.shifts.filter(
        (shift) => shift.status === "ACTIVE",
      ).length;
      const attendanceRows = db.attendance.filter(
        (item) =>
          item.type === "SHIFT_START" &&
          item.status === "VERIFIED" &&
          new Date(item.capturedAt) >= weekStart,
      );
      return res.json({
        success: true,
        data: {
          totalGuards: activeGuards.length,
          onDuty: activeShifts,
          notStarted: Math.max(0, activeGuards.length - activeShifts),
          verificationPending: db.verifications.filter(
            (item) =>
              ["NOTIFICATION_PENDING", "SENT", "OPENED"].includes(
                item.status,
              ) && new Date(item.expiresAt) > new Date(),
          ).length,
          missedVerification: db.verifications.filter(
            (item) =>
              item.status === "MISSED" &&
              new Date(item.requestCreatedAt) >= start,
          ).length,
          openIncidents: db.incidents.filter((item) => item.status === "OPEN")
            .length,
          activeSites: db.sites.filter((site) => site.status === "ACTIVE")
            .length,
          pendingSalaries: db.salaries.filter(
            (salary) => salary.status === "PENDING",
          ).length,
          pendingDocumentReviews: db.documents.filter((item) => (item.status ?? "PENDING") === "PENDING").length,
          expiringDocuments: db.documents.filter((item) => item.expiresAt && new Date(item.expiresAt).getTime() >= Date.now() && new Date(item.expiresAt).getTime() <= Date.now() + 30 * 86400000 && item.status !== "REJECTED").length,
          payrollReview: db.salaries.filter((item) => ["DRAFT", "REVIEW", "PENDING"].includes(String(item.workflowStatus ?? item.status))).length,
          teamMembers: db.users.filter(
            (user) => user.role === "MAIN_SECURITY" && user.active,
          ).length,
          trend: trendFor(attendanceRows, 7),
          siteStats: siteCoverage(
            db.sites.filter((site) => site.status === "ACTIVE"),
            attendanceRows,
          ),
          activities: db.activities.slice(0, 8),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);
router.post("/guards/bulk-lifecycle", requireAuth, requireRoles("ADMIN"), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.guardIds) ? req.body.guardIds.map(String).slice(0, 100) : [];
    const employmentStatus = String(req.body?.employmentStatus ?? "").toUpperCase();
    const reason = String(req.body?.reason ?? "").trim();
    if (!ids.length || !["ACTIVE", "INACTIVE", "SUSPENDED", "RESIGNED", "EXITED"].includes(employmentStatus) || reason.length < 3) return res.status(400).json({ success: false, error: "INVALID_BULK_LIFECYCLE" });
    const changed: any[] = [];
    for (const id of ids) {
      const guard: any = usingMongo() ? await GuardModel.findById(id) : db.guards.find((item) => item.id === id);
      if (!guard) continue;
      const event = { type: `BULK_${employmentStatus}`, reason, actorId: req.user!.id, at: new Date().toISOString() };
      guard.employmentStatus = employmentStatus; guard.accountStatusReason = reason; guard.lifecycleEvents = [...(guard.lifecycleEvents ?? []), event];
      if (usingMongo()) await guard.save();
      changed.push({ id, employmentStatus });
      await recordAudit(req.user!.id, "GUARD_BULK_LIFECYCLE", "Guard", id, { employmentStatus, reason });
    }
    return res.json({ success: true, data: { guards: changed } });
  } catch (error) { return next(error); }
});

router.get(
  "/guards",
  requireAuth,
  requireRoles("MAIN_SECURITY", "ADMIN"),
  async (req, res, next) => {
    try {
      const page = requestedPage(req.query);
      const query = String(req.query.search ?? "").trim();
      const site = String(req.query.site ?? "");
      const status = String(req.query.status ?? "");
      const searchableFields = req.user?.role === "ADMIN"
        ? ["name", "employeeCode", "mobile", "village"] as const
        : ["name", "employeeCode", "mobile"] as const;
      if (usingMongo()) {
        const filter: any = req.user?.role === "MAIN_SECURITY" ? { assignedSite: { $in: req.user.assignedSiteIds ?? [] } } : {};
        if (site) {
          if (!canAccessSite(req.user, site)) return res.status(403).json({ success: false, error: "FORBIDDEN" });
          filter.assignedSite = site;
        }
        if (status) filter.employmentStatus = status;
        if (query)
          filter.$or = searchableFields.map(
            (field) => ({ [field]: { $regex: query, $options: "i" } }),
          );
        const sites = await SiteModel.find(
          {},
          { siteCode: 1, siteName: 1, mapLink: 1 },
        ).lean();
        const siteLookup = new Map<
          string,
          { siteCode: string; siteName: string; mapLink?: string }
        >();
        sites.forEach((item: any) => {
          const details = {
            siteCode: String(item.siteCode ?? ""),
            siteName: String(item.siteName ?? ""),
            ...(item.mapLink ? { mapLink: String(item.mapLink) } : {}),
          };
          [item._id, item.id, item.siteCode]
            .filter((key) => key !== undefined && key !== null && key !== "")
            .forEach((key) => siteLookup.set(String(key), details));
        });
        const result = await mongoPage(GuardModel, filter, { name: 1, _id: 1 }, page);
        const guards = result.records;
        return res.json({
          success: true,
          data: {
            ...(result.pagination ? { pagination: result.pagination } : {}),
            guards: guards.map((guard) =>
              withAssignedSiteDetails(guard, siteLookup, req.user),
            ),
          },
        });
      }
      const lower = query.toLowerCase();
      const siteLookup = new Map<
        string,
        { siteCode: string; siteName: string; mapLink?: string }
      >();
      db.sites.forEach((item) => {
        const details = {
          siteCode: String(item.siteCode ?? ""),
          siteName: String(item.siteName ?? ""),
          ...(item.mapLink ? { mapLink: String(item.mapLink) } : {}),
        };
        [item.id, item.siteCode]
          .filter((key) => key !== undefined && key !== null && key !== "")
          .forEach((key) => siteLookup.set(String(key), details));
      });
      const memoryRecords = db.guards
            .filter(
              (guard) =>
                visibleGuard(req, guard) && (!lower ||
                  searchableFields.some((field) => String(guard[field] ?? "").toLowerCase().includes(lower))) &&
                (!site || guard.assignedSite === site) &&
                (!status || guard.employmentStatus === status),
            )
            .map((guard) => withAssignedSiteDetails(guard, siteLookup, req.user));
      const result = memoryPage(memoryRecords.sort((a: any,b: any) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), page);
      return res.json({
        success: true,
        data: {
          guards: result.records, ...(result.pagination ? { pagination: result.pagination } : {}),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);
router.get("/guards/:id/photo", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    if (denyGuardOtherThan(req.user, id))
      return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const guard: any = await findGuard(id);
    const storedPath = String(guard?.profilePhoto ?? "");
    const validStorageKey = isStoredUpload(storedPath);
    if (
      !guard ||
      !storedPath ||
      !validStorageKey
    )
      return res
        .status(404)
        .json({ success: false, error: "PROFILE_PHOTO_NOT_FOUND" });
    return await sendStoredUpload(res, storedPath);
  } catch (error) {
    return next(error);
  }
});
router.get("/guards/:id", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    if (denyGuardOtherThan(req.user, id))
      return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const guard: any = await findGuard(id);
    if (!guard)
      return res.status(404).json({ success: false, error: "GUARD_NOT_FOUND" });
    const privateGuard = canReadPrivate(req.user, { guardId: id }) || canManageGuard(req.user, { siteId: guard.assignedSite });
    const user: any =
      (req.user?.role === "ADMIN" || canManageGuard(req.user, { siteId: guard.assignedSite })) ? await findUserForGuard(id) : undefined;
    const profile = user
      ? {
          email: user.email,
          alternateMobile: user.alternateMobile ?? "",
          aadharNumber: user.aadharNumber ?? "",
          bank: user.bank ?? guard.bank ?? {},
        }
      : undefined;
    if (usingMongo()) {
      const [documents, attendance, salary] = await Promise.all([
        privateGuard ? DocumentModel.find({ guardId: id }) : Promise.resolve([]),
        AttendanceModel.find({ ...operationalFilter(req), guardId: id })
          .sort({ capturedAt: -1 })
          .limit(20),
        privateGuard ? SalaryModel.find({ guardId: id }).sort({ year: -1, month: -1 }) : Promise.resolve([]),
      ]);
      return res.json({
        success: true,
        data: {
          guard: safeGuard(guard, req.user),
          profile,
          documents: objects(documents).map(({ storageKey, ...item }) => ({ ...item, status: "APPROVED" })),
          attendance: publicAttendances(attendance),
          salary: objects(salary),
        },
      });
    }
    return res.json({
      success: true,
      data: {
        guard: safeGuard(guard, req.user),
        profile,
        documents: privateGuard ? db.documents.filter((doc) => doc.guardId === id).map(({ storageKey, ...doc }) => doc) : [],
        attendance: db.attendance
          .filter((item) => item.guardId === id && visibleOperation(req, item))
          .slice(0, 20),
        salary: privateGuard ? db.salaries.filter((item) => item.guardId === id) : [],
      },
    });
  } catch (error) {
    return next(error);
  }
});
router.get("/guards/:id/attendance", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    if (denyGuardOtherThan(req.user, id))
      return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const records = usingMongo()
      ? await AttendanceModel.find({ ...operationalFilter(req), guardId: id }).sort({ capturedAt: -1 })
      : db.attendance.filter((item) => item.guardId === id && visibleOperation(req, item));
    return res.json({ success: true, data: { attendance: publicAttendances(records) } });
  } catch (error) {
    return next(error);
  }
});
router.get("/guards/:id/salary", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    if (denyGuardOtherThan(req.user, id))
      return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const records = usingMongo()
      ? await SalaryModel.find({ guardId: id })
      : db.salaries.filter((item) => item.guardId === id);
    return res.json({ success: true, data: { salary: objects(records) } });
  } catch (error) {
    return next(error);
  }
});
router.post(
  "/guards",
  requireAuth,
  requireRoles("ADMIN", "MAIN_SECURITY"),
  async (req, res, next) => {
    try {
      const parsed = z
        .object({
          name: z.string().min(2),
          employeeCode: z.string().min(2),
          mobile: z.string().min(8),
          email: z.string().email().optional(),
          assignedSite: z.string().optional(),
          monthlySalary: z.number().optional(),
          dutyShift: z.enum(["DAY", "NIGHT"]).optional(),
          photoRate: z.coerce.number().finite().min(0).max(100000).multipleOf(0.01).optional(),
          temporaryPassword: z.string().min(6).max(128).optional(),
          joiningDate: z.string().datetime().optional(),
          employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]).optional(),
          emergencyContacts: z.array(z.object({ name: z.string().min(2), relation: z.string().min(2), mobile: z.string().min(8) })).max(3).optional(),
          skills: z.array(z.string().min(1).max(60)).max(30).optional(),
          trainingTags: z.array(z.string().min(1).max(60)).max(30).optional(),
          policeVerificationStatus: z.enum(["PENDING", "VERIFIED", "FAILED"]).optional(),
          onboardingChecklist: z.record(z.boolean()).optional(),
        })
        .safeParse({
          ...req.body,
          monthlySalary:
            req.body.monthlySalary === undefined
              ? undefined
              : Number(req.body.monthlySalary),
        });
      if (!parsed.success)
        return res.status(400).json({ success: false, error: "INVALID_GUARD" });
      if (req.user?.role === "MAIN_SECURITY" && (!canAccessSite(req.user, parsed.data.assignedSite))) return res.status(403).json({ success: false, error: "FORBIDDEN" });
      if ((!parsed.data.assignedSite || !parsed.data.dutyShift || parsed.data.photoRate === undefined)) return res.status(400).json({ success: false, error: "GUARD_PHOTO_POLICY_REQUIRED" });
      if (parsed.data.assignedSite && (await findSite(parsed.data.assignedSite))?.status !== "ACTIVE") return res.status(400).json({ success: false, error: "SITE_NOT_FOUND" });
      const photoPolicy = parsed.data.assignedSite && parsed.data.dutyShift && parsed.data.photoRate !== undefined ? { dutyShift: parsed.data.dutyShift, photoRate: parsed.data.photoRate, photoPolicyHistory: newPhotoPolicy({ siteId: parsed.data.assignedSite, shiftType: parsed.data.dutyShift, photoRate: parsed.data.photoRate }) } : {};
      const email = (
        parsed.data.email ?? generatedGuardEmail(parsed.data.employeeCode)
      ).toLowerCase();
      const generatedPassword = !parsed.data.temporaryPassword;
      const temporaryPassword =
        parsed.data.temporaryPassword ??
        generatedGuardPassword(parsed.data.employeeCode);
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      if (usingMongo()) {
        if (
          (await GuardModel.exists({
            employeeCode: parsed.data.employeeCode,
          })) ||
          (await UserModel.exists({ email }))
        )
          return res
            .status(409)
            .json({ success: false, error: "DUPLICATE_GUARD_OR_EMAIL" });
        let guard: any;
        try {
          guard = await GuardModel.create({
            _id: makeId("guard"),
            name: parsed.data.name,
            employeeCode: parsed.data.employeeCode,
            mobile: parsed.data.mobile,
            assignedSite: parsed.data.assignedSite,
            nameGujarati: parsed.data.name,
            village: req.body.village ?? "",
            district: req.body.district ?? "Devbhumi Dwarka",
            employmentStatus: "ACTIVE",
            monthlySalary: parsed.data.monthlySalary ?? 0,
              ...photoPolicy,
            preferredLanguage: "gu",
            documentCount: 0,
            bank: { bankName: "", accountNumber: "XXXXXXXX", ifscCode: "" },
            joiningDate: parsed.data.joiningDate ? new Date(parsed.data.joiningDate) : undefined,
            employmentType: parsed.data.employmentType,
            emergencyContacts: parsed.data.emergencyContacts,
            skills: parsed.data.skills,
            trainingTags: parsed.data.trainingTags,
            policeVerificationStatus: parsed.data.policeVerificationStatus ?? "PENDING",
            onboardingChecklist: parsed.data.onboardingChecklist,
          });
          const user: any = await UserModel.create({
            _id: makeId("user"),
            email,
            passwordHash,
            name: parsed.data.name,
            role: "GUARD",
            guardId: guard._id,
            passwordChangeRequired: true,
            preferredLanguage: "gu",
            active: true,
          });
          guard.userId = user._id;
          await guard.save();
          if (parsed.data.assignedSite)
            await SiteModel.updateOne(
              { _id: parsed.data.assignedSite },
              { $addToSet: { assignedGuards: guard._id } },
            );
          await recordAudit(
            String(req.user?.id),
            "GUARD_CREATED",
            "Guard",
            String(guard._id),
            {
              employeeCode: parsed.data.employeeCode,
              userId: String(user._id),
            },
          );
          return res
            .status(201)
            .json({
              success: true,
              data: {
                guard: safeGuard(guard),
                login: { email, passwordChangeRequired: true, ...(generatedPassword ? { temporaryPassword } : {}) },
              },
            });
        } catch (error) {
          if (guard?._id) {
            await GuardModel.deleteOne({ _id: guard._id });
            await SiteModel.updateMany(
              { assignedGuards: guard._id },
              { $pull: { assignedGuards: guard._id } },
            );
          }
          throw error;
        }
      }
      if (
        db.guards.some((g) => g.employeeCode === parsed.data.employeeCode) ||
        db.users.some((u) => u.email.toLowerCase() === email)
      )
        return res
          .status(409)
          .json({ success: false, error: "DUPLICATE_GUARD_OR_EMAIL" });
      const guard: GuardRecord = {
        id: newId("guard"),
        employeeCode: parsed.data.employeeCode,
        name: parsed.data.name,
        nameGujarati: parsed.data.name,
        mobile: parsed.data.mobile,
        village: req.body.village ?? "",
        district: req.body.district ?? "Devbhumi Dwarka",
        assignedSite: parsed.data.assignedSite,
        employmentStatus: "ACTIVE",
        monthlySalary: parsed.data.monthlySalary ?? 0,
              ...photoPolicy,
        preferredLanguage: "gu",
        documentCount: 0,
        bank: { bankName: "", accountNumber: "XXXXXXXX", ifscCode: "" },
        joiningDate: parsed.data.joiningDate,
        employmentType: parsed.data.employmentType,
        emergencyContacts: parsed.data.emergencyContacts,
        skills: parsed.data.skills,
        trainingTags: parsed.data.trainingTags,
        policeVerificationStatus: parsed.data.policeVerificationStatus ?? "PENDING",
        onboardingChecklist: parsed.data.onboardingChecklist,
      };
      const user = {
        id: newId("user"),
        email,
        passwordHash,
        name: guard.name,
        role: "GUARD" as const,
        guardId: guard.id,
        passwordChangeRequired: true,
        preferredLanguage: "gu" as const,
        active: true,
      };
      db.guards.push(guard);
      db.users.push(user);
      if (guard.assignedSite)
        db.sites
          .find((site) => site.id === guard.assignedSite)
          ?.assignedGuards.push(guard.id);
      audit(String(req.user?.id), "GUARD_CREATED", "Guard", guard.id, {
        employeeCode: guard.employeeCode,
        userId: user.id,
      });
      return res
        .status(201)
        .json({
          success: true,
          data: {
            guard: safeGuard(guard),
            login: { email, passwordChangeRequired: true },
          },
        });
    } catch (error) {
      return next(error);
    }
  },
);
router.patch(
  "/guards/:id",
  requireAuth,
  requireRoles("ADMIN", "MAIN_SECURITY"),
  upload.fields([
    { name: "userPhoto", maxCount: 1 },
    { name: "aadharDocument", maxCount: 1 },
    { name: "bankPassbook", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      const parsed = z
        .object({
          name: z.string().min(2).optional(),
          mobile: z.string().min(8).optional(),
          alternateMobile: z.string().min(8).or(z.literal("")).optional(),
          email: z.string().email().or(z.literal("")).optional(),
          aadharNumber: z.string().min(4).or(z.literal("")).optional(),
          bankName: z.string().min(2).or(z.literal("")).optional(),
          branchName: z.string().min(2).or(z.literal("")).optional(),
          bankAccountNumber: z.string().min(4).or(z.literal("")).optional(),
          ifscCode: z.string().min(4).or(z.literal("")).optional(),
          assignedSite: z.string().optional(),
          monthlySalary: z.coerce.number().nonnegative().optional(),
          dutyShift: z.enum(["DAY", "NIGHT"]).optional(),
          photoRate: z.coerce.number().finite().min(0).max(100000).multipleOf(0.01).optional(),
          employmentStatus: z.enum(["ACTIVE", "INACTIVE"]).optional(),
          joiningDate: z.string().datetime().optional(),
          employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]).optional(),
          emergencyContacts: z.array(z.object({ name: z.string().min(2), relation: z.string().min(2), mobile: z.string().min(8) })).max(3).optional(),
          skills: z.array(z.string().min(1).max(60)).max(30).optional(),
          trainingTags: z.array(z.string().min(1).max(60)).max(30).optional(),
          policeVerificationStatus: z.enum(["PENDING", "VERIFIED", "FAILED"]).optional(),
          onboardingChecklist: z.record(z.boolean()).optional(),
          trainingAcknowledgedAt: z.string().datetime().nullable().optional(),
          accountStatusReason: z.string().max(500).optional(),
          bankChangeReason: z.string().max(500).optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({
            success: false,
            error: "INVALID_GUARD_PROFILE",
            details: validationDetails(parsed.error),
          });
      const scopedGuard: any = await findGuard(id);
      if (!scopedGuard || !canManageGuard(req.user, { siteId: scopedGuard.assignedSite })) return res.status(403).json({ success: false, error: "FORBIDDEN" });
      if (parsed.data.assignedSite && (!canAccessSite(req.user, parsed.data.assignedSite) || (await findSite(parsed.data.assignedSite))?.status !== "ACTIVE")) return res.status(403).json({ success: false, error: "FORBIDDEN" });
      if (parsed.data.assignedSite === "") return res.status(403).json({ success: false, error: "FORBIDDEN" });
      const nextShift = parsed.data.dutyShift ?? scopedGuard.dutyShift;
      const nextRate = parsed.data.photoRate ?? scopedGuard.photoRate;
      const nextSite = parsed.data.assignedSite ?? scopedGuard.assignedSite;
      const nextActive = (parsed.data.employmentStatus ?? scopedGuard.employmentStatus) === "ACTIVE";
      const policyChanged = nextShift !== scopedGuard.dutyShift || nextRate !== scopedGuard.photoRate || nextSite !== scopedGuard.assignedSite || nextActive !== (scopedGuard.employmentStatus === "ACTIVE") || !guardPolicies(scopedGuard).length;
      const photoPolicyPatch = nextShift && nextRate !== undefined && nextSite && policyChanged ? { dutyShift: nextShift, photoRate: nextRate, photoPolicyHistory: newPhotoPolicy({ shiftType: nextShift, photoRate: nextRate, siteId: nextSite, active: nextActive }, new Date(), guardPolicies(scopedGuard)) } : {};
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const uploadFields = [
        ["userPhoto", "USER_PHOTO"],
        ["aadharDocument", "AADHAAR"],
        ["bankPassbook", "BANK_PASSBOOK"],
      ] as const;
      const savedUploads = await Promise.all(
        uploadFields
          .flatMap(([field, type]) =>
            files?.[field]?.[0] ? [{ type, file: files[field][0] }] : [],
          )
          .map(async ({ type, file }) => ({
            type,
            saved: await saveLocalUpload(file),
          })),
      );
      const guard: any = await findGuard(id);
      if (!guard)
        return res
          .status(404)
          .json({ success: false, error: "GUARD_NOT_FOUND" });
      const bankPatch = {
        ...(parsed.data.bankName !== undefined
          ? { bankName: parsed.data.bankName }
          : {}),
        ...(parsed.data.branchName !== undefined
          ? { branchName: parsed.data.branchName }
          : {}),
        ...(parsed.data.bankAccountNumber !== undefined
          ? { accountNumber: parsed.data.bankAccountNumber }
          : {}),
        ...(parsed.data.ifscCode !== undefined
          ? { ifscCode: parsed.data.ifscCode }
          : {}),
      };
      const guardPatch: Record<string, unknown> = {
        ...photoPolicyPatch,
        ...(parsed.data.name !== undefined
          ? { name: parsed.data.name, nameGujarati: parsed.data.name }
          : {}),
        ...(parsed.data.mobile !== undefined
          ? { mobile: parsed.data.mobile }
          : {}),
        ...(parsed.data.alternateMobile !== undefined
          ? { alternateMobile: parsed.data.alternateMobile }
          : {}),
        ...(parsed.data.assignedSite !== undefined
          ? { assignedSite: parsed.data.assignedSite || undefined }
          : {}),
        ...(parsed.data.monthlySalary !== undefined
          ? { monthlySalary: parsed.data.monthlySalary }
          : {}),
        ...(parsed.data.employmentStatus !== undefined
          ? { employmentStatus: parsed.data.employmentStatus }
          : {}),
        ...(parsed.data.joiningDate !== undefined ? { joiningDate: new Date(parsed.data.joiningDate) } : {}),
        ...(parsed.data.employmentType !== undefined ? { employmentType: parsed.data.employmentType } : {}),
        ...(parsed.data.emergencyContacts !== undefined ? { emergencyContacts: parsed.data.emergencyContacts } : {}),
        ...(parsed.data.skills !== undefined ? { skills: parsed.data.skills } : {}),
        ...(parsed.data.trainingTags !== undefined ? { trainingTags: parsed.data.trainingTags } : {}),
        ...(parsed.data.policeVerificationStatus !== undefined ? { policeVerificationStatus: parsed.data.policeVerificationStatus } : {}),
        ...(parsed.data.onboardingChecklist !== undefined ? { onboardingChecklist: parsed.data.onboardingChecklist } : {}),
        ...(parsed.data.trainingAcknowledgedAt !== undefined ? { trainingAcknowledgedAt: parsed.data.trainingAcknowledgedAt ? new Date(parsed.data.trainingAcknowledgedAt) : undefined } : {}),
        ...(parsed.data.accountStatusReason !== undefined ? { accountStatusReason: parsed.data.accountStatusReason } : {}),
        ...(Object.keys(bankPatch).length
          ? { bank: { ...(guard.bank ?? {}), ...bankPatch } }
          : {}),
      };
      const previousSite = guard.assignedSite;
      const photo = savedUploads.find(
        (item) => item.type === "USER_PHOTO",
      )?.saved;
      if (photo) guardPatch.profilePhoto = photo.storageKey;
      Object.assign(guard, guardPatch);
      if (previousSite && previousSite !== guard.assignedSite) {
        guard.transferHistory = [...(guard.transferHistory ?? []), { fromSiteId: previousSite, toSiteId: guard.assignedSite, at: new Date().toISOString(), actorId: String(req.user?.id), reason: "Admin assignment update" }];
      }
      const user: any = await findUserForGuard(id);
      if (usingMongo()) {
        if (
          parsed.data.email &&
          user &&
          (await UserModel.exists({
            email: parsed.data.email.toLowerCase(),
            _id: { $ne: user._id },
          }))
        )
          return res
            .status(409)
            .json({ success: false, error: "EMAIL_ALREADY_EXISTS" });
        if (user) {
          if (parsed.data.name !== undefined) user.name = parsed.data.name;
          if (parsed.data.email) user.email = parsed.data.email.toLowerCase();
          if (parsed.data.mobile !== undefined)
            user.mobile = parsed.data.mobile;
          if (parsed.data.alternateMobile !== undefined)
            user.alternateMobile = parsed.data.alternateMobile;
          if (parsed.data.aadharNumber !== undefined)
            user.aadharNumber = parsed.data.aadharNumber;
          if (parsed.data.employmentStatus !== undefined)
            user.active = parsed.data.employmentStatus === "ACTIVE";
          if (Object.keys(bankPatch).length)
            user.bank = { ...(user.bank ?? {}), ...bankPatch };
          if (photo) user.profilePhoto = photo.storageKey;
          await user.save();
        }
        await guard.save();
        if (previousSite && previousSite !== guard.assignedSite)
          await SiteModel.updateOne(
            { _id: previousSite },
            { $pull: { assignedGuards: guard._id } },
          );
        if (guard.assignedSite && previousSite !== guard.assignedSite)
          await SiteModel.updateOne(
            { _id: guard.assignedSite },
            { $addToSet: { assignedGuards: guard._id } },
          );
        for (const { type, saved } of savedUploads) {
          await DocumentModel.findOneAndUpdate(
            { guardId: id, type },
            {
              $set: {
                userId: user?._id,
                originalName: saved.originalName,
                storageKey: saved.storageKey,
                mimeType: saved.mimeType,
                size: saved.size,
                uploadedBy: req.user?.id ?? "",
                uploadedAt: new Date(),
                status: "APPROVED",
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
        }
        if (savedUploads.length) {
          guard.documentCount = (
            await DocumentModel.distinct("type", { guardId: id })
          ).length;
          await guard.save();
        }
        await recordAudit(
          String(req.user?.id),
          "GUARD_UPDATED",
          "Guard",
          id,
          { ...parsed.data, ...(Object.keys(bankPatch).length ? { bankChangeReason: parsed.data.bankChangeReason ?? "Admin profile update approval" } : {}) },
        );
        return res.json({ success: true, data: { guard: safeGuard(guard) } });
      }
      if (
        parsed.data.email &&
        user &&
        db.users.some(
          (item) =>
            item.email.toLowerCase() === parsed.data.email?.toLowerCase() &&
            item.id !== user.id,
        )
      )
        return res
          .status(409)
          .json({ success: false, error: "EMAIL_ALREADY_EXISTS" });
      if (user) {
        if (parsed.data.name !== undefined) user.name = parsed.data.name;
        if (parsed.data.email) user.email = parsed.data.email.toLowerCase();
        if (parsed.data.mobile !== undefined) user.mobile = parsed.data.mobile;
        if (parsed.data.alternateMobile !== undefined)
          user.alternateMobile = parsed.data.alternateMobile;
        if (parsed.data.aadharNumber !== undefined)
          user.aadharNumber = parsed.data.aadharNumber;
        if (parsed.data.employmentStatus !== undefined)
          user.active = parsed.data.employmentStatus === "ACTIVE";
        if (Object.keys(bankPatch).length)
          (user as any).bank = { ...((user as any).bank ?? {}), ...bankPatch };
        if (photo) (user as any).profilePhoto = photo.storageKey;
      }
      Object.assign(guard, guardPatch);
      if (previousSite && previousSite !== guard.assignedSite) {
        guard.transferHistory = [...(guard.transferHistory ?? []), { fromSiteId: previousSite, toSiteId: guard.assignedSite, at: new Date().toISOString(), actorId: String(req.user?.id), reason: "Admin assignment update" }];
      }
      if (previousSite && previousSite !== guard.assignedSite) {
        const previous = db.sites.find((site) => site.id === previousSite);
        const index = previous?.assignedGuards.indexOf(id) ?? -1;
        if (previous && index >= 0) previous.assignedGuards.splice(index, 1);
      }
      if (guard.assignedSite && previousSite !== guard.assignedSite)
        db.sites
          .find((site) => site.id === guard.assignedSite)
          ?.assignedGuards.push(id);
      for (const { type, saved } of savedUploads) {
        const existing = db.documents.find(
          (item) => item.guardId === id && item.type === type,
        );
        const value = {
          guardId: id,
          userId: user?.id,
          type,
          originalName: saved.originalName,
          storageKey: saved.storageKey,
          mimeType: saved.mimeType,
          size: saved.size,
          uploadedBy: req.user?.id ?? "",
          uploadedAt: new Date().toISOString(),
          status: "APPROVED" as const,
        };
        if (existing) Object.assign(existing, value);
        else db.documents.unshift({ id: newId("doc"), ...value });
      }
      if (savedUploads.length)
        guard.documentCount = new Set(
          db.documents
            .filter((item) => item.guardId === id)
            .map((item) => item.type),
        ).size;
      audit(String(req.user?.id), "GUARD_UPDATED", "Guard", id, { ...parsed.data, ...(Object.keys(bankPatch).length ? { bankChangeReason: parsed.data.bankChangeReason ?? "Admin profile update approval" } : {}) });
      return res.json({ success: true, data: { guard: safeGuard(guard) } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post("/guards/:id/lifecycle", requireAuth, requireRoles("ADMIN"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const parsed = z.object({ event: z.enum(["ONBOARDED", "PROMOTED", "SUSPENDED", "RESIGNED", "EXITED", "REHIRED", "TRANSFERRED", "DEACTIVATED", "ACTIVATED"]), reason: z.string().min(3).max(500), siteId: z.string().optional(), effectiveAt: z.string().datetime().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "INVALID_LIFECYCLE_EVENT" });
    const guard: any = await findGuard(id);
    if (!guard) return res.status(404).json({ success: false, error: "GUARD_NOT_FOUND" });
    if (parsed.data.siteId && !(await findSite(parsed.data.siteId))) return res.status(404).json({ success: false, error: "SITE_NOT_FOUND" });
    const event = { type: parsed.data.event, reason: parsed.data.reason, effectiveAt: parsed.data.effectiveAt ?? new Date().toISOString(), actorId: String(req.user!.id), siteId: parsed.data.siteId };
    const nextStatus = ({ SUSPENDED: "SUSPENDED", RESIGNED: "RESIGNED", EXITED: "EXITED", REHIRED: "ACTIVE", DEACTIVATED: "INACTIVE", ACTIVATED: "ACTIVE" } as Record<string, string>)[parsed.data.event];
    const oldSite = String(guard.assignedSite ?? "");
    if (parsed.data.siteId && parsed.data.siteId !== oldSite) {
      guard.assignedSite = parsed.data.siteId;
      guard.transferHistory = [...(guard.transferHistory ?? []), { fromSiteId: oldSite || undefined, toSiteId: parsed.data.siteId, at: event.effectiveAt, actorId: event.actorId, reason: parsed.data.reason }];
    }
    guard.lifecycleEvents = [...(guard.lifecycleEvents ?? []), event];
    if (nextStatus) guard.employmentStatus = nextStatus;
    guard.accountStatusReason = parsed.data.reason;
    const user: any = await findUserForGuard(id);
    if (user && ["SUSPENDED", "RESIGNED", "EXITED", "DEACTIVATED"].includes(parsed.data.event)) { user.active = false; if (usingMongo()) await user.save(); }
    if (user && ["REHIRED", "ACTIVATED"].includes(parsed.data.event)) { user.active = true; if (usingMongo()) await user.save(); }
    if (usingMongo()) {
      await guard.save();
      if (oldSite && oldSite !== parsed.data.siteId) await SiteModel.updateOne({ _id: oldSite }, { $pull: { assignedGuards: id } });
      if (parsed.data.siteId && oldSite !== parsed.data.siteId) await SiteModel.updateOne({ _id: parsed.data.siteId }, { $addToSet: { assignedGuards: id } });
      await recordAudit(req.user!.id, "GUARD_LIFECYCLE_CHANGED", "Guard", id, event);
      return res.json({ success: true, data: { guard: safeGuard(guard) } });
    }
    if (oldSite && oldSite !== parsed.data.siteId) {
      const oldSiteRecord = db.sites.find((site) => site.id === oldSite);
      const oldIndex = oldSiteRecord?.assignedGuards.indexOf(id) ?? -1;
      if (oldSiteRecord && oldIndex >= 0) oldSiteRecord.assignedGuards.splice(oldIndex, 1);
    }
    if (parsed.data.siteId && oldSite !== parsed.data.siteId) { const site = db.sites.find((item) => item.id === parsed.data.siteId); if (site && !site.assignedGuards.includes(id)) site.assignedGuards.push(id); }
    audit(req.user!.id, "GUARD_LIFECYCLE_CHANGED", "Guard", id, event);
    return res.json({ success: true, data: { guard: safeGuard(guard) } });
  } catch (error) { return next(error); }
});

router.get("/guards/:id/id-card", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const guard: any = await findGuard(id);
    if (!guard || !canReadProfile(req.user, { guardId: id, siteId: guard.assignedSite })) return res.status(404).json({ success: false, error: "GUARD_NOT_FOUND" });
    const site: any = await findSite(String(guard.assignedSite ?? ""));
    return res.json({ success: true, data: { idCard: { employeeCode: guard.employeeCode, name: guard.name, siteCode: site?.siteCode, siteName: site?.siteName, status: guard.employmentStatus, idCardNumber: guard.idCardNumber ?? `CARD-${guard.employeeCode}` } } });
  } catch (error) { return next(error); }
});

router.post("/guards/import", requireAuth, requireRoles("ADMIN"), async (req, res, next) => {
  try {
    const rows = z.array(z.object({ name: z.string().min(2), employeeCode: z.string().min(2), mobile: z.string().min(8), email: z.string().email().optional(), assignedSite: z.string().optional(), joiningDate: z.string().datetime().optional(), employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]).optional() })).min(1).max(200).safeParse(req.body?.rows);
    if (!rows.success) return res.status(400).json({ success: false, error: "INVALID_GUARD_IMPORT", details: validationDetails(rows.error) });
    for (const row of rows.data) if (row.assignedSite && !(await findSite(row.assignedSite))) return res.status(404).json({ success: false, error: "SITE_NOT_FOUND", details: { employeeCode: row.employeeCode, siteId: row.assignedSite } });
    const duplicates: string[] = [];
    for (const row of rows.data) {
      const email = (row.email ?? generatedGuardEmail(row.employeeCode)).toLowerCase();
      const exists = usingMongo() ? Boolean(await GuardModel.exists({ employeeCode: row.employeeCode })) || Boolean(await UserModel.exists({ email })) : db.guards.some((item) => item.employeeCode === row.employeeCode) || db.users.some((item) => item.email === email);
      if (exists) duplicates.push(row.employeeCode);
    }
    if (duplicates.length) return res.status(409).json({ success: false, error: "DUPLICATE_GUARD_ROWS", details: { employeeCodes: duplicates } });
    const created: string[] = [];
    const credentials: Array<{ employeeCode: string; email: string; temporaryPassword: string }> = [];
    for (const row of rows.data) {
      const email = (row.email ?? generatedGuardEmail(row.employeeCode)).toLowerCase();
      const temporaryPassword = generatedGuardPassword(row.employeeCode);
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      const guardValue = { name: row.name, employeeCode: row.employeeCode, mobile: row.mobile, assignedSite: row.assignedSite, joiningDate: row.joiningDate ? new Date(row.joiningDate) : undefined, employmentType: row.employmentType, nameGujarati: row.name, employmentStatus: "ACTIVE" as const, monthlySalary: 24000, preferredLanguage: "gu" as const, documentCount: 0, bank: { bankName: "", accountNumber: "XXXXXXXX", ifscCode: "" }, policeVerificationStatus: "PENDING" };
      if (usingMongo()) { const guard: any = await GuardModel.create({ _id: makeId("guard"), ...guardValue }); await UserModel.create({ _id: makeId("user"), email, passwordHash, name: row.name, role: "GUARD", guardId: guard._id, passwordChangeRequired: true, preferredLanguage: "gu", active: true }); if (row.assignedSite) await SiteModel.updateOne({ _id: row.assignedSite }, { $addToSet: { assignedGuards: guard._id } }); created.push(String(guard._id)); }
      else { const guard: GuardRecord = { id: newId("guard"), ...guardValue, village: "", district: "", joiningDate: row.joiningDate, employmentStatus: "ACTIVE", preferredLanguage: "gu", documentCount: 0, bank: { bankName: "", accountNumber: "XXXXXXXX", ifscCode: "" } }; db.guards.push(guard); db.users.push({ id: newId("user"), email, passwordHash, name: row.name, role: "GUARD", guardId: guard.id, passwordChangeRequired: true, preferredLanguage: "gu", active: true }); if (row.assignedSite) db.sites.find((site) => site.id === row.assignedSite)?.assignedGuards.push(guard.id); created.push(guard.id); }
      credentials.push({ employeeCode: row.employeeCode, email, temporaryPassword });
    }
    await recordAudit(req.user!.id, "GUARDS_IMPORTED", "Guard", "bulk", { count: created.length });
    return res.status(201).json({ success: true, data: { created, credentials } });
  } catch (error) { return next(error); }
});

router.post(
  "/guards/:id/reset-password",
  requireAuth,
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      const value = z
        .object({ temporaryPassword: z.string().min(6).max(128).optional() })
        .parse(req.body ?? {});
      const generatedPassword = !value.temporaryPassword;
      const temporaryPassword = value.temporaryPassword ?? generatedGuardPassword(id);
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      if (usingMongo()) {
        const guard: any = await GuardModel.findById(id);
        const user: any = guard?.userId
          ? await UserModel.findById(guard.userId)
          : await UserModel.findOne({ guardId: id });
        if (!guard || !user)
          return res
            .status(404)
            .json({ success: false, error: "GUARD_LOGIN_NOT_FOUND" });
        user.passwordHash = passwordHash;
        user.passwordChangeRequired = true;
        await user.save();
        if (!guard.userId) {
          guard.userId = user._id;
          await guard.save();
        }
      } else {
        const guard = db.guards.find((item) => item.id === id);
        const user = db.users.find((item) => item.guardId === id);
        if (!guard || !user)
          return res
            .status(404)
            .json({ success: false, error: "GUARD_LOGIN_NOT_FOUND" });
        user.passwordHash = passwordHash;
        user.passwordChangeRequired = true;
      }
      const resetUser: any = usingMongo() ? await findUserForGuard(id) : db.users.find((item) => item.guardId === id);
      if (resetUser) await revokeAllRefreshSessions(String(resetUser._id ?? resetUser.id));
      await recordAudit(
        String(req.user?.id),
        "GUARD_PASSWORD_RESET",
        "Guard",
        id,
      );
      return res.json({ success: true, data: { passwordChangeRequired: true, ...(generatedPassword ? { temporaryPassword } : {}) } });
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/sites", requireAuth, async (req, res, next) => {
  try {
    const guard: any = await guardForUser(req.user);
    const page = requestedPage(req.query);
    const filter = req.user?.role === "GUARD" ? { _id: { $in: guard?.assignedSite ? [guard.assignedSite] : [] } } : req.user?.role === "MAIN_SECURITY" ? { _id: { $in: req.user.assignedSiteIds ?? [] } } : {};
    const result = usingMongo()
      ? await mongoPage(SiteModel, filter, { siteCode: 1, _id: 1 }, page)
      : memoryPage(db.sites.filter((site) => req.user?.role === "GUARD" ? site.id === guard?.assignedSite : canAccessSite(req.user, site.id)).slice().sort((a,b) => a.siteCode.localeCompare(b.siteCode) || a.id.localeCompare(b.id)), page);
    return res.json({ success: true, data: { sites: objects(result.records), ...(result.pagination ? { pagination: result.pagination } : {}) } });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/sites",
  requireAuth,
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      const parsed = z
        .object({
          siteCode: z.string().trim().min(1),
          siteName: z.string().min(2),
          siteType: z.enum(["WIND", "SOLAR", "STORE", "OTHER"]).optional(),
          farmerAddress: z.string().optional(),
          district: z.string().trim().optional(),
          subDistrict: z.string().trim().optional(),
          village: z.string().trim().optional(),
          mapLink: z.string().trim().url().optional(),
          clientName: z.string().trim().optional(),
          clientContact: z.string().trim().optional(),
          siteAddress: z.string().trim().optional(),
          reportingInstructions: z.string().trim().optional(),
          approvedGuardStrength: z.coerce.number().int().nonnegative().optional(),
          requiredShiftCoverage: z.coerce.number().int().nonnegative().optional(),
          contracts: z.unknown().optional(),
          emergencyContacts: z.array(z.object({ name: z.string().min(2), mobile: z.string().min(8), role: z.string().optional() })).max(10).optional(),
          region: z.string().trim().optional(),
          zone: z.string().trim().optional(),
          cluster: z.string().trim().optional(),
          sop: z.string().trim().optional(),
          postOrders: z.string().trim().optional(),
          holidayRequirements: z.unknown().optional(),
          equipmentRequirements: z.unknown().optional(),
          complianceIndicators: z.unknown().optional(),
          latitude: optionalLatitude,
          longitude: optionalLongitude,
          geofenceRadiusMeters: optionalGeofenceRadius,
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ success: false, error: "INVALID_SITE" });
      if (!coordinatesArePaired(parsed.data.latitude, parsed.data.longitude))
        return res.status(400).json({ success: false, error: "INVALID_SITE_COORDINATES" });
      const value = {
        siteCode: parsed.data.siteCode,
        siteName: parsed.data.siteName,
        siteType: parsed.data.siteType ?? "WIND",
        ...(parsed.data.farmerAddress ? { farmerAddress: parsed.data.farmerAddress } : {}),
        district: parsed.data.district ?? "",
        subDistrict: parsed.data.subDistrict ?? "",
        village: parsed.data.village ?? "",
        ...(parsed.data.mapLink ? { mapLink: parsed.data.mapLink } : {}),
         ...(parsed.data.clientName !== undefined ? { clientName: parsed.data.clientName } : {}),
         ...(parsed.data.clientContact !== undefined ? { clientContact: parsed.data.clientContact } : {}),
         ...(parsed.data.siteAddress !== undefined ? { siteAddress: parsed.data.siteAddress } : {}),
         ...(parsed.data.reportingInstructions !== undefined ? { reportingInstructions: parsed.data.reportingInstructions } : {}),
         ...(parsed.data.approvedGuardStrength !== undefined ? { approvedGuardStrength: parsed.data.approvedGuardStrength } : {}),
         ...(parsed.data.requiredShiftCoverage !== undefined ? { requiredShiftCoverage: parsed.data.requiredShiftCoverage } : {}),
         ...(parsed.data.contracts !== undefined ? { contracts: parsed.data.contracts } : {}),
         ...(parsed.data.emergencyContacts !== undefined ? { emergencyContacts: parsed.data.emergencyContacts } : {}),
         ...(parsed.data.region !== undefined ? { region: parsed.data.region } : {}),
         ...(parsed.data.zone !== undefined ? { zone: parsed.data.zone } : {}),
         ...(parsed.data.cluster !== undefined ? { cluster: parsed.data.cluster } : {}),
         ...(parsed.data.sop !== undefined ? { sop: parsed.data.sop } : {}),
         ...(parsed.data.postOrders !== undefined ? { postOrders: parsed.data.postOrders } : {}),
         ...(parsed.data.holidayRequirements !== undefined ? { holidayRequirements: parsed.data.holidayRequirements } : {}),
         ...(parsed.data.equipmentRequirements !== undefined ? { equipmentRequirements: parsed.data.equipmentRequirements } : {}),
         ...(parsed.data.complianceIndicators !== undefined ? { complianceIndicators: parsed.data.complianceIndicators } : {}),
        ...(typeof parsed.data.latitude === "number" && typeof parsed.data.longitude === "number"
          ? { latitude: parsed.data.latitude, longitude: parsed.data.longitude }
          : {}),
        ...(typeof parsed.data.geofenceRadiusMeters === "number"
          ? { geofenceRadiusMeters: parsed.data.geofenceRadiusMeters }
          : {}),
        status: "ACTIVE" as const,
        assignedGuards: [] as string[],
      };
      if (usingMongo()) {
        const site = await SiteModel.create({ _id: makeId("site"), ...value });
        await recordAudit(req.user!.id, "SITE_CREATED", "Site", recordId(site));
        return res
          .status(201)
          .json({ success: true, data: { site: object(site) } });
      }
      const site: SiteRecord = { id: newId("site"), ...value };
      db.sites.push(site);
      await recordAudit(req.user!.id, "SITE_CREATED", "Site", site.id);
      return res.status(201).json({ success: true, data: { site } });
    } catch (error) {
      return next(error);
    }
  },
);
router.patch(
  "/sites/:id",
  requireAuth,
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      const parsed = z
        .object({
          siteCode: z.string().trim().min(1).optional(),
          siteName: z.string().min(2).optional(),
          siteType: z.enum(["WIND", "SOLAR", "STORE", "OTHER"]).optional(),
          farmerAddress: z.string().optional(),
          status: z.enum(["ACTIVE", "INACTIVE", "TEMPORARY_HOLD", "CLOSED"]).optional(),
          district: z.string().trim().optional(),
          subDistrict: z.string().trim().optional(),
          village: z.string().trim().optional(),
          mapLink: z.string().trim().url().nullable().optional(),
          clientName: z.string().trim().optional(),
          clientContact: z.string().trim().optional(),
          siteAddress: z.string().trim().optional(),
          reportingInstructions: z.string().trim().optional(),
          approvedGuardStrength: z.coerce.number().int().nonnegative().optional(),
          requiredShiftCoverage: z.coerce.number().int().nonnegative().optional(),
          contracts: z.unknown().optional(),
          emergencyContacts: z.array(z.object({ name: z.string().min(2), mobile: z.string().min(8), role: z.string().optional() })).max(10).optional(),
          region: z.string().trim().optional(),
          zone: z.string().trim().optional(),
          cluster: z.string().trim().optional(),
          sop: z.string().trim().optional(),
          postOrders: z.string().trim().optional(),
          holidayRequirements: z.unknown().optional(),
          equipmentRequirements: z.unknown().optional(),
          complianceIndicators: z.unknown().optional(),
          closureReason: z.string().trim().max(500).optional(),
          latitude: optionalLatitude,
          longitude: optionalLongitude,
          geofenceRadiusMeters: optionalGeofenceRadius,
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ success: false, error: "INVALID_SITE" });
      if (!coordinatesArePaired(parsed.data.latitude, parsed.data.longitude))
        return res.status(400).json({ success: false, error: "INVALID_SITE_COORDINATES" });
      const { latitude, longitude, geofenceRadiusMeters, ...siteFields } = parsed.data;
      const hasCoordinates = latitude !== undefined || longitude !== undefined;
      const hasGeofenceRadius = geofenceRadiusMeters !== undefined;
      const geofenceFields = hasGeofenceRadius ? { geofenceRadiusMeters } : {};
      if (usingMongo()) {
        const update: any = hasCoordinates
          ? latitude === null && longitude === null
            ? { $set: { ...siteFields, ...geofenceFields }, $unset: { latitude: "", longitude: "" } }
            : { $set: { ...siteFields, ...geofenceFields, latitude, longitude } }
          : { $set: { ...siteFields, ...geofenceFields } };
        if (geofenceRadiusMeters === null) {
          delete (update.$set as any).geofenceRadiusMeters;
          update.$unset = { ...(update.$unset ?? {}), geofenceRadiusMeters: "" };
        }
        const site = await SiteModel.findByIdAndUpdate(
          id,
          update,
          { new: true },
        );
        if (!site)
          return res
            .status(404)
            .json({ success: false, error: "SITE_NOT_FOUND" });
        await recordAudit(req.user!.id, "SITE_UPDATED", "Site", recordId(site), { fields: Object.keys(parsed.data) });
        return res.json({ success: true, data: { site: object(site) } });
      }
      const site = db.sites.find((item) => item.id === id);
      if (!site)
        return res
          .status(404)
          .json({ success: false, error: "SITE_NOT_FOUND" });
      Object.assign(site, siteFields);
      if (hasGeofenceRadius) {
        if (geofenceRadiusMeters === null) delete site.geofenceRadiusMeters;
        else if (typeof geofenceRadiusMeters === "number") site.geofenceRadiusMeters = geofenceRadiusMeters;
      }
      if (hasCoordinates) {
        if (latitude === null && longitude === null) {
          delete site.latitude;
          delete site.longitude;
        } else if (typeof latitude === "number" && typeof longitude === "number") {
          site.latitude = latitude;
          site.longitude = longitude;
        }
      }
      await recordAudit(req.user!.id, "SITE_UPDATED", "Site", site.id, { fields: Object.keys(parsed.data) });
      return res.json({ success: true, data: { site } });
    } catch (error) {
      return next(error);
    }
  },
);
router.get(
  "/sites/:id/guards",
  requireAuth,
  requireRoles("MAIN_SECURITY", "ADMIN"),
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      const site: any = await findSite(id);
      if (!site)
        return res
          .status(404)
          .json({ success: false, error: "SITE_NOT_FOUND" });
      const guards = usingMongo()
        ? await GuardModel.find({ assignedSite: id })
        : db.guards.filter((item) => item.assignedSite === id);
      return res.json({
        success: true,
        data: { guards: guards.map((guard) => safeGuard(guard, req.user)) },
      });
    } catch (error) {
      return next(error);
    }
  },
);

function validBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00+05:30`);
  return !Number.isNaN(parsed.getTime()) && indiaBusinessDate(parsed) === value;
}
function rosterInterval(startValue: string, endValue: string) {
  const start = new Date(startValue);
  let end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;
  let overnight = false;
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    overnight = true;
  }
  return { start, end, overnight };
}
function intervalsOverlap(leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date) {
  return leftStart.getTime() < rightEnd.getTime() && rightStart.getTime() < leftEnd.getTime();
}
async function findRoster(id: string) {
  return usingMongo() ? RosterModel.findById(id) : db.rosters.find((item) => item.id === id);
}
async function rosterConflicts(guardId: string, start: Date, end: Date, ignoreId?: string) {
  const records: any[] = usingMongo()
    ? await RosterModel.find({ guardId, status: { $nin: ["CANCELLED"] } })
    : db.rosters.filter((item) => item.guardId === guardId && item.status !== "CANCELLED");
  return records.filter((item) => String(item._id ?? item.id) !== ignoreId && intervalsOverlap(start, end, new Date(item.startAt), new Date(item.endAt)));
}
async function approvedLeaveConflict(guardId: string, businessDate: string, endDate = businessDate, ignoreId?: string) {
  const records: any[] = usingMongo()
    ? await LeaveRequestModel.find({ guardId, status: "APPROVED", ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) })
    : db.leaveRequests.filter((item) => item.guardId === guardId && item.status === "APPROVED" && item.id !== ignoreId);
  return records.some((item) => String(item.startDate) <= endDate && String(item.endDate) >= businessDate);
}
async function eligibleGuardForRoster(guardId: string, siteId: string) {
  const guard: any = await findGuard(guardId);
  return guard && guard.employmentStatus === "ACTIVE" && String(guard.assignedSite ?? "") === siteId ? guard : undefined;
}
async function visibleRoster(req: express.Request, roster: any) {
  return Boolean(roster && canReadOperational(req.user, { guardId: String(roster.guardId), siteId: String(roster.siteId) }));
}

router.get("/rosters", requireAuth, async (req, res, next) => {
  try {
    const requestedGuard = req.user?.role === "GUARD" ? guardIdForUser(req.user) : String(req.query.guardId ?? "");
    const requestedSite = String(req.query.siteId ?? "");
    if (requestedSite && !canAccessSite(req.user, requestedSite)) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const filter: any = {
      ...operationalFilter(req),
      ...(requestedGuard ? { guardId: requestedGuard } : {}),
      ...(requestedSite ? { siteId: requestedSite } : {}),
    };
    if (req.query.from || req.query.to) {
      const from = String(req.query.from ?? req.query.to);
      const to = String(req.query.to ?? req.query.from);
      if (!validBusinessDate(from) || !validBusinessDate(to) || from > to) return res.status(400).json({ success: false, error: "INVALID_ROSTER_DATE_RANGE" });
      filter.businessDate = { $gte: from, $lte: to };
    }
    const page = requestedPage(req.query);
    const result = usingMongo()
      ? await mongoPage(RosterModel, filter, { startAt: 1, _id: 1 }, page)
      : memoryPage(db.rosters.filter((item) => visibleOperation(req, item) && (!requestedGuard || item.guardId === requestedGuard) && (!requestedSite || item.siteId === requestedSite) && (!filter.businessDate || item.businessDate >= filter.businessDate.$gte && item.businessDate <= filter.businessDate.$lte)).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()), page);
    const records: any[] = result.records;
    const guardIds = [...new Set(records.map((item) => String(item.guardId)))];
    const siteIds = [...new Set(records.map((item) => String(item.siteId)))];
    const guards: any[] = usingMongo() ? await GuardModel.find({ _id: { $in: guardIds } }) : db.guards.filter((item) => guardIds.includes(item.id));
    const sites: any[] = usingMongo() ? await SiteModel.find({ _id: { $in: siteIds } }) : db.sites.filter((item) => siteIds.includes(item.id));
    const guardMap = new Map(guards.map((item) => [recordId(item), item.name]));
    const siteMap = new Map(sites.map((item) => [recordId(item), { siteCode: item.siteCode, siteName: item.siteName }]));
    return res.json({ success: true, data: { ...(result.pagination ? { pagination: result.pagination } : {}), rosters: records.map((item) => ({ ...object(item), guardName: guardMap.get(String(item.guardId)), site: siteMap.get(String(item.siteId)) })) } });
  } catch (error) { return next(error); }
});

router.post("/rosters", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = z.object({ guardId: z.string().min(1), siteId: z.string().min(1), businessDate: z.string(), shiftType: z.string().min(1).max(60), startAt: z.string().datetime(), endAt: z.string().datetime(), overnight: z.boolean().optional(), recurrenceRule: z.unknown().optional(), weeklyOff: z.boolean().optional(), holidayCode: z.string().max(60).optional(), notes: z.string().max(1000).optional(), handoverNotes: z.string().max(2000).optional() }).safeParse(req.body);
    if (!parsed.success || !validBusinessDate(parsed.success ? parsed.data.businessDate : "")) return res.status(400).json({ success: false, error: "INVALID_ROSTER" });
    if (!canAccessSite(req.user, parsed.data.siteId)) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const interval = rosterInterval(parsed.data.startAt, parsed.data.endAt);
    if (!interval || indiaBusinessDate(interval.start) !== parsed.data.businessDate) return res.status(400).json({ success: false, error: "INVALID_ROSTER_INTERVAL" });
    if (!(await findSite(parsed.data.siteId))) return res.status(404).json({ success: false, error: "SITE_NOT_FOUND" });
    if (!(await eligibleGuardForRoster(parsed.data.guardId, parsed.data.siteId))) return res.status(409).json({ success: false, error: "GUARD_NOT_ELIGIBLE_FOR_SITE" });
    if (await approvedLeaveConflict(parsed.data.guardId, parsed.data.businessDate, indiaBusinessDate(interval.end))) return res.status(409).json({ success: false, error: "APPROVED_LEAVE_CONFLICT" });
    if ((await rosterConflicts(parsed.data.guardId, interval.start, interval.end)).length) return res.status(409).json({ success: false, error: "ROSTER_CONFLICT" });
    const value = { guardId: parsed.data.guardId, siteId: parsed.data.siteId, businessDate: parsed.data.businessDate, shiftType: parsed.data.shiftType, startAt: interval.start, endAt: interval.end, overnight: parsed.data.overnight ?? interval.overnight, recurrenceRule: parsed.data.recurrenceRule, weeklyOff: parsed.data.weeklyOff, holidayCode: parsed.data.holidayCode, status: "SCHEDULED" as const, assignedBy: String(req.user!.id), notes: parsed.data.notes, handoverNotes: parsed.data.handoverNotes, locked: false, conflictFlags: [] as string[] };
    if (usingMongo()) {
      const roster = await RosterModel.create({ _id: makeId("roster"), ...value });
      await recordAudit(req.user!.id, "ROSTER_CREATED", "Roster", recordId(roster), { guardId: parsed.data.guardId, siteId: parsed.data.siteId, businessDate: parsed.data.businessDate });
      await createNotification({ guardId: parsed.data.guardId, siteId: parsed.data.siteId, kind: "SHIFT_ASSIGNED", title: "New duty assigned", body: `A duty shift is assigned for ${parsed.data.businessDate}.`, deepLink: "/guard/rosters", source: "ROSTER", dedupeKey: `roster-assigned:${recordId(roster)}`, priority: "HIGH" });
      return res.status(201).json({ success: true, data: { roster: object(roster) } });
    }
    const roster: RosterRecord = { id: newId("roster"), ...value, startAt: interval.start.toISOString(), endAt: interval.end.toISOString(), assignedBy: String(req.user!.id), status: "SCHEDULED", overnight: value.overnight, conflictFlags: [] };
    db.rosters.push(roster);
    await recordAudit(req.user!.id, "ROSTER_CREATED", "Roster", roster.id, { guardId: roster.guardId, siteId: roster.siteId, businessDate: roster.businessDate });
    await createNotification({ guardId: roster.guardId, siteId: roster.siteId, kind: "SHIFT_ASSIGNED", title: "New duty assigned", body: `A duty shift is assigned for ${roster.businessDate}.`, deepLink: "/guard/rosters", source: "ROSTER", dedupeKey: `roster-assigned:${roster.id}`, priority: "HIGH" });
    return res.status(201).json({ success: true, data: { roster } });
  } catch (error) { return next(error); }
});

router.patch("/rosters/:id", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const roster: any = await findRoster(id);
    if (!roster || !(await visibleRoster(req, roster))) return res.status(404).json({ success: false, error: "ROSTER_NOT_FOUND" });
    if (roster.locked || String(roster.businessDate) < indiaBusinessDate(new Date())) return res.status(409).json({ success: false, error: "ROSTER_LOCKED" });
    const parsed = z.object({ guardId: z.string().optional(), siteId: z.string().optional(), businessDate: z.string().optional(), shiftType: z.string().min(1).max(60).optional(), startAt: z.string().datetime().optional(), endAt: z.string().datetime().optional(), status: z.enum(["SCHEDULED", "CANCELLED"]).optional(), dutyStatus: z.string().max(40).optional(), lateMinutes: z.coerce.number().int().nonnegative().optional(), earlyDepartureMinutes: z.coerce.number().int().nonnegative().optional(), notes: z.string().max(1000).optional(), handoverNotes: z.string().max(2000).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "INVALID_ROSTER_UPDATE" });
    const nextGuardId = parsed.data.guardId ?? String(roster.guardId);
    const nextSiteId = parsed.data.siteId ?? String(roster.siteId);
    const nextDate = parsed.data.businessDate ?? String(roster.businessDate);
    if (!validBusinessDate(nextDate) || !canAccessSite(req.user, nextSiteId)) return res.status(400).json({ success: false, error: "INVALID_ROSTER_UPDATE" });
    const interval = rosterInterval(parsed.data.startAt ?? new Date(roster.startAt).toISOString(), parsed.data.endAt ?? new Date(roster.endAt).toISOString());
    if (!interval || indiaBusinessDate(interval.start) !== nextDate || !(await eligibleGuardForRoster(nextGuardId, nextSiteId))) return res.status(409).json({ success: false, error: "GUARD_NOT_ELIGIBLE_FOR_SITE" });
    if (await approvedLeaveConflict(nextGuardId, nextDate, indiaBusinessDate(interval.end))) return res.status(409).json({ success: false, error: "APPROVED_LEAVE_CONFLICT" });
    if ((await rosterConflicts(nextGuardId, interval.start, interval.end, id)).length) return res.status(409).json({ success: false, error: "ROSTER_CONFLICT" });
    const change = { at: new Date().toISOString(), actorId: String(req.user!.id), from: { guardId: roster.guardId, siteId: roster.siteId, startAt: roster.startAt, endAt: roster.endAt }, to: { guardId: nextGuardId, siteId: nextSiteId, startAt: interval.start.toISOString(), endAt: interval.end.toISOString() } };
    const patch: any = { guardId: nextGuardId, siteId: nextSiteId, businessDate: nextDate, startAt: interval.start, endAt: interval.end, overnight: interval.overnight, ...(parsed.data.shiftType ? { shiftType: parsed.data.shiftType } : {}), ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.dutyStatus !== undefined ? { dutyStatus: parsed.data.dutyStatus } : {}), ...(parsed.data.lateMinutes !== undefined ? { lateMinutes: parsed.data.lateMinutes } : {}), ...(parsed.data.earlyDepartureMinutes !== undefined ? { earlyDepartureMinutes: parsed.data.earlyDepartureMinutes } : {}), ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}), ...(parsed.data.handoverNotes !== undefined ? { handoverNotes: parsed.data.handoverNotes } : {}), $push: { changeHistory: change } };
    if (usingMongo()) { const updated: any = await RosterModel.findByIdAndUpdate(id, { $set: Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "$push")), $push: patch.$push }, { new: true }); await recordAudit(req.user!.id, "ROSTER_UPDATED", "Roster", id, change); if (String(change.from.guardId) !== String(change.to.guardId) || String(change.from.siteId) !== String(change.to.siteId)) await createNotification({ guardId: nextGuardId, siteId: nextSiteId, kind: "SHIFT_CHANGED", title: "Duty assignment changed", body: `Your duty assignment for ${nextDate} was changed.`, deepLink: "/guard/rosters", source: "ROSTER", dedupeKey: `roster-changed:${id}:${change.to.startAt}`, priority: "HIGH" }); return res.json({ success: true, data: { roster: object(updated) } }); }
    Object.assign(roster, patch); roster.changeHistory = [...(roster.changeHistory ?? []), change]; delete roster.$push; roster.startAt = interval.start.toISOString(); roster.endAt = interval.end.toISOString(); await recordAudit(req.user!.id, "ROSTER_UPDATED", "Roster", id, change); if (String(change.from.guardId) !== String(change.to.guardId) || String(change.from.siteId) !== String(change.to.siteId)) await createNotification({ guardId: nextGuardId, siteId: nextSiteId, kind: "SHIFT_CHANGED", title: "Duty assignment changed", body: `Your duty assignment for ${nextDate} was changed.`, deepLink: "/guard/rosters", source: "ROSTER", dedupeKey: `roster-changed:${id}:${change.to.startAt}`, priority: "HIGH" }); return res.json({ success: true, data: { roster } });
  } catch (error) { return next(error); }
});

router.post("/rosters/:id/acknowledge", requireAuth, requireRoles("GUARD"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id); const guardId = guardIdForUser(req.user); const roster: any = await findRoster(id);
    if (!roster || String(roster.guardId) !== guardId) return res.status(404).json({ success: false, error: "ROSTER_NOT_FOUND" });
    if (roster.status === "CANCELLED") return res.status(409).json({ success: false, error: "ROSTER_CANCELLED" });
    const now = new Date();
    if (usingMongo()) { roster.status = "ACKNOWLEDGED"; roster.acknowledgedAt = now; await roster.save(); }
    else { roster.status = "ACKNOWLEDGED"; roster.acknowledgedAt = now.toISOString(); }
    await recordAudit(req.user!.id, "ROSTER_ACKNOWLEDGED", "Roster", id);
    return res.json({ success: true, data: { roster: object(roster) } });
  } catch (error) { return next(error); }
});

router.get("/leave-requests", requireAuth, async (req, res, next) => {
  try {
    const guardId = req.user?.role === "GUARD" ? guardIdForUser(req.user) : String(req.query.guardId ?? "");
    const siteId = String(req.query.siteId ?? ""); if (siteId && !canAccessSite(req.user, siteId)) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const records: any[] = usingMongo() ? await LeaveRequestModel.find({ ...(guardId ? { guardId } : {}), ...(req.user?.role === "MAIN_SECURITY" ? { guardId: { $in: await GuardModel.find({ assignedSite: { $in: req.user.assignedSiteIds ?? [] } }).distinct("_id") } } : {}) }).sort({ requestedAt: -1 }) : db.leaveRequests.filter((item) => { const guard = db.guards.find((candidate) => candidate.id === item.guardId); return (!guardId || item.guardId === guardId) && visibleOperation(req, { guardId: item.guardId, siteId: siteId || guard?.assignedSite }); });
    return res.json({ success: true, data: { leaveRequests: objects(records) } });
  } catch (error) { return next(error); }
});

router.post("/leave-requests", requireAuth, requireRoles("GUARD", "MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = z.object({ guardId: z.string().optional(), startDate: z.string(), endDate: z.string(), leaveType: z.string().min(1).max(40), reason: z.string().min(3).max(1000) }).safeParse(req.body);
    if (!parsed.success || !validBusinessDate(parsed.success ? parsed.data.startDate : "") || !validBusinessDate(parsed.success ? parsed.data.endDate : "") || parsed.data.startDate > parsed.data.endDate) return res.status(400).json({ success: false, error: "INVALID_LEAVE_REQUEST" });
    const guardId = req.user?.role === "GUARD" ? guardIdForUser(req.user) : String(parsed.data.guardId ?? ""); const guard: any = await findGuard(guardId);
    if (!guard || (req.user?.role === "GUARD" && guardId !== guardIdForUser(req.user)) || (req.user?.role === "MAIN_SECURITY" && !canAccessSite(req.user, String(guard.assignedSite ?? "")))) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    if (await approvedLeaveConflict(guardId, parsed.data.startDate, parsed.data.endDate)) return res.status(409).json({ success: false, error: "LEAVE_ALREADY_APPROVED" });
    const now = new Date(); const value = { guardId, startDate: parsed.data.startDate, endDate: parsed.data.endDate, leaveType: parsed.data.leaveType, reason: parsed.data.reason.trim(), status: "PENDING" as const, requestedAt: now };
    if (usingMongo()) { const item = await LeaveRequestModel.create({ _id: makeId("leave"), ...value }); await recordAudit(req.user!.id, "LEAVE_REQUESTED", "LeaveRequest", recordId(item), value); return res.status(201).json({ success: true, data: { leaveRequest: object(item) } }); }
    const item: LeaveRequestRecord = { id: newId("leave"), ...value, requestedAt: now.toISOString(), status: "PENDING" }; db.leaveRequests.unshift(item); await recordAudit(req.user!.id, "LEAVE_REQUESTED", "LeaveRequest", item.id, value); return res.status(201).json({ success: true, data: { leaveRequest: item } });
  } catch (error) { return next(error); }
});

router.patch("/leave-requests/:id/decision", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id); const parsed = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().min(3).max(500) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, error: "INVALID_LEAVE_DECISION" });
    const item: any = usingMongo() ? await LeaveRequestModel.findById(id) : db.leaveRequests.find((value) => value.id === id); if (!item) return res.status(404).json({ success: false, error: "LEAVE_NOT_FOUND" });
    const guard: any = await findGuard(String(item.guardId)); if (!guard || !canAccessSite(req.user, String(guard.assignedSite ?? ""))) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    if (item.status !== "PENDING") return res.status(409).json({ success: false, error: "LEAVE_ALREADY_DECIDED" });
    if (parsed.data.decision === "APPROVED" && await rosterDateConflict(String(item.guardId), String(item.startDate), String(item.endDate))) return res.status(409).json({ success: false, error: "ROSTER_CONFLICT" });
    const now = new Date(); item.status = parsed.data.decision; item.approvedBy = String(req.user!.id); item.approvedAt = usingMongo() ? now : now.toISOString(); item.decisionReason = parsed.data.reason.trim(); if (usingMongo()) await item.save(); await recordAudit(req.user!.id, "LEAVE_DECISION", "LeaveRequest", id, { decision: item.status, reason: item.decisionReason }); await createNotification({ guardId: String(item.guardId), siteId: String(guard.assignedSite), kind: `LEAVE_${parsed.data.decision}`, title: `Leave request ${parsed.data.decision.toLowerCase()}`, body: `Your leave request from ${item.startDate} to ${item.endDate} was ${parsed.data.decision.toLowerCase()}.`, deepLink: "/guard/rosters", source: "LEAVE", dedupeKey: `leave-decision:${id}:${parsed.data.decision}`, priority: "HIGH" }); return res.json({ success: true, data: { leaveRequest: object(item) } });
  } catch (error) { return next(error); }
});

async function rosterDateConflict(guardId: string, startDate: string, endDate: string) {
  const records: any[] = usingMongo() ? await RosterModel.find({ guardId, status: { $nin: ["CANCELLED"] }, businessDate: { $gte: startDate, $lte: endDate } }) : db.rosters.filter((item) => item.guardId === guardId && item.status !== "CANCELLED" && item.businessDate >= startDate && item.businessDate <= endDate);
  return records.length > 0;
}

router.get("/replacements", requireAuth, async (req, res, next) => {
  try {
    const rosterId = String(req.query.rosterId ?? ""); if (rosterId) { const roster: any = await findRoster(rosterId); if (!roster || !(await visibleRoster(req, roster))) return res.status(404).json({ success: false, error: "ROSTER_NOT_FOUND" }); const guards: any[] = usingMongo() ? await GuardModel.find({ assignedSite: roster.siteId, employmentStatus: "ACTIVE", _id: { $ne: roster.guardId } }) : db.guards.filter((item) => item.assignedSite === roster.siteId && item.employmentStatus === "ACTIVE" && item.id !== roster.guardId); const available = []; for (const guard of guards) if (!(await approvedLeaveConflict(recordId(guard), String(roster.businessDate))) && !(await rosterConflicts(recordId(guard), new Date(roster.startAt), new Date(roster.endAt), rosterId)).length) available.push(safeGuard(guard, req.user)); return res.json({ success: true, data: { suggestions: available } }); }
    const records: any[] = usingMongo() ? await ReplacementModel.find(operationalFilter(req)).sort({ createdAt: -1 }) : db.replacements.filter((item) => visibleOperation(req, item)); return res.json({ success: true, data: { replacements: objects(records) } });
  } catch (error) { return next(error); }
});

router.post("/replacements", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = z.object({ rosterId: z.string().min(1), replacementGuardId: z.string().optional(), reason: z.string().min(3).max(1000) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, error: "INVALID_REPLACEMENT" });
    const roster: any = await findRoster(parsed.data.rosterId); if (!roster || !(await visibleRoster(req, roster))) return res.status(404).json({ success: false, error: "ROSTER_NOT_FOUND" });
    if (parsed.data.replacementGuardId && !(await eligibleGuardForRoster(parsed.data.replacementGuardId, String(roster.siteId)))) return res.status(409).json({ success: false, error: "REPLACEMENT_NOT_ELIGIBLE" });
    const value = { rosterId: parsed.data.rosterId, siteId: String(roster.siteId), absentGuardId: String(roster.guardId), replacementGuardId: parsed.data.replacementGuardId, reason: parsed.data.reason.trim(), status: (parsed.data.replacementGuardId ? "PROPOSED" : "OPEN") as ReplacementRecord["status"], requestedBy: String(req.user!.id) };
    if (usingMongo()) { const item = await ReplacementModel.create({ _id: makeId("replacement"), ...value }); await recordAudit(req.user!.id, "REPLACEMENT_REQUESTED", "Replacement", recordId(item), value); return res.status(201).json({ success: true, data: { replacement: object(item) } }); }
    const item: ReplacementRecord = { id: newId("replacement"), ...value, status: value.status as ReplacementRecord["status"], requestedBy: String(req.user!.id) }; db.replacements.unshift(item); await recordAudit(req.user!.id, "REPLACEMENT_REQUESTED", "Replacement", item.id, value); return res.status(201).json({ success: true, data: { replacement: item } });
  } catch (error) { return next(error); }
});

router.patch("/replacements/:id/decision", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id); const parsed = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().min(3).max(500) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, error: "INVALID_REPLACEMENT_DECISION" }); const item: any = usingMongo() ? await ReplacementModel.findById(id) : db.replacements.find((value) => value.id === id); if (!item) return res.status(404).json({ success: false, error: "REPLACEMENT_NOT_FOUND" }); const roster: any = await findRoster(String(item.rosterId)); if (!roster || !(await visibleRoster(req, roster))) return res.status(404).json({ success: false, error: "ROSTER_NOT_FOUND" }); if (parsed.data.decision === "APPROVED") { if (!item.replacementGuardId || !(await eligibleGuardForRoster(String(item.replacementGuardId), String(roster.siteId))) || (await rosterConflicts(String(item.replacementGuardId), new Date(roster.startAt), new Date(roster.endAt), String(roster._id ?? roster.id))).length) return res.status(409).json({ success: false, error: "REPLACEMENT_CONFLICT" }); roster.changeHistory = [...(roster.changeHistory ?? []), { at: new Date().toISOString(), actorId: String(req.user!.id), reason: item.reason, replacementId: id, fromGuardId: roster.guardId, toGuardId: item.replacementGuardId }]; roster.guardId = item.replacementGuardId; roster.status = "SCHEDULED"; if (usingMongo()) await roster.save(); }
    item.status = parsed.data.decision; item.approvedBy = String(req.user!.id); item.approvedAt = usingMongo() ? new Date() : new Date().toISOString(); item.decisionReason = parsed.data.reason.trim(); if (usingMongo()) await item.save(); await recordAudit(req.user!.id, "REPLACEMENT_DECISION", "Replacement", id, { decision: item.status, reason: item.decisionReason }); return res.json({ success: true, data: { replacement: object(item), roster: object(roster) } });
  } catch (error) { return next(error); }
});

router.get("/overtime", requireAuth, async (req, res, next) => {
  try { const guardId = req.user?.role === "GUARD" ? guardIdForUser(req.user) : String(req.query.guardId ?? ""); const records: any[] = usingMongo() ? await OvertimeModel.find({ ...operationalFilter(req), ...(guardId ? { guardId } : {}) }).sort({ businessDate: -1 }) : db.overtime.filter((item) => (!guardId || item.guardId === guardId) && visibleOperation(req, item)); return res.json({ success: true, data: { overtime: objects(records) } }); } catch (error) { return next(error); }
});

router.post("/overtime", requireAuth, requireRoles("GUARD", "MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = z.object({ guardId: z.string().optional(), siteId: z.string().min(1), rosterId: z.string().optional(), businessDate: z.string(), hours: z.coerce.number().positive().max(24), reason: z.string().min(3).max(1000) }).safeParse(req.body); if (!parsed.success || !validBusinessDate(parsed.success ? parsed.data.businessDate : "")) return res.status(400).json({ success: false, error: "INVALID_OVERTIME" }); const guardId = req.user?.role === "GUARD" ? guardIdForUser(req.user) : String(parsed.data.guardId ?? ""); const guard: any = await findGuard(guardId); if (!guard || (req.user?.role === "GUARD" ? guardId !== guardIdForUser(req.user) : req.user?.role === "MAIN_SECURITY" && !canAccessSite(req.user, parsed.data.siteId)) || String(guard.assignedSite ?? "") !== parsed.data.siteId) return res.status(403).json({ success: false, error: "FORBIDDEN" }); if (parsed.data.rosterId) { const roster: any = await findRoster(parsed.data.rosterId); if (!roster || String(roster.guardId) !== guardId || String(roster.siteId) !== parsed.data.siteId || String(roster.businessDate) !== parsed.data.businessDate) return res.status(400).json({ success: false, error: "INVALID_ROSTER" }); }
    const value = { guardId, siteId: parsed.data.siteId, rosterId: parsed.data.rosterId, businessDate: parsed.data.businessDate, hours: parsed.data.hours, reason: parsed.data.reason.trim(), status: "PENDING" as const, requestedBy: String(req.user!.id) }; if (usingMongo()) { const item = await OvertimeModel.create({ _id: makeId("overtime"), ...value }); await recordAudit(req.user!.id, "OVERTIME_REQUESTED", "Overtime", recordId(item), value); return res.status(201).json({ success: true, data: { overtime: object(item) } }); } const item: OvertimeRecord = { id: newId("overtime"), ...value, status: "PENDING", requestedBy: String(req.user!.id) }; db.overtime.unshift(item); await recordAudit(req.user!.id, "OVERTIME_REQUESTED", "Overtime", item.id, value); return res.status(201).json({ success: true, data: { overtime: item } });
  } catch (error) { return next(error); }
});

router.patch("/overtime/:id/decision", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try { const id = routeParam(req.params.id); const parsed = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().min(3).max(500) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, error: "INVALID_OVERTIME_DECISION" }); const item: any = usingMongo() ? await OvertimeModel.findById(id) : db.overtime.find((value) => value.id === id); if (!item || !canAccessSite(req.user, String(item.siteId))) return res.status(404).json({ success: false, error: "OVERTIME_NOT_FOUND" }); if (item.status !== "PENDING") return res.status(409).json({ success: false, error: "OVERTIME_ALREADY_DECIDED" }); item.status = parsed.data.decision; item.approvedBy = String(req.user!.id); item.approvedAt = usingMongo() ? new Date() : new Date().toISOString(); item.decisionReason = parsed.data.reason.trim(); if (usingMongo()) await item.save(); await recordAudit(req.user!.id, "OVERTIME_DECISION", "Overtime", id, { decision: item.status, reason: item.decisionReason }); return res.json({ success: true, data: { overtime: object(item) } }); } catch (error) { return next(error); }
});

router.get("/operations/dashboard", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const businessDate = String(req.query.businessDate ?? indiaBusinessDate(new Date())); if (!validBusinessDate(businessDate)) return res.status(400).json({ success: false, error: "INVALID_BUSINESS_DATE" }); const siteFilter = req.user?.role === "MAIN_SECURITY" ? { _id: { $in: req.user.assignedSiteIds ?? [] } } : {};
    const sites: any[] = usingMongo() ? await SiteModel.find({ ...siteFilter, status: { $ne: "CLOSED" } }) : db.sites.filter((item) => item.status !== "CLOSED" && canAccessSite(req.user, item.id)); const siteIds = sites.map(recordId); const rosterFilter: any = { businessDate, siteId: { $in: siteIds }, status: { $nin: ["CANCELLED"] } }; const { start, end } = indiaDayUtcRange(new Date(`${businessDate}T00:00:00+05:30`)); const [rosters, attendance, incidents, leaveRequests] = usingMongo() ? await Promise.all([RosterModel.find(rosterFilter), AttendanceModel.find({ siteId: { $in: siteIds }, receivedAt: { $gte: start, $lt: end } }), IncidentModel.find({ siteId: { $in: siteIds }, status: { $in: ["OPEN", "ACKNOWLEDGED", "REOPENED"] } }), LeaveRequestModel.find({ status: "PENDING" })]) : [db.rosters.filter((item) => siteIds.includes(item.siteId) && item.businessDate === businessDate && item.status !== "CANCELLED"), db.attendance.filter((item) => siteIds.includes(item.siteId) && new Date(item.receivedAt) >= start && new Date(item.receivedAt) < end), db.incidents.filter((item) => siteIds.includes(item.siteId) && ["OPEN", "ACKNOWLEDGED", "REOPENED"].includes(item.status)), db.leaveRequests.filter((item) => item.status === "PENDING")];
    const activeAttendance = new Set(attendance.filter((item: any) => ["verified", "needs_review", "VERIFIED", "MANUAL_REVIEW"].includes(String(item.verificationStatus ?? item.status))).map((item: any) => String(item.guardId))); const guards: any[] = usingMongo() ? await GuardModel.find({ assignedSite: { $in: siteIds }, employmentStatus: "ACTIVE" }) : db.guards.filter((item) => siteIds.includes(String(item.assignedSite)) && item.employmentStatus === "ACTIVE"); const rows = sites.map((site) => { const id = recordId(site); const siteRosters = rosters.filter((item: any) => String(item.siteId) === id); const siteGuards = guards.filter((item: any) => String(item.assignedSite) === id); const openIncidents = incidents.filter((item: any) => String(item.siteId) === id); const expected = Number(site.requiredShiftCoverage ?? site.approvedGuardStrength ?? siteRosters.length); return { siteCode: site.siteCode, siteName: site.siteName, assignedGuards: siteGuards.length, expectedCoverage: expected, rostered: siteRosters.length, attendanceSubmitted: siteRosters.filter((item: any) => activeAttendance.has(String(item.guardId))).length, pendingAttendance: Math.max(0, siteRosters.length - siteRosters.filter((item: any) => activeAttendance.has(String(item.guardId))).length), shortage: Math.max(0, expected - siteRosters.length), openIncidents: openIncidents.length }; });
    const upcoming: any[] = usingMongo() ? await RosterModel.find({ siteId: { $in: siteIds }, businessDate: { $gte: businessDate }, status: { $nin: ["CANCELLED"] } }).sort({ businessDate: 1, startAt: 1 }).limit(20) : db.rosters.filter((item) => siteIds.includes(item.siteId) && item.businessDate >= businessDate && item.status !== "CANCELLED").sort((a, b) => `${a.businessDate}${a.startAt}`.localeCompare(`${b.businessDate}${b.startAt}`)).slice(0, 20); return res.json({ success: true, data: { businessDate, summary: { sites: rows.length, rostered: rosters.length, attendanceSubmitted: attendance.length, pendingAttendance: Math.max(0, rosters.length - attendance.length), openIncidents: incidents.length, pendingLeaveRequests: leaveRequests.filter((item: any) => !siteIds.length || guards.some((guard: any) => String(guard._id ?? guard.id) === String(item.guardId))).length }, sites: rows, upcomingChanges: objects(upcoming), escalationQueue: objects(incidents).slice(0, 20) } });
  } catch (error) { return next(error); }
});

router.get("/attendance/today", requireAuth, async (req, res, next) => {
  try {
    const guardId = guardIdForUser(req.user);
    if (req.user?.role === "GUARD" && !guardId) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    if (!guardId) {
      const { start, end } = dateRange();
      const records: any[] = usingMongo()
        ? await AttendanceModel.find({
            ...operationalFilter(req), capturedAt: { $gte: start, $lt: end },
          }).sort({ capturedAt: -1 })
        : db.attendance.filter(
            (item) =>
              visibleOperation(req, item) && new Date(item.capturedAt) >= start &&
              new Date(item.capturedAt) < end,
          );
      return res.json({
        success: true,
        data: { attendance: publicAttendances(records) },
      });
    }
    const active: any = await findActiveShift(guardId);
    const { start, end } = dateRange();
    let completed: any;
    let records: any[];
    if (usingMongo()) {
      completed = await ShiftModel.findOne({
        guardId,
        status: "COMPLETED",
        $or: [
          { startedAt: { $gte: start, $lt: end } },
          { endedAt: { $gte: start, $lt: end } },
        ],
      }).sort({ endedAt: -1, startedAt: -1 });
      records = await AttendanceModel.find(
        active
          ? { guardId, shiftId: active._id }
          : { guardId, capturedAt: { $gte: start, $lt: end } },
      ).sort({ capturedAt: 1 });
    } else {
      completed = db.shifts
        .filter(
          (shift) =>
            shift.guardId === guardId &&
            shift.status === "COMPLETED" &&
            ((new Date(shift.startedAt) >= start &&
              new Date(shift.startedAt) < end) ||
              (shift.endedAt &&
                new Date(shift.endedAt) >= start &&
                new Date(shift.endedAt) < end)),
        )
        .sort(
          (a, b) =>
            new Date(b.endedAt ?? b.startedAt).getTime() -
            new Date(a.endedAt ?? a.startedAt).getTime(),
        )[0];
      records = db.attendance
        .filter(
          (item) =>
            item.guardId === guardId &&
            (active
              ? item.shiftId === active.id
              : new Date(item.capturedAt) >= start &&
                new Date(item.capturedAt) < end),
        )
        .sort(
          (a, b) =>
            new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
        );
    }
    const verification: any = await findActiveVerification(guardId);
    return res.json({
      success: true,
      data: {
        state: attendanceState(records, active, completed),
        attendance: publicAttendances(records),
        shift: active
          ? object(active)
          : completed
            ? object(completed)
            : undefined,
        activeVerification: verification ? object(verification) : undefined,
      },
    });
  } catch (error) {
    return next(error);
  }
});
router.get(
  "/shifts/mine",
  requireAuth,
  requireRoles("GUARD"),
  async (req, res, next) => {
    try {
      const guardId = guardIdForUser(req.user);
      const page = requestedPage(req.query);
      const filter = { guardId };
      const result = usingMongo() ? await mongoPage(ShiftModel, filter, { startedAt: -1, _id: -1 }, page, 60) : memoryPage(db.shifts.filter((shift) => shift.guardId === guardId).slice().sort((a,b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime() || b.id.localeCompare(a.id)), page, 60);
      const shifts: any[] = result.records;
      const completedCount = page === undefined ? undefined : usingMongo() ? await ShiftModel.countDocuments({ guardId, status: "COMPLETED" }) : db.shifts.filter((shift) => shift.guardId === guardId && shift.status === "COMPLETED").length;
      const records: any[] = usingMongo()
        ? await AttendanceModel.find({
            guardId,
            shiftId: { $in: shifts.map((item) => String(item._id)) },
          }).sort({ capturedAt: 1 })
        : db.attendance.filter(
            (item) =>
              item.guardId === guardId &&
              item.shiftId &&
              shifts.some((shift) => shift.id === item.shiftId),
          );
      const byShift = new Map<string, any[]>();
      records.forEach((record) => {
        const id = String(record.shiftId);
        byShift.set(id, [...(byShift.get(id) ?? []), publicAttendance(record)]);
      });
      return res.json({
        success: true,
        data: {
          ...(result.pagination ? { pagination: result.pagination, completedCount } : {}),
          shifts: shifts.map((shift) => ({
            ...object(shift),
            attendance: byShift.get(String(shift._id ?? shift.id)) ?? [],
          })),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);
router.get("/attendance/history", requireAuth, async (req, res, next) => {
  try {
    const guardId = req.user?.role === "GUARD" ? req.user.guardId : String(req.query.guardId ?? "");
    if (req.user?.role === "GUARD" && !guardId) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const page = requestedPage(req.query);
    const requestedLimit = Number(req.query.limit ?? 0);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 0), 50) : 0;
    const search = page === undefined ? "" : String(req.query.search ?? "").trim();
    const status = page === undefined ? "ALL" : String(req.query.status ?? "ALL");
    const statusValue = status === "PENDING" ? "MANUAL_REVIEW" : status;
    const baseFilter: any = { ...operationalFilter(req), ...(guardId ? { guardId } : {}), ...(req.query.legacy === "true" ? { type: { $ne: "DUTY_PHOTO" } } : {}) };
    const hasFlags = { $gt: [{ $size: { $cond: [{ $isArray: "$reviewFlags" }, "$reviewFlags", []] } }, 0] };
    let result: { records: any[]; pagination?: import("../shared/pagination.js").Pagination };
    let summary: any;
    if (usingMongo()) {
      if (search) {
        const literal = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = { $regex: literal, $options: "i" };
        const [guardMatches, siteMatches] = await Promise.all([GuardModel.find({ name: pattern }).select({ _id: 1 }).lean(), SiteModel.find({ $or: [{ siteCode: pattern }, { siteName: pattern }] }).select({ _id: 1 }).lean()]);
        baseFilter.$and = [...(baseFilter.$and ?? []), { $or: [{ _id: pattern }, { type: pattern }, { guardId: { $in: guardMatches.map((item: any) => String(item._id)) } }, { siteId: { $in: siteMatches.map((item: any) => String(item._id)) } }] }];
      }
      const filter = { ...baseFilter, ...(status === "FLAGGED" ? { $expr: hasFlags } : status !== "ALL" ? { status: statusValue } : {}) };
      result = await mongoPage(AttendanceModel, filter, { capturedAt: -1, _id: -1 }, page, limit || undefined);
      if (page !== undefined) {
        const totals = await AttendanceModel.aggregate([{ $match: baseFilter }, { $group: { _id: null, total: { $sum: 1 }, verified: { $sum: { $cond: [{ $eq: ["$status", "VERIFIED"] }, 1, 0] } }, pending: { $sum: { $cond: [{ $eq: ["$status", "MANUAL_REVIEW"] }, 1, 0] } }, flagged: { $sum: { $cond: [hasFlags, 1, 0] } } } }]);
        summary = totals[0] ?? { total: 0, verified: 0, pending: 0, flagged: 0 };
      }
      const [guards, sites] = await Promise.all([GuardModel.find({ _id: { $in: [...new Set(result.records.map((item) => String(item.guardId)))] } }), SiteModel.find({ _id: { $in: [...new Set(result.records.map((item) => String(item.siteId)))] } })]);
      const guardMap = new Map(guards.map((item: any) => [recordId(item), item.name]));
      const siteMap = new Map(sites.map((item: any) => [recordId(item), item]));
      result.records = result.records.map((item) => ({ ...publicAttendance(item), guardId: String(item.guardId), guard: guardMap.get(String(item.guardId)), site: siteMap.get(String(item.siteId))?.siteCode, siteName: siteMap.get(String(item.siteId))?.siteName }));
    } else {
      const scoped = db.attendance.filter((item) => visibleOperation(req, item) && (!guardId || item.guardId === guardId) && (req.query.legacy !== "true" || item.type !== "DUTY_PHOTO")).map((item) => ({ ...publicAttendance(item), guard: db.guards.find((guard) => guard.id === item.guardId)?.name, site: db.sites.find((site) => site.id === item.siteId)?.siteCode, siteName: db.sites.find((site) => site.id === item.siteId)?.siteName })).filter((item) => !search || [item.guard, item.site, item.siteName, item.id, item.type].some((value) => String(value ?? "").toLowerCase().includes(search.toLowerCase())));
      summary = page === undefined ? undefined : { total: scoped.length, verified: scoped.filter((item) => item.status === "VERIFIED").length, pending: scoped.filter((item) => item.status === "MANUAL_REVIEW").length, flagged: scoped.filter((item) => item.reviewFlags?.length).length };
      const matching = scoped.filter((item) => status === "ALL" || (status === "FLAGGED" ? Boolean(item.reviewFlags?.length) : item.status === statusValue)).sort((a,b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime() || String(b.id).localeCompare(String(a.id)));
      result = memoryPage(matching, page, limit || undefined);
    }
    return res.json({ success: true, data: { attendance: result.records, ...(result.pagination ? { pagination: result.pagination, summary } : {}) } });
  } catch (error) { return next(error); }
});
if (false)
  router.get("/attendance/today", requireAuth, async (req, res, next) => {
    try {
      const guardId = req.user?.guardId;
      if (usingMongo()) {
        const { start, end } = dateRange();
        return res.json({
          success: true,
          data: {
            attendance: publicAttendances(
              await AttendanceModel.find({
                ...(guardId ? { guardId } : {}),
                capturedAt: { $gte: start, $lt: end },
              }),
            ),
          },
        });
      }
      return res.json({
        success: true,
        data: {
          attendance: db.attendance.filter(
            (item) =>
              (!guardId || item.guardId === guardId) &&
              item.capturedAt.slice(0, 10) ===
                new Date().toISOString().slice(0, 10),
          ),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

router.get("/incidents", requireAuth, async (req, res, next) => {
  try {
    const page = requestedPage(req.query);
    const result = usingMongo()
      ? await mongoPage(IncidentModel, operationalFilter(req), { capturedAt: -1, _id: -1 }, page)
      : memoryPage(db.incidents.filter(
          (item) =>
            visibleOperation(req, item),
        ).slice().sort((a,b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime() || b.id.localeCompare(a.id)), page);
    const records: any[] = result.records;
    if (usingMongo())
      return res.json({
        success: true,
        data: { ...(result.pagination ? { pagination: result.pagination } : {}), incidents: await withLabels(records) },
      });
    return res.json({
      success: true,
      data: {
        ...(result.pagination ? { pagination: result.pagination } : {}),
        incidents: records.map((item) => ({
          ...item,
          guard: db.guards.find((guard) => guard.id === item.guardId)?.name,
          site: db.sites.find((site) => site.id === item.siteId)?.siteCode,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
});
async function withLabels(records: any[]) {
  const guardIds = [...new Set(records.map((item) => String(item.guardId)))];
  const siteIds = [...new Set(records.map((item) => String(item.siteId)))];
  const [guards, sites] = await Promise.all([
    GuardModel.find({ _id: { $in: guardIds } }),
    SiteModel.find({ _id: { $in: siteIds } }),
  ]);
  const guardMap = new Map(
    guards.map((item: any) => [String(item._id), item.name]),
  );
  const siteMap = new Map(
    sites.map((item: any) => [String(item._id), item.siteCode]),
  );
  return records.map((item) => ({
    ...object(item),
    guard: guardMap.get(String(item.guardId)),
    site: siteMap.get(String(item.siteId)),
  }));
}
router.post(
  "/incidents",
  requireAuth,
  requireRoles("GUARD"),
  async (req, res, next) => {
    try {
      const guard: any = await guardForUser(req.user);
      if (guard?.employmentStatus === "INACTIVE") return res.status(403).json({ success: false, error: "FORBIDDEN" });
      const active: any = await findActiveShift(
        String(guard?._id ?? guard?.id),
      );
      if (!guard?.assignedSite)
        return res
          .status(400)
          .json({ success: false, error: "NO_ASSIGNED_SITE" });
      const parsed = z
        .object({
          category: z.enum([
            "THEFT",
            "LOCK_DAMAGE",
            "FENCE_DAMAGE",
            "SUSPICIOUS_ACTIVITY",
            "EQUIPMENT_DAMAGE",
            "OTHER",
          ]),
          description: z.string().max(1000).optional(),
          photo: z.string().optional(),
          severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
          priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
          witnesses: z.array(z.unknown()).max(20).optional(),
          attachments: z.array(z.unknown()).max(20).optional(),
          recurrenceKey: z.string().max(120).optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ success: false, error: "INVALID_INCIDENT" });
      const value = {
        guardId: guard._id ?? guard.id,
        siteId: guard.assignedSite,
        shiftId: active?._id ?? active?.id,
        category: parsed.data.category,
        description: parsed.data.description ?? "",
        status: "OPEN",
        capturedAt: new Date(),
        photo: parsed.data.photo,
        severity: parsed.data.severity ?? "MEDIUM",
        priority: parsed.data.priority ?? "NORMAL",
        witnesses: parsed.data.witnesses,
        attachments: parsed.data.attachments,
        recurrenceKey: parsed.data.recurrenceKey,
        activity: [{ type: "CREATED", at: new Date().toISOString(), actorId: String(req.user?.id), note: "Incident reported" }],
      };
      if (usingMongo()) {
        const incident: any = await IncidentModel.create({
          _id: makeId("incident"),
          ...value,
        });
        await recordAudit(
          String(req.user?.id),
          "INCIDENT_CREATED",
          "Incident",
          String(incident._id),
          { category: value.category },
        );
        return res
          .status(201)
          .json({ success: true, data: { incident: object(incident) } });
      }
      const incident = {
        id: newId("incident"),
        ...value,
        capturedAt: value.capturedAt.toISOString(),
      } as any;
      db.incidents.unshift(incident);
      audit(String(req.user?.id), "INCIDENT_CREATED", "Incident", incident.id, {
        category: value.category,
      });
      addActivity(
        "Incident reported",
        `${guard.name} - ${value.category}`,
        "incident",
      );
      return res.status(201).json({ success: true, data: { incident } });
    } catch (error) {
      return next(error);
    }
  },
);
router.patch(
  "/incidents/:id",
  requireAuth,
  requireRoles("MAIN_SECURITY", "ADMIN"),
  async (req, res, next) => {
    try {
      const parsed = z.object({
        status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "REOPENED"]).optional(),
        severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
        priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
        assignedOfficerId: z.string().nullable().optional(),
        comment: z.string().min(2).max(1000).optional(),
        handoverNotes: z.string().max(2000).optional(),
        correctiveActions: z.string().max(2000).optional(),
        preventiveActions: z.string().max(2000).optional(),
        resolutionEvidence: z.unknown().optional(),
        followUpTasks: z.array(z.unknown()).max(30).optional(),
        reopenedReason: z.string().min(3).max(500).optional(),
        decisionReason: z.string().max(500).optional(),
      }).strict().safeParse(req.body);
      if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, error: "INVALID_INCIDENT_UPDATE" });
      const id = routeParam(req.params.id);
      const incident: any = usingMongo()
        ? await IncidentModel.findOne({ _id: id, ...operationalFilter(req) })
        : db.incidents.find((item) => item.id === id && visibleOperation(req, item));
      if (!incident)
        return res
          .status(404)
          .json({ success: false, error: "INCIDENT_NOT_FOUND" });
      if (parsed.data.status === "REOPENED" && !parsed.data.reopenedReason) return res.status(400).json({ success: false, error: "REOPEN_REASON_REQUIRED" });
      if (parsed.data.status === "RESOLVED" && !parsed.data.resolutionEvidence && !parsed.data.decisionReason) return res.status(400).json({ success: false, error: "RESOLUTION_EVIDENCE_REQUIRED" });
      const now = new Date();
      const activity = { type: parsed.data.status ? `STATUS_${parsed.data.status}` : "UPDATED", at: now.toISOString(), actorId: String(req.user!.id), note: parsed.data.comment ?? parsed.data.decisionReason };
      const update: any = { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.severity ? { severity: parsed.data.severity } : {}), ...(parsed.data.priority ? { priority: parsed.data.priority } : {}), ...(parsed.data.assignedOfficerId !== undefined ? { assignedOfficerId: parsed.data.assignedOfficerId ?? undefined } : {}), ...(parsed.data.handoverNotes !== undefined ? { handoverNotes: parsed.data.handoverNotes } : {}), ...(parsed.data.correctiveActions !== undefined ? { correctiveActions: parsed.data.correctiveActions } : {}), ...(parsed.data.preventiveActions !== undefined ? { preventiveActions: parsed.data.preventiveActions } : {}), ...(parsed.data.resolutionEvidence !== undefined ? { resolutionEvidence: parsed.data.resolutionEvidence } : {}), ...(parsed.data.followUpTasks !== undefined ? { followUpTasks: parsed.data.followUpTasks } : {}), ...(parsed.data.reopenedReason ? { reopenedReason: parsed.data.reopenedReason } : {}), ...(parsed.data.status === "ACKNOWLEDGED" ? { acknowledgedAt: now } : {}), ...(parsed.data.status === "REOPENED" ? { escalatedAt: now } : {}), ...(parsed.data.status === "RESOLVED" && req.user?.role === "ADMIN" ? { closureVerifiedBy: String(req.user.id) } : {}) };
      if (parsed.data.status === "RESOLVED" && parsed.data.decisionReason) update.resolutionEvidence = parsed.data.resolutionEvidence ?? { note: parsed.data.decisionReason };
      if (usingMongo()) { Object.assign(incident, update); incident.comments = [...(incident.comments ?? []), ...(parsed.data.comment ? [{ at: now, actorId: String(req.user!.id), text: parsed.data.comment }] : [])]; incident.activity = [...(incident.activity ?? []), activity]; await incident.save(); }
      else { Object.assign(incident, { ...update, ...(update.acknowledgedAt ? { acknowledgedAt: now.toISOString() } : {}), ...(update.escalatedAt ? { escalatedAt: now.toISOString() } : {}) }); incident.comments = [...(incident.comments ?? []), ...(parsed.data.comment ? [{ at: now.toISOString(), actorId: String(req.user!.id), text: parsed.data.comment }] : [])]; incident.activity = [...(incident.activity ?? []), activity]; }
      await recordAudit(req.user!.id, "INCIDENT_UPDATED", "Incident", id, { status: incident.status, severity: incident.severity, priority: incident.priority, reason: parsed.data.decisionReason ?? parsed.data.reopenedReason });
      return res.json({ success: true, data: { incident: object(incident) } });
    } catch (error) {
      return next(error);
    }
  },
);

const moneyCents = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};
const centsMoney = (value: number) => Number((value / 100).toFixed(2));
const payrollPeriod = (body: any) => {
  const month = Number(body.month);
  const year = Number(body.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2200) return undefined;
  const from = body.from ? String(body.from) : `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = body.to ? String(body.to) : `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const fromInstant = new Date(`${from}T12:00:00+05:30`); const toInstant = new Date(`${to}T12:00:00+05:30`);
  if (!Number.isFinite(fromInstant.getTime()) || !Number.isFinite(toInstant.getTime()) || toInstant < fromInstant) return undefined;
  return { month, year, from, to, start: indiaDayUtcRange(fromInstant).start, end: indiaDayUtcRange(toInstant).end };
};
const safeSalary = (salary: any, guardName?: string) => {
  const item = object(salary);
  delete item.payslipStorageKey;
  return { ...item, guard: guardName };
};
async function payrollGuards(req: express.Request, body: any) {
  const requested = Array.isArray(body.guardIds) ? body.guardIds.map(String) : undefined;
  const guards: any[] = usingMongo() ? await GuardModel.find({ employmentStatus: { $nin: ["RESIGNED", "EXITED"] } }) : db.guards.filter((guard) => !["RESIGNED", "EXITED"].includes(guard.employmentStatus));
  return guards.filter((guard) => {
    const id = recordId(guard);
    if (requested && !requested.includes(id)) return false;
    if (req.user?.role === "MAIN_SECURITY" && !canAccessSite(req.user, guard.assignedSite ? String(guard.assignedSite) : undefined)) return false;
    return true;
  });
}
async function payrollRows(req: express.Request, body: any) {
  const period = payrollPeriod(body);
  if (!period) return { error: "INVALID_PAYROLL_PERIOD" as const };
  const policy = body.policy && typeof body.policy === "object" ? body.policy : {};
  const guards = await payrollGuards(req, body);
  const rows = [] as any[];
  for (const guard of guards) {
    const guardId = recordId(guard);
    const attendance: any[] = usingMongo()
      ? await AttendanceModel.find({ guardId, capturedAt: { $gte: period.start, $lte: period.end } })
      : db.attendance.filter((item) => item.guardId === guardId && new Date(item.capturedAt).getTime() >= period.start.getTime() && new Date(item.capturedAt).getTime() <= period.end.getTime());
    const payableDates = new Set(attendance.filter((item) => item.verificationStatus === "verified" || ["VERIFIED", "CORRECTED"].includes(String(item.status))).map((item) => indiaBusinessDate(new Date(item.capturedAt ?? item.receivedAt))));
    const overtime: any[] = usingMongo() ? await OvertimeModel.find({ guardId, status: "APPROVED", businessDate: { $gte: period.from, $lte: period.to } }) : db.overtime.filter((item) => item.guardId === guardId && item.status === "APPROVED" && item.businessDate >= period.from && item.businessDate <= period.to);
    const overtimeHours = overtime.reduce((sum, item) => sum + Number(item.hours ?? 0), 0);
    const basic = moneyCents(policy.basicSalary ?? guard.monthlySalary ?? 0);
    const overtimeRate = Number(policy.overtimeRate ?? 0);
    const overtimeAmount = Number.isFinite(overtimeRate) ? Math.round(overtimeHours * overtimeRate * 100) : 0;
    const holidayPay = moneyCents(policy.holidayPay);
    const allowances = moneyCents(policy.allowances);
    const advances = moneyCents(policy.advances);
    const deductions = moneyCents(policy.deductions);
    const arrears = moneyCents(policy.arrears);
    const net = basic + overtimeAmount + holidayPay + allowances + arrears - advances - deductions;
    rows.push({ guardId, guard: guard.name, month: period.month, year: period.year, payPeriodStart: period.from, payPeriodEnd: period.to, basicSalary: centsMoney(basic), baseSalary: centsMoney(basic), payableDays: payableDates.size, attendanceDays: payableDates.size, scheduledDays: payableDates.size, overtimeHours: Number(overtimeHours.toFixed(2)), overtimeAmount: centsMoney(overtimeAmount), holidayPay: centsMoney(holidayPay), allowances: centsMoney(allowances), advances: centsMoney(advances), deductions: centsMoney(deductions), arrears: centsMoney(arrears), adjustments: centsMoney(overtimeAmount + holidayPay + allowances + arrears - advances - deductions), netPayable: centsMoney(Math.max(0, net)), finalSalary: centsMoney(Math.max(0, net)), currency: "INR", calculationPolicyVersion: String(policy.version ?? "explicit-inputs-v1") });
  }
  return { period, rows };
}

router.get(
  "/salaries",
  requireAuth,
  requireRoles("GUARD", "ADMIN"),
  async (req, res, next) => {
    try {
      if (req.user?.role === "GUARD" && !req.user.guardId) return res.status(403).json({ success: false, error: "FORBIDDEN" });
      const filter: any =
        req.user?.role === "GUARD"
          ? { guardId: req.user.guardId }
          : req.query.guardId
            ? { guardId: String(req.query.guardId) }
            : {};
      if (usingMongo()) {
        const records: any[] = await SalaryModel.find(filter).sort({
          year: -1,
          month: -1,
        });
        const guards = new Map(
          objects(
            await GuardModel.find({
              _id: { $in: [...new Set(records.map((item) => item.guardId))] },
            }),
          ).map((item: any) => [item.id, item.name]),
        );
        return res.json({
          success: true,
          data: {
            salaries: records.map((item) => ({
              ...object(item),
              guard: guards.get(String(item.guardId)),
            })),
          },
        });
      }
      return res.json({
        success: true,
        data: {
          salaries: db.salaries
            .filter((item) => !filter.guardId || (filter.guardId.$in ? filter.guardId.$in.includes(item.guardId) : item.guardId === filter.guardId))
            .map((item) => ({
              ...item,
              guard: db.guards.find((guard) => guard.id === item.guardId)?.name,
            })),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);
router.post(
  "/salaries/:id/mark-paid",
  requireAuth,
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      if (usingMongo()) {
        const salary: any = await SalaryModel.findById(id);
        if (!salary)
          return res
            .status(404)
            .json({ success: false, error: "SALARY_NOT_FOUND" });
        if (salary.status === "PAID")
          return res
            .status(409)
            .json({ success: false, error: "ALREADY_PAID" });
        if (salary.calculationPolicyVersion && salary.workflowStatus !== "LOCKED") return res.status(409).json({ success: false, error: "PAYROLL_MUST_BE_LOCKED_BEFORE_PAYMENT" });
        salary.status = "PAID";
        salary.workflowStatus = salary.workflowStatus ? "PAID" : undefined;
        salary.paidAt = new Date();
        salary.paidBy = req.user?.id;
        await salary.save();
        await recordAudit(req.user!.id, "SALARY_PAID", "Salary", id, { guardId: String(salary.guardId) });
        return res.json({ success: true, data: { salary: object(salary) } });
      }
      const salary = db.salaries.find((item) => item.id === id);
      if (!salary)
        return res
          .status(404)
          .json({ success: false, error: "SALARY_NOT_FOUND" });
      if (salary.status === "PAID")
        return res.status(409).json({ success: false, error: "ALREADY_PAID" });
      if (salary.calculationPolicyVersion && salary.workflowStatus !== "LOCKED") return res.status(409).json({ success: false, error: "PAYROLL_MUST_BE_LOCKED_BEFORE_PAYMENT" });
      salary.status = "PAID";
      salary.workflowStatus = salary.workflowStatus ? "PAID" : undefined;
      salary.paidAt = new Date().toISOString();
      salary.paidBy = req.user?.id;
      await recordAudit(req.user!.id, "SALARY_PAID", "Salary", id, { guardId: salary.guardId });
      return res.json({ success: true, data: { salary } });
    } catch (error) {
      return next(error);
    }
  },
);
router.post(
  "/salaries/:id/correct",
  requireAuth,
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      if (typeof req.body.reason !== "string" || !req.body.reason.trim() || req.body.reason.length > 500)
        return res
          .status(400)
          .json({ success: false, error: "CORRECTION_REASON_REQUIRED" });
      const validAmount = (value: unknown) => (typeof value === "number" || (typeof value === "string" && Boolean(value.trim()))) && Number.isFinite(Number(value));
      if ((req.body.finalSalary !== undefined && !validAmount(req.body.finalSalary)) ||
          (req.body.adjustments !== undefined && !validAmount(req.body.adjustments)))
        return res.status(400).json({ success: false, error: "INVALID_SALARY_CORRECTION" });
      const id = routeParam(req.params.id);
      await recordAudit(req.user!.id, "SALARY_CORRECTION_REQUESTED", "Salary", id, {
        justification: req.body.reason.trim(),
        ...(req.body.finalSalary !== undefined ? { finalSalary: Number(req.body.finalSalary) } : {}),
        ...(req.body.adjustments !== undefined ? { adjustments: Number(req.body.adjustments) } : {}),
      });
      if (usingMongo()) {
        const existing: any = await SalaryModel.findById(id);
        if (!existing) return res.status(404).json({ success: false, error: "SALARY_NOT_FOUND" });
        if (existing.status === "PAID" || ["LOCKED", "PAID", "RECONCILED"].includes(String(existing.workflowStatus))) return res.status(409).json({ success: false, error: "PAYROLL_LOCKED_CORRECTION_REQUESTED" });
        existing.finalSalary = Number(req.body.finalSalary ?? existing.finalSalary);
        existing.adjustments = Number(req.body.adjustments ?? existing.adjustments ?? 0);
        existing.correctionHistory = [...(existing.correctionHistory ?? []), { requestedBy: req.user!.id, reason: req.body.reason.trim(), requestedAt: new Date().toISOString() }];
        const salary: any = await existing.save();
        if (!salary)
          return res
            .status(404)
            .json({ success: false, error: "SALARY_NOT_FOUND" });
        await recordAudit(req.user!.id, "SALARY_CORRECTED", "Salary", id, { justification: req.body.reason.trim() });
        return res.json({ success: true, data: { salary: object(salary) } });
      }
      const salary = db.salaries.find((item) => item.id === id);
      if (!salary)
        return res
          .status(404)
          .json({ success: false, error: "SALARY_NOT_FOUND" });
      if (salary.status === "PAID" || ["LOCKED", "PAID", "RECONCILED"].includes(String(salary.workflowStatus))) return res.status(409).json({ success: false, error: "PAYROLL_LOCKED_CORRECTION_REQUESTED" });
      salary.finalSalary = Number(req.body.finalSalary ?? salary.finalSalary);
      salary.adjustments = Number(req.body.adjustments ?? salary.adjustments);
      salary.correctionHistory = [...(salary.correctionHistory ?? []), { requestedBy: req.user!.id, reason: req.body.reason.trim(), requestedAt: new Date().toISOString() }];
      await recordAudit(req.user!.id, "SALARY_CORRECTED", "Salary", id, { justification: req.body.reason.trim() });
      return res.json({ success: true, data: { salary } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post("/payroll/preview", requireAuth, requireRoles("ADMIN"), async (req, res, next) => {
  try {
    const result = await payrollRows(req, req.body ?? {});
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    return res.json({ success: true, data: { period: result.period, rows: result.rows, policy: "No statutory rates assumed; only explicit company inputs are applied." } });
  } catch (error) { return next(error); }
});

router.post("/payroll/run", requireAuth, requireRoles("ADMIN"), async (req, res, next) => {
  try {
    const result = await payrollRows(req, req.body ?? {});
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    const output: any[] = [];
    for (const row of result.rows) {
      if (usingMongo()) {
        const current: any = await SalaryModel.findOne({ guardId: row.guardId, month: row.month, year: row.year });
        if (current && ["PAID", "LOCKED", "RECONCILED"].includes(String(current.workflowStatus)) || current?.status === "PAID") { output.push(safeSalary(current, row.guard)); continue; }
        const salary: any = current ?? new SalaryModel({ _id: makeId("salary"), guardId: row.guardId, month: row.month, year: row.year });
        Object.assign(salary, { ...row, status: "PENDING", workflowStatus: current?.workflowStatus === "APPROVED" ? "APPROVED" : "REVIEW", approvalHistory: [...(current?.approvalHistory ?? []), { action: "RUN", actor: req.user!.id, at: new Date().toISOString() }] });
        await salary.save(); output.push(safeSalary(salary, row.guard));
      } else {
        const current = db.salaries.find((item) => item.guardId === row.guardId && item.month === row.month && item.year === row.year);
        if (current && (["PAID", "LOCKED", "RECONCILED"].includes(String(current.workflowStatus)) || current.status === "PAID")) { output.push(safeSalary(current, row.guard)); continue; }
        const salary: any = current ?? { id: newId("salary"), guardId: row.guardId, month: row.month, year: row.year, attendanceDays: 0, baseSalary: 0, adjustments: 0, finalSalary: 0 };
        Object.assign(salary, { ...row, status: "PENDING", workflowStatus: current?.workflowStatus === "APPROVED" ? "APPROVED" : "REVIEW", approvalHistory: [...(current?.approvalHistory ?? []), { action: "RUN", actor: req.user!.id, at: new Date().toISOString() }] });
        if (!current) db.salaries.unshift(salary);
        output.push(safeSalary(salary, row.guard));
      }
    }
    await recordAudit(req.user!.id, "PAYROLL_RUN", "Payroll", `${result.period.year}-${result.period.month}`, { count: output.length, policyVersion: req.body?.policy?.version ?? "explicit-inputs-v1" });
    return res.status(201).json({ success: true, data: { salaries: output, period: result.period } });
  } catch (error) { return next(error); }
});

router.get("/payroll", requireAuth, requireRoles("GUARD", "ADMIN"), async (req, res, next) => {
  try {
    const guardIds = req.user?.role === "GUARD" ? [req.user.guardId].filter(Boolean) as string[] : undefined;
    const query: any = guardIds ? { guardId: { $in: guardIds } } : (req.query.guardId ? { guardId: String(req.query.guardId) } : {});
    const page = requestedPage(req.query);
    const matching = usingMongo() ? undefined : db.salaries.filter((item) => !query.guardId || (query.guardId.$in ? query.guardId.$in.includes(item.guardId) : item.guardId === query.guardId)).slice().sort((a,b) => b.year - a.year || b.month - a.month || b.id.localeCompare(a.id));
    const result = usingMongo() ? await mongoPage(SalaryModel, query, { year: -1, month: -1, _id: -1 }, page) : memoryPage(matching!, page);
    const records: any[] = result.records;
    let summary: any;
    if (page !== undefined) {
      const latest: any = usingMongo() ? await SalaryModel.findOne(query).sort({ year: -1, month: -1, _id: -1 }) : matching?.[0];
      const totals = usingMongo() ? await SalaryModel.aggregate([{ $match: query }, { $group: { _id: null, totalNet: { $sum: { $ifNull: ["$netPayable", { $ifNull: ["$finalSalary", 0] }] } } } }]) : [{ totalNet: matching!.reduce((sum,item) => sum + Number(item.netPayable ?? item.finalSalary ?? 0), 0) }];
      summary = { totalNet: totals[0]?.totalNet ?? 0, latest: latest ? safeSalary(latest) : undefined };
    }
    const guards = new Map((usingMongo() ? objects(await GuardModel.find({ _id: { $in: [...new Set(records.map((item) => String(item.guardId)))] } })) : db.guards.filter((item) => records.some((salary) => salary.guardId === item.id))).map((item: any) => [String(item.id), item.name]));
    return res.json({ success: true, data: { ...(result.pagination ? { pagination: result.pagination, summary } : {}), salaries: records.map((item) => safeSalary(item, guards.get(String(item.guardId)))) } });
  } catch (error) { return next(error); }
});

router.post("/payroll/bulk-approve", requireAuth, requireRoles("ADMIN"), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 100) : [];
    if (!ids.length || String(req.body?.confirmation ?? "").toUpperCase() !== "APPROVE") return res.status(400).json({ success: false, error: "BULK_CONFIRMATION_REQUIRED" });
    const changed: any[] = [];
    for (const id of ids) {
      const salary: any = usingMongo() ? await SalaryModel.findById(id) : db.salaries.find((item) => item.id === id);
      if (!salary || String(salary.workflowStatus ?? "REVIEW") !== "REVIEW") continue;
      salary.workflowStatus = "APPROVED"; salary.approvedBy = req.user!.id; salary.approvedAt = new Date(); salary.approvalHistory = [...(salary.approvalHistory ?? []), { action: "APPROVED", actor: req.user!.id, at: new Date().toISOString(), reason: req.body.reason }];
      if (usingMongo()) await salary.save(); changed.push(object(salary));
      await recordAudit(req.user!.id, "PAYROLL_BULK_APPROVED", "Salary", id, { reason: req.body.reason });
    }
    return res.json({ success: true, data: { salaries: changed } });
  } catch (error) { return next(error); }
});

router.patch("/payroll/:id/:action", requireAuth, requireRoles("ADMIN"), async (req, res, next) => {
  try {
    const id = routeParam(req.params.id); const action = String(req.params.action);
    const salary: any = usingMongo() ? await SalaryModel.findById(id) : db.salaries.find((item) => item.id === id);
    if (!salary) return res.status(404).json({ success: false, error: "SALARY_NOT_FOUND" });
    if (action === "correction") return res.status(409).json({ success: false, error: "USE_CORRECTION_REQUEST_WITH_REASON" });
    const current = String(salary.workflowStatus ?? (salary.status === "PAID" ? "PAID" : "REVIEW"));
    const expected: Record<string, string> = { approve: "REVIEW", lock: "APPROVED", pay: "LOCKED", reconcile: "PAID" };
    if (expected[action] !== current) return res.status(409).json({ success: false, error: "INVALID_PAYROLL_TRANSITION", current, expected: expected[action] });
    if (action === "pay" && (typeof req.body?.paymentReference !== "string" || req.body.paymentReference.trim().length < 3)) return res.status(400).json({ success: false, error: "PAYMENT_REFERENCE_REQUIRED" });
    const now = new Date(); const nextStatus = action === "approve" ? "APPROVED" : action === "lock" ? "LOCKED" : action === "pay" ? "PAID" : "RECONCILED";
    const history = [...(salary.approvalHistory ?? []), { action: nextStatus, actor: req.user!.id, at: now.toISOString(), reason: req.body?.reason }];
    Object.assign(salary, { workflowStatus: nextStatus, approvalHistory: history, ...(action === "approve" ? { approvedBy: req.user!.id, approvedAt: now } : {}), ...(action === "lock" ? { lockedBy: req.user!.id, lockedAt: now } : {}), ...(action === "pay" ? { status: "PAID", paidBy: req.user!.id, paidAt: now, paymentDate: req.body?.paymentDate ? new Date(req.body.paymentDate) : now, paymentReference: req.body.paymentReference.trim(), partialPaidAmount: req.body?.partialPaidAmount === undefined ? salary.netPayable ?? salary.finalSalary : Number(req.body.partialPaidAmount) } : {}) });
    if (usingMongo()) await salary.save();
    await recordAudit(req.user!.id, `PAYROLL_${nextStatus}`, "Salary", id, { guardId: String(salary.guardId), reason: req.body?.reason });
    if (nextStatus === "PAID" || nextStatus === "RECONCILED") await createNotification({ guardId: String(salary.guardId), kind: "PAYROLL_PUBLISHED", title: "Salary record published", body: `Your salary record for ${salary.month}/${salary.year} is now available.`, deepLink: "/guard/salary", source: "PAYROLL", dedupeKey: `payroll-published:${id}:${nextStatus}`, priority: "NORMAL" });
    return res.json({ success: true, data: { salary: object(salary) } });
  } catch (error) { return next(error); }
});

router.get("/payroll/:id/payslip", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id); const salary: any = usingMongo() ? await SalaryModel.findById(id) : db.salaries.find((item) => item.id === id);
    if (!salary) return res.status(404).json({ success: false, error: "SALARY_NOT_FOUND" });
    const guard: any = await findGuard(String(salary.guardId));
    if (!guard || !canReadOwnedPrivate(req.user, { guardId: String(salary.guardId) })) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const esc = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
    res.type("html").setHeader("Cache-Control", "private, no-store");
    await recordAudit(req.user!.id, "PAYSLIP_VIEWED", "Salary", id, { guardId: String(salary.guardId) });
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(salary.month)}/${esc(salary.year)}</title><style>body{font-family:Arial,sans-serif;max-width:720px;margin:32px auto;color:#172033}table{width:100%;border-collapse:collapse}td{padding:9px;border-bottom:1px solid #ddd}.total{font-size:20px;font-weight:700}</style></head><body><h1>Salary payslip</h1><p>${esc(guard.name)} · ${esc(guard.employeeCode)}</p><p>Period: ${esc(salary.payPeriodStart ?? `${salary.month}/${salary.year}`)} to ${esc(salary.payPeriodEnd ?? "")}</p><table><tr><td>Basic salary</td><td>₹${esc(salary.basicSalary ?? salary.baseSalary ?? 0)}</td></tr><tr><td>Payable days</td><td>${esc(salary.payableDays ?? salary.attendanceDays ?? 0)}</td></tr><tr><td>Overtime</td><td>₹${esc(salary.overtimeAmount ?? 0)}</td></tr><tr><td>Allowances / holiday / arrears</td><td>₹${esc(Number(salary.allowances ?? 0) + Number(salary.holidayPay ?? 0) + Number(salary.arrears ?? 0))}</td></tr><tr><td>Advances / deductions</td><td>₹${esc(Number(salary.advances ?? 0) + Number(salary.deductions ?? 0))}</td></tr><tr class="total"><td>Net payable</td><td>₹${esc(salary.netPayable ?? salary.finalSalary ?? 0)}</td></tr></table><p>Status: ${esc(salary.workflowStatus ?? salary.status)}</p></body></html>`);
  } catch (error) { return next(error); }
});

const documentTypes = ["AADHAAR", "PAN", "BANK_PASSBOOK", "POLICE_VERIFICATION", "MEDICAL", "ADDRESS_PROOF", "TRAINING_CERTIFICATE", "PHOTO", "OTHER"] as const;
const documentView = (value: any) => {
  const item = object(value);
  item.status = "APPROVED";
  delete item.storageKey; delete item.fileHash; delete item.payslipStorageKey;
  delete item.reviewedBy; delete item.reviewedAt; delete item.reviewerComment; delete item.rejectionReason;
  return item;
};
async function canViewDocumentForRequest(req: express.Request, document: any) {
  const guard: any = document?.guardId ? await findGuard(String(document.guardId)) : undefined;
  return Boolean(document && guard && canReadDocument(req.user, { guardId: String(document.guardId), siteId: guard.assignedSite }));
}

router.get("/guards/:id/documents", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id); const guard: any = await findGuard(id);
    const allowed = Boolean(guard && canReadDocument(req.user, { guardId: id, siteId: guard.assignedSite }));
    if (!allowed) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const page = requestedPage(req.query);
    const filter = { guardId: id };
    const result = usingMongo() ? await mongoPage(DocumentModel, filter, { type: 1, version: -1, _id: -1 }, page) : memoryPage(db.documents.filter((doc) => doc.guardId === id).slice().sort((a,b) => String(a.type).localeCompare(String(b.type)) || Number(b.version ?? 1) - Number(a.version ?? 1) || b.id.localeCompare(a.id)), page);
    const documentTypes = page === undefined ? undefined : usingMongo() ? await DocumentModel.distinct("type", filter) : [...new Set(db.documents.filter((doc) => doc.guardId === id).map((doc) => doc.type))];
    return res.json({ success: true, data: { documents: result.records.map((doc) => ({ ...documentView(doc), previewUrl: `/api/documents/${recordId(doc)}/preview` })), ...(result.pagination ? { pagination: result.pagination, documentTypes } : {}) } });
  } catch (error) { return next(error); }
});

router.get("/documents", requireAuth, requireRoles("ADMIN", "MAIN_SECURITY"), async (req, res, next) => {
  try {
    const page = requestedPage(req.query);
    const documentGuardIds = req.user?.role === "MAIN_SECURITY" ? (usingMongo() ? (await GuardModel.find({ assignedSite: { $in: req.user.assignedSiteIds ?? [] } }).select({ _id: 1 })).map((g) => String(g._id)) : db.guards.filter((g) => canManageGuard(req.user, { siteId: g.assignedSite })).map((g) => g.id)) : undefined;
    if (req.query.guardId && documentGuardIds && !documentGuardIds.includes(String(req.query.guardId))) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    if (page !== undefined) {
      const query: any = req.query.guardId ? { guardId: String(req.query.guardId) } : {};
      const search = String(req.query.search ?? "").trim();
      const status = String(req.query.status ?? "");
      if (documentGuardIds && !query.guardId) query.guardId = { $in: documentGuardIds };
      const grouped = req.query.groupBy === "guard";
      let pagination;
      let rows: any[];
      if (usingMongo()) {
        const pipeline: any[] = [{ $match: query }, { $lookup: { from: GuardModel.collection.name, localField: "guardId", foreignField: "_id", as: "guardRecord" } }, { $unwind: "$guardRecord" }];
        if (status) pipeline.push({ $addFields: { effectiveStatus: { $cond: [{ $and: [{ $gt: ["$expiresAt", null] }, { $lt: ["$expiresAt", new Date()] }, { $ne: ["$status", "REJECTED"] }] }, "EXPIRED", "$status"] } } }, { $match: { effectiveStatus: status } });
        if (search) {
          const literal = search.split("").map((char) => ".*+?^$".includes(char) || "{}()|[]".includes(char) || char.charCodeAt(0) === 92 ? String.fromCharCode(92) + char : char).join("");
          pipeline.push({ $match: { $or: ["guardRecord.name", "guardRecord.employeeCode", "guardRecord.mobile", "type", "originalName"].map((field) => ({ [field]: { $regex: literal, $options: "i" } })) } });
        }
        if (grouped) pipeline.push({ $group: { _id: "$guardId", guardRecord: { $first: "$guardRecord" }, latestUpload: { $max: "$uploadedAt" }, documentCount: { $sum: 1 } } });
        const totals = await DocumentModel.aggregate([...pipeline, { $count: "total" }]);
        pagination = paginationFor(totals[0]?.total ?? 0, page);
        rows = await DocumentModel.aggregate([...pipeline, { $sort: grouped ? { latestUpload: -1, _id: 1 } : { uploadedAt: -1, _id: -1 } }, { $skip: (pagination.page - 1) * pagination.pageSize }, { $limit: pagination.pageSize }]);
      } else {
        const guards = new Map(db.guards.map((guard) => [guard.id, guard]));
        const matching = db.documents.filter((doc) => {
          const guard = guards.get(String(doc.guardId));
          return guard && (!documentGuardIds || documentGuardIds.includes(String(doc.guardId))) && (!req.query.guardId || doc.guardId === String(req.query.guardId)) && (!status || documentView(doc).status === status) && (!search || [guard.name, guard.employeeCode, guard.mobile, doc.type, doc.originalName].some((value) => String(value ?? "").toLowerCase().includes(search.toLowerCase())));
        });
        if (grouped) {
          const groups = new Map<string, any>();
          for (const doc of matching) { const id = String(doc.guardId); const existing = groups.get(id); if (existing) { existing.documentCount++; if (String(doc.uploadedAt) > String(existing.latestUpload)) existing.latestUpload = doc.uploadedAt; } else groups.set(id, { _id: id, guardRecord: guards.get(id), latestUpload: doc.uploadedAt, documentCount: 1 }); }
          const result = memoryPage([...groups.values()].sort((a,b) => String(b.latestUpload).localeCompare(String(a.latestUpload)) || a._id.localeCompare(b._id)), page); rows = result.records; pagination = result.pagination!;
        } else {
          const result = memoryPage(matching.slice().sort((a,b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime() || b.id.localeCompare(a.id)), page); rows = result.records.map((doc) => ({ ...doc, guardRecord: guards.get(String(doc.guardId)) })); pagination = result.pagination!;
        }
      }
      const assignedSites = [...new Set(rows.map((row) => String(row.guardRecord?.assignedSite ?? "")).filter(Boolean))];
      const sites: any[] = usingMongo() ? await SiteModel.find({ $or: [{ _id: { $in: assignedSites } }, { siteCode: { $in: assignedSites } }] }).select({ siteCode: 1, siteName: 1 }) : db.sites.filter((site) => assignedSites.includes(site.id) || assignedSites.includes(site.siteCode));
      const lookup = new Map<string, { siteCode: string; siteName: string }>();
      for (const site of sites) for (const key of [site._id, site.id, site.siteCode]) if (key) lookup.set(String(key), { siteCode: String(site.siteCode ?? ""), siteName: String(site.siteName ?? "") });
      const values = rows.map((row) => {
        const guard = withAssignedSiteDetails(row.guardRecord, lookup, req.user);
        const guardDetails = { id: guard.id, mobile: guard.mobile, village: guard.village, employmentStatus: guard.employmentStatus, profilePhotoUrl: guard.profilePhotoUrl, assignedSiteDetails: guard.assignedSiteDetails };
        if (grouped) return { id: guard.id, guardId: guard.id, guard: guard.name, employeeCode: guard.employeeCode, guardDetails, documentCount: row.documentCount };
        const { guardRecord, effectiveStatus, ...doc } = row;
        return { ...documentView(doc), guard: guard.name, employeeCode: guard.employeeCode, guardDetails, previewUrl: `/api/documents/${recordId(doc)}/preview` };
      });
      return res.json({ success: true, data: { ...(grouped ? { documentGroups: values } : { documents: values }), pagination } });
    }
    const all: any[] = usingMongo() ? await DocumentModel.find(documentGuardIds ? { guardId: { $in: documentGuardIds } } : {}).sort({ uploadedAt: -1 }) : db.documents.filter((d) => !documentGuardIds || documentGuardIds.includes(String(d.guardId)));
    const guards: any[] = usingMongo() ? await GuardModel.find({ _id: { $in: [...new Set(all.map((item) => String(item.guardId)).filter(Boolean))] } }) : db.guards;
    const guardMap = new Map(guards.map((guard: any) => [recordId(guard), guard]));
    const sites: any[] = usingMongo() ? await SiteModel.find({}, { siteCode: 1, siteName: 1 }).lean() : db.sites;
    const siteLookup = new Map<string, { siteCode: string; siteName: string }>();
    for (const site of sites) {
      const details = { siteCode: String(site.siteCode ?? ""), siteName: String(site.siteName ?? "") };
      for (const key of [site._id, site.id, site.siteCode]) {
        if (key !== undefined && key !== null && key !== "") siteLookup.set(String(key), details);
      }
    }
    const documents = all.filter((doc) => {
      const guard = guardMap.get(String(doc.guardId));
      if (!guard || (req.user?.role === "MAIN_SECURITY" && !canAccessSite(req.user, String(guard.assignedSite ?? "")))) return false;
      if (req.query.status && String(req.query.status) !== String(documentView(doc).status)) return false;
      if (req.query.guardId && String(req.query.guardId) !== String(doc.guardId)) return false;
      const search = String(req.query.search ?? "").trim().toLowerCase();
      return !search || [guard.name, guard.employeeCode, guard.mobile, doc.type, doc.originalName].some((value) => String(value ?? "").toLowerCase().includes(search));
    });
    return res.json({ success: true, data: { documents: documents.map((doc) => {
      const guard = withAssignedSiteDetails(guardMap.get(String(doc.guardId)), siteLookup, req.user);
      return {
        ...documentView(doc), guard: guard.name, employeeCode: guard.employeeCode,
        guardDetails: {
          id: guard.id, mobile: guard.mobile, village: guard.village,
          employmentStatus: guard.employmentStatus, profilePhotoUrl: guard.profilePhotoUrl,
          assignedSiteDetails: guard.assignedSiteDetails,
        },
        previewUrl: `/api/documents/${recordId(doc)}/preview`,
      };
    }) } });
  } catch (error) { return next(error); }
});

router.post(
  "/guards/:id/documents",
  requireAuth,
  upload.single("file"),
  async (req, res, next) => {
    let savedUpload: Awaited<ReturnType<typeof saveLocalUpload>> | undefined;
    let createdDocumentId: string | undefined;
    try {
      const id = routeParam(req.params.id);
      const guard: any = await findGuard(id);
      if (!guard || !req.file || !canManageGuard(req.user, { siteId: guard.assignedSite }))
        return res.status(400).json({ success: false, error: "FILE_REQUIRED" });
      const type = String(req.body.type ?? "OTHER").toUpperCase();
      if (!documentTypes.includes(type as (typeof documentTypes)[number])) return res.status(400).json({ success: false, error: "INVALID_DOCUMENT_TYPE" });
      savedUpload = await saveLocalUpload(req.file);
      const saved = savedUpload;
      const fileHash = createHash("sha256").update(req.file.buffer).digest("hex");
      const previous: any = usingMongo() ? await DocumentModel.findOne({ guardId: id, type }).sort({ version: -1 }) : db.documents.filter((doc) => doc.guardId === id && doc.type === type).sort((a, b) => Number(b.version ?? 1) - Number(a.version ?? 1))[0];
      const duplicate: any = usingMongo() ? await DocumentModel.findOne({ fileHash }) : db.documents.find((doc) => doc.fileHash === fileHash);
      const expiresAt = req.body.expiresAt ? new Date(String(req.body.expiresAt)) : undefined;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        await deleteLocalUpload(saved.storageKey);
        return res.status(400).json({ success: false, error: "INVALID_EXPIRY_DATE" });
      }
      const value: any = {
        guardId: id,
        type,
        originalName: saved.originalName,
        storageKey: saved.storageKey,
        mimeType: saved.mimeType,
        size: saved.size,
        uploadedBy: req.user?.id ?? "",
        uploadedAt: new Date(),
        notes: req.body.notes,
        status: "APPROVED", expiresAt, version: Number(previous?.version ?? 0) + 1, previousDocumentId: previous ? recordId(previous) : undefined,
        fileHash, duplicateOf: duplicate ? recordId(duplicate) : undefined, duplicateWarning: duplicate ? "This file is already stored in the system." : undefined,
        documentNumberMasked: req.body.documentNumber ? maskSensitive(req.body.documentNumber) : undefined, sensitive: ["AADHAAR", "PAN", "BANK_PASSBOOK"].includes(type), required: req.body.required === true || req.body.required === "true", checklistKey: type, uploadedByRole: req.user?.role,
      };
      if (usingMongo()) {
        const document = await DocumentModel.create({
          _id: makeId("doc"),
          ...value,
        });
        createdDocumentId = recordId(document);
        await GuardModel.updateOne({ _id: id }, { $set: { documentCount: (await DocumentModel.distinct("type", { guardId: id })).length } });
        await recordAudit(req.user!.id, "DOCUMENT_UPLOADED", "Document", recordId(document), { guardId: id, type: value.type, version: value.version, duplicate: Boolean(duplicate) });
        return res
          .status(201)
          .json({ success: true, data: { document: documentView(document) } });
      }
      const document = {
        id: newId("doc"),
        ...value,
        uploadedAt: value.uploadedAt.toISOString(),
      } as any;
      createdDocumentId = document.id;
      db.documents.unshift(document);
      guard.documentCount = new Set(db.documents.filter((doc) => doc.guardId === id).map((doc) => doc.type)).size;
      await recordAudit(req.user!.id, "DOCUMENT_UPLOADED", "Document", document.id, { guardId: id, type: value.type, version: value.version, duplicate: Boolean(duplicate) });
      return res.status(201).json({ success: true, data: { document: documentView(document) } });
    } catch (error) {
      if (createdDocumentId) {
        if (usingMongo()) {
          await DocumentModel.deleteOne({ _id: createdDocumentId });
          await GuardModel.updateOne({ _id: routeParam(req.params.id) }, { $set: { documentCount: (await DocumentModel.distinct("type", { guardId: routeParam(req.params.id) })).length } });
        } else { db.documents = db.documents.filter((item) => item.id !== createdDocumentId); const guard = db.guards.find((g) => g.id === routeParam(req.params.id)); if (guard) guard.documentCount = new Set(db.documents.filter((doc) => doc.guardId === guard.id).map((doc) => doc.type)).size; }
      }
      if (savedUpload) await deleteLocalUpload(savedUpload.storageKey);
      return next(error);
    }
  },
);
router.get("/documents/:id/history", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id); const document: any = usingMongo() ? await DocumentModel.findById(id) : db.documents.find((item) => item.id === id);
    if (!document || !(await canViewDocumentForRequest(req, document))) return res.status(document ? 403 : 404).json({ success: false, error: document ? "FORBIDDEN" : "DOCUMENT_NOT_FOUND" });
    const all: any[] = usingMongo() ? await DocumentModel.find({ guardId: document.guardId, type: document.type }).sort({ version: -1 }) : db.documents.filter((item) => item.guardId === document.guardId && item.type === document.type).sort((a, b) => Number(b.version ?? 1) - Number(a.version ?? 1));
    return res.json({ success: true, data: { history: all.map(documentView) } });
  } catch (error) { return next(error); }
});
router.get(
  "/documents/:id/preview",
  requireAuth,
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      const document: any = usingMongo()
        ? await DocumentModel.findById(id)
        : db.documents.find((item) => item.id === id);
      const allowed = document && await canViewDocumentForRequest(req, document);
      const storedPath = String(document?.storageKey ?? "");
      const validStorageKey = isStoredUpload(storedPath);
      if (
        !document ||
        !allowed ||
        !storedPath ||
        !validStorageKey
      )
        return res
          .status(document ? 403 : 404)
          .json({
            success: false,
            error: document ? "FORBIDDEN" : "DOCUMENT_FILE_NOT_FOUND",
          });
      const filename = String(document.originalName ?? "document").replace(
        /["\r\n]/g,
        "_",
      );
      res.setHeader(
        "Content-Type",
        document.mimeType ?? "application/octet-stream",
      );
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      document.lastAccessedAt = new Date();
      if (usingMongo()) await document.save();
      await recordAudit(req.user!.id, "DOCUMENT_PREVIEWED", "Document", id, { guardId: String(document.guardId) });
      return await sendStoredUpload(res, storedPath);
    } catch (error) {
      return next(error);
    }
  },
);
router.get(
  "/documents/:id",
  requireAuth,
  async (req, res, next) => {
    try {
      const document: any = usingMongo()
        ? await DocumentModel.findById(req.params.id)
        : db.documents.find((item) => item.id === req.params.id);
      if (!document || !(await canViewDocumentForRequest(req, document)))
        return res
          .status(document ? 403 : 404)
          .json({ success: false, error: document ? "FORBIDDEN" : "DOCUMENT_NOT_FOUND" });
      return res.json({ success: true, data: { document: documentView(document) } });
    } catch (error) {
      return next(error);
    }
  },
);
router.get(
  "/documents/:id/download",
  requireAuth,
  async (req, res, next) => {
    try {
      const document: any = usingMongo()
        ? await DocumentModel.findById(req.params.id)
        : db.documents.find((item) => item.id === req.params.id);
      if (!document || !(await canViewDocumentForRequest(req, document)) || !document.storageKey)
        return res
          .status(document ? 403 : 404)
          .json({ success: false, error: document ? "FORBIDDEN" : "DOCUMENT_FILE_NOT_FOUND" });
      const storedPath = String(document.storageKey);
      if (!isStoredUpload(storedPath))
        return res.status(403).json({ success: false, error: "FORBIDDEN" });
      res.setHeader("Cache-Control", "private, no-store");
      document.lastAccessedAt = new Date();
      if (usingMongo()) await document.save();
      await recordAudit(req.user!.id, "DOCUMENT_DOWNLOADED", "Document", routeParam(req.params.id), { guardId: String(document.guardId) });
      return await sendStoredUpload(res, storedPath, document.originalName || 'document');
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/verifications", requireAuth, async (req, res, next) => {
  try {
    const filter =
      operationalFilter(req);
    const records = usingMongo()
      ? await VerificationRequestModel.find(filter).sort({
          requestCreatedAt: -1,
        })
      : db.verifications.filter(
          (item) =>
            visibleOperation(req, item),
        );
    return res.json({
      success: true,
      data: { verifications: objects(records) },
    });
  } catch (error) {
    return next(error);
  }
});
router.get("/verifications/:id", requireAuth, async (req, res, next) => {
  try {
    const item: any = usingMongo()
      ? await VerificationRequestModel.findById(req.params.id)
      : db.verifications.find((value) => value.id === req.params.id);
    if (
      !item ||
      (req.user?.role === "GUARD" && String(item.guardId) !== req.user.guardId)
    )
      return res
        .status(404)
        .json({ success: false, error: "VERIFICATION_NOT_FOUND" });
    if (new Date(item.expiresAt) < new Date() && item.status !== "VERIFIED") {
      item.status = "EXPIRED";
      if (usingMongo()) await item.save();
    }
    return res.json({ success: true, data: { verification: object(item) } });
  } catch (error) {
    return next(error);
  }
});
router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100); const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    const page = requestedPage(req.query);
    const filter = notificationFilter(req);
    const result = page === undefined ? undefined : usingMongo() ? await mongoPage(NotificationModel, filter, { createdAt: -1, _id: -1 }, page) : memoryPage(db.notifications.filter((item) => canReadPrivate(req.user, item)).slice().sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id.localeCompare(a.id)), page);
    const records = result ? result.records : usingMongo() ? await NotificationModel.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit) : db.notifications.filter((item) => canReadPrivate(req.user, item)).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(offset, offset + limit);
    const unreadCount = usingMongo() ? await NotificationModel.countDocuments({ ...notificationFilter(req), status: { $ne: "READ" } }) : db.notifications.filter((item) => canReadPrivate(req.user, item) && item.status !== "READ").length;
    return res.json({
      success: true,
      data: { notifications: objects(records), unreadCount, offset, limit, ...(result?.pagination ? { pagination: result.pagination } : {}) },
    });
  } catch (error) {
    return next(error);
  }
});
router.patch("/notifications/:id/read", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    
    if (usingMongo()) {
      const notification: any = await NotificationModel.findOne({
        _id: id,
        ...notificationFilter(req),
      });
      if (!notification)
        return res
          .status(404)
          .json({ success: false, error: "NOTIFICATION_NOT_FOUND" });
      notification.status = "READ";
      notification.readAt = new Date();
      await notification.save();
      return res.json({
        success: true,
        data: { notification: object(notification) },
      });
    }
    const notification = db.notifications.find(
      (item) => item.id === id && canReadPrivate(req.user, item),
    );
    if (!notification)
      return res
        .status(404)
        .json({ success: false, error: "NOTIFICATION_NOT_FOUND" });
    notification.status = "READ";
    notification.readAt = new Date().toISOString();
    return res.json({ success: true, data: { notification } });
  } catch (error) {
    return next(error);
  }
});
router.patch("/notifications/read-all", requireAuth, async (req, res, next) => {
  try {
    
    if (usingMongo()) {
      await NotificationModel.updateMany(
        notificationFilter(req),
        { $set: { status: "READ", readAt: new Date() } },
      );
    } else
      db.notifications
        .filter((item) => canReadPrivate(req.user, item))
        .forEach((item) => {
          item.status = "READ";
          item.readAt = new Date().toISOString();
        });
    return res.json({ success: true, data: { read: true } });
  } catch (error) {
    return next(error);
  }
});
router.get("/notifications/preferences", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.user!.id); const value: any = usingMongo() ? await NotificationPreferenceModel.findOne({ userId }) : db.notificationPreferences.find((item) => item.userId === userId);
    return res.json({ success: true, data: { preferences: value ? object(value) : { id: `notification-preferences-${userId}`, userId, enabled: true, channels: { inApp: true, push: true, sms: false, email: false, whatsapp: false }, timezone: "Asia/Kolkata" } } });
  } catch (error) { return next(error); }
});
router.patch("/notifications/preferences", requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({ enabled: z.boolean().optional(), channels: z.object({ inApp: z.boolean().optional(), push: z.boolean().optional(), sms: z.boolean().optional(), email: z.boolean().optional(), whatsapp: z.boolean().optional() }).partial().optional(), categories: z.record(z.boolean()).optional(), quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), timezone: z.string().trim().max(80).optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "INVALID_NOTIFICATION_PREFERENCES", details: validationDetails(parsed.error) });
    const userId = String(req.user!.id); const defaults = { enabled: true, channels: { inApp: true, push: true, sms: false, email: false, whatsapp: false }, categories: {}, timezone: "Asia/Kolkata" };
    if (usingMongo()) { const current: any = await NotificationPreferenceModel.findOneAndUpdate({ userId }, { $set: { ...parsed.data, ...(parsed.data.channels ? { channels: { ...defaults.channels, ...parsed.data.channels } } : {}) }, $setOnInsert: { _id: makeId("notification-preferences"), ...defaults } }, { upsert: true, new: true, setDefaultsOnInsert: true }); return res.json({ success: true, data: { preferences: object(current) } }); }
    const current = db.notificationPreferences.find((item) => item.userId === userId);
    if (current) { Object.assign(current, parsed.data, parsed.data.channels ? { channels: { ...current.channels, ...parsed.data.channels } } : {}); return res.json({ success: true, data: { preferences: current } }); }
    const created = { id: newId("notification-preferences"), userId, ...defaults, ...parsed.data, channels: { ...defaults.channels, ...(parsed.data.channels ?? {}) } } as any; db.notificationPreferences.push(created); return res.json({ success: true, data: { preferences: created } });
  } catch (error) { return next(error); }
});
router.post("/notifications/broadcast", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(2000), kind: z.string().trim().min(2).max(60), siteId: z.string().trim().min(1).optional(), guardIds: z.array(z.string().trim().min(1)).max(500).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "EMERGENCY"]).default("NORMAL"), requiresAcknowledgement: z.boolean().default(false), quietHoursBypass: z.boolean().default(false), deepLink: z.string().trim().max(300).optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "INVALID_BROADCAST", details: validationDetails(parsed.error) });
    if (parsed.data.siteId && !canAccessSite(req.user, parsed.data.siteId)) return res.status(403).json({ success: false, error: "FORBIDDEN" });
    const requested = parsed.data.guardIds ? new Set(parsed.data.guardIds) : undefined;
    const guards: any[] = usingMongo() ? await GuardModel.find({ employmentStatus: "ACTIVE", ...(parsed.data.siteId ? { assignedSite: parsed.data.siteId } : req.user?.role === "MAIN_SECURITY" ? { assignedSite: { $in: req.user.assignedSiteIds ?? [] } } : {}), ...(requested ? { _id: { $in: [...requested] } } : {}) }) : db.guards.filter((guard) => guard.employmentStatus === "ACTIVE" && (!parsed.data.siteId || guard.assignedSite === parsed.data.siteId) && (req.user?.role === "ADMIN" || (guard.assignedSite && req.user?.assignedSiteIds?.includes(String(guard.assignedSite)))) && (!requested || requested.has(guard.id)));
    const notifications = await createNotifications(guards.map((guard: any) => ({ ...parsed.data, guardId: recordId(guard), siteId: guard.assignedSite ? String(guard.assignedSite) : parsed.data.siteId, source: "SUPERVISOR_BROADCAST", dedupeKey: `broadcast:${req.user!.id}:${recordId(guard)}:${parsed.data.kind}:${Date.now()}` })));
    await recordAudit(req.user!.id, "NOTIFICATION_BROADCAST", "Notification", "broadcast", { count: notifications.length, siteId: parsed.data.siteId, priority: parsed.data.priority });
    return res.status(201).json({ success: true, data: { count: notifications.length } });
  } catch (error) { return next(error); }
});
router.post("/notifications/:id/acknowledge", requireAuth, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id); const item: any = usingMongo() ? await NotificationModel.findOne({ _id: id, ...notificationFilter(req) }) : db.notifications.find((notification) => notification.id === id && canReadPrivate(req.user, notification));
    if (!item) return res.status(404).json({ success: false, error: "NOTIFICATION_NOT_FOUND" });
    item.status = "READ"; item.readAt = new Date(); item.acknowledgedAt = new Date(); item.acknowledgedBy = req.user!.id;
    if (usingMongo()) await item.save(); else { item.readAt = new Date().toISOString(); item.acknowledgedAt = new Date().toISOString(); }
    await recordAudit(req.user!.id, "NOTIFICATION_ACKNOWLEDGED", "Notification", id, { kind: item.kind });
    return res.json({ success: true, data: { notification: object(item) } });
  } catch (error) { return next(error); }
});
router.post("/push/subscribe", requireAuth, async (req, res, next) => {
  try {
    if (!req.body.endpoint || !req.body.keys)
      return res
        .status(400)
        .json({ success: false, error: "PUSH_SUBSCRIPTION_REQUIRED" });
    if (usingMongo())
      await PushSubscriptionModel.findOneAndUpdate(
        { endpoint: req.body.endpoint },
        {
          $set: { userId: req.user?.id, keys: req.body.keys },
          $setOnInsert: { _id: makeId("push"), endpoint: req.body.endpoint },
        },
        { upsert: true, new: true },
      );
    return res.status(201).json({ success: true, data: { subscribed: true } });
  } catch (error) {
    return next(error);
  }
});
router.get(
  "/audit",
  requireAuth,
  requireRoles("ADMIN"),
  async (_req, res, next) => {
    try {
      const page = requestedPage(_req.query);
      const result = usingMongo()
        ? await mongoPage(AuditLogModel, {}, { at: -1, _id: -1 }, page, 100)
        : memoryPage(db.audits.slice().sort((a,b) => new Date(b.at).getTime() - new Date(a.at).getTime() || b.id.localeCompare(a.id)), page, 100);
      return res.json({ success: true, data: { audits: objects(result.records), ...(result.pagination ? { pagination: result.pagination } : {}) } });
    } catch (error) {
      return next(error);
    }
  },
);
router.get(
  "/reports/attendance.csv",
  requireAuth,
  requireRoles("MAIN_SECURITY", "ADMIN"),
  async (req, res, next) => {
    try {
      if (usingMongo()) {
        const records: any[] = await AttendanceModel.find(operationalFilter(req)).sort({
          capturedAt: -1,
        });
        const [guards, sites] = await Promise.all([
          GuardModel.find(),
          SiteModel.find(),
        ]);
        const guardMap = new Map(
          guards.map((item: any) => [String(item._id), item]),
        );
        const siteMap = new Map(
          sites.map((item: any) => [String(item._id), item]),
        );
        return res.type("text/csv").send(
          csv([
            ["Guard", "Employee Code", "Site", "Type", "Status", "Captured At"],
            ...records.map((item) => {
              const guard: any = guardMap.get(String(item.guardId));
              const site: any = siteMap.get(String(item.siteId));
              return [
                guard?.name ?? "",
                guard?.employeeCode ?? "",
                site?.siteCode ?? "",
                item.type,
                item.status,
                new Date(item.capturedAt).toISOString(),
              ];
            }),
          ]),
        );
      }
      return res
        .type("text/csv")
        .send(
          csv([
            ["Guard", "Employee Code", "Site", "Type", "Status", "Captured At"],
            ...db.attendance.filter((item) => visibleOperation(req, item)).map((item) => [
              db.guards.find((guard) => guard.id === item.guardId)?.name ?? "",
              db.guards.find((guard) => guard.id === item.guardId)
                ?.employeeCode ?? "",
              db.sites.find((site) => site.id === item.siteId)?.siteCode ?? "",
              item.type,
              item.status,
              item.capturedAt,
            ]),
          ]),
        );
    } catch (error) {
      return next(error);
    }
  },
);
router.get(
  "/reports/salaries.csv",
  requireAuth,
  requireRoles("ADMIN"),
  async (_req, res, next) => {
    try {
      if (usingMongo()) {
        const records: any[] = await SalaryModel.find();
        const guards = new Map(
          (await GuardModel.find()).map((item: any) => [
            String(item._id),
            item,
          ]),
        );
        return res.type("text/csv").send(
          csv([
            [
              "Guard",
              "Month",
              "Year",
              "Attendance Days",
              "Final Salary",
              "Status",
            ],
            ...records.map((item) => {
              const guard: any = guards.get(String(item.guardId));
              return [
                guard?.name ?? "",
                String(item.month),
                String(item.year),
                String(item.attendanceDays),
                String(item.finalSalary),
                item.status,
              ];
            }),
          ]),
        );
      }
      return res
        .type("text/csv")
        .send(
          csv([
            [
              "Guard",
              "Month",
              "Year",
              "Attendance Days",
              "Final Salary",
              "Status",
            ],
            ...db.salaries.map((item) => [
              db.guards.find((guard) => guard.id === item.guardId)?.name ?? "",
              String(item.month),
              String(item.year),
              String(item.attendanceDays),
              String(item.finalSalary),
              item.status,
            ]),
          ]),
        );
    } catch (error) {
      return next(error);
    }
  },
);
router.get("/reports/payroll.csv", requireAuth, requireRoles("ADMIN"), async (req, res, next) => {
  try {
    const guardIds = req.user?.role === "MAIN_SECURITY" ? (usingMongo() ? (await GuardModel.find({ assignedSite: { $in: req.user.assignedSiteIds ?? [] } }).select({ _id: 1 })).map((item: any) => String(item._id)) : db.guards.filter((item) => item.assignedSite && req.user?.assignedSiteIds?.includes(String(item.assignedSite))).map((item) => item.id)) : undefined;
    const filter: any = guardIds ? { guardId: { $in: guardIds } } : (req.query.guardId ? { guardId: String(req.query.guardId) } : {});
    const records: any[] = usingMongo() ? await SalaryModel.find(filter).sort({ year: -1, month: -1 }) : db.salaries.filter((item) => !filter.guardId || (filter.guardId.$in ? filter.guardId.$in.includes(item.guardId) : item.guardId === filter.guardId));
    const guards: any[] = usingMongo() ? await GuardModel.find({ _id: { $in: [...new Set(records.map((item) => String(item.guardId)))] } }) : db.guards;
    const names = new Map(guards.map((item: any) => [recordId(item), item.name]));
    return res.type("text/csv").send(csv([
      ["Guard", "Period", "Payable Days", "Basic", "Overtime", "Allowances", "Deductions", "Net Payable", "Workflow", "Payment Reference"],
      ...records.map((item) => [
        names.get(String(item.guardId)) ?? "",
        `${item.month}/${item.year}`,
        String(item.payableDays ?? item.attendanceDays ?? 0),
        String(item.basicSalary ?? item.baseSalary ?? 0),
        String(item.overtimeAmount ?? 0),
        String(Number(item.allowances ?? 0) + Number(item.holidayPay ?? 0) + Number(item.arrears ?? 0)),
        String(Number(item.advances ?? 0) + Number(item.deductions ?? 0)),
        String(item.netPayable ?? item.finalSalary ?? 0),
        String(item.workflowStatus ?? item.status),
        String(item.paymentReference ?? ""),
      ]),
    ]));
  } catch (error) { return next(error); }
});
router.get("/reports/documents.csv", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const documents: any[] = usingMongo() ? await DocumentModel.find().sort({ uploadedAt: -1 }) : db.documents;
    const guards: any[] = usingMongo() ? await GuardModel.find({ _id: { $in: [...new Set(documents.map((item) => String(item.guardId)).filter(Boolean))] } }) : db.guards;
    const guardMap = new Map(guards.map((item: any) => [recordId(item), item]));
    const rows = documents.filter((item) => { const guard = guardMap.get(String(item.guardId)); return guard && (req.user?.role === "ADMIN" || canAccessSite(req.user, String(guard.assignedSite ?? ""))); }).filter((item) => !req.query.status || String(documentView(item).status) === String(req.query.status));
    return res.type("text/csv").send(csv([["Guard", "Employee Code", "Type", "File", "Status", "Version", "Expires At", "Uploaded At", "Duplicate Warning"], ...rows.map((item) => { const guard = guardMap.get(String(item.guardId)); return [guard?.name ?? "", guard?.employeeCode ?? "", item.type, item.originalName, documentView(item).status, String(item.version ?? 1), item.expiresAt ? new Date(item.expiresAt).toISOString() : "", new Date(item.uploadedAt).toISOString(), item.duplicateWarning ?? ""]; })]));
  } catch (error) { return next(error); }
});
router.get("/reports/incidents.csv", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const records: any[] = usingMongo() ? await IncidentModel.find(operationalFilter(req)).sort({ capturedAt: -1 }) : db.incidents.filter((item) => visibleOperation(req, item));
    const guards: any[] = usingMongo() ? await GuardModel.find({ _id: { $in: [...new Set(records.map((item) => String(item.guardId)).filter(Boolean))] } }) : db.guards;
    const sites: any[] = usingMongo() ? await SiteModel.find({ _id: { $in: [...new Set(records.map((item) => String(item.siteId)).filter(Boolean))] } }) : db.sites;
    const guardMap = new Map(guards.map((item: any) => [recordId(item), item.name])); const siteMap = new Map(sites.map((item: any) => [recordId(item), item.siteCode]));
    return res.type("text/csv").send(csv([
      ["Guard", "Site", "Category", "Severity", "Priority", "Status", "Captured At", "Due At"],
      ...records.map((item) => [
        guardMap.get(String(item.guardId)) ?? "",
        siteMap.get(String(item.siteId)) ?? "",
        item.category,
        item.severity ?? "",
        item.priority ?? "",
        item.status,
        new Date(item.capturedAt).toISOString(),
        item.dueAt ? new Date(item.dueAt).toISOString() : "",
      ]),
    ]));
  } catch (error) { return next(error); }
});
router.get("/reports/site-coverage.csv", requireAuth, requireRoles("MAIN_SECURITY", "ADMIN"), async (req, res, next) => {
  try {
    const sites: any[] = usingMongo() ? await SiteModel.find(req.user?.role === "MAIN_SECURITY" ? { _id: { $in: req.user.assignedSiteIds ?? [] } } : { status: "ACTIVE" }) : db.sites.filter((item) => req.user?.role === "ADMIN" || req.user?.assignedSiteIds?.includes(item.id));
    const guards: any[] = usingMongo() ? await GuardModel.find({ assignedSite: { $in: sites.map((item) => recordId(item)) } }) : db.guards.filter((item) => sites.some((site) => site.id === item.assignedSite));
    const attendance: any[] = usingMongo() ? await AttendanceModel.find({ siteId: { $in: sites.map((item) => recordId(item)) }, type: "SHIFT_START" }) : db.attendance.filter((item) => sites.some((site) => site.id === item.siteId) && item.type === "SHIFT_START");
    return res.type("text/csv").send(csv([["Site", "Assigned Guards", "Attendance Records", "Verified Records", "Coverage Percent"], ...sites.map((site) => { const id = recordId(site); const assigned = guards.filter((guard) => String(guard.assignedSite) === id).length; const rows = attendance.filter((item) => String(item.siteId) === id); const verified = rows.filter((item) => item.status === "VERIFIED" || item.verificationStatus === "verified").length; return [site.siteCode, String(assigned), String(rows.length), String(verified), String(assigned ? Math.round((new Set(rows.filter((item) => item.status === "VERIFIED").map((item) => String(item.guardId))).size / assigned) * 100) : 0)]; })]));
  } catch (error) { return next(error); }
});
