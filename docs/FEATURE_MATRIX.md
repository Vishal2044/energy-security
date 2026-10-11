# Baseline feature matrix

Audit date: 2026-10-10 (Asia/Kolkata). Prompt 01 was source inspection only. Subsequent architecture scaffolding and RBAC changes are recorded below. B01–B36 and the original API/model inventories preserve historical audit evidence; the RBAC update supersedes affected permission findings. Original records and route paths are retained; unsafe access is intentionally restricted.

## Evidence and completeness

Read `AGENTS.md`, package/configuration files, backend entrypoints and handlers, models/services/jobs, frontend route registrations, and relevant pages/components. **The requested `docs/Security_Management_Complete_Feature_Blueprint_Hinglish.pdf` is absent.** No other blueprint PDF was found in the workspace source inventory. Personal files under `uploads/` were not opened. Neither Part A nor Part B can be enumerated or mapped honestly until the source is supplied. Rows below map the user's stated requirements and inspected capabilities; they are NOT substitutes for PDF requirements.

Status definitions: **existing** = the described behavior is present in inspected code; **partial** = implemented elements with gaps; **missing** = no implementation found in inspected source; **conflict** = inspected behavior contradicts the supplied contract or another active path. Existing does not mean runtime-tested. `Verified` means verified by source inspection, not operational verification. Risk is a review assessment. PDF-only requirements remain **unmapped**, not automatically missing.

