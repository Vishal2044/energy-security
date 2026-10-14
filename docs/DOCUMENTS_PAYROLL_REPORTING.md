# Documents, photo payroll and reporting

## Documents

Admin and Supervisors can add or replace documents for guards they are authorized to manage. Supervisors are constrained to their assigned sites in creation, edit, document lists and private file routes. Guards can view their own documents but cannot upload or change them.

New manager-added documents have status APPROVED immediately. There is no document verification/rejection workflow. Legacy stored review fields are preserved for compatibility but are not exposed as current review tasks.

## Photo payroll

The guard's configured day/night shift has four daily live-photo slots. Each accepted photo earns its configured rate; an expired slot without a photo earns zero. Worked-day, full-day, partial-day, absent-day, received-photo and missed-photo counts are derived from the same attendance ledger as earnings.

The original legacy Salary collection remains intact. The new PhotoPayroll collection stores immutable credited-month snapshots and payment references. Until credited, photo salary is derived from the guard's effective-dated policies and received photos; no read endpoint writes payroll rows.

API routes:

- GET /photo-payroll: scoped photo salary, counts and credited status.
- POST /photo-payroll/credit/:id: Admin records a completed external payment and reference.
- GET /photo-payroll/payslip/:id: private printable payslip for a credited record.

A month remains open until 10:00 IST on the following month's first date, so its final night-shift photo can arrive. Open periods cannot be marked credited. A credited period cannot be paid twice or silently recalculated.

Previous salary records and their existing payment workflow remain under the historical-record section. Historical paid records are never overwritten by the new photo calculation.

The app records company payment status; it does not execute or independently verify bank transfers.

## Validation

Focused synthetic tests are tests/photo-duty.test.ts and tests/photo-duty-management.test.ts. They do not connect to MongoDB or write uploads. Production MongoDB indexes/concurrency, real phone camera access and payslip/payment smoke checks are still required. Build/typecheck commands require owner permission.

Schema changes are additive. No destructive migration or automatic historical-rate backfill is run. Existing historical reports remain available; photo attendance and photo salary are shown in their dedicated pages.
