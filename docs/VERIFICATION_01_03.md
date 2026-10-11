# Verification of Prompts 01–03

Date: 2026-10-10 (Asia/Kolkata). **NOT READY for production release.** Targeted fixes and permitted checks are complete; known legacy production risks and critical execution checks remain. This does not certify the application as error-free. Only code, documentation and synthetic fixtures were changed; no persisted user, attendance, salary or document data was accessed or modified.

## Completion status

| Prompt | Status | Missing requirements / limits | Issues assessed |
| --- | --- | --- | --- |
| 01: baseline inventory / traceability | Source inventory documented; PDF mapping blocked | Blueprint Part A/B is still absent. No Git repository/history exists here. Historical source assertions remain archived, not current permission claims | Matrix distinguishes baseline facts, later fixes and assumptions; no exhaustive PDF claim |
| 02: architecture / compatibility | Scaffolding implemented; plans documented | Broader domain extraction, API versions and flags are proposals; helpers are not integrated into date queries/payroll. Live records/indexes and type compatibility unverified | Shared unchanged attendance contract, upload facade and modern India date helpers reused; no dependencies, index execution or migration added |
| 03: RBAC / site / profile privacy | Core slice implemented and repaired; full acceptance conditional | Delegation/emergency disabled pending D11 policy; production assignments, Mongo/media/browser checks and typecheck not approved/performed | Outer and linked-record scope, stale role associations, privacy search, cookie expiry, session/offline boundaries and affected UI states verified/fixed below |

## Evidence and attribution

Read AGENTS.md, the pasted verification request, implementation/progress/decision documents, actual changed modules and their dependency paths. Git status reports no repository, so no commit or uncommitted-diff attribution is claimed. The original three prompts remain available in this conversation. The current source and earlier documents identify the delivered slices; code presence is not treated as runtime success.

Captured hashes for 73 source/config/test/document files before this verification. The verification changes are enumerated below; unrelated source/config files, including models, package manifests/lockfile, database/startup/seed/jobs/storage and the original image picker, are preserved. The two optional supervisor assignment/revision fields were intentional Prompt 03 additions already present at verification start. No new schema/index change was introduced by this verification. Prior-stage hash reports are historical evidence, not a live comparison against original commits.

## Bugs found and fixes

| ID / severity | File / relevant location | Root cause | Fix / evidence |
| --- | --- | --- | --- |
| V01 High | server/route.ts: findUserForGuard, loadAuthorizationResource, user-photo/profile handlers, session serializers | Non-guard accounts with stale guardId were still joined to guard records; own-user ownership could expose a different guard's bank/salary/document data, and alias lookup could select the wrong role | Role-aware joins/guard-user lookup, conflicting target fallback to valid guard association, guardId serialized only for guards, unknown-role login rejected. Regression reproduced disclosure, then passed; no record repair/backfill |
| V02 High | server/route.ts: PATCH attendance/:id/verify related request/shift writes | Attendance scope did not constrain foreign linked request/shift IDs in inconsistent legacy records | Related request requires matching guard/site and compatible optional shift; counter update requires same guard/site in Mongo and memory. Foreign-link test failed before fix and passed after. In-scope human review remains possible; mismatched linked rows are not rewritten |
| V03 High | client/src/lib/offline.ts: drainCaptures; components/guard/GuardLayout.tsx replay effect; App.tsx session transitions | A replay already in progress outlived the component/session; subsequent evidence could use another account's cookie and then delete the original queue entry | Active/session-generation checks before sends and after awaiting responses, abort on effect cleanup; preserve evidence when session changes. Fake-IDB cancellation, owner filtering, order and failure retention cases passed; no real browser/IDB execution |
| V04 Medium | client/src/lib/api.ts: response interceptor; App.tsx auth transitions | A late 401 from the previous account could clear a newer login's QueryClient/user state | Tag requests with a session generation, advance on login/logout/expiry, dispatch expiry only for the current generation. Synthetic Axios delayed/current/login-error cases passed |
| V05 Medium | server/route.ts: GET guards search; ManagementGuards.tsx search input | Supervisor search matched village even though serializer removed it, allowing private-field inference | Search only operational name/code/mobile for supervisors; admin village search retained; placeholder aligned. Negative/positive test reproduced and passed after fix |
| V06 Medium | server/services/auth.ts: setSession/clearSession | Logout did not use the secure/SameSite attributes used to set a cookie in cross-site configurations | Reuse cookie options (path, HTTP-only, secure, SameSite), omit maxAge on deletion. Secure logout-header test reproduced and passed; actual browser cross-site cookie behaviour unverified |
| V07 Medium | server/authorization/authenticate.ts: AccountIdentity boundary | New injected lookup type excluded null although installed Mongoose inference includes null for optional fields | Null-compatible boundary with existing fail-closed role/ID checks and normalized optional strings/sites. Legacy nullable fixture passed. This is source/type-contract inspection, not an executed TypeScript check |
| V08 Medium | ManagementGuards.tsx action menu/list; ManagementAttendance.tsx; AdminDashboard.tsx recent evidence | Supervisor menu offered an admin edit route that redirected; affected query failures appeared as empty records | Operational View profile link for supervisors; explicit retry/error UI and guard mutation feedback, hide failed guard-list action menu. Source/parser verified; interactive UI not executed |