| ID | Requirement / capability | Status | Verified implementation and gap | Evidence / dependency | Risk / decision |
| --- | --- | --- | --- | --- | --- |
| PDF-A | Every Part A requirement | Unmapped / blocked | Part A contents unavailable; requirement count, wording and pages unknown | Missing blueprint; D01 | Completion blocker |
| PDF-B | Every Part B requirement | Unmapped / blocked | Part B contents unavailable; no invented SaaS or other requirements | Missing blueprint; D01 | Completion blocker |
| B01 | Three roles and role-specific pages | Existing | ADMIN, MAIN_SECURITY, GUARD; separate guard app and management route gating | `shared/types.ts:1`; `client/src/App.tsx`; `pages/guard/GuardApp.tsx` | Source only |
| B02 | API authentication and RBAC | Partial | JWT cookie/bearer, bcrypt, role middleware; refresh only returns claims; middleware does not reload active user/role | `server/services/auth.ts`; `server/route.ts:300`; D07 | High: disabled/changed accounts retain token access |
| B03 | Guard privacy / ownership | Conflict | Many guard-specific handlers deny other guards, but `/profiles/:id` exposes other profiles/doc metadata to any authenticated user; `/users/:id/photo` has no owner check | `server/route.ts:208`, `696`, `727`; D03 | High: cross-guard private data |
| B04 | Supervisor site scope | Missing | Supervisor-accessible lists/review/report handlers use global queries; no supervisor-site assignment field found | `server/models/index.ts:6`; `server/route.ts:913`, `1030`, `2072`, `3148`; D03 | High; assignment policy undecided |
| B05 | Users and guard onboarding/edit/reset | Partial | Admin user multipart creation, guard creation/edit and password reset; generated guard password is predictable; multi-record/file writes lack transaction boundary | `server/route.ts:447`, `1222`, `1384`, `1626`; admin forms | High: credentials and partial writes |
| B06 | Sites and assignments | Partial | Admin site create/update, guard assignment and site guard lists; site UI/API retain coordinate/geofence settings; no guard live tracking found | `server/route.ts:1676`; `AdminSiteForm.tsx`; `server/models/index.ts:8`; D03/D08 | Assignment and inactive-site validation needs focused follow-up |
| B07 | Image-upload attendance, optional device choice | Existing | File picker reads one image as data URL; no camera/location request; schema rejects extra location fields | `CameraCapture.tsx`; `AttendanceCaptureFlow.tsx`; `server/route.ts:183` | Does not prove physical presence |
| B08 | Attendance start/verify/end | Partial | Guard start creates ACTIVE shift; verification requires matching request/guard/site/shift and expiry; end completes active shift | `server/route.ts:1853`; `GuardHomePage.tsx`; D02 | No transaction or unique active-shift constraint; concurrent writes risk |
| B09 | Human evidence review | Existing | All new attendance is MANUAL_REVIEW; privileged explicit review sets VERIFIED, reviewer/time and audit | `server/route.ts:1968`, `2072`; `ManagementAttendance.tsx` | Supervisor scope gap B04; review remains required |
| B10 | Duplicate-safe attendance retries | Conflict | Optional global clientRecordId lookup returns existing record without owner/type check; unique Mongo index alone does not make related shift writes atomic | `server/route.ts:1900`; `server/models/index.ts:9`, `21`; D04 | High: disclosure and concurrent/partial state |
| B11 | Offline attendance queue | Partial | IndexedDB v3, owner-filtered chronological drain at guard mount/online, reused retry ID; first error blocks later items; no drain lock/result UI; ownerless legacy entries not replayed | `client/src/lib/offline.ts`; `GuardLayout.tsx:20`; `AttendanceCaptureFlow.tsx`; D04 | Failed/permanently expired submissions can stall queue |
| B12 | Historic/offline timestamps | Conflict | Client capturedAt accepted but new record capturedAt is server receive time, so late sync changes effective date; historical records are read, not rewritten by this audit | `server/route.ts:1972`; D04/D05 | Pay-period/day implications |
| B13 | UTC storage, Asia/Kolkata business dates | Conflict | Date/ISO storage is UTC; `dateRange()` uses UTC midnight; management attendance pins India timezone but many guard/admin formatters use device timezone | `server/route.ts:178`, `874`; `ManagementAttendance.tsx:26`; `GuardAttendancePage.tsx:8`; D05 | Day-boundary and overnight-shift errors |
| B14 | Attendance/history views | Partial | Today, own shifts (60), history, guard-specific history and CSV exist; unbound guard token can reach all records in today/history; history defaults unbounded | `server/route.ts:2174`, `2260`, `2307`; D03 | High: missing guardId must fail closed |
| B15 | Verification notifications / push | Partial | Manual request, 15-minute expiry, in-app notifications, optional VAPID/Web Push; delivery outcome tracked separately; no automatic random request scheduler found | `server/route.ts:2841`; `services/push.ts`; `lib/push.ts`; D02 | Deployment/subscription not verified |
| B16 | Verification state consistency | Conflict | Open handler can reset SUBMITTED or VERIFIED to OPENED; expiry job expires every non-VERIFIED state, including SUBMITTED pending review; GET detail also writes expiry | `server/route.ts:2959`, `3014`; `server/jobs/index.ts`; D02 | Duplicate evidence / inconsistent review states |
| B17 | Notifications read / read-all | Partial | Guard ownership on reads; managers see global notifications; query invalidation passes composite key instead of invalidating both independent keys | `server/route.ts:3035`; `GuardNotificationsPage.tsx:12`; D03 | Recipient scope and stale UI |
| B18 | Payroll records | Partial | Salary schema with unique guard/month/year; list, mark-paid and correction endpoints; no salary generation/create path found | `server/models/index.ts:15`; `server/route.ts:2550`; `Management.tsx:29`; D06 | Existing records must remain unchanged |
| B19 | Payroll permissions / validation / audit | Conflict | List restricted to guard/admin, but supervisor can read salary via guard-detail and guard-salary endpoints; correction reason required but not persisted/audited, numeric/range validation absent; mark-paid lacks audit | `server/route.ts:1143`, `1209`, `2602`, `2641`; D03/D06 | High: privacy and financial integrity |
| B20 | Payroll frontend | Partial | Admin paid action and guard salary cards; no generation/correction UI; banner hardcodes September 2026 and sums all returned periods; composite invalidation misses both queries | `Management.tsx:29`; `GuardSalaryPage.tsx` | Cannot claim full payroll workflow |
| B21 | Incidents | Partial | Guard scoped creation/list, site derived from assignment, optional photo, manager acknowledge/resolve; update accepts arbitrary status with no audit; no incident offline queue found | `server/route.ts:2397`, `2445`, `2524`; `IncidentForm.tsx`; `Management.tsx:27` | Manager scope, validation, stale query and error gaps |
| B22 | Document metadata permissions | Conflict | Dedicated guard document list is admin/owner-only, but profiles leak metadata; guard-detail permits supervisor docs and memory branch returns storageKey | `server/route.ts:727`, `1143`, `2683`; D03/D08 | High: inconsistent privacy policy |
| B23 | Private document preview/download | Partial | Files not publicly mounted; preview checks guard ownership, path containment and private/no-store; all non-guards can preview; admin download lacks matching containment check | `server/index.ts`; `server/route.ts:2752`, `2821`; D03/D08 | Upload content and stored-path trust |
| B24 | Upload validation/storage | Partial | Multer memory uploads allow declared PDF/image MIME, 8 MiB per file; local filesystem save uses timestamp/sanitized original name; no signature scanning, lifecycle/retention or cloud backend found | `server/route.ts:46`; `services/storage.ts`; D08 | Collisions/orphans, memory/disk limits, inline image/SVG review |
| B25 | Attendance image limits | Conflict | Picker allows 10 MiB raw image; JSON parser caps entire data-URL request at 2 MB; server photo schema only checks nonempty string | `CameraCapture.tsx`; `server/index.ts:18`; `server/route.ts:183`; D08 | Valid UI selection can fail API; content not authenticated |
| B26 | Document frontend | Partial | Required-type guard status cards and profile preview exist; management Open documents button has no action; aggregate count does not prove each required type exists | `GuardDocumentsPage.tsx`; `UserProfile.tsx`; `Management.tsx:31` | Incomplete workflow / misleading readiness |
| B27 | Audit | Partial | Model, admin viewer, login/user/guard/password/incident-create/request/review audits exist; no consistent audit on attendance submit/end, site writes, docs upload, incident transitions or salary writes | `server/route.ts:260`, `3133`; `AdminAudit.tsx` | Mutation and audit can commit separately |
| B28 | Gujarati localization | Partial | Shared en/gu dictionaries exist; guard selects gu directly; many upload/profile/document/admin strings are English; manager toggle mostly nav labels | `client/src/locales`; `App.tsx`; `CameraCapture.tsx`; `GuardDocumentsPage.tsx` | UTF-8 source read confirms Gujarati exists; console decoding alone is not a defect |
| B29 | Loading/error/empty states | Partial | Shared LoadingState/EmptyState/Toast and several guard error states; many query errors render empty/loading indefinitely, some mutations lack error/pending handling | `components/ui.tsx`; `AdminDashboard.tsx:35`; `Management.tsx`; `GuardAttendancePage.tsx` | Distinguish failure from no data |
| B30 | Session/browser data isolation | Conflict | Singleton QueryClient survives logout, several guard keys lack owner ID; logout does not clear cache; broad API NetworkFirst cache lacks user partition/purge | `client/src/main.tsx:8`; `App.tsx`; `GuardAttendancePage.tsx`; both Vite configs | High: potential shared-device disclosure; PWA runtime not tested |
| B31 | Production entry/deployment | Partial | Build scripts target TS server and client/dist; start serves API and built SPA, CORS/Helmet configured; no deployment/CI/container manifests found | `package.json`; `server/index.ts`; `server/tsconfig.json`; root `vite.config.ts` | Existing dist is not evidence of current build validity |
| B32 | Production persistence/safe startup | Conflict | Mongo failure/missing URI falls back to volatile memory; connect runs unsets/field conversion on existing collections; startup seeds known admin whenever that email is absent, not only when DB empty | `server/db.ts`; `server/seed.ts`; `services/memory.ts`; D07/D09 | High: startup writes, destructive cleanup and unsafe fallback |
| B33 | Secrets/auth hardening | Partial | Env-based keys and HTTP-only cookies exist; fallback signing secrets, known seeded admin and visible demo login remain; no rate limit, CSRF middleware, token revocation or true refresh flow found | `config/env.ts`; `services/auth.ts`; `App.tsx`; D07 | Production configuration/HTTPS not inspected |
| B34 | Tests / validation harness | Missing | No app test/spec files, test scripts, runner configuration or CI found outside dependencies/generated assets | Source file inventory; `package.json` | No runtime acceptance claim |
| B35 | SaaS tenancy / billing | Missing (source only) | No tenant/subscription/invoice model or billing route found; whether required is unknown until Part B is read | `server/models/index.ts`; route inventory; D01/D10 | No invented pricing/tenant policy |
| B36 | README accuracy | Conflict | README describes forced live camera/GPS/geofence evidence; current attendance uploads images without those capabilities; it says startup seeds only empty DB, unlike implementation | `README.md`; `CameraCapture.tsx`; `server/seed.ts` | README was not changed in this audit |

