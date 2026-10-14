import { PaginationControls } from '../components/ui';
import { usePageQuery, useDebouncedValue } from '../lib/pagination';
import { t } from '../locales/runtime';
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
    dutyShift?: 'DAY' | 'NIGHT';
    photoRate?: number;
    profilePhotoUrl?: string;
};
type MenuPosition = {
    top: number;
    left: number;
    placement: 'above' | 'below';
};
function GuardActionMenu({ guard, canManage, anchor, isPending, onClose, onEdit, onToggle }: {
    guard: GuardRow;
    canManage: boolean;
    anchor: HTMLButtonElement;
    isPending: boolean;
    onClose: () => void;
    onEdit: () => void;
    onToggle: () => void;
}) {
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
            if (!menuRef.current?.contains(target) && !anchor.contains(target))
                onClose();
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                onClose();
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
    return createPortal(<div ref={menuRef} className="guard-action-menu" data-placement={position.placement} style={{ top: position.top, left: position.left }} onMouseDown={(event) => event.stopPropagation()}><button type="button" onClick={onEdit}><Pencil size={15}/> {canManage ? 'Edit profile' : 'View profile'}</button>{canManage && <button type="button" disabled={isPending} onClick={onToggle}><Power size={15}/>{t(" Mark ")}{guard.employmentStatus === 'ACTIVE' ? 'inactive' : 'active'}</button>}</div>, document.body);
}
export function ManagementGuardsPage({ canManage = true }: {
    canManage?: boolean;
}) {
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search);
    const [openMenu, setOpenMenu] = useState<string>();
    const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const closeMenu = useCallback(() => {
        setOpenMenu(undefined);
        setMenuAnchor(null);
    }, []);
    const guards = usePageQuery<{
        guards: GuardRow[];
    }>(['guards'], '/guards', { search: debouncedSearch });
    const updateStatus = useMutation({
        mutationFn: ({ id, employmentStatus }: {
            id: string;
            employmentStatus: GuardRow['employmentStatus'];
        }) => api.patch(`/guards/${id}`, { employmentStatus }),
        onSuccess: () => {
            closeMenu();
            queryClient.invalidateQueries({ queryKey: ['guards'] });
        },
    });
    const openGuard = guards.data?.guards.find((item) => item.id === openMenu);
    return <>
    <PageHeader eyebrow="WORKFORCE" title={t("Guards")} description={t("Manage your people, assignments and document readiness.")} action={canManage ? <button className="button primary" onClick={() => navigate('/users/new')}><Plus size={17}/>{t(" Add guard")}</button> : undefined}/>
    <div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder={canManage ? "Search name, code, mobile or village…" : "Search name, code or mobile…"}/></div>
    {updateStatus.isError && <div className="error-callout">{t("Status could not be updated. Check your access and retry. / \u0AB8\u0ACD\u0AA5\u0ABF\u0AA4\u0ABF \u0AAC\u0AA6\u0AB2\u0AC0 \u0AB6\u0A95\u0ABE\u0A88 \u0AA8\u0AA5\u0AC0. \u0AAB\u0AB0\u0AC0 \u0AAA\u0ACD\u0AB0\u0AAF\u0ABE\u0AB8 \u0A95\u0AB0\u0ACB.")}</div>}
    {guards.isError ? <div className="error-callout">{t("Guards could not be loaded. / \u0A97\u0ABE\u0AB0\u0ACD\u0AA1\u0AA8\u0AC0 \u0AAE\u0ABE\u0AB9\u0ABF\u0AA4\u0AC0 \u0AB2\u0ABE\u0AB5\u0AC0 \u0AB6\u0A95\u0ABE\u0A88 \u0AA8\u0AA5\u0AC0. ")}<button onClick={() => void guards.refetch()}>{t("Retry / \u0AAB\u0AB0\u0AC0 \u0AAA\u0ACD\u0AB0\u0AAF\u0ABE\u0AB8")}</button></div> : guards.isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th scope="col">#</th><th>{t("Guard")}</th><th>Employee code</th><th>{t("Site")}</th><th>{t("Duty shift")}</th><th>{t("Photo rate")}</th><th>{t("Documents")}</th><th>{t("Status")}</th><th /></tr></thead><tbody>{guards.data?.guards.map((item, index) => {
                return <tr key={item.id}><td className="list-index">{guards.startIndex + index + 1}</td>
        <td><UserIdentity id={item.id} name={item.name} photoUrl={item.profilePhotoUrl} meta={item.mobile}/></td>
        <td><code>{item.employeeCode}</code></td>
        <td>{item.assignedSiteDetails ? <div className="guard-site-cell"><strong>{item.assignedSiteDetails.siteCode || 'Site'}</strong><span>{item.assignedSiteDetails.siteName || 'Name unavailable'}</span>{item.assignedSiteDetails.mapLink && <a className="guard-site-map-link" href={item.assignedSiteDetails.mapLink} target="_blank" rel="noreferrer"><ExternalLink size={12}/>{t(" Map link")}</a>}</div> : item.assignedSite ? 'Assigned site' : 'Unassigned'}</td>
        <td>{item.dutyShift === "NIGHT" ? t("Night: 8 PM – 8 AM") : item.dutyShift === "DAY" ? t("Day: 8 AM – 8 PM") : "—"}</td><td>{item.photoRate === undefined ? "—" : `₹${item.photoRate}`}</td><td>{canManage ? <span className={item.documentCount < 3 ? 'doc-status incomplete' : 'doc-status'}><FileCheck2 size={15}/> {item.documentCount}{t(" Documents")}</span> : <span>{t("Restricted / \u0AAA\u0ACD\u0AB0\u0AA4\u0ABF\u0AAC\u0A82\u0AA7\u0ABF\u0AA4")}</span>}</td>
        <td><StatusBadge value={item.employmentStatus}/></td>
        <td><div className="guard-row-actions" onClick={(event) => event.stopPropagation()}><button type="button" className="guard-more-button" aria-label={`Actions for ${item.name}`} aria-expanded={openMenu === item.id} onClick={(event) => {
                        if (openMenu === item.id) {
                            closeMenu();
                            return;
                        }
                        setMenuAnchor(event.currentTarget);
                        setOpenMenu(item.id);
                    }}><MoreHorizontal size={19}/></button></div></td>
      </tr>;
            })}</tbody></table><PaginationControls pagination={guards.pagination} page={guards.page} onPageChange={guards.setPage} busy={guards.isFetching} />{!guards.data?.guards.length && <EmptyState title={t("No guards found")} description={t("Create the first guard from the admin form.")} icon={<Users />}/>}</section>}
    {!guards.isError && openGuard && menuAnchor && <GuardActionMenu guard={openGuard} canManage={canManage} anchor={menuAnchor} isPending={updateStatus.isPending} onClose={closeMenu} onEdit={() => { closeMenu(); navigate(canManage ? `/guards/${openGuard.id}/edit` : `/profile/${openGuard.id}`); }} onToggle={() => updateStatus.mutate({ id: openGuard.id, employmentStatus: openGuard.employmentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}/>}
  </>;
}