Without Git, these are defects in or unaddressed by the delivered slices, not proven commit-introduced regressions. Fixtures use deliberately inconsistent legacy associations to verify that links cannot grant ownership/site privileges; no claim is made that those inconsistent records exist in the live database.

## Flow verification

| Flow | Source trace | Executed evidence / limit |
| --- | --- | --- |
| Login → role → dashboard | App Login/auth bootstrap → current-account middleware → role shell/dashboard | Guard password login + cookie auth/me fixture; all role scopes/forged grants/dashboard tests. Browser rendering not run |
| Admin → create guard → assign site | AdminUserForm multipart /users; AdminGuardEdit PATCH /guards/:id; legacy JSON /guards retained | Legacy JSON onboarding/login + assignment fixture passed. Actual multipart/file-save UI only source-traced |
| Guard → assigned site | GuardHome /sites; server current guard assignment | Correct site before/after reassignment fixture passed |
| Guard → attendance upload | ImageUploadCapture facade → AttendanceCaptureFlow → shared payload → /attendance/:kind | Synthetic image-string start remains MANUAL_REVIEW; valid retry and conflicts passed. Real image/parser-size/media UI not tested |
| Supervisor → review attendance | ManagementAttendance → explicit verify API → current sites + record site + related guard/site filters | Assigned/out-of-scope/foreign-link/history tests passed |
| Admin → review attendance | Same UI/API, admin permission and original idempotent review result | Admin repeat review fixture passed; transaction/concurrent reviewer cases remain |
| Guard → own salary | GuardSalary /salaries; direct guard-salary/detail APIs | Owner-only reads/query-spoof and cross-owner/private supervisor denials passed |
| Guard → own documents | GuardDocuments metadata; UserProfile authorized preview | Own metadata/no-storage-path and cross-owner/download-denial tests passed. Valid file IO/PDF/image UI not exercised |
| Guard → incident | IncidentForm → /incidents → server guard/site | Synthetic incident creation at own site passed |
| Supervisor → resolve incident | IncidentsPage → PATCH incident → permission + record site + scoped update/audit | Own resolution and other-site denial passed. Legacy page invalidation/error limitations remain |
| Admin → audit | AdminAudit → AUDIT_VIEW → existing audit records | Access/cache headers/privileged audit fixtures passed; durability/retention unverified |
| Logout → protected route | Matched cookie expiry + App cache/session reset + server identity gate | Logout headers and anonymous API denial passed; delayed-401/replay cancellation simulated. A retained/copied JWT is still valid until expiry; server-side revocation is not implemented |

## Compatibility and remaining risks