## Entrypoints and dependency paths

- API: `package.json` dev:server -> `server/index.ts` -> env/database/seed -> `/api` mount of `server/route.ts` -> auth, Mongoose or memory adapter, storage/push; then expiry job and listen. **Do not launch to perform a read-only audit:** startup has writes.
- Browser: `client/index.html` -> `client/src/main.tsx` -> singleton React Query / BrowserRouter -> `App.tsx` -> auth bootstrap/login -> role shell and route pages. Axios cookie API calls use `VITE_API_URL` or `/api`.
- Attendance: GuardHomePage -> AttendanceCaptureFlow -> CameraCapture file picker -> `/attendance/:kind` -> Attendance + Shift + VerificationRequest; ManagementAttendance -> review endpoint -> audit/activity. IndexedDB replay joins this API path through GuardLayout.
- Documents: admin multipart forms / document upload endpoint -> Multer -> saveLocalUpload -> Document/User/Guard -> profile preview and protected file endpoint. Attendance/incident photos instead remain strings on their records.
- Push: verification request -> Notification + deliverPushToUser -> PushSubscription/VAPID; browser lib/push and `client/public/push-sw.js` -> guard deep link. Expiry job never writes salaries.
- Dependencies from manifest: React 18/Vite 5, React Router 6, React Query 5, Axios; Express 4, Mongoose 8, Zod 3, bcryptjs/JWT/Multer, node-cron, web-push; vite-plugin-pwa, date-fns, Tailwind and visual/form libraries. Manifest ranges are not installed-version or vulnerability verification. No dependency audit/install was run.

