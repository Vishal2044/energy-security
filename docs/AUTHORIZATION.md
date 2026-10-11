# Server authorization and rollout

Updated: 2026-10-10 (Asia/Kolkata). This slice implements the explicit RBAC request against actual source. The blueprint PDF remains absent; this is not Part A/B certification. Delegation and emergency access remain disabled because the selected existing policy has not been described or located.

## Current policy

Every route in `server/route.ts` passes the central authenticated allowlist before handlers, uploads or serialization. New unlisted APIs deny access, including admin callers. Public login/logout remain public; `/health` is mounted outside this router and unchanged. Preflight CORS remains handled by the existing application middleware.

| Requested permission | Admin | Supervisor / MAIN_SECURITY | Guard |
| --- | --- | --- | --- |
| USER_CREATE | Yes | No | No |
| USER_DISABLE | Yes; existing self-admin boundary retained | No | No |
| SITE_MANAGE | Yes | No | No |
| ATTENDANCE_VERIFY | Yes | Actual attendance/request site must be explicitly assigned | No |
| SALARY_VIEW | Yes | No | Own guard only; association required |
| SALARY_APPROVE | Yes; existing mark-paid/correction APIs | No | No |
| DOCUMENT_DOWNLOAD | Yes; existing admin download audience | No | No; own preview retained |
| AUDIT_VIEW | Yes | No | No |
| REPORT_EXPORT | Attendance and salary | Assigned-site attendance only | No |

Salary export additionally requires SALARY_VIEW and retains the existing admin route restriction. Additional permissions cover operational reads, attendance submission, incident management, profile/document preview, existing user management, and admin assignment management. These are fixed role permissions, not arbitrary per-user grants. No new salary approval state, generation policy or paid-period rule is invented.

- Guard reads use the current account's guardId, never a supplied query owner or JWT role/guard/site grant. Missing association fails closed rather than selecting all records. Guard submissions retain the existing image-upload workflow and reject explicitly inactive guards.
- Supervisors read guard/profile/photo operations only at assigned sites. Profile/guard serializers exclude private identity, bank, address, salary and document fields. Own personal profile/document preview remains available. Admin retains agency-wide access within current single-agency architecture; no tenant policy is assumed.
- Stale guardId on non-guard accounts is ignored by profile/photo/session joins; guard alias resolution uses a valid guard-role association. Supervisor guard search uses only visible operational name/code/mobile, while admin retains village search.
- Attendance, incidents, requests and attendance CSV use each record's siteId. Guard profile/list visibility uses current guard assignedSite. Moving a guard does not move historical records. Scoped review/incident handlers also filter their queries; notification read/read-all uses recipients, not operational site membership.
- Documents/salary are private to admin or owner where the existing API permits ownership. Preview rechecks ownership and local-path containment; downloads reject stored paths outside uploads. No real documents were opened during implementation.
- Duplicate attendance retry IDs must match current guard, event, photo and applicable verification request before returning evidence. This closes disclosure, but does not make shift/attendance writes transactional or solve all offline conflicts.

## Identity, assignments and history

Authentication verifies the existing cookie or bearer JWT, then loads the current account for each request. Deleted, explicitly inactive and unknown-role accounts are rejected. Old JWT role/guard/site claims cannot authorize access. Legacy missing-active records retain the existing enabled interpretation. Lookup failures never fall through to a privileged handler; existing persistence fallback/startup behavior is a separate unresolved risk.

Optional `User.assignedSiteIds` and `User.accessRevision` extend Mongo and memory records. Missing sites mean no supervisor site access; missing revision reads as zero. No collection rewrite, index change or bulk backfill was executed.

- `PATCH /api/users/:id/access`: ACCESS_MANAGE (admin), supervisor targets only, strict body `{ assignedSiteIds, expectedRevision, justification }`. IDs must exist, be unique and bounded; reason is 8–500 trimmed characters. Empty sites revoke access. Existing inactive sites can be selected for historical operations; assignment does not activate sites. No extra permission/elevation fields accepted.
- Mongo uses conditional revision/role update; memory rechecks after awaited audit. Stale edits return 409 `ACCESS_CHANGED_RELOAD`. The team editor provides site loading/retry/empty/pending/conflict states, justification and history with India timezone display.
- `GET /api/users/:id/access-history`: admin-only; latest 100 matching User assignment, creation, account update and password audit entries. Legacy records may have incomplete history; no synthetic history is generated. This view is not an immutable ledger or full paginated export.
- ACCESS_CHANGE_REQUESTED is written before mutation, ACCESS_CHANGED records before/after sites/revision/reason after success. Existing account creation/update audits are reused. Privileged API intents and denials are audited without request bodies, photos, passwords or document content. Incident status, document upload and salary paid/correction success audits were added; salary correction reasons are retained in audits.