- Existing API/browser paths and normal authorized envelopes remain; only unsafe role/link/search access is restricted. The image picker, manual review, shared payload, offline DB version/idempotency keys, historical records and original model/index definitions are preserved. Replay cancellation retains queued evidence; it does not migrate/delete old queue records. Dependencies and package scripts are unchanged.
- Missing supervisor assignments intentionally deny site operations; no automatic site grants were inferred. Actual records/indexes, conflicting legacy links and rollout assignment counts require approved read-only preflight. Prompt 02 helpers remain unused by server day queries: UTC-midnight/device-time formatting and offline dating are still D04/D05 issues.
- **High, pre-existing release blocker:** server/db.ts connect performs field unsets/conversion; server/index.ts seeds/runs jobs; Mongo failure permits volatile memory and known-admin bootstrap. Fallback signing secret and demo credentials remain in config/login/seed. These files were not changed; starting the normal app is unsafe as an audit diagnostic. Requires a separately reviewed startup/config/persistence fix and deployment/production-write approval (D07/D09).
- Existing storage scope remains partial: accepted document MIME includes active image formats and storage lacks signature validation/durable lifecycle; media is served on the API origin with existing Helmet protections. Actual format/size/content/browser security and retention remain D08; no exploitable-media or protection-sufficiency claim is made. No existing files were opened.
- Existing audit/multi-record attendance writes are not transactional; concurrent reviews/retries and partial failures can still diverge. Missing critical indexes require live explain/index/duplicate preflight, not speculative index creation. Salary correction adapter differences, paid locks/wage policy remain D06.
- Old deployed service workers need to update; already viewed data cannot be recalled. Cookie/CSRF, copied-JWT/password-change revocation and production origin behaviour remain D07. The new generation check does not implement server-side token revocation.
- Legacy Management.tsx incident/salary composite query invalidation, some loading/error states and financial period display remain baseline gaps outside these targeted fixes. Client ES2020 library configuration coexists with existing replaceAll calls; only an approved typecheck can establish full type compatibility. No compiler-pass claim is made.
- Full PDF coverage and delegation/emergency policy are blocked by D01/D11. No emergency defaults, tenant boundaries, wage rules, migration or bypass flag were invented.

## Validation and changed files

Executed **29 distinct focused tests: 20 router/authentication/integration, 4 client-session/offline/cache simulations, 5 architecture contract/date cases; all passed in their latest applicable runs**. Four regression cases first reproduced failures (three together, then stale-role association separately). Final affected authorization/client run: 24 passed, exit 0; architecture five passed earlier in this verification and their sources were unchanged afterward. TSX disk cache disabled/restored; test router uses loopback/synthetic memory only, .env skipped, no startup/connect/seed imported. No real network service, DB, uploads, caches or IndexedDB were used.

Non-emitting TypeScript **parser** and relative-reference diagnostics: 62 source/config/test files, zero syntax diagnostics or unresolved relative paths. This is not typechecking or export/type validation. Static route-policy/link and final hash checks are recorded in IMPLEMENTATION_PROGRESS.md.

Not executed: build, TypeScript check, lint/fix, broad suites, normal app entrypoint, real browser/service worker, live Mongo/index/explain, valid document IO, migrations, dependency install, deployment or production writes. No approved-policy/production readiness assumptions substituted for these checks.

Changed code: server/route.ts, server/services/auth.ts, server/authorization/authenticate.ts; client/src/App.tsx, lib/api.ts, lib/offline.ts, components/guard/GuardLayout.tsx, pages/ManagementGuards.tsx, ManagementAttendance.tsx, AdminDashboard.tsx; expanded tests/authorization/rbac.test.ts and added client-session.test.ts. Existing progress/matrix/policy/architecture/decision/plan documents receive status corrections; this report is the only new audit document.

Next: supply blueprint and D11 policy; separately approve typecheck and scoped live-Mongo/browser/media validation; resolve reviewed startup/config/storage release blockers before production. Subsequent features can use the repaired code and honest matrix, but Prompts 01–03 are not fully certified complete.