## Registered pages

| Audience | Routes and active components | Notes |
| --- | --- | --- |
| Unauthenticated | Catch-all Login in App | Demo credentials displayed; auth-check loader |
| Admin / supervisor | `/` AdminDashboard; `/guards` ManagementGuards; `/attendance` ManagementAttendance; `/sites` AdminSites; `/incidents` IncidentsPage; `/profile/:id` UserProfile | Mutations gated by canManage where passed; frontend visibility is not API authorization |
| Admin | `/users/new` AdminUserForm; `/guards/:id/edit` AdminGuardEdit; `/sites/new`, `/sites/:id/edit` AdminSiteForm; `/team` AdminTeam; `/salary` SalaryPage; `/documents` DocumentsPage; `/audit` AdminAudit | Other management role redirected on these routes |
| Guard | `/guard` GuardHome; `/guard/attendance`, `/guard/salary`, `/guard/documents`, `/guard/incidents`, `/guard/notifications`, `/guard/profile`; `/profile/:id` UserProfile | GuardApp wildcard redirects to `/guard` |

Old DashboardPage, GuardsPage, AttendancePage and SitesPage exports in `Management.tsx` are not mounted by App; its IncidentsPage, SalaryPage and DocumentsPage are active. Do not infer behavior from dormant exports or the `if (false)` attendance/today registration.

## API inventory

