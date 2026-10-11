# Contracts, compatibility and rollout architecture

Date: 2026-10-10. Scope: architecture inventory plus safe additive scaffolding. Read actual `AGENTS.md`, source and configuration. The blueprint PDF remains absent; these decisions derive from the supplied contract and inspected code, not invented Part A/B requirements. Baseline line anchors in FEATURE_MATRIX.md refer to the pre-extraction source; prefer the named route/helper when lines shift.

The architecture-only claims below retain their original stage scope. Subsequent RBAC and [completed-prompt verification](VERIFICATION_01_03.md) supersede security/status claims: optional supervisor fields were intentional RBAC additions; verification introduced no further schema/index/dependency changes, and 29 unique focused cases pass. Date integration, versions/flags and broader domain extraction remain proposed; production/live/type compatibility are not certified.

## Implemented decisions

| ADR | Decision | Justification / compatibility | Status |
| --- | --- | --- | --- |
| ADR-01 | Reuse one attendance payload schema in `shared/attendance.ts`; infer AttendancePayload for the existing server parser and frontend retry body | Extracted the existing Zod object unchanged: same required photo, optional fields, limits, datetime and strict rejection. No new DTO requirements, response filtering or schema/index writes | Implemented; focused contract tests passed; typecheck not run |
| ADR-02 | Add pure India date helpers and one timezone constant in `shared/time.ts` | Accept explicit Date, produce YYYY-MM-DD and UTC half-open day interval without changing input or relying on device timezone. Helpers deliberately support modern records from 1970 UTC through year 9999, with explicit errors outside that range. India uses UTC+05:30 in this range; this is not a historical timezone migration | Implemented; focused boundary tests passed; date query integration deferred |
| ADR-03 | Expose `ImageUploadCapture` / `UploadedImage` through an additive compatibility module | The existing CameraCapture is an image picker. New canonical imports reuse exactly that implementation; old module/export/callback names remain valid. Attendance adopts the new name; incident consumers retain compatibility | Implemented; no picker/UX change |
| ADR-04 | Preserve `/api`, all route names, envelopes and legacy permissive read shapes | Frontend, push deep links, preview/download URLs and queued captures contain these paths. No API version mount, redirect or request rewrite is added | Accepted for this slice |
| ADR-05 | Extract modules incrementally at dependency seams | Start with the pure attendance schema. No routing/authorization/business-state rewrite or adapter consolidation in this slice; preserve the existing ordered registrations | Proposed next extractions below |
| ADR-06 | Keep schema/index/data changes and policy rollouts separate from scaffolding | New fields, indexes, date attribution, tenancy or automatic cleanup can affect historical records and writes. No migrations or flags are activated by these additions | Approval gates below |

Scaffolding changes no server permissions or writes and adds no audit events: existing routes retain their authentication, validation and audit behavior. Baseline security defects remain open; compatibility is not a reason to exempt a future endpoint from permission enforcement. No dependencies/package scripts are added.

## Current data contracts

Three layers differ: Mongoose documents use string `_id` plus Date values; memory records use `id` plus ISO strings; JSON commonly uses `id` and ISO strings through object/public serializers. Do not make persistence schemas into public DTOs or expose a document by spreading it without field review. `object()` renames `_id` but can preserve fields such as `__v` and sensitive properties. Zod validates writes selectively; TS types are not runtime validation.

