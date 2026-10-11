// Canonical upload name; retain the legacy module/export for existing consumers.
// This is the same picker, preview and submission implementation, not a camera.
export { CameraCapture as ImageUploadCapture } from './CameraCapture';
export type { CapturedPhoto as UploadedImage } from './CameraCapture';