Paths below have `/api` prefix. A=ADMIN, S=MAIN_SECURITY, G=GUARD; Auth=any valid JWT. Scope describes actual source, not the desired policy. Line anchors refer to `server/route.ts` unless stated otherwise.

| Method / paths | Gate / actual scope | Entry anchor |
| --- | --- | --- |
| GET `/health` | Public; reports Mongo/memory and UTC time | `server/index.ts:20` |
| POST `/auth/login`, `/auth/logout` | Public; login rejects inactive users; logout clears cookie | 300, 344 |
| POST `/auth/refresh`; GET `/auth/me`; POST `/auth/change-password` | Auth; refresh returns existing claims, password change own account | 348, 351, 368 |
| GET `/users`, `/users/next-employee-code`; POST `/users`; PATCH `/users/:id` | A; creation multipart; self-admin edit refused | 407, 431, 447, 810 |
| GET `/users/:id/photo`, `/profiles/:id` | Auth; no owner/role scope on target | 696, 727 |
| GET `/dashboard`, `/guards` | A/S; global aggregates/list; guard query filters do not enforce supervisor scope | 913, 1030 |
| GET `/guards/:id/photo`, `/guards/:id`, `/guards/:id/attendance`, `/guards/:id/salary` | Auth; G restricted to own guard ID, A/S global | 1114, 1143, 1196, 1209 |
| POST `/guards`; PATCH `/guards/:id`; POST `/guards/:id/reset-password` | A; profile and account writes | 1222, 1384, 1626 |
| GET `/sites` | Auth; G assigned site; A/S all | 1676 |
| POST `/sites`; PATCH `/sites/:id` | A | 1692, 1750 |
| GET `/sites/:id/guards` | A/S; any requested site | 1828 |
| POST `/attendance/:kind` (start, verify, end) | G; guard/site derived server-side, duplicate lookup lacks owner scope | 1853 |
| PATCH `/attendance/:id/verify` | A/S; any MANUAL_REVIEW record | 2072 |
| GET `/attendance/today`, `/attendance/history` | Auth; G uses guardId, missing association falls back to global query; managers global | 2174, 2307 |
| GET `/shifts/mine` | G; own shifts and their evidence | 2260 |
| GET `/incidents`; POST `/incidents`; PATCH `/incidents/:id` | List Auth (G own, A/S global); create G; update A/S | 2397, 2445, 2524 |
| GET `/salaries` | A/G; G own, A optional guard filter; other endpoints still allow S salary reads | 2550 |
| POST `/salaries/:id/mark-paid`, `/salaries/:id/correct` | A; correction amount/reason validation incomplete | 2602, 2641 |
| GET `/guards/:id/documents`; POST same path | List A or owning G; upload A | 2683, 2708 |
| GET `/documents/:id/preview` | Auth; G owns guard/user document; all non-guards allowed | 2752 |
| GET `/documents/:id`, `/documents/:id/download` | A; metadata includes storageKey; download reads stored path | 2802, 2821 |
| POST `/verifications`; PATCH `/verifications/:id/open` | Create A/S any active guard; open G owner | 2841, 2959 |
| GET `/verifications`, `/verifications/:id` | Auth; G own, A/S global; detail can persist expiry | 2994, 3014 |
| GET `/notifications`; PATCH `/notifications/:id/read`, `/notifications/read-all` | Auth; G own guard notifications, managers global | 3035, 3058, 3093 |
| POST `/push/subscribe` | Auth; body minimally checked, endpoint upsert reassigns user | 3113 |
| GET `/audit` | A; most recent 100 | 3133 |
| GET `/reports/attendance.csv`; GET `/reports/salaries.csv` | Attendance A/S global; salaries A global | 3148, 3207 |

CSV helper escapes quotes but not spreadsheet formula prefixes in user-controlled names/codes (`server/route.ts:146`): review export safety before wider reporting.

## Model inventory

All Mongoose schemas are in `server/models/index.ts`; readable string IDs and timestamps are shared conventions. Memory mirrors records in `server/services/memory.ts` with some shape/serialization differences.

