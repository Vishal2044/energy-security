import { KeyRound, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, getData } from '../lib/api';
import { EmptyState, LoadingState, PageHeader, StatusBadge, UserIdentity } from '../components/ui';
import { SupervisorAccessEditor } from '../components/access/SupervisorAccessEditor';

type TeamUser = { id: string; name: string; email: string; role: string; active: boolean; profilePhotoUrl?: string; assignedSiteIds?: string[]; accessRevision?: number };

export function AdminTeamPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<string>();
  const users = useQuery({ queryKey: ['users'], queryFn: () => getData<{ users: TeamUser[] }>('/users') });
  const update = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/users/${id}`, { active }), onSuccess: () => { client.invalidateQueries({ queryKey: ['users'] }); client.invalidateQueries({ queryKey: ['dashboard'] }); } });
  const editingUser = users.data?.users.find((user) => user.id === editing);
  const supervisors = users.data?.users.filter((user) => user.role === 'MAIN_SECURITY') ?? [];

  return <>
    <PageHeader eyebrow="ADMIN ACCESS" title="Team & roles" description="Create users from one guided form. The primary admin stays protected." action={<button className="button primary" onClick={() => navigate('/users/new')}><Plus size={17} /> Add user</button>} />
    {users.isError && <div className="error-callout">Team could not be loaded. <button onClick={() => void users.refetch()}>Retry / ફરી પ્રયાસ</button></div>}
    {update.isError && <div className="error-callout">Access could not be updated. Please retry.</div>}
    <section className="panel"><h2>Supervisor site assignments / સુપરવાઇઝરની સાઇટ્સ</h2><p>Unassigned supervisors have no site access. Salary and private documents stay restricted.</p>{supervisors.map((user) => <div className="panel-heading" key={user.id}><span>{user.name} · {user.assignedSiteIds?.length ?? 0} sites</span><button className="button secondary" onClick={() => setEditing(user.id)}>Manage sites / સાઇટ્સ સોંપો</button></div>)}{users.isSuccess && !supervisors.length && <EmptyState title="No supervisors / કોઈ સુપરવાઇઝર નથી" description="Create a supervisor account to assign sites." />}</section>
    {editingUser && <SupervisorAccessEditor key={`${editingUser.id}-${editingUser.accessRevision ?? 0}`} user={editingUser} onClose={() => setEditing(undefined)} />}
    {users.isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th>Member</th><th>Role</th><th>Access</th><th>Account</th><th /></tr></thead><tbody>{users.data?.users.map((user) => <tr key={user.id}><td><UserIdentity id={user.id} name={user.name} photoUrl={user.profilePhotoUrl} meta={user.email} /></td><td><span className="doc-status"><ShieldCheck size={15} /> {user.role === 'ADMIN' ? 'Administrator' : user.role === 'GUARD' ? 'Guard' : 'Security manager'}</span></td><td><StatusBadge value={user.active ? 'ACTIVE' : 'INACTIVE'} /></td><td>{user.role === 'ADMIN' ? <span className="muted">Primary admin</span> : user.role === 'GUARD' ? <span className="muted">Managed in Guards</span> : <button className="button small secondary" disabled={update.isPending} onClick={() => update.mutate({ id: user.id, active: !user.active })}>{user.active ? 'Disable access' : 'Enable access'}</button>}</td><td>{user.role === 'ADMIN' ? <KeyRound size={17} className="muted-icon" /> : <UserRound size={17} className="muted-icon" />}</td></tr>)}</tbody></table>{!users.data?.users.length && <EmptyState title="No team members" description="The primary admin account will appear here." icon={<UserRound />} />}</section>}
  </>;
}
