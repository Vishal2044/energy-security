import { PaginationControls } from '../components/ui';
import { usePageQuery } from '../lib/pagination';
import { t } from '../locales/runtime';
import { KeyRound, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, getData } from '../lib/api';
import { EmptyState, LoadingState, PageHeader, StatusBadge, UserIdentity } from '../components/ui';
import { SupervisorAccessEditor } from '../components/access/SupervisorAccessEditor';
type TeamUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    profilePhotoUrl?: string;
    assignedSiteIds?: string[];
    accessRevision?: number;
};
export function AdminTeamPage() {
    const client = useQueryClient();
    const navigate = useNavigate();
    const [editing, setEditing] = useState<string>();
    const users = usePageQuery<{
        users: TeamUser[];
    }>(['users'], '/users', {});
    const update = useMutation({ mutationFn: ({ id, active }: {
            id: string;
            active: boolean;
        }) => api.patch(`/users/${id}`, { active }), onSuccess: () => { client.invalidateQueries({ queryKey: ['users'] }); client.invalidateQueries({ queryKey: ['dashboard'] }); } });
    const editingUser = users.data?.users.find((user) => user.id === editing);
    const supervisors = users.data?.users.filter((user) => user.role === 'MAIN_SECURITY') ?? [];
    return <>
    <PageHeader eyebrow="ADMIN ACCESS" title={t("Team & roles")} description={t("Create users from one guided form. The primary admin stays protected.")} action={<button className="button primary" onClick={() => navigate('/users/new')}><Plus size={17}/>{t(" Add user")}</button>}/>
    {users.isError && <div className="error-callout">{t("Team could not be loaded. ")}<button onClick={() => void users.refetch()}>{t("Retry / \u0AAB\u0AB0\u0AC0 \u0AAA\u0ACD\u0AB0\u0AAF\u0ABE\u0AB8")}</button></div>}
    {update.isError && <div className="error-callout">{t("Access could not be updated. Please retry.")}</div>}
    <section className="panel"><h2>{t("Supervisor site assignments / \u0AB8\u0AC1\u0AAA\u0AB0\u0AB5\u0ABE\u0A87\u0A9D\u0AB0\u0AA8\u0AC0 \u0AB8\u0ABE\u0A87\u0A9F\u0ACD\u0AB8")}</h2><p>{t("Unassigned supervisors have no site access. Guard profiles, photo rates and documents are manageable only within assigned sites.")}</p>{supervisors.map((user) => <div className="panel-heading" key={user.id}><span>{user.name} · {user.assignedSiteIds?.length ?? 0}{t(" sites")}</span><button className="button secondary" onClick={() => setEditing(user.id)}>{t("Manage sites / \u0AB8\u0ABE\u0A87\u0A9F\u0ACD\u0AB8 \u0AB8\u0ACB\u0A82\u0AAA\u0ACB")}</button></div>)}{users.isSuccess && !supervisors.length && <EmptyState title={t("No supervisors / \u0A95\u0ACB\u0A88 \u0AB8\u0AC1\u0AAA\u0AB0\u0AB5\u0ABE\u0A87\u0A9D\u0AB0 \u0AA8\u0AA5\u0AC0")} description={t("Create a supervisor account to assign sites.")}/>}</section>
    {editingUser && <SupervisorAccessEditor key={`${editingUser.id}-${editingUser.accessRevision ?? 0}`} user={editingUser} onClose={() => setEditing(undefined)}/>}
    {users.isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th scope="col">#</th><th>{t("Member")}</th><th>{t("Role")}</th><th>{t("Access")}</th><th>{t("Account")}</th><th /></tr></thead><tbody>{users.data?.users.map((user, index) => <tr key={user.id}><td className="list-index">{users.startIndex + index + 1}</td><td><UserIdentity id={user.id} name={user.name} photoUrl={user.profilePhotoUrl} meta={user.email}/></td><td><span className="doc-status"><ShieldCheck size={15}/> {user.role === 'ADMIN' ? 'Administrator' : user.role === 'GUARD' ? 'Guard' : 'Security manager'}</span></td><td><StatusBadge value={user.active ? 'ACTIVE' : 'INACTIVE'}/></td><td>{user.role === 'ADMIN' ? <span className="muted">{t("Primary admin")}</span> : user.role === 'GUARD' ? <span className="muted">{t("Managed in Guards")}</span> : <button className="button small secondary" disabled={update.isPending} onClick={() => update.mutate({ id: user.id, active: !user.active })}>{user.active ? 'Disable access' : 'Enable access'}</button>}</td><td>{user.role === 'ADMIN' ? <KeyRound size={17} className="muted-icon"/> : <UserRound size={17} className="muted-icon"/>}</td></tr>)}</tbody></table><PaginationControls pagination={users.pagination} page={users.page} onPageChange={users.setPage} busy={users.isFetching} />{!users.data?.users.length && <EmptyState title={t("No team members")} description={t("The primary admin account will appear here.")} icon={<UserRound />}/>}</section>}
  </>;
}