| Models | Relationships / constraints | Gap affecting dependencies |
| --- | --- | --- |
| User / Guard / Site | User.guardId, Guard.userId/assignedSite, Site.assignedGuards; unique email/employeeCode/siteCode | No supervisor site or tenant relation; sensitive user/guard fields need consistent serializers |
| Attendance / Shift | guard/site/shift references; unique sparse clientRecordId; guard/time and site/time indexes; shift guard/status index | No unique ACTIVE shift constraint or atomic multi-record workflow; photo string embedded |
| VerificationRequest / Notification / PushSubscription | guard/site/shift and user/request associations, state/timestamp fields | No transition guard; endpoint uniqueness not declared; delivery vs verification state partly conflated |
| Salary | guard/month/year unique; amounts/days/status/paid metadata | No policy version, correction reason/history or generation service |
| Document / Incident | owner/site associations, local storage metadata or photo string | MIME/category/status checks are mostly handler-level; missing full lifecycle |
| AuditLog / Activity | actor/entity/action/metadata/time and operational feed | Selective audit, no transactional coupling or immutable storage enforcement found |

## Verification limits

During Prompt 01 no server was started; no DB/files in uploads were read or written; `.env` values were not read. No build, typecheck, tests, migrations, seed/reset, deployment, package installation or dependency/network audit was run in that baseline audit. Subsequent focused scaffold test results are recorded below. There is no `.git` repository at this workspace root, so git status/diff could not establish repository history. Static findings about exploitability, browser cache behavior, live indexes, hosted configuration and installed dependency compatibility require focused approved verification.

## Architecture slice update

See [architecture decisions](ARCHITECTURE_DECISIONS.md) for current contracts, legacy cohorts, index inventory, date boundaries, module seams, versioning/flag proposals, migration rollback and approval gates. Original B01-B36 findings remain open unless explicitly resolved here; their line anchors refer to the baseline source.

| ID | Requirement / scaffolding | Status | Evidence / dependencies | Verification and limits |
| --- | --- | --- | --- | --- |
| AR01 | Shared attendance request contract | Implemented, focused tests passed | `shared/attendance.ts`; server parser and AttendanceCaptureFlow reuse schema/inferred type | Existing schema unchanged; no validation tightening or privacy fix; full API/typecheck unrun; B07/B08 |
| AR02 | UTC/India date scaffolding | Implemented, integration partial | `shared/time.ts`; ManagementAttendance reuses identical timezone constant | New day helpers not bound to queries/payroll; B12/B13 remain conflicts; D04/D05 |
| AR03 | Accurate image-upload component name | Implemented with legacy compatibility | `ImageUploadCapture.tsx` facade; attendance imports new name; CameraCapture/CapturedPhoto remain | Same image picker and UX; no camera/GPS added |
| AR04 | Data/legacy/index architecture map | Documented, live data unverified | ARCHITECTURE_DECISIONS contract/cohort/index inventories | No database query or index creation; D03-D09 |
| AR05 | route.ts / Management.tsx modularization | First pure schema seam implemented; broader extraction proposed | ADR-05 and module dependency table | Route registration/order, active pages and old exports retained |
| AR06 | API versioning / rollout flags | Documented; not activated | ADR-04/ADR-06; G03/G05 | `/api` unchanged; no version mounts/env flags; authorization cannot be flag-bypassed |
| AR07 | Compatible migrations / rollback | Documented; not executed | Migration table; G04/G05 | No schema/index/data changes or migration scripts; existing startup risk remains |
| AR08 | Focused scaffold tests | Added and run: 5 passed, 0 failed | Two test files under `tests/architecture/`; G02; TSX disk cache disabled | No build/typecheck/broad-suite pass claimed; B34 now has scaffold-specific cases but no broad app harness |

## RBAC slice update

See [authorization policy and rollout](AUTHORIZATION.md) for current permission audiences, actual record/current guard site distinctions, assignment contracts, history, compatibility, rollback and limits. These rows supersede the corresponding baseline claims only to the extent stated.

