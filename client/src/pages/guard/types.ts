import type { DutyState } from '../../../../shared/types';

export type GuardProfile = {
  id: string; name: string; nameGujarati?: string; employeeCode: string; mobile: string; village?: string; district?: string; joiningDate?: string; assignedSite?: string; monthlySalary: number; profilePhotoUrl?: string; preferredLanguage?: 'gu' | 'en'; bank?: { accountNumber?: string; bankName?: string };
};
export type GuardSite = { id?: string; siteCode: string; siteName: string; siteType?: string; address?: string; farmerAddress?: string; latitude?: number; longitude?: number; geofenceRadiusMeters?: number };
export type AttendanceRecord = { id: string; shiftId?: string; type: 'SHIFT_START' | 'RANDOM_VERIFICATION' | 'SHIFT_END'; status: string; capturedAt: string; site?: string; guard?: string; photo?: string };
export type Shift = { id: string; guardId?: string; siteId?: string; startedAt: string; endedAt?: string; status: 'ACTIVE' | 'COMPLETED'; verificationCount?: number; attendance?: AttendanceRecord[] };
export type Verification = { id: string; status: string; expiresAt: string; requestCreatedAt: string; notificationStatus?: string; shiftId?: string };
export type DutySummary = { state: DutyState; attendance: AttendanceRecord[]; shift?: Shift; activeVerification?: Verification };
export type Salary = { id: string; month: number; year: number; attendanceDays: number; finalSalary: number; netPayable?: number; workflowStatus?: string; status: 'PAID' | 'PENDING'; paidAt?: string };
export type DocumentStatus = { id?: string; type: string; originalName?: string; uploadedAt?: string; mimeType?: string; previewUrl?: string; status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'; expiresAt?: string; duplicateWarning?: string; version?: number };
export type Incident = { id: string; category: string; description?: string; status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'; capturedAt: string; site?: string; photo?: string };
export type GuardNotification = { id: string; title: string; body: string; kind?: string; deepLink?: string; status: 'READ' | 'UNREAD'; createdAt: string; readAt?: string; requestId?: string; requiresAcknowledgement?: boolean; acknowledgedAt?: string };