| Domain | Stored relationships and fields | Existing HTTP/client contract and legacy risk |
| --- | --- | --- |
| Auth / User | String ID; unique email; passwordHash, role, optional guardId, contact/Aadhaar/bank/photo, language, active | SessionUser exposes id/role/name/email and optional guardId/photo URL/language. Cookie/bearer claims may be stale. Login treats absent active as enabled in Mongo, memory requires truthy active. `/auth/refresh` does not issue a token; logout success has no data |
| Guard | Unique employeeCode; userId/assignedSite strings, personal/employment/bank/doc fields, joiningDate and monthlySalary | safeGuard masks account number and creates photo URL, but spreads other fields. Admin details include raw profile bank/Aadhaar; guard/profile response DTOs differ. Do not tighten historical fields into required values without inventory |
| Site | Unique siteCode; siteType/name/address parts, mapLink, coordinates/geofence, assignedGuards | Types still allow legacy address; current model uses farmerAddress. assignedSite and assignedGuards duplicate relation state and may disagree. Coordinate settings do not authorize GPS/live tracking |
| Attendance | guardId/siteId, optional shiftId/clientRecordId/verificationRequestId; photo, type/status, capturedAt/receivedAt, notes and reviewer fields | Current writes require nonempty photo; identifiers remain optional and may be empty strings. Current capturedAt equals server receipt despite accepted client field. History can lack photo/receivedAt/shift/reviewer; frontend status remains string to display old values |
| Shift | guard/site, start/end timestamps, ACTIVE/COMPLETED, attendance references, verificationCount | Own timeline queries up to 60 shifts. Earlier attendance may have no Shift relation and is displayed via history fallback; do not synthesize shifts from weak evidence |
| VerificationRequest | guard/site/shift, request/sent/open/submitted/expiry timestamps, status and notificationStatus | Shared VerificationStatus enumerates lifecycle, but stored status is unconstrained string. Open/expiry paths can overwrite submission state. Preserve unknown legacy states on reads until a reviewed transition policy is adopted |
| Notification / PushSubscription | user/guard/request, deepLink/kind/body/read/delivery status; endpoint and keys | Delivery and verification states are separate concepts; subscription keys stay server-private. `/guard?verification=...` and `/guard/notifications` links must survive modularization |
| Salary | Unique guard/month/year; attendanceDays/baseSalary/adjustments/finalSalary/status and paid metadata | Salary list and guard-detail read permissions differ. Month/year are Numbers with no policy schema; no generation route. Correction lacks persisted reason/history. Existing paid records are authoritative history, not recalculation targets |
| Document | guardId or userId, type/originalName/storageKey/mimeType/size/uploadedBy/notes/uploadedAt | Most lists remove storageKey, memory guard-detail does not; admin upload/detail may return it. Preview has ownership/containment/no-store, download differs. Local absolute paths are persistence details, not reusable client contract |
| Incident | guard/site/shift, category/description/photo/capturedAt/status | POST category enum/strict body; PATCH status unvalidated. Memory interface omits shiftId though creation may include it. No clientRecordId/offline contract exists; do not silently route incidents through attendance queue |
| AuditLog / Activity | actor/action/entity/metadata/time; feed title/detail/kind/time | `/audit` returns most recent 100. Selected writes are audited; persistence and audit are separate writes. Do not copy photos/bank/Aadhaar or push credentials into audit metadata |
| Offline capture | IndexedDB dg-energy-offline v3; clientRecordId key, endpoint/body/createdAt/optional ownerId | Upgrade strips location fields; owner-scoped drain skips ownerless entries, stops on first error. Preserve IDs, owner, queued bytes and legacy paths; reject mismatches safely rather than rewriting ownership |

The main API convention is `{ success: true, data: {...} }`, while logout and some mutations return success without data. Failures use `{ success: false, error, details?: { fields } }`. Axios converts failures to ApiRequestError; current getData assumes a data field. Do not replace all responses with one stricter generic envelope or reinterpret errors without checking every caller.

The shared attendance schema is deliberately the existing contract, not a stronger photo/content validation policy. It accepts legacy string photos and optional empty idempotency/request strings just as before. The added tests characterize that behavior; signature checks, required idempotency and new size limits need a separate slice.

## Legacy record inventory required before migrations

Only code was inspected; no live records, indexes or storage contents were queried. The following are **plausible cohorts suggested by source**, not verified production counts:

| Cohort | Required read-only preflight | Compatible handling / forbidden assumption |
| --- | --- | --- |
| Users without active, guardId or linked Guard | Field presence, role values, linkage counts and duplicates | Respect missing-active login behavior until policy change; fail closed on missing ownership in future auth fix; do not create guessed guard links |
| Attendance without shiftId/photo/receivedAt/clientRecordId | Count and group by field presence, type/status and date shape without exporting photos | Preserve independent historical history; omit unavailable fields or show unknown; never backfill event time/presence from receipt or EXIF |
| Duplicate/null/empty clientRecordId | Count absent vs null vs empty vs unique actual strings; ownership/type disagreements | Sparse unique indexes omit absent keys, but existing null/empty values participate; do not delete duplicate evidence to make an index build pass |
| ACTIVE shifts / orphan links | Multiple ACTIVE per guard, attendance/verification references, changed site assignments | Human-reviewed reconciliation; keep all records; no automatic merge/close/delete or guessed matching shift |
| Sites with address/allowedRadiusMeters or existing farmerAddress | Separate field-presence/value conflicts and siteType groups | Current startup conversion can overwrite farmerAddress and remove original address. A replacement must add/copy only when unambiguous and retain original fields until approved |
| Salary period duplicates, unknown status, bad numbers | Duplicate guard/month/year, valid period range, finite amounts, paid/correction metadata | Quarantine/report for authorized review; no wage-policy recalculation or overwriting paid amounts |
| Documents with missing/orphan path or owner | Metadata relations, configured storage roots, object/path counts; content access only if authorized | Preserve media; no public URL conversion, relocation or deletion by a diagnostic; path provenance must be reviewed |
| Ownerless/old offline records and cached API data | Synthetic browser inspection of queue/cache versions and account switching | Preserve queued evidence and ask owner recovery policy; never assign all pending records to the next logged-in guard |

