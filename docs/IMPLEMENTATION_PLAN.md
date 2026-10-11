# Implementation plan

Baseline: 2026-10-10. Prompt 01 authorized audit documentation; subsequent prompts authorized architecture scaffolding and the core RBAC slice recorded below. The risk-ranked sequence remains a proposal for remaining work, not approval for ambiguous policies or command execution. See [feature matrix](FEATURE_MATRIX.md), [decisions](DECISIONS_NEEDED.md), [progress](IMPLEMENTATION_PROGRESS.md), [architecture decisions](ARCHITECTURE_DECISIONS.md) and [authorization rollout](AUTHORIZATION.md).

Subsequent [verification](VERIFICATION_01_03.md) applied V01–V08 targeted corrections and executed 29 unique latest-passing focused cases. Stages remain partial where explicitly listed; blueprint/policy and startup/config/storage/live validation gaps still prevent production readiness. No migration/index/dependency/deployment was performed or authorized by this verification.

## Traceability gate

The complete blueprint is missing. Obtain both parts, record file identity/version and page count, then enumerate every requirement as `A-<section>-<item>` or `B-<section>-<item>` with page, exact requirement summary, source evidence, existing/partial/missing/conflict status, dependency, decision and acceptance check. Separate multi-behavior bullets into testable rows, include recommendations and conflicts, and reconcile total source items with mapped rows. Retain B01-B36 as baseline evidence and link them to real PDF IDs. Do not claim exhaustive mapping or choose a next PDF feature until this gate is complete.

## Risk-ranked slices

| Stage | Concrete outcome / reusable paths | Dependencies / decisions | Acceptance evidence to prepare |
| --- | --- | --- | --- |
| 0 | Complete Part A/B mapping and select the next bounded module | D01; current source evidence | Every requirement mapped with page references; contradictions explicitly recorded |
| 1 | Close cross-guard reads and retry disclosures; fail closed for missing guard association; align document/salary permissions | B03/B10/B14/B19/B22; D03; auth/serializers/route handlers | Two guards, admin and in/out-of-site supervisors; direct endpoint access; no unauthorized photo/doc/salary/evidence fields |
| 2 | Enforce active-account access and production configuration; isolate browser query/offline/API cache across accounts | B02/B30/B32/B33; D07/D09; auth/App/QueryClient/Vite configs | Disable/reassign/password-reset scenarios, logout/login with second guard, offline shared-device behavior; production Mongo failure does not silently accept volatile writes |
| 3 | Make existing attendance events and retries consistent, without changing event policy | B08-B16; D02/D04; models/API/jobs/capture/layout/history/review | Duplicate and concurrent retries, partial write recovery, valid/invalid state transitions, submitted evidence past deadline awaiting review, owner/type mismatch, offline end/start sequence |
| 4 | Use Asia/Kolkata date boundaries and display consistently without reinterpreting historical records | B12/B13; D04/D05; dateRange/trend/guard/admin pages | UTC 18:29:59 vs 18:30:00 boundary, overnight duty, delayed sync, month end, device timezone differing from India |
| 5 | Align upload limits/content checks and document scope/lifecycle | B22-B26; D03/D08; storage/Multer/JSON parser/CameraCapture/profile/docs UI | Allowed/disallowed signatures, boundary image sizes including Base64 overhead, malformed photo, owner/site denied, path traversal, failed metadata save, missing-file preview |
| 6 | Complete incident validation/audit and frontend failure handling | B21/B27/B29; D03; IncidentForm/Management/routes | Guard own site, valid transition, invalid status, unauthorized supervisor, loading/empty/error and mutation retry; audit before/after |
| 7 | Payroll workflow only after approved policy; preserve existing salary history | B18-B20; D03/D05/D06 | Policy-approved examples, unique period generation if required, paid/corrected record behavior, finite/ranged amounts, persisted reason/audit, permission parity and actual selected period |
| 8 | Finish localization, UI states and truthful documentation in selected module | B26/B28/B29/B36; earlier selected slice | Gujarati review, error distinct from empty, pending/disabled actions, usable preview, current README behavior |
| 9 | Release readiness and focused QA for approved slices | D07/D08/D09; test harness and explicit execution approval | Approved targeted tests/checks, backup/restore evidence, deploy/revert plan, cache/HTTPS/storage/push configuration verification |
| Deferred | SaaS tenancy/billing or any additional PDF feature | D01/D10; complete Part B; explicit module selection | No tenancy rewrite or pricing/law assumptions before requirements and policy approval |

