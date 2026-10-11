import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, FileCheck2, MoreHorizontal, Pencil, Plus, Power, Users } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api, getData } from '../lib/api';
import { EmptyState, LoadingState, PageHeader, SearchBox, StatusBadge, UserIdentity } from '../components/ui';

type GuardRow = {
  id: string;
  name: string;
  employeeCode: string;
  mobile: string;
  village: string;
  assignedSite?: string;
  assignedSiteDetails?: {
    siteCode: string;
    siteName: string;
    mapLink?: string;
  };
  employmentStatus: 'ACTIVE' | 'INACTIVE';
  monthlySalary: number;
  documentCount: number;
  profilePhotoUrl?: string;
};

type MenuPosition = { top: number; left: number; placement: 'above' | 'below' };

function GuardActionMenu({ guard, canManage, anchor, isPending, onClose, onEdit, onToggle }: { guard: GuardRow; canManage: boolean; anchor: HTMLButtonElement; isPending: boolean; onClose: () => void; onEdit: () => void; onToggle: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0, placement: 'below' });
  const positionMenu = useCallback(() => {
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    const menuWidth = menuRect?.width ?? 190;
    const menuHeight = menuRect?.height ?? 86;
    const edge = 12;
    const gap = 8;
    const maxLeft = Math.max(edge, window.innerWidth - menuWidth - edge);
    const left = Math.min(Math.max(edge, anchorRect.right - menuWidth), maxLeft);
    const fitsBelow = anchorRect.bottom + gap + menuHeight <= window.innerHeight - edge;
    const fitsAbove = anchorRect.top - gap - menuHeight >= edge;
    const placement = !fitsBelow && fitsAbove ? 'above' : 'below';
    const requestedTop = placement === 'above' ? anchorRect.top - gap - menuHeight : anchorRect.bottom + gap;
    const top = Math.min(Math.max(edge, requestedTop), Math.max(edge, window.innerHeight - menuHeight - edge));
    setPosition({ top, left, placement });
  }, [anchor]);

  useLayoutEffect(() => {
    positionMenu();
    const frame = window.requestAnimationFrame(positionMenu);
    return () => window.cancelAnimationFrame(frame);
  }, [positionMenu]);

  useEffect(() => {
    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleResize = () => positionMenu();
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [anchor, onClose, positionMenu]);

  return createPortal(<div ref={menuRef} className="guard-action-menu" data-placement={position.placement} style={{ top: position.top, left: position.left }} onMouseDown={(event) => event.stopPropagation()}><button type="button" onClick={onEdit}><Pencil size={15} /> {canManage ? 'Edit profile' : 'View profile'}</button>{canManage && <button type="button" disabled={isPending} onClick={onToggle}><Power size={15} /> Mark {guard.employmentStatus === 'ACTIVE' ? 'inactive' : 'active'}</button>}</div>, document.body);
}

export function ManagementGuardsPage({ canManage = true }: { canManage?: boolean }) {
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState<string>();
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const closeMenu = useCallback(() => {
    setOpenMenu(undefined);
    setMenuAnchor(null);
  }, []);
  const guards = useQuery({ queryKey: ['guards', search], queryFn: () => getData<{ guards: GuardRow[] }>('/guards', { search }) });
  const updateStatus = useMutation({
    mutationFn: ({ id, employmentStatus }: { id: string; employmentStatus: GuardRow['employmentStatus'] }) => api.patch(`/guards/${id}`, { employmentStatus }),
    onSuccess: () => {
      closeMenu();
      queryClient.invalidateQueries({ queryKey: ['guards'] });
    },
  });

  const openGuard = guards.data?.guards.find((item) => item.id === openMenu);

  return <>
    <PageHeader eyebrow="WORKFORCE" title="Guards" description="Manage your people, assignments and document readiness." action={canManage ? <button className="button primary" onClick={() => navigate('/users/new')}><Plus size={17} /> Add guard</button> : undefined} />
    <div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder={canManage ? "Search name, code, mobile or village…" : "Search name, code or mobile…"} /></div>
    {updateStatus.isError && <div className="error-callout">Status could not be updated. Check your access and retry. / સ્થિતિ બદલી શકાઈ નથી. ફરી પ્રયાસ કરો.</div>}
    {guards.isError ? <div className="error-callout">Guards could not be loaded. / ગાર્ડની માહિતી લાવી શકાઈ નથી. <button onClick={() => void guards.refetch()}>Retry / ફરી પ્રયાસ</button></div> : guards.isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th>Guard</th><th>Employee code</th><th>Site</th><th>Documents</th><th>Status</th><th /></tr></thead><tbody>{guards.data?.guards.map((item) => {
      return <tr key={item.id}>
        <td><UserIdentity id={item.id} name={item.name} photoUrl={item.profilePhotoUrl} meta={item.mobile} /></td>
        <td><code>{item.employeeCode}</code></td>
        <td>{item.assignedSiteDetails ? <div className="guard-site-cell"><strong>{item.assignedSiteDetails.siteCode || 'Site'}</strong><span>{item.assignedSiteDetails.siteName || 'Name unavailable'}</span>{item.assignedSiteDetails.mapLink && <a className="guard-site-map-link" href={item.assignedSiteDetails.mapLink} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Map link</a>}</div> : item.assignedSite ? 'Assigned site' : 'Unassigned'}</td>
        <td>{canManage ? <span className={item.documentCount < 3 ? 'doc-status incomplete' : 'doc-status'}><FileCheck2 size={15} /> {item.documentCount}/3 complete</span> : <span>Restricted / પ્રતિબંધિત</span>}</td>
        <td><StatusBadge value={item.employmentStatus} /></td>
        <td><div className="guard-row-actions" onClick={(event) => event.stopPropagation()}><button type="button" className="guard-more-button" aria-label={`Actions for ${item.name}`} aria-expanded={openMenu === item.id} onClick={(event) => { if (openMenu === item.id) { closeMenu(); return; } setMenuAnchor(event.currentTarget); setOpenMenu(item.id); }}><MoreHorizontal size={19} /></button></div></td>
      </tr>;
    })}</tbody></table>{!guards.data?.guards.length && <EmptyState title="No guards found" description="Create the first guard from the admin form." icon={<Users />} />}</section>}
    {!guards.isError && openGuard && menuAnchor && <GuardActionMenu guard={openGuard} canManage={canManage} anchor={menuAnchor} isPending={updateStatus.isPending} onClose={closeMenu} onEdit={() => { closeMenu(); navigate(canManage ? `/guards/${openGuard.id}/edit` : `/profile/${openGuard.id}`); }} onToggle={() => updateStatus.mutate({ id: openGuard.id, employmentStatus: openGuard.employmentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })} />}
  </>;
}
