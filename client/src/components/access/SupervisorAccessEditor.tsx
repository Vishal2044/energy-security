import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getData } from '../../lib/api';
import { EmptyState, LoadingState } from '../ui';
import { INDIA_TIME_ZONE } from '../../../../shared/time';

export type AccessUser = { id: string; name: string; assignedSiteIds?: string[]; accessRevision?: number };
type Site = { id: string; siteCode: string; siteName: string; status: string };
type History = { id: string; action: string; actor: string; at: string; metadata?: { justification?: string; before?: { assignedSiteIds?: string[] }; after?: { assignedSiteIds?: string[] } } };

export function SupervisorAccessEditor({ user, onClose }: { user: AccessUser; onClose: () => void }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState(user.assignedSiteIds ?? []);
  const [justification, setJustification] = useState('');
  const sites = useQuery({ queryKey: ['access-sites'], queryFn: () => getData<{ sites: Site[] }>('/sites') });
  const history = useQuery({ queryKey: ['access-history', user.id], queryFn: () => getData<{ history: History[] }>(`/users/${user.id}/access-history`) });
  const save = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/access`, { assignedSiteIds: selected, expectedRevision: user.accessRevision ?? 0, justification }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['users'] }); client.invalidateQueries({ queryKey: ['access-history', user.id] }); onClose(); },
  });
  const conflict = save.error instanceof Error && save.error.message === 'ACCESS_CHANGED_RELOAD';
  const labels = (ids?: string[]) => ids?.map((id) => sites.data?.sites.find((site) => site.id === id)?.siteCode ?? id).join(', ') || 'None / કોઈ નહીં';
  return <section className="panel guard-inline-form" aria-label="Supervisor site access">
    <div className="panel-heading"><div><h2>{user.name}: Site access / સાઇટ પ્રવેશ</h2><p>Only selected sites are accessible. No sites means no operational access.</p><p>Delegation and emergency elevation are unavailable until their approval policy is provided.</p></div><button type="button" className="button secondary" disabled={save.isPending} onClick={onClose}>Close / બંધ કરો</button></div>
    {sites.isLoading ? <LoadingState /> : sites.isError ? <div className="error-callout">Sites could not be loaded. <button onClick={() => void sites.refetch()}>Retry / ફરી પ્રયાસ</button></div> : <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      {sites.data?.sites.length ? <fieldset disabled={save.isPending}><legend>Assigned sites / સોંપેલી સાઇટ્સ</legend>{sites.data.sites.map((site) => <label key={site.id}><input type="checkbox" checked={selected.includes(site.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, site.id] : ids.filter((id) => id !== site.id))} /> {site.siteCode} · {site.siteName} {site.status !== 'ACTIVE' ? '(Inactive)' : ''}</label>)}</fieldset> : <EmptyState title="No sites / કોઈ સાઇટ નથી" description="Create a site before assigning access." />}
      {selected.filter((id) => !sites.data?.sites.some((site) => site.id === id)).map((id) => <label key={id}><input type="checkbox" disabled={save.isPending} checked onChange={() => setSelected((ids) => ids.filter((value) => value !== id))} />Unavailable site: {id} — remove before saving.</label>)}
      <label>Justification / કારણ<textarea required minLength={8} maxLength={500} rows={3} disabled={save.isPending} value={justification} onChange={(event) => setJustification(event.target.value)} /></label>
      {save.isError && <div className="error-callout">{conflict ? 'Access changed in another session. Close this editor, refresh the team and reopen it.' : 'Access could not be saved. Check site selection and retry.'}</div>}
      <button className="button primary" disabled={save.isPending || justification.trim().length < 8 || conflict}>{save.isPending ? 'Saving / સાચવાઈ રહ્યું છે…' : 'Save access / પ્રવેશ સાચવો'}</button>
    </form>}
    <h3>Permission history / પરવાનગીનો ઇતિહાસ</h3>
    {history.isLoading ? <LoadingState /> : history.isError ? <div className="error-callout">History could not be loaded. <button onClick={() => void history.refetch()}>Retry</button></div> : history.data?.history.length ? <ul>{history.data.history.map((entry) => <li key={entry.id}><strong>{entry.action.replace(/_/g, ' ')}</strong> · {new Intl.DateTimeFormat('en-IN', { timeZone: INDIA_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.at))} · {entry.actor}{entry.metadata?.before && <p>{labels(entry.metadata.before.assignedSiteIds)} → {entry.metadata.after ? labels(entry.metadata.after.assignedSiteIds) : 'Requested / વિનંતી'}</p>}{entry.metadata?.justification && <p>{entry.metadata.justification}</p>}</li>)}</ul> : <EmptyState title="No permission changes yet / હજી ફેરફાર નથી" description="Site-access changes and account updates will appear here." />}
  </section>;
}
