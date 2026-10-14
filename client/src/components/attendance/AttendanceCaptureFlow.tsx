import { LiveCameraCapture } from './LiveCameraCapture';
export type AttendanceAction = 'start' | 'verify' | 'end';
// Compatibility wrapper: all duty submissions now use the scheduled camera flow.
export function AttendanceCaptureFlow({ onDone, onCancel }: { action?: AttendanceAction; verificationRequestId?: string; guardId?: string; siteName?: string; siteCode?: string; onDone: () => void; onCancel: () => void }) { return <LiveCameraCapture onDone={onDone} onCancel={onCancel}/>; }