Stages are risk ordering, not authorization for a broad refactor. Select one stage/module and its necessary dependencies per future prompt. Reuse Zod, current role middleware, recordAudit, Axios error envelope, QueryClient, shared loading/empty components, Gujarati dictionaries and existing string IDs. Avoid new libraries until a confirmed requirement cannot be met with the existing stack.

Each implemented slice should carry server ownership/site validation, API compatibility, frontend loading/error/empty/pending states, audit with safe metadata, and meaningful targeted tests. Authorization must precede target serialization or duplicate response. Do not copy sensitive documents/photos into audit metadata. Preserve API prefixes, route names and existing success/error envelopes; document any security-driven access restriction.

## Data safety and rollback before risky work

RBAC implementation now closes the ownership/site/privacy/duplicate-disclosure parts of stage 1 and the current-account/cache parts of stage 2. Stage 2's secrets/bootstrap/persistence hardening, stage 3's transactional/offline state work, and other domain policies remain open. Optional supervisor site/revision fields, the admin assignment/history UI/APIs, explicit permission allowlist and selected privilege audits are implemented. Fourteen focused synthetic authorization tests passed; no normal startup/live Mongo/browser/build/typecheck/deployment was performed. Delegation/emergency remains disabled pending D11. See AUTHORIZATION.md for exact compatibility, site assignment prerequisites, validation and rollout/rollback approval gates; previous stage proposals must not be treated as completed wholesale.

No migration is needed for these audit documents. Do not run application startup, `npm run seed`, or database cleanup as a diagnostic: startup calls removeLegacyCoordinates and seeds an admin; seed explicitly deletes all application collections.

For a future approved schema/data change:

1. Inventory affected record counts, missing fields, legacy IDs, duplicate keys and deployment constraints read-only. Do not assume declared indexes are installed or that a replica set is available.
2. Specify an additive optional-field/index change, compatibility serializer/read path, and policy for existing records. Keep historical attendance/salaries/documents intact and do not invent capture timestamps or tenant assignments.
3. Produce a reviewable dry-run, exact migration scope and rollback before requesting execution approval. Back up affected records and media, with protected access and a verified restore procedure.
4. For active-shift uniqueness, resolve existing duplicates through human review first; do not delete/merge automatically. For site scope/tenancy, stage explicit assignments and verify grants before enabling enforcement.
5. Avoid destructive unsets. The current startup cleanup cannot recover removed coordinates or original address values without a backup; record that limit rather than claiming a reversible migration.
6. Deploy compatible code first where appropriate, apply approved bounded migration separately, then verify counts and relationships. Roll back new behavior without dropping new records; remove only newly added indexes/fields when that is separately approved and lossless.

## Validation and execution boundary

The baseline audit used static reads/searches only and found no test harness. The architecture slice adds two focused Node test files for attendance request compatibility and India date boundaries; five pure non-writing cases passed with the loader disk cache disabled. Further tests should verify unauthorized access, retry consistency, state transitions and upload-size/content failures. Use synthetic fixtures and isolated storage; never import the production startup/seed path into tests. No dependencies or broad harness were added.

Builds, typechecks, broad tests, migrations and deployments need explicit user permission. Focused tests that mutate fixtures/files also need permission under the supplied non-writing-check policy. Static reviews and documentation link/status checks may proceed. No runtime pass is implied by source presence.

## Next prompt readiness

Code inventory, safe shared attendance schema, time helpers and upload naming compatibility are ready for reviewed incremental work; focused tests passed, while typecheck/full API/browser validation remain pending. Full blueprint traceability and a PDF-specific feature implementation remain blocked on D01. Attendance semantics, supervisor scope, payroll rules and any risky data changes need their listed decisions before dependent behavior is changed. ARCHITECTURE_DECISIONS.md defines the next module seams, migration/rollback contracts and G01-G05 approval gates.
