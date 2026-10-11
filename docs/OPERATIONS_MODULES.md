# Security operations modules

This implementation adds the operational foundation requested for guard lifecycle and site operations while preserving existing attendance records and routes.

## APIs

- `POST /guards/import` — admin-only bulk onboarding with duplicate checks.
- `POST /guards/:id/lifecycle` — admin-only onboarding, suspension, resignation, exit, rehire and transfer events.
- `GET /guards/:id/id-card` — role-scoped ID-card data.
- `POST /rosters`, `GET /rosters`, `PATCH /rosters/:id`, `POST /rosters/:id/acknowledge` — roster publication, conflict checks and guard acknowledgement.
- `GET/POST /leave-requests`, `PATCH /leave-requests/:id/decision` — leave workflow and roster conflict protection.
- `GET/POST /replacements`, `PATCH /replacements/:id/decision` — replacement suggestions and approval.
- `GET/POST /overtime`, `PATCH /overtime/:id/decision` — auditable overtime requests; payroll is not changed automatically.
- `GET /operations/dashboard` — site coverage, attendance pending, shortage, open incidents and leave queue from persisted records.

All manager routes are limited to assigned sites. Guard routes derive the guard identity from the authenticated session. Dates are validated as India business dates and timestamps are stored as UTC `Date` values.

Bank fields remain behind the existing admin-only guard profile mutation for API compatibility; every such mutation is included in the guard update audit event with a bank-change reason. A second-person approval workflow is not enabled because the current role model has no approved bank approver role. This is a release decision to review before payroll production use.

## Data compatibility

The new Mongoose fields are optional. Existing guards, sites, incidents, attendance records and legacy attendance image records continue to load without a migration. The memory adapter has matching collections for development and focused API tests. `npm run seed` removes the new operational collections only when an explicit development reset is requested.

## Incident lifecycle

New incidents keep the existing category/description/photo contract and may additionally include severity, priority, witnesses, attachments and recurrence keys. Managers can acknowledge, assign, add comments/handover/actions, resolve with evidence, or reopen with a reason. Closure evidence and activity entries are audit data—not automatic proof that an incident was physically verified.

## Attendance boundary

Attendance remains image-only with privileged manual review. No GPS, live tracking, browser camera, geofence or automatic verification has been introduced by these operations modules. Photo similarity and client metadata remain review signals, not tamper-proof presence proof.

Leave balances, recurring roster expansion, holiday calendars, SLA policy values and automatic notifications remain configurable follow-up work; no company policy was invented in their absence.