Pre-handler audit failure blocks sensitive exposure/write. Domain mutation and its success audit still lack a shared transaction: a success-audit failure can follow a committed mutation. Requested intent is not proof of success. Mongo audit durability, retention, tamper resistance and concurrency remain unverified.

Attendance review additionally constrains related request and shift writes by the attendance guard/site (and compatible request shift). Inconsistent foreign links do not grant mutation rights; the in-scope human review can complete without rewriting those foreign records. No historical links are automatically repaired.

## Browser privacy and compatibility

The React Query cache clears on account changes, successful logout and authenticated 401 responses. Both Vite PWA configurations use NetworkOnly for API requests. Boot/login/logout delete only the old `api-cache`; shell caches and owner-tagged IndexedDB attendance evidence are retained. New API authorization responses carry `private, no-store`.

Verification added request/session generations so old 401 responses do not expire a newer login. Guard replay checks the active generation before sends and after awaiting responses, aborts on effect cleanup and retains evidence when the session changes. Cookie expiration now matches setter path/HTTP-only/secure/SameSite attributes. These fixes do not implement server-side copied-JWT/password-change revocation or certify real browser cookie/service-worker behaviour.

Browser routes, `/api` paths, normal success envelopes, user IDs, event types and existing offline queue are retained. New assignment/history APIs and operational profile scope are additive. Denials, supervisor redaction, empty unassigned operational results and owner/event retry conflicts intentionally tighten unsafe access. Existing supervisors are not automatically granted guessed sites. Old cached pages/data already viewed cannot be remotely recalled; deployed older service workers must update. Browser/device and service worker behavior has not been exercised.

## Approval gates and safe rollout

1. Before any release, approve build/typecheck and a scoped Mongo/browser QA plan. Verify both persistence adapters, cookie/bearer auth, profile/photo/document denial, historical actual-site behavior, concurrent assignment revisions, admin boundaries, export scope, and account switching including deployed service worker update. No such production checks ran.
2. Obtain protected code/data/media backup and restore evidence before approved deployment. Existing startup cleanup, known-admin bootstrap and Mongo-to-memory fallback remain unsafe and unchanged. Starting the app is not a read-only diagnostic.
3. Review each supervisor's intended sites and grant explicitly via the new admin API/editor only after deployment/production-write approval. Current implementation uses absent assignments as deny-by-default. No unattended assignment migration is proposed. If a future import is requested, first prepare a read-only count/relationship dry-run, reviewed per-user assignments, revision-safe resumable writes and exact before-state rollback.
4. Retain optional fields/audits and all original users/attendance/salary/documents on rollback. Reverting this slice to prior global/private reads restores known security defects; preferred rollback is to disable affected operational access and fix forward while retaining authorization. Never add an authorization-bypass flag. Any coordinated code/service-worker rollback and assignment restore needs a reviewed artifact and explicit execution approval.
5. Delegation/emergency needs the existing approved policy source, grantor/approver separation, permitted permissions/sites/targets, duration/expiry, justification, revocation, post-access review and history requirements. No elevation endpoint, flag or guessed default is enabled. Tenant boundaries require a separately approved SaaS policy.

## Files and verification

Backend/shared: `shared/permissions.ts`, `shared/types.ts`, `server/authorization/{authenticate,middleware,routes}.ts`, `server/services/{auth,memory}.ts`, `server/models/index.ts`, `server/route.ts`, `server/config/env.ts` (test-only local-secret isolation).

Client/config: `client/src/components/access/SupervisorAccessEditor.tsx`, `client/src/pages/{AdminTeam,UserProfile,ManagementGuards,AdminDashboard}.tsx`, `client/src/{App.tsx,lib/api.ts,lib/session.ts}`, root and client `vite.config.ts`.

Focused verification: `tests/authorization/rbac.test.ts` **20 passed**, `client-session.test.ts` **4 passed**; all zero failures in the latest affected run. Router uses isolated loopback/synthetic memory and injected failures, imports no startup/connect/seed, asserts disconnected DB, skips .env and disables TSX disk cache. Client tests use synthetic Axios and fake browser/IDB/cache adapters only. Added stale-role/link/search/logout/nullable/onboarding/assignment and session/replay regressions; no real media or persisted data accessed. Full detail: [verification report](VERIFICATION_01_03.md).

Verification parser/reference checks: 62 TS/TSX files, zero syntax diagnostics/unresolved relative paths; this is not typechecking. Earlier policy coverage checked all 54 declarations (56 expanded event paths); latest diagnostics are recorded in IMPLEMENTATION_PROGRESS.md. Five architecture helper/schema tests were rerun and passed during verification, giving 29 unique focused latest-passing cases. No build/typecheck/broad suite, live Mongo/media, normal startup/browser, migration/dependency install/deployment/production write was performed. Production release remains NOT READY due to documented legacy risks and critical unperformed checks.
