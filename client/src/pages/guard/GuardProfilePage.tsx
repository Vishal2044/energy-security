import { Navigate } from 'react-router-dom';
import type { SessionUser } from '../../../../shared/types';
export function GuardProfilePage({ user }: { user: SessionUser }) { return <Navigate to={`/profile/${user.id}`} replace/>; }
