# Image-only attendance review

Attendance remains an image-upload workflow. The standard guard flow does not request camera, GPS, geofence, or live tracking permissions. Existing attendance routes and historical records remain compatible.

## Evidence recorded

- `capturedAtClient`: browser-reported time when the guard selected the image; untrusted.
- `capturedAt` and `receivedAt`: server timestamps; server time is authoritative.
- `clientQueuedAt`: time the offline queue created the request, when available.
- `photoHash`: server SHA-256 of decoded image bytes for exact duplicate detection.
- `photoPerceptualHash`: client Canvas dHash used only as a review signal for resized/compressed similarity.
- image MIME, byte size, dimensions, and JPEG EXIF `DateTimeOriginal` when readable.
- `reviewFlags`, `similarPhotoMatches`, `verificationStatus`, `reviewDueAt`, and rejection reason.
- correction requests with an explicit decision reason; approval is blocked when the related IST payroll month is already marked `PAID`.

No flag automatically rejects attendance. A similarity or duplicate signal must be reviewed by an authorized Admin or Main Security user.

## Dependencies and configuration

No new package is required. The implementation uses Node `crypto`, browser Canvas APIs, existing React Query, Express, Mongoose, and Base64 storage.

Existing installation remains sufficient:

```sh
npm install
```

The normal project environment variables are still required. Do not expose MongoDB or JWT secrets to the browser.

## Manual verification checklist

1. Select an image in the guard attendance flow and confirm a preview is shown before upload.
2. Retake/select another image and confirm the previous preview and metadata are replaced.
3. Submit once online, then repeat the same request with the same `clientRecordId`; the API must return the existing record rather than create another one.
4. Submit the same image on another attendance date. Confirm the server stores the SHA-256 duplicate signal but leaves the record in manual review.
5. Submit a resized or recompressed copy after the client dHash is generated. Confirm the similarity signal is visible in the reviewer panel.
6. Open a review preview on a small screen and scroll the modal; image, timestamps, hashes, flags, comparison, and action controls must remain reachable.
7. Verify a pending record as an authorized reviewer. Confirm `status=VERIFIED` and `verificationStatus=verified`.
8. Reject a pending record without a reason and confirm the server refuses it. Reject with a reason and confirm `status=REJECTED`.
9. Test offline submission and reconnect. The same idempotency key must be retried without creating a second record.
10. Confirm guard history is limited to the authenticated guard and Main Security sees only assigned sites.
11. Exercise `POST /attendance/:id/correction-request` and resolve it with `PATCH /attendance/corrections/:id/resolve`; a paid payroll period must return `PAYROLL_LOCKED`.

Browser upload metadata, timestamps, and image pixels are not tamper-proof proof of physical presence. Human review and operational controls remain necessary.
