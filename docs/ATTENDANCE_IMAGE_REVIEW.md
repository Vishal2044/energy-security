# Scheduled live-camera attendance

This workflow supersedes the earlier gallery-upload/manual-review workflow.

Guards can only capture and send a live camera photo. Their attendance, salary, profile, documents and notifications are read-only. Guard writes to incident, roster acknowledgement, document upload, preferences and password-change APIs are denied.

## Shift windows (Asia/Kolkata)

| Shift | Four capture windows |
| --- | --- |
| Day | 08:00-10:00, 12:00-14:00, 16:00-18:00, 20:00-22:00 |
| Night | 20:00-22:00, 00:00-02:00, 04:00-06:00, 08:00-10:00 |

A window includes its opening instant and excludes its closing instant. A night duty belongs to the date it starts, including the three photos after midnight. The configured guard shift recurs daily; existing legacy roster rows do not override this photo schedule.

The server issues a camera session only while a required slot is open. The session is bound to the authenticated user, guard, business date, site and slot, and expires after two minutes or at the slot deadline, whichever comes first. The browser requests a video stream, captures a JPEG frame and sends it with that session. The server validates image decoding, size, dimensions, ownership and receipt time.

One deterministic attendance ID per guard/date/slot and a unique slot index prevent duplicate earnings. Repeating a successful request with its original clientRecordId returns the same record. Another attempt for that slot cannot replace it.

There is no gallery picker, manual attendance approval, random verification request or offline upload queue in the guard flow. A photo must reach the server within its time window; network retries cannot backdate attendance.

## Attendance and salary

Each received slot earns its snapshotted per-photo rate. Expired slots with no photo are missed and unpaid. A finished duty with zero received photos is absent; one to three photos produce partial attendance; all required photos produce full attendance.

Admin and assigned-site Supervisors set the day/night shift and per-photo rate when creating or editing a guard. Rates use paise precision. Existing guards are not backfilled with an invented rate: save their explicit photo policy to enable the new workflow. Initial onboarding does not deduct slots that closed before configuration. Later shift/rate changes apply from the next business date, preserving prior earnings.

Legacy attendance remains readable under Previous attendance records. No historical attendance or salary documents are deleted.

## Browser requirements and limits

Camera access needs HTTPS on a phone, or localhost on the development computer, plus camera permission. A plain HTTP LAN address cannot provide camera access in normal browsers. Camera tracks stop after capture, retake/unmount and cancellation.

This is a browser live-camera workflow, not hardware-backed camera attestation or proof of physical presence. No GPS, geofence or live tracking is used.

## Focused verification

The isolated tests in tests/photo-duty.test.ts and tests/photo-duty-management.test.ts cover deadlines, night/month boundaries, duplicate submissions, missed-photo pay, payroll snapshots, read-only guard actions and supervisor scope. They use synthetic in-memory records and do not touch MongoDB or upload files.

Real-device camera, MongoDB index/concurrency and payment/payslip smoke testing remain separate checks. Build and typecheck require the project owner's permission.