| ID | Requirement / affected baseline | Current status | Evidence / dependencies | Remaining risks / verification |
| --- | --- | --- | --- | --- |
| RB01 | Deny-by-default named permissions; B02/B04 | Implemented | shared/permissions; authorization route allowlist/middleware; nine requested permissions plus operational seams | Fixed role grants only; tenant/admin policy D10; new routes require explicit policy |
| RB02 | Current-account auth; B02/B33 | Implemented; focused tests passed | authorization/authenticate; services/auth | Stale/forged grants ignored, disabled/deleted/unknown accounts denied; secret/bootstrap/cookie/CSRF/session revocation D07 still open |
| RB03 | Profiles/photos/guard ownership; B03/B14 | Implemented; focused negative tests passed | Central resource policies; profile/guard serializers | Supervisor operational redaction; real media/browser/Mongo path not exercised |
| RB04 | Supervisor assigned sites and admin boundaries; B04/B06 | Implemented | Optional user assignedSiteIds/accessRevision; admin PATCH access; team editor; query scopes | No backfill; absent assignments deny operations. Admin must review/grant after production-write approval |
| RB05 | Salary/document privacy; B19/B22/B23 | Implemented for authorization | Owner/admin reads; supervisor private denial; preview ownership and download containment | Actual valid files not opened; upload content/retention D08; financial generation/range/paid-lock policy D06 pending |
| RB06 | Exports/bulk/operational scope; B14/B17/B21 | Implemented; focused tests passed | Attendance CSV actual-site scope; salary export REPORT_EXPORT + SALARY_VIEW + existing admin gate; recipient notification bulk | Historical record sites unchanged; state-machine/expiry/concurrency B08/B16 remain |
| RB07 | Owner-safe attendance retries; B10/B11 | Disclosure closed; state atomicity partial | Owner/type/photo/request comparison before duplicate response | Offline failure/drain/recovery and concurrent shift writes still D02/D04 |
| RB08 | Privilege/history audits; B19/B21/B27 | Implemented; durability partial | Request/denial audits; revision-safe assignment history; incident/document/salary success + correction justification | No transaction/immutable ledger; some existing domain operations retain request intent only |
| RB09 | Frontend privacy/states; B28/B29/B30 | Implemented; browser unverified | Team editor, operational profile privacy, dashboard fields, missing-site banner, query cache clears, both API caches NetworkOnly | Older service worker update required; scoped fields/session status revalidate on requests, already viewed data cannot be recalled |
| RB10 | Temporary delegation/emergency | Disabled / policy blocked | D11; elevation APIs absent and deny by default | User selected an existing approved policy but did not supply its details/source |
| RB11 | Negative tests; B34 | Verification: 20 router/integration + 4 client simulations passed; architecture five rerun and passed | tests/authorization/rbac.test.ts; client-session.test.ts; five architecture cases | 29 unique latest-passing focused cases; no live DB/media/browser/build/typecheck/broad suite |
| RB12 | Release/migration/rollback gates | Documented; not executed | AUTHORIZATION.md; D07/D09/D11; G02/G04/G05 | Optional schema only, no data/index rewrite. Existing dangerous startup remains; release requires separate approval |

## Completed-prompt verification update

[Verification report](VERIFICATION_01_03.md) traces the twelve requested flows and records V01–V08. Fixed stale non-guard profile/photo associations, foreign linked-review mutations, cross-session offline replay and late-401 handling, supervisor private-village search, matching logout-cookie attributes, nullable Mongo identity contract and affected frontend errors/menu actions. Four negative cases reproduced pre-fix failures; latest tests pass. RB03/RB06/RB08/RB09 are improved only within these scoped changes; immutable/transactional audit, live adapters/media/browser and legacy state/date/startup/config risks remain partial. Prompt 01 PDF mapping and Prompt 03 elevation policy remain blocked. Production readiness: NOT READY; no new schema, index, persisted-record or dependency changes were made during verification.
