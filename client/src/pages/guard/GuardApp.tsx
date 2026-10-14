import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { SessionUser } from '../../../../shared/types';
import { GuardLayout } from '../../components/guard/GuardLayout';
import { GuardHomePage } from './GuardHomePage';
import { GuardAttendancePage } from './GuardAttendancePage';
import { GuardSalaryPage } from './GuardSalaryPage';
import { GuardDocumentsPage } from './GuardDocumentsPage';

import { GuardNotificationsPage } from './GuardNotificationsPage';
import { GuardProfilePage } from './GuardProfilePage';
import { UserProfilePage } from '../UserProfile';
import { GuardRosterPage } from './GuardRosterPage';

export function GuardApp({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const location = useLocation();
  if (location.pathname === '/guard/rosters') return <GuardLayout user={user} onLogout={onLogout}><GuardRosterPage /></GuardLayout>;
  return <GuardLayout user={user} onLogout={onLogout}><Routes><Route path="/guard" element={<GuardHomePage user={user} />} /><Route path="/guard/attendance" element={<GuardAttendancePage />} /><Route path="/guard/salary" element={<GuardSalaryPage />} /><Route path="/guard/documents" element={<GuardDocumentsPage guardId={user.guardId} />} /><Route path="/guard/notifications" element={<GuardNotificationsPage />} /><Route path="/guard/profile" element={<GuardProfilePage user={user} />} /><Route path="/profile/:id" element={<UserProfilePage />} /><Route path="*" element={<Navigate to="/guard" replace />} /></Routes></GuardLayout>;
}
