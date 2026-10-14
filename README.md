# Elector Security

Gujarati-first security agency operations platform for managing guards, sites, attendance evidence, rosters, incidents, documents, payroll, notifications and reports.

> **Current attendance policy:** guards send scheduled live-camera photos; all other guard data is read-only. Salary is calculated per received photo, with automatic missed-slot deductions. Browser camera access or image pixels do not independently prove physical presence.

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111827)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7%2B%20%2F%20Mongoose-47A248?logo=mongodb&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-mobile%20ready-5A0FC8)

## Contents

- [What the application does](#what-the-application-does)
- [Roles and access](#roles-and-access)
- [Implemented modules](#implemented-modules)
- [Attendance workflow](#attendance-workflow)
- [Security and privacy](#security-and-privacy)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Development commands](#development-commands)
- [Demo credentials](#demo-credentials)
- [API overview](#api-overview)
- [Testing and release checklist](#testing-and-release-checklist)
- [Known limitations](#known-limitations)
- [Project documentation](#project-documentation)

## What the application does

Elector Security supports day-to-day security-agency operations across multiple sites:

- Admin creates and manages users, guards, sites, assignments and operational policies.
- Main Security / Supervisor creates and maintains guards, per-photo rates and documents within assigned sites.
- Guards capture and send four scheduled live-camera photos per day/night duty; all other guard records are read-only.
- Management can track roster coverage, leave, replacements, overtime, incidents, documents, payroll and reports.
- The React application is responsive and PWA-ready for mobile guard usage.
- Gujarati and English UI support is available through the shared language state and translation dictionaries.

## Roles and access

| Role | Main capabilities | Privacy boundary |
| --- | --- | --- |
| **Admin** | Agency-wide users, guards, sites, assignments, photo attendance, documents, payroll, audit, reports and settings | Full authorized management access; sensitive actions are server-authorized |
| **Main Security / Supervisor** | Assigned-site dashboard, guard creation/edit, day/night shifts, photo rates, documents, attendance and incidents | Guard maintenance and private document access are limited to assigned sites |
| **Guard** | Scheduled live-camera photo capture; read-only own attendance, shift, notifications, profile, documents and salary | Guard identity is derived from the authenticated account; another guard's private records are denied |

The frontend hides unavailable menus for convenience, but the API is the security boundary. Every protected route must pass authentication, role and ownership/site-scope checks on the server.

## Implemented modules

### Authentication and account security

- JWT-based authentication with HTTP-only cookies and bearer compatibility.
- Short-lived access sessions and rotating server-side refresh sessions.
- Login throttling/lockout, logout, logout-all and session revocation support.
- Management password APIs and `passwordChangeRequired` handling for newly created/reset guard accounts.
- CSRF double-submit protection for cookie-authenticated state-changing requests.
- Exact-origin/CORS checks, Helmet security headers and generic error responses.
- Admin/security audit events for important authentication and management actions.

### Guard and site management

- Guard onboarding, edit, status/lifecycle events, transfer history and ID-card data.
- Bulk guard import with duplicate checks.
- Site creation/editing with assignment, client/contact, emergency, SOP, compliance and closure information.
- Explicit supervisor site assignments with revision-safe updates and assignment history.
- Historical attendance and operational records remain attached to their original site.

### Attendance and shift evidence

- Day duty photos: 08:00, 12:00, 16:00, 20:00 IST.
- Night duty photos: 20:00, 00:00, 04:00, 08:00 IST, anchored to the starting date.
- Each slot has a two-hour server-enforced submission window.
- Live camera capture only; no gallery picker or guard offline upload queue.
- One photo per guard/date/slot, with idempotent retries.
- No attendance approval or document verification.
- Expired missing slots are automatically missed/unpaid; zero photos in a finished duty means absent.
- Per-photo earnings and effective-dated rate/shift policies preserve historical salary.
- Historical attendance remains readable.

### Roster and workforce operations

- Legacy roster publication/editing APIs remain; the new photo schedule follows the configured recurring guard day/night shift. Guards cannot acknowledge or alter rosters.
- India business-date validation, overnight shifts and double-booking checks.
- Leave requests with decision workflow.
- Replacement suggestions and approval.
- Overtime requests and decisions with audit history.
- Operations dashboard for site coverage, attendance pending, shortages, incidents and leave queues.

### Incidents

- Guard incident creation with category, description, optional evidence and capture time.
- Management acknowledgement, assignment, comments, handover/actions and resolution evidence.
- Reopen flow with a reason and activity history.
- Site/guard scoping is enforced by the API.

### Documents and private media

- Admin/Supervisor document upload; guard documents are read-only.
- Manager-added documents are approved immediately; document type, filename and version data remain available.
- Private preview/download routes with authorization and local-path containment checks.
- Admin, assigned-site Supervisor and guard-self access follow server scope checks; private media is not public.
- Existing local upload paths and historical records remain readable when authorized.

### Payroll and reporting

- The current photo ledger calculates received/missed photos, worked/full/partial/absent days and earnings in integer paise.
- Admin records credited salary with an external payment reference after the month closes.
- Credited photo payroll snapshots cannot be paid twice or silently recalculated.
- Historical salary rows and existing legacy API contracts remain preserved.
- Private printable payslips are available for credited records.
- Existing historical CSV reports remain available; current photo data is shown in dedicated attendance and payroll pages.

### Notifications and PWA support

- Guards can read in-app notifications; notification write actions are unavailable to them.
- Slot reminders point guards to the live-camera home screen.
- Existing Web Push delivery uses VAPID credentials and authorized subscriptions.
- Service worker is generated by vite-plugin-pwa.
- Timed live attendance must arrive online before the deadline; no guard offline capture queue is drained.

### Localization and UI

- Gujarati/English language switch with persisted runtime preference and cross-tab updates.
- Shared translation of common labels, statuses, dates, empty states and page headers.
- Asia/Kolkata display formatting for user-facing dates while persisted timestamps remain UTC.
- Responsive layouts, safe-area support, keyboard/focus states and reduced-motion support.

## Attendance workflow

Guard login -> view configured day/night slot -> live camera frame -> capture session and photo submission -> server checks ownership, slot deadline and JPEG -> one recorded slot -> automatic per-photo earnings.

The camera session lasts at most two minutes and never extends the slot deadline. Window opening is inclusive and closing is exclusive. A night duty belongs to the date it starts. No GPS or live tracking is used, and browser camera capture does not prove physical presence.

The camera needs HTTPS on mobile (localhost works on the development computer). An HTTP LAN address cannot normally request the camera.

Salary is received-photo count at each applicable rate; missed photos are unpaid. A finished shift with zero photos is absent. Admin and assigned-site Supervisors set the per-photo rate and shift; future edits preserve previous earnings. Existing guards need an explicit photo policy saved before this calculation starts.

Guards see worked/full/partial/absent days, photo counts, deductions and credited/not-credited status. Admin records an external payment with a reference after the month closes; the app does not transfer money.

## Security and privacy

- Protected API routes use current-account authentication rather than trusting stale JWT role/guard/site claims.
- Guard-owned queries fail closed when the account has no valid guard association.
- Supervisor operations are limited to explicitly assigned sites.
- Private salary/document/media responses remove sensitive storage fields where appropriate.
- Uploaded files use randomized private storage keys, size/type/signature checks and image dimension limits.
- Private media is served through authorized routes with `no-store`; uploads are not publicly mounted.
- Audit metadata does not include passwords, document contents, bank details or photo contents.
- MongoDB is required in production; the in-memory adapter is for development/test fallback only.
- Normal startup must not be treated as a data-cleanup or migration command.
- Never commit `.env`, JWT secrets, Mongo credentials, VAPID private keys or uploaded media.

## Architecture

```text
client/                  React 18 + Vite PWA
  src/App.tsx            Auth bootstrap and role routing
  src/pages/             Admin, supervisor and guard screens
  src/components/        Shared UI and attendance capture
  src/lib/               API, session, offline queue and push helpers
  src/locales/           Gujarati/English dictionaries

server/                  Express + TypeScript API
  index.ts               HTTP server, middleware, health and SPA serving
  route.ts               Compatibility API routes and request validation
  authorization/         Authentication and permission policy
  models/index.ts        Mongoose schemas and indexes
  services/              Auth, storage, memory adapter, push and image analysis
  jobs/                   Scheduled expiry/reminder work

shared/                  Cross-layer contracts
  attendance.ts          Attendance payload validation and image limits
  permissions.ts         Role/resource permissions
  time.ts                UTC/India time helpers
  types.ts               Shared roles and enums

uploads/                 Private local media root in development
```

MongoDB is the primary persistence adapter. Development/test paths can use the explicit memory adapter when MongoDB is unavailable. The normal API response convention is generally `{ success: true, data }`; errors use `{ success: false, error, details? }`.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- MongoDB 7+ recommended for local development
- MongoDB replica-set/transaction support recommended for production workflows that use transactions
- HTTPS in production for secure cookies and browser features
- A writable private media directory for local uploads

## Installation

### Windows PowerShell

```powershell
git clone <repository-url>
Set-Location enegy-security
npm install
Copy-Item .env.example .env
```

Edit `.env`, start MongoDB if using persistence, then run:

```powershell
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite client uses port `5173`; the Express API uses port `4000`.

### macOS/Linux

```bash
git clone <repository-url>
cd enegy-security
npm install
cp .env.example .env
npm run dev
```

If `MONGODB_URI` is valid, records persist in MongoDB. In development, the application may use the memory adapter if MongoDB is unavailable. Do not rely on that fallback for production data.

## Configuration

Copy `.env.example` to `.env`. Values below are the supported configuration surface:

| Variable | Purpose | Development example |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | `development` |
| `PORT` | Express API port | `4000` |
| `CLIENT_URL` | Exact allowed browser origin | `http://localhost:5173` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/dg-energy` |
| `JWT_ACCESS_SECRET` | Access-token signing secret | Long random value; never use the placeholder |
| `JWT_REFRESH_SECRET` | Refresh/session signing secret | Long random value; never use the placeholder |
| `COOKIE_SECURE` | HTTPS-only cookies | `false` locally, `true` in HTTPS production |
| `MEDIA_STORAGE_ROOT` | Private local media root | `uploads` |
| `VAPID_PUBLIC_KEY` | Optional Web Push public key | Empty locally |
| `VAPID_PRIVATE_KEY` | Optional Web Push private key | Empty locally |
| `VAPID_SUBJECT` | Web Push contact subject | `mailto:security@example.com` |
| `CLOUDINARY_CLOUD_NAME` | Optional storage integration setting | Empty unless integrated |
| `CLOUDINARY_API_KEY` | Optional storage integration setting | Empty unless integrated |
| `CLOUDINARY_API_SECRET` | Optional storage integration setting | Empty unless integrated |
| `VITE_API_URL` | Browser API base URL | `/api` |
| `VITE_VAPID_PUBLIC_KEY` | Browser Web Push public key | Empty unless push is enabled |

### Production configuration requirements

Set `NODE_ENV=production`, a real MongoDB URI, strong unique secrets, exact HTTPS `CLIENT_URL`, `COOKIE_SECURE=true` and a private writable `MEDIA_STORAGE_ROOT`. Production startup should fail closed when required persistence/security configuration is missing.

Generate secrets instead of copying examples:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Development commands

| Command | Use |
| --- | --- |
| `npm run dev` | Run API and Vite client together |
| `npm run dev:server` | Run only the Express/TypeScript server |
| `npm run dev:client` | Run only the Vite client |
| `npm run check` | Typecheck server and client without emitting build output |
| `npm run build` | Build server output and Vite client output |
| `npm start` | Serve the production build from `dist` / `client/dist` |
| `npm run seed` | Explicit development reset/seed; destructive, never use against production |

## Demo credentials

The development seed/memory setup provides:

```text
Admin email:    admin@dgenergy.local
Admin password: demo1234
```

These credentials are for local demonstration only. Change the password immediately and never deploy them. There is no safe shared production supervisor/guard password. Create accounts through the Admin workflow; new/reset guard accounts follow the password-change policy.

## API overview

All application routes are mounted below `/api` unless noted otherwise.

| Area | Representative endpoints |
| --- | --- |
| Health | `/health`, `/health/live`, `/health/ready` |
| Auth | `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/me`, `/auth/change-password` |
| Users/guards/sites | `/users`, `/guards`, `/guards/import`, `/guards/:id/lifecycle`, `/sites` |
| Attendance | /photo-duty/current, /photo-duty/days, /photo-duty/capture-session, /photo-duty/capture, /photo-duty/photo/:id, /attendance/history |
| Shifts/rosters | `/shifts/mine`, `/rosters`, `/leave-requests`, `/replacements`, `/overtime` |
| Operations | `/operations/dashboard`, `/incidents` |
| Documents | `/guards/:id/documents`, `/documents`, `/documents/:id/preview`, `/documents/:id/download` |
| Payroll | /photo-payroll, /photo-payroll/credit/:id, /photo-payroll/payslip/:id; historical /payroll routes remain |
| Notifications | /notifications (guard read-only); management notification endpoints remain |
| Reports/audit | `/reports/*.csv`, `/audit` |

The existing route contracts and historical fields are intentionally retained. New fields are optional unless the endpoint's validation contract explicitly requires them.

## Testing and release checklist

Before release, run these only against an approved environment:

```bash
npm run check
npm run build
```

Also verify:

- Login, refresh, logout, logout-all, password change and inactive-account denial.
- Guard ownership, supervisor assigned-site scope and Admin boundaries.
- Day/night slot deadlines, live camera capture, duplicate retry, missed-photo salary and read-only guard restrictions.
- Offline queue retry, account switching and stale session handling.
- Roster conflicts, leave/replacement/overtime decisions and incident lifecycle.
- Private document preview/download and private payslip access.
- Payroll state transitions, locked record protection and CSV formula safety.
- Gujarati/English switching, mobile layouts, loading/error/empty states and service-worker update.
- Mongo persistence, indexes, backup/restore and media authorization.

Focused architecture/RBAC checks are documented in `docs/VERIFICATION_01_03.md`. They use isolated synthetic adapters and are not a substitute for a real browser, MongoDB, media or deployment verification. Do not claim production readiness until the approved checks actually pass.

## Known limitations

- Browser image uploads, Base64 data, EXIF, client timestamps and offline queues are client-controlled evidence.
- The guard UI requires live camera capture and server-bound sessions. This is not hardware camera attestation; GPS/geofencing and manual attendance approval are absent.
- Perceptual hashing is a similarity signal, not identity proof; a legitimate repeated image can still be similar.
- Unsupported/corrupt image formats may receive exact payload validation without a usable perceptual hash.
- Local private media storage needs backup, retention and operational monitoring before production use.
- No automatic cleanup or migration should be inferred from application startup.
- The complete external Security Management Blueprint is not present in this repository, so blueprint-specific requirements cannot be certified from source alone.
- Static inspection and focused tests do not prove hosted browser, MongoDB, concurrency, cookie, service-worker or deployment behavior.

## Project documentation

- [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md) — module coverage, routes, models and known gaps.
- [`docs/ATTENDANCE_IMAGE_REVIEW.md`](docs/ATTENDANCE_IMAGE_REVIEW.md) — live-camera slots, receipt deadlines and per-photo attendance contract.
- [`docs/AUTHORIZATION.md`](docs/AUTHORIZATION.md) — role policy, ownership, supervisor site scope and rollout safeguards.
- [`docs/OPERATIONS_MODULES.md`](docs/OPERATIONS_MODULES.md) — roster, leave, replacements, overtime and incident operations.
- [`docs/DOCUMENTS_PAYROLL_REPORTING.md`](docs/DOCUMENTS_PAYROLL_REPORTING.md) — document, payroll and reporting workflows.
- [`docs/IMPLEMENTATION_PROGRESS.md`](docs/IMPLEMENTATION_PROGRESS.md) — implementation status and validation boundaries.
- [`docs/MASTER5_PRODUCTION_READINESS.md`](docs/MASTER5_PRODUCTION_READINESS.md) — production-readiness gates and pending operational work.
- [`AGENTS.md`](AGENTS.md) — repository engineering and execution policy.

## License and data handling

This is an internal security-management application. Confirm the organization's license, retention, backup, employee-consent and privacy policies before production deployment. Do not commit real attendance photos, identity documents, payroll data or secrets to the repository.
