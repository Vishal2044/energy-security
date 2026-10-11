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
- Follow the approved image-upload workflow.
- Do not reintroduce GPS or live tracking without approval.
- Do not claim photo metadata proves physical presence.
- Prevent duplicate submissions and handle offline retries.

## Implementation
- Implement features incrementally.
- Preserve existing routes and workflows.
- Validate affected permissions and data flows.
- Do not modify unrelated modules.
- Keep reports concise.