## Declared indexes versus deployed indexes

| Model | Declared indexes in models/index.ts | Query paths / next assessment |
| --- | --- | --- |
| User | Unique email | Login and email duplicate checks; user guardId lookups not indexed explicitly |
| Guard | Unique employeeCode | AssignedSite/employmentStatus/search paths require measured workload before more indexes |
| Site | Unique siteCode | Status/site lists; bidirectional assignment integrity is not an index guarantee |
| Attendance | guardId; shiftId; unique sparse clientRecordId; guardId+capturedAt desc; siteId+capturedAt desc | History/shift evidence/duplicate lookup; consider bounded-query plans before status/date additions |
| Shift | guardId; guardId+status | findActiveShift sorts startedAt; no partial unique ACTIVE guard index exists |
| Salary | Unique guardId+month+year | Period identity; live uniqueness is unknown |
| VerificationRequest, Document, Incident, Notification, PushSubscription, AuditLog, Activity | No explicit application indexes beyond implicit ID index | Owner/time/expiry/endpoint/report queries need observed sizes and explain plans before candidates are selected |

No index changes are implemented. Mongoose connection/model startup may automatically create declared indexes under its defaults; startup is not a read-only inventory tool. Never run syncIndexes as a check: it can drop indexes. Proposed new indexes require live listIndexes/read-only aggregate/explain review, duplicate preflight, build-load assessment and explicit execution approval.

## UTC and India business dates

Mongo Date and memory ISO values represent UTC instants. Current `dateRange()` and trend buckets are based on UTC midnight/ISO dates; most guard formatters follow device timezone; management attendance already pins Asia/Kolkata. The scaffolding only reuses that identical display constant and introduces opt-in helpers, so these existing business-date defects are **not fixed** by this slice.

For a modern India day D, UTC query interval is `[D-1 18:30:00Z, D 18:30:00Z)`. For example India 2027-01-01 starts at 2026-12-31T18:30:00Z; 18:29:59.999Z still belongs to December 31. Use inclusive start/exclusive end consistently; avoid UTC slicing for India day keys or host-local constructors. Helpers require an explicit instant rather than consulting the current clock, allowing deterministic tests.

Before integration, approve overnight shift/day attribution and offline receipt-versus-occurrence dating (D04/D05). Use helper results only for approved new query/report semantics; do not update stored timestamps, recalculate historical pay or process pre-1970 records with the modern helpers. Existing ISO strings must first be parsed and validated; date-only joining dates and salary month/year are calendar values, not attendance instants.

## Modularization without route/UX churn

| Current seam | Proposed target | Required dependencies and invariant |
| --- | --- | --- |
| route.ts attendance schema | `shared/attendance.ts` | Implemented: same Zod schema/parser/error details, frontend type-only import; Zod remains existing dependency |
| route.ts object/safeUser/safeGuard/publicAttendance | `server/serializers/` by entity | Characterize response shape per audience/adapter first; separate pure extraction from permission/privacy fix |
| route.ts queries/memory branches | Domain services/repositories | Preserve Mongo and memory behavior/IDs; explicit actor scope input required before repository queries; avoid a generic CRUD abstraction |
| route.ts auth/users/guards/sites | `server/routes/` domain routers | Keep requireAuth/requireRoles, validators, uploads and route order. Preserve error envelope and complete URLs; route.ts can remain assembly/export compatibility |
| route.ts attendance/verification/notifications | Domain routers + attendance service | Ownership/site scope and transaction/state policy separately reviewed; jobs reuse transitions only after tests. Keep /attendance/:kind and request deep links |
| route.ts incidents/salary/docs/reports/audit | One router per selected module | Preserve permissions, preview/download semantics and CSV handlers; extraction is not blanket auth approval |
| Management.tsx active IncidentsPage/SalaryPage/DocumentsPage | Dedicated page modules with compatibility re-exports | App currently mounts only these three exports. Keep all existing exports until external usage is inventoried; do not copy dormant dashboard/guards/attendance/sites UI into active routes |
| CameraCapture implementation | Canonical ImageUploadCapture path | Implemented facade exports the same component/type; attendance consumer adopts it, incident legacy path remains. Later move implementation only with old re-export preserved |

