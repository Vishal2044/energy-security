# Security Management App

## Product
Role-based security agency management application.

## Core Roles
- Admin
- Main Security / Supervisor
- Guard

## Engineering Rules
- Preserve existing users and records.
- Maintain backward compatibility.
- Enforce authorization server-side.
- Never expose another guard's private records.
- Keep Gujarati localization consistent.
- Store timestamps in UTC and display in Asia/Kolkata.
- Protect attendance evidence and personal documents.
- Avoid unnecessary database schema changes.
- Use safe migrations when changes are required.

## Attendance
- Follow the approved scheduled live-camera workflow: four photo slots per day/night duty, each with a two-hour server deadline.
- Do not reintroduce GPS or live tracking without approval.
- Do not claim photo metadata proves physical presence.
- Prevent duplicate slot submissions. Timed photos must arrive before the deadline; do not backdate offline submissions.
- Guard data is read-only except for live duty-photo submission.
- Admin and assigned-site Supervisors create guard profiles and add already-approved documents.
- Attendance and salary are calculated per received photo; no attendance/document review workflow.

## Implementation
- Implement features incrementally.
- Preserve existing routes and workflows.
- Validate affected permissions and data flows.
- Do not modify unrelated modules.
- Keep reports concise.