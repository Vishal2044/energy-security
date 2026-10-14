import { PaginationControls } from '../ui';
import { usePageQuery } from '../../lib/pagination';
import { t } from '../../locales/runtime';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getData } from '../../lib/api';
import { EmptyState, LoadingState } from '../ui';
import { INDIA_TIME_ZONE } from '../../../../shared/time';
export type AccessUser = {
    id: string;
    name: string;
    assignedSiteIds?: string[];
    accessRevision?: number;
};
type Site = {
    id: string;
    siteCode: string;
    siteName: string;
    status: string;
};
type History = {
    id: string;
    action: string;
    actor: string;
    at: string;
    metadata?: {
        justification?: string;
        before?: {
            assignedSiteIds?: string[];
        };
        after?: {
            assignedSiteIds?: string[];
        };
    };
};
export function SupervisorAccessEditor({ user, onClose }: {
    user: AccessUser;
    onClose: () => void;
}) {
    const client = useQueryClient();
    const [selected, setSelected] = useState(user.assignedSiteIds ?? []);
    const [justification, setJustification] = useState('');
    const sites = useQuery({ queryKey: ['access-sites'], queryFn: () => getData<{
            sites: Site[];
        }>('/sites') });
    const history = usePageQuery<{
        history: History[];
    }>(['access-history', user.id], `/users/${user.id}/access-history`, {});
    const save = useMutation({
        mutationFn: () => api.patch(`/users/${user.id}/access`, { assignedSiteIds: selected, expectedRevision: user.accessRevision ?? 0, justification }),
        onSuccess: () => { client.invalidateQueries({ queryKey: ['users'] }); client.invalidateQueries({ queryKey: ['access-history', user.id] }); onClose(); },
    });
    const conflict = save.error instanceof Error && save.error.message === 'ACCESS_CHANGED_RELOAD';
    const labels = (ids?: string[]) => ids?.map((id) => sites.data?.sites.find((site) => site.id === id)?.siteCode ?? id).join(', ') || 'None / કોઈ નહીં';
    return <section className="panel guard-inline-form" aria-label={t("Supervisor site access")}>
    <div className="panel-heading"><div><h2>{user.name}{t(": Site access / \u0AB8\u0ABE\u0A87\u0A9F \u0AAA\u0ACD\u0AB0\u0AB5\u0AC7\u0AB6")}</h2><p>{t("Only selected sites are accessible. No sites means no operational access.")}</p><p>{t("Delegation and emergency elevation are unavailable until their approval policy is provided.")}</p></div><button type="button" className="button secondary" disabled={save.isPending} onClick={onClose}>{t("Close / \u0AAC\u0A82\u0AA7 \u0A95\u0AB0\u0ACB")}</button></div>
    {sites.isLoading ? <LoadingState /> : sites.isError ? <div className="error-callout">{t("Sites could not be loaded. ")}<button onClick={() => void sites.refetch()}>{t("Retry / \u0AAB\u0AB0\u0AC0 \u0AAA\u0ACD\u0AB0\u0AAF\u0ABE\u0AB8")}</button></div> : <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      {sites.data?.sites.length ? <fieldset disabled={save.isPending}><legend>{t("Assigned sites / \u0AB8\u0ACB\u0A82\u0AAA\u0AC7\u0AB2\u0AC0 \u0AB8\u0ABE\u0A87\u0A9F\u0ACD\u0AB8")}</legend>{sites.data.sites.map((site) => <label key={site.id}><input type="checkbox" checked={selected.includes(site.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, site.id] : ids.filter((id) => id !== site.id))}/> {site.siteCode} · {site.siteName} {site.status !== 'ACTIVE' ? '(Inactive)' : ''}</label>)}</fieldset> : <EmptyState title={t("No sites / \u0A95\u0ACB\u0A88 \u0AB8\u0ABE\u0A87\u0A9F \u0AA8\u0AA5\u0AC0")} description={t("Create a site before assigning access.")}/>}
      {selected.filter((id) => !sites.data?.sites.some((site) => site.id === id)).map((id) => <label key={id}><input type="checkbox" disabled={save.isPending} checked onChange={() => setSelected((ids) => ids.filter((value) => value !== id))}/>{t("Unavailable site: ")}{id}{t(" \u2014 remove before saving.")}</label>)}
      <label>{t("Justification / \u0A95\u0ABE\u0AB0\u0AA3")}<textarea required minLength={8} maxLength={500} rows={3} disabled={save.isPending} value={justification} onChange={(event) => setJustification(event.target.value)}/></label>
      {save.isError && <div className="error-callout">{conflict ? 'Access changed in another session. Close this editor, refresh the team and reopen it.' : 'Access could not be saved. Check site selection and retry.'}</div>}
      <button className="button primary" disabled={save.isPending || justification.trim().length < 8 || conflict}>{save.isPending ? 'Saving / સાચવાઈ રહ્યું છે…' : 'Save access / પ્રવેશ સાચવો'}</button>
    </form>}
    <h3>{t("Permission history / \u0AAA\u0AB0\u0AB5\u0ABE\u0AA8\u0A97\u0AC0\u0AA8\u0ACB \u0A87\u0AA4\u0ABF\u0AB9\u0ABE\u0AB8")}</h3>
    {history.isLoading ? <LoadingState /> : history.isError ? <div className="error-callout">{t("History could not be loaded. ")}<button onClick={() => void history.refetch()}>{t("Retry")}</button></div> : history.data?.history.length ? <ul>{history.data.history.map((entry, index) => <li key={entry.id}><strong><span className="inline-record-index">{history.startIndex + index + 1}</span>{entry.action.replace(/_/g, ' ')}</strong> · {new Intl.DateTimeFormat('en-IN', { timeZone: INDIA_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.at))} · {entry.actor}{entry.metadata?.before && <p>{labels(entry.metadata.before.assignedSiteIds)} → {entry.metadata.after ? labels(entry.metadata.after.assignedSiteIds) : 'Requested / વિનંતી'}</p>}{entry.metadata?.justification && <p>{entry.metadata.justification}</p>}</li>)}</ul> : <EmptyState title={t("No permission changes yet / \u0AB9\u0A9C\u0AC0 \u0AAB\u0AC7\u0AB0\u0AAB\u0ABE\u0AB0 \u0AA8\u0AA5\u0AC0")} description={t("Site-access changes and account updates will appear here.")}/>}
  <PaginationControls pagination={history.pagination} page={history.page} onPageChange={history.setPage} busy={history.isFetching} /></section>;
}