Extract one domain at a time with a before/after ordered route/response inventory. Avoid importing server/index.ts or seed.ts into tests/services. Any factory for isolated test app must be separated from startup writes first; it is proposed, not implemented. Router prefixes, static/dynamic matching, `/api` 404 boundary, SPA fallback, auth cookie credentials, upload parsers, push URLs and IndexedDB endpoints must be checked before rollout.

## API versioning and flags

Current deployment has one unversioned `/api` router and no feature-flag system found. There is no new `/api/v1` or `/api/v2` mount, header requirement, redirect, env flag or client-visible capability in this slice. Type/schema extraction and component aliases do not require flags because they retain existing behavior.

Proposed versioning policy: keep `/api` as the compatibility contract; additive optional fields may be introduced only after privacy review. Removing/renaming fields, making optional fields mandatory, changing status semantics or business-date attribution requires an approved version/capability transition. If a new version is later approved, alias legacy and new URLs to shared reviewed services rather than duplicating business logic. Maintain legacy routes for persisted offline endpoints; do not redirect replayed POSTs or discard queued records.

Proposed flags are disabled by default and require approved implementation, validation and deployment configuration. They are planning names, **not implemented switches**:

| Proposed flag | Server authority / candidate scope | Enable gate / rollback limit |
| --- | --- | --- |
| INDIA_BUSINESS_DATE_READS | Explicitly selected new report/read query cohort; constant display reuse needs no flag | Approved D04/D05 attribution, boundary and parity tests; disabling changes query behavior but cannot undo downstream paid decisions |
| ATTENDANCE_TRANSITIONS_V2 | Approved transition/retry service plus matching frontend capability | D02/D04 and concurrency/state verification; reversible code path only if all written states remain readable by legacy service |
| PRIVATE_STORAGE_V2 | New uploads only with dual-read support for existing local storageKey | D08 plus authorized migration/backup; disabling new writes must still read all already-written new storage references |

Authorization, guard ownership and cross-site protection must never be bypassable by flags, client parameters or an older API version. Supervisor grants must come from approved persisted assignments, not a default global fallback. A future capability response may expose behavior availability only, never secrets/grants; client flags cannot authorize requests. Production invalid flag configuration should fail startup validation rather than silently enabling behavior. Cohort selection and flag changes need a restricted operator audit and an operational rollback procedure.

## Migration and rollback contracts

No data/schema/index migration is implemented or run. The current automatic cleanup and admin seeding remain present and risky (B32/D09); this slice does not launch the app or amend that behavior.

| Proposed change | Backward-compatible steps before execution | Rollback and data preservation |
| --- | --- | --- |
| Remove automatic startup migration | Prepare a separate, explicitly invoked bounded dry-run/write command; preserve old fields; define guarded address copy; approve startup behavior change and Mongo failure policy | Roll back application independently; do not re-enable destructive cleanup blindly. Already-unset coordinates/addresses need preexisting backup to restore |
| Add received/occurrence/policy fields | Optional fields, dual-read semantics and source provenance; no fabricated captured time; approve eligibility and new-write meaning | Keep added records/fields, restore previous reader only if it can consume them; no bulk removal of original timestamps |
| Add supervisor assignments / scope | Explicit approved assignments and historical-read policy; preview grant impact with synthetic actors; activate scope with fail-closed semantics | Restore reviewed grants/code, never globalize private access as rollback; retain assignment history and audits |
| Add unique ACTIVE-shift or owner-scoped retry index | Inventory duplicate ACTIVE shifts/null/empty/idempotency ownership; reviewed reconciliation, existing global ID contract and race design | Drop only newly introduced index if separately approved; preserve every shift/evidence record. Global-to-compound uniqueness is a contract change, not an automatic index swap |
| Add ordinary query indexes | Review actual deployed listIndexes/explain/collection size; assess redundancy and write load; add explicitly named index in approved window | Remove only the new named index with approval; do not drop unrelated existing indexes or use syncIndexes |
| Store private media elsewhere | Dual-read local/new storage references; authenticated upload/preview/download; verify copy/checksum and preserve old files until approved retention | Continue reading both stores after rollback; do not delete originals or new objects while references exist |
| Salary correction history or policy version | Add optional immutable history/policy metadata, define correction/pay lock approvals; old amounts/month/year unchanged | Keep history and originals; revert new behavior without dropping paid/corrected records. Financial reconciliation requires human approval |
| Renamed client component/page module | Retain old exports and paths; no wire/schema changes | Restore consumer imports; same underlying picker still available; no DB/cache reset |

