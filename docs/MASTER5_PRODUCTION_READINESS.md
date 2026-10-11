# Master Implementation 5 — production readiness

Updated 2026-10-11 (Asia/Kolkata). This document records the bounded slice implemented in the existing application. It does not certify production readiness.

## Implemented

### Notifications and communication

- Notifications keep the existing in-app/read/unread contract and now support `priority`, delivery attempts, retry time, deduplication, acknowledgement, expiry, source, site and optional tenant fields.
- `GET /api/notifications` supports bounded `limit` and `offset` and returns `unreadCount`.
- Guards can read/update `GET/PATCH /api/notifications/preferences`. Preferences include in-app/push/SMS/email/WhatsApp flags, category switches, quiet hours and timezone. Only in-app and optional Web Push are wired; SMS, email and WhatsApp are not silently simulated.
- `POST /api/notifications/:id/acknowledge` records acknowledgement and actor. `POST /api/notifications/broadcast` is restricted to Admin and assigned Main Security users, with optional site/guard targeting and emergency acknowledgement.
- Existing operational events now create notifications for roster assignment/change, leave decisions, rejected attendance, document review, payroll publication and selected escalation/missing-attendance/expiry reminders.
- A 15-minute job runs reminders and retries failed/unavailable/no-subscription push delivery. Dedupe keys prevent the same scheduled reminder from being recreated during the same window.
- Push delivery remains optional and requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and client `VITE_VAPID_PUBLIC_KEY`. No paid provider or external messaging credential was added.

### Reliability and observability

- `X-Request-Id` is accepted in a bounded form or generated server-side and included in error logs/responses.
- `/api/health/live` is a liveness check. `/api/health/ready` fails when MongoDB is unavailable. Existing `/api/health` remains backward-compatible.
- Notification retry and job failures are logged without changing attendance, payroll or verification state.

### Multi-tenant preparation

- Optional indexed `tenantId` fields were added to users, guards, sites, attendance, documents, incidents, salaries and notifications. They are dormant compatibility fields only.
- No tenant is activated, no records are reassigned, and no cross-tenant query behavior is claimed. Tenant rollout requires an approved identity, isolation and migration design.

### Guard experience

- The existing notification page now shows in-app/push preference controls and an acknowledgement action for emergency notifications.
- Existing Gujarati copy, guard ownership checks, offline attendance flow and private-record filtering remain in place.

## Deliberately staged / not activated

These items need product, legal or operational decisions before implementation can be safely completed:

- Client portal external accounts, invoice numbering, billing rates, tax/GST treatment, payment terms and client visibility. Guard salary and private documents must remain excluded from client views.
- Equipment issuance/returns, training certificates/expiry, visitor logs, inspections, SOP acknowledgement and grievance workflows need approved schemas, retention rules and role ownership.
- Tenant activation needs tenant identity, admin boundaries, migration/backfill, unique-key strategy and tenant-aware authorization tests.
- External SMS/email/WhatsApp delivery needs provider, consent, template, cost, retry and failure-handling decisions.
- Backup provider, retention, encryption, restore RTO/RPO and incident ownership are deployment decisions; application code does not claim that backups exist.

## Security and data tradeoffs

- Notification targeting is server-side: guards receive their own records, Main Security receives assigned-site notifications, and Admin can broadcast globally. Route policy and resource checks remain mandatory.
- Browser push is best-effort. A `SENT`/`NO_SUBSCRIPTION` result is delivery telemetry, not proof that a person read a message.
- Existing Base64 attendance, historical records and routes remain compatible. No migration, rewrite or deletion was performed.
- Attendance remains image-only with privileged manual review. GPS, live tracking, forced camera capture and automatic verification were not introduced. Photo metadata never proves physical presence.

## Verification status

| Area | Status | Evidence boundary |
| --- | --- | --- |
| Notification routes, models and memory adapter | Implemented | Source inspection only in this turn |
| Notification preferences/broadcast/acknowledgement UI | Implemented | Browser behavior not run |
| Reminder/retry scheduler | Implemented | Live clock, Mongo and job execution not run |
| Health endpoints/request IDs | Implemented | Server startup not run |
| Optional tenant fields | Implemented, dormant | No migration or isolation rollout |
| Client billing/portal | Staged | Business decisions and schema approval required |
| Equipment/training/visitor/inspection/grievance | Staged | Bounded vertical slices not yet approved |
| Automated tests | Focused policy test added separately | Tests were not run under the current execution policy |
| CI/CD | Procedure documented below | No CI, deployment or production write performed |

The checked-in `client/dist` was not regenerated because build execution was restricted. A reviewed build is required before the new notification UI can appear in a static production deployment.

## Prompt 24–30 coverage classification

| Prompt area | Classification | Current boundary |
| --- | --- | --- |
| 24 Notifications and communication | Implemented but not executed/tested | Routes, preferences, targeting, reminders and retry state are present; provider delivery and live jobs are unverified |
| 25 Mobile UX, localization and accessibility | Partially implemented | Existing mobile guard flow, loading/error/empty states and notification labels remain; Hindi, complete saved-language switching, full translation coverage and browser accessibility audit remain |
| 26 Client portal, billing and invoicing | Requires business decision / not implemented | External access, rates, tax, invoice and receivables policy are not defined or activated |
| 27 Equipment, training, SOP and visitor operations | Partially implemented | Existing site/guard metadata is retained; dedicated inventory, issue/return, training, visitor and SOP workflows remain staged |
| 28 Inspections, grievances and multi-tenancy | Partially implemented | Optional tenant indexes are a dormant foundation; inspection/grievance workflows and tenant isolation are not activated |
| 29 Automated testing and CI/CD | Implemented but not executed/tested | A notification policy contract test and existing focused suites are documented; restricted checks were not run |
| 30 Performance, monitoring, backups and production readiness | Partially implemented | Pagination, indexes, request IDs, health endpoints and job retry state exist; provider monitoring, restore proof, deployment and rollback execution remain unverified |

The supplied Security Management Blueprint was not available in the repository during this slice, so a page-by-page blueprint reconciliation cannot be claimed.

## Recommended CI and release gates

Run these only in an approved CI/review environment:

```sh
npm ci
npm run check
npm run build
node --import tsx --test tests/architecture/*.test.ts tests/authorization/*.test.ts tests/security/*.test.ts
```

Before release, also run an isolated Mongo fixture, browser checks for notification preferences/acknowledgement, a service-worker push check, authorization negative cases, and a backup restore drill. Do not run migrations or seed/reset against production as part of CI.

## Backup and restore runbook template

1. Record the MongoDB backup identifier, UTC start/end, encryption key reference and operator.
2. Restore into an isolated database with network access restricted to the test operator.
3. Verify users, guards, sites, attendance evidence, documents, payroll and audit records by counts and sampled IDs.
4. Verify indexes and authorization using a non-production application instance.
5. Record restore duration, missing records, corrective action and approval before any production recovery.

The repository does not contain provider credentials or a backup command, so backup success and restore RTO/RPO are unverified.
