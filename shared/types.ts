export const ROLES = ['GUARD', 'MAIN_SECURITY', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ATTENDANCE_TYPES = ['SHIFT_START', 'RANDOM_VERIFICATION', 'SHIFT_END', 'DUTY_PHOTO'] as const;
export type AttendanceType = (typeof ATTENDANCE_TYPES)[number];
export type AttendanceStatus = 'RECORDED' | 'VERIFIED' | 'PENDING_SYNC' | 'MISSED' | 'MANUAL_REVIEW' | 'REJECTED' | 'CORRECTED';
export type ApiErrorDetail = { field: string; message: string };
export type ApiError = {
  success: false;
  error: string;
  details?: {
    fields?: ApiErrorDetail[];
  };
};
export type SiteType = 'WIND' | 'SOLAR' | 'STORE' | 'OTHER';
export type DutyState = 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED';
export type VerificationStatus = 'NOTIFICATION_PENDING' | 'SENT' | 'OPENED' | 'SUBMITTED' | 'VERIFIED' | 'EXPIRED' | 'MISSED' | 'FAILED';

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  guardId?: string;
  profilePhotoUrl?: string;
  preferredLanguage?: 'gu' | 'en';
  assignedSiteIds?: string[];
  passwordChangeRequired?: boolean;
}