Every data migration needs protected backup of affected collections/media, read-only count/relationship preflight, deterministic filter, resumable checkpoints, idempotent operation, documented per-record rollback provenance, dry-run report and explicit execution approval. Workspaces without Git need a protected code snapshot/versioned artifact before risky rollout; do not assume git reset is available or authorized. Rollback is not permission to delete newly created user data.

## Validation plan and explicit approval gates

Added and executed focused non-writing tests: **5 passed, 0 failed** across two files:

- `tests/architecture/attendance-contract.test.ts`: legacy photo-only and optional fields, validation boundary, malformed date/photo/notes, rejection of injected guard/site/status and location fields.
- `tests/architecture/india-time.test.ts`: India midnight/year rollover, half-open UTC bounds, leap day, immutable inputs/results, invalid/unsupported historical dates.

Ran `node --import tsx --test tests/architecture/attendance-contract.test.ts tests/architecture/india-time.test.ts` on Node v22.20.0 with process-local `TSX_DISABLE_CACHE=1`, restored afterwards. Inspected the installed loader to confirm that this setting selects an in-memory Map instead of the disk cache. These pure cases perform no file/database/network writes and import no server/models/env/seed path, so they fit the permitted focused non-writing checks. No test runner/package additions were needed. This verifies the tested helpers/schema, not full API/browser/type compatibility.

Further focused checks require separate scope: DTO fixtures from sanitized historical records for both adapters; route status/body/cookie compatibility; unrelated guard/supervisor/site denial; concurrent duplicate start/end/review and interrupted writes; offline owner/reassignment/expiry retries; upload signature/size/path constraints; image picker preview/cancel/loading/error; date display with a non-India device timezone; old/new API paths and private cache isolation. Avoid photographing real users or copying private files into fixtures.

| Gate | Required approval / evidence | Status |
| --- | --- | --- |
| G01 Blueprint | Complete PDF Part A/B source and exact requirement mapping (D01) | Blocked: source absent |
| G02 Checks | Explicit permission for build/typecheck/broad tests and any check that writes artifacts; pure focused non-writing diagnostics are permitted | Five focused tests passed; build/typecheck/broad checks not run |
| G03 Business change | Approved D02-D06 decisions for attendance/site/private grants/offline dates/payroll | Pending; no policy changed |
| G04 Schema/index/data | Concrete reviewed dry-run, protected backup/restore, compatibility and rollback; explicit migration/index execution approval | Pending; no migration code run |
| G05 Deployment/flags | Reviewed artifact/config/roles/site scope/HTTPS/private storage, reversible path, execution approval before deployment or production writes | Pending; no deploy/flag activation |

Static source review and local link/contract/import searches are permitted. Focused helper/schema results do not establish live API/browser acceptance. The subsequent RBAC slice resolves the ownership/site/privacy and retry-disclosure subset below; startup, timestamps and transactional/state concerns remain open. Blueprint-specific traceability remains blocked by G01.

## Subsequent RBAC implementation

The requested RBAC slice now implements optional supervisor assignment/revision fields, current-account authentication, explicit route permission/resource gates, scoped queries and private serializers, privileged intent/denial/domain audits, admin assignment/history UI/APIs, and browser/API-cache isolation. See [authorization policy and rollout](AUTHORIZATION.md) for the current contracts, fixed permission table, safeguards and limits; [progress](IMPLEMENTATION_PROGRESS.md) records 14 passing focused synthetic authorization cases. Earlier gate status rows above describe the architecture-only stage, not current RBAC completion. Core security restrictions were authorized by the RBAC prompt; ambiguous financial/elevation rules and production execution remain gated. No migration/index/backfill or risky startup was executed. Delegation/emergency is blocked on D11, and no bypass flag is added.
