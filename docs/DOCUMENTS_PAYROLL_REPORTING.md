# Documents, Payroll and Reporting

## Implemented

- Guard document self-upload remains multipart and Base64/attendance compatibility is untouched. Document records now optionally carry `status`, reviewer decision/reason, expiry, version chain, SHA-256 duplicate warning, masked document number, sensitivity and access timestamps.
- Admin and assigned Main Security users can review document metadata, preview/download authorized files, review versions and run bounded bulk decisions. Guard uploads start as `PENDING`; only an authorized reviewer can approve or reject them.
- Payroll uses integer paise arithmetic and explicit company inputs only. No statutory rate, holiday rule or allowance is inferred. Approved attendance (`verificationStatus=verified` or legacy `VERIFIED/CORRECTED`) is the payable attendance source; approved overtime is included when supplied.
- New payroll workflow is `REVIEW -> APPROVED -> LOCKED -> PAID -> RECONCILED`. Locked/paid records cannot be silently corrected. Payment references and audit history are recorded. Payslips are private printable HTML so a browser can save/print PDF without adding a PDF dependency.
- Added scoped CSV reports for payroll, documents, incidents and site coverage. Existing salary, attendance routes and historical fields remain available.

## API additions

```text
POST  /guards/:id/documents
GET   /documents?status=&search=&guardId=
PATCH /documents/:id/review
POST  /documents/bulk-review
GET   /documents/:id/history
POST  /payroll/preview
POST  /payroll/run
GET   /payroll
PATCH /payroll/:id/approve|lock|pay|reconcile
POST  /payroll/bulk-approve   (confirmation: APPROVE)
GET   /payroll/:id/payslip
POST  /guards/bulk-lifecycle
GET   /reports/payroll.csv
GET   /reports/documents.csv
GET   /reports/incidents.csv
GET   /reports/site-coverage.csv
```

Payroll preview/run accepts `month`, `year`, optional `guardIds`, and an explicit `policy` object such as `{ "basicSalary": 18000, "overtimeRate": 120, "allowances": 500 }`. The policy is stored as a version label, not treated as legal/statutory configuration.

## Configuration and installation

No new dependency is required. Existing installation remains:

```bash
npm install
```

Mongo deployments should create the new optional indexes from `server/models/index.ts` during the normal application startup/index lifecycle. No destructive migration is needed; old document and salary rows continue to read through legacy fields.

## Verification checklist

Run only with project-owner approval under repository execution policy:

```bash
npm run check
npm run build
```

Manual checks should cover guard self-upload, rejected replacement, duplicate warning, expiry display, supervisor site scoping, payroll preview against approved attendance, invalid workflow transitions, locked correction rejection, private payslip access, bulk confirmation and CSV scope.

The document hash is exact-file detection, not identity proof. Payroll is a calculation and approval record, not a bank transfer. Browser/device timestamps, images and operational records do not independently prove physical presence.
