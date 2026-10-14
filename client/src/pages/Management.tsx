import { t } from '../locales/runtime';
import { ErrorState } from '../components/ui';
import { useState } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, CircleDollarSign, FileCheck2, MapPinned, MoreHorizontal, Plus, Shield, Users, X } from 'lucide-react';
import { format } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getData } from '../lib/api';
import { EmptyState, LoadingState, PageHeader, SearchBox, StatCard, StatusBadge, Toast, UserIdentity } from '../components/ui';
type GuardListItem = {
    id: string;
    name: string;
    employeeCode: string;
    mobile?: string;
    village?: string;
    assignedSite?: string;
    employmentStatus: string;
    monthlySalary: number;
    documentCount: number;
    profilePhotoUrl?: string;
};
export function DashboardPage() {
    const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => getData<{
            totalGuards: number;
            onDuty: number;
            notStarted: number;
            verificationPending: number;
            missedVerification: number;
            openIncidents: number;
            activeSites: number;
            pendingSalaries: number;
            pendingDocumentReviews?: number;
            expiringDocuments?: number;
            payrollReview?: number;
            trend: Array<{
                day: string;
                value: number;
            }>;
            siteStats: Array<{
                site: string;
                attendance: number;
            }>;
            activities: Array<{
                id: string;
                title: string;
                detail: string;
                kind: string;
                at: string;
            }>;
        }>('/dashboard') });
    if (isLoading || !data)
        return <LoadingState />;
    return <><PageHeader eyebrow="OPERATIONS OVERVIEW" title={t("Welcome to DG Energy")} description={t("Here's what is happening across your security network today.")} action={<button className="button primary"><Plus size={17}/>{t(" New report")}</button>}/><div className="stat-grid"><StatCard label="Total guards" value={data.totalGuards} icon={<Users />} detail="Active workforce"/><StatCard label="Currently on duty" value={data.onDuty} icon={<Shield />} tone="green" detail={`${data.notStarted} not started`}/><StatCard label="Verification pending" value={data.verificationPending} icon={<Activity />} tone="amber" detail={`${data.missedVerification} missed today`}/><StatCard label="Open incidents" value={data.openIncidents} icon={<AlertTriangle />} tone="rose" detail="Needs attention"/></div><div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">{t("LAST 7 DAYS")}</span><h2>{t("Attendance trend")}</h2></div><span className="trend-up"><ArrowUpRight size={15}/> 8.4%</span></div><div className="bar-chart">{data.trend.map((item) => <div className="bar-col" key={item.day}><div className="bar" style={{ height: `${item.value * 1.7}px` }}><span>{item.value}</span></div><small>{item.day.split(' ')[1]}</small></div>)}</div></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">{t("SITE HEALTH")}</span><h2>{t("Attendance by site")}</h2></div><MapPinned size={19} className="muted-icon"/></div><div className="site-health">{data.siteStats.map((item) => <div className="health-row" key={item.site}><span>{item.site}</span><div className="progress"><span style={{ width: `${item.attendance}%` }}/></div><strong>{item.attendance}%</strong></div>)}</div></section></div><div className="bottom-grid"><section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">{t("LIVE FEED")}</span><h2>{t("Recent activity")}</h2></div><button className="link-button">{t("View all ")}<ArrowUpRight size={15}/></button></div><div className="activity-list">{data.activities.map((item) => <div className="activity-row" key={item.id}><div className={`activity-icon ${item.kind}`}><CheckCircle2 size={17}/></div><div><strong>{item.title}</strong><span>{item.detail}</span></div><time>{format(new Date(item.at), 'HH:mm')}</time></div>)}</div></section><section className="panel quick-panel"><span className="eyebrow">{t("QUICK VIEW")}</span><h2>{t("Operational pulse")}</h2><div className="pulse-item"><span>{t("Active sites")}</span><strong>{data.activeSites}</strong></div><div className="pulse-item"><span>{t("Pending salaries")}</span><strong>{data.pendingSalaries}</strong></div><div className="pulse-item"><span>{t("Monthly coverage")}</span><strong>94.2%</strong></div><div className="pulse-note"><CircleDollarSign size={18}/><span>External bank payment is recorded manually after review.</span></div></section></div></>;
}
export function GuardsPage() {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string>();
    const [toast, setToast] = useState('');
    const { data, isLoading } = useQuery({ queryKey: ['guards', search], queryFn: () => getData<{
            guards: GuardListItem[];
        }>('/guards', { search }) });
    const guard = data?.guards.find((item) => item.id === selected);
    return <><PageHeader eyebrow="WORKFORCE" title={t("Guards")} description={t("Manage your people, assignments and document readiness.")} action={<button className="button primary" onClick={() => setToast('Guard creation form is ready for your next record.')}><Plus size={17}/>{t(" Add guard")}</button>}/><div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder={t("Search name, code, mobile or village...")}/></div>{isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th>{t("Guard")}</th><th>Employee code</th><th>{t("Site")}</th><th>{t("Documents")}</th><th>{t("Status")}</th><th /></tr></thead><tbody>{data?.guards.map((item) => <tr key={item.id} onClick={() => setSelected(item.id)}><td><UserIdentity id={item.id} name={item.name} photoUrl={item.profilePhotoUrl} meta={item.mobile}/></td><td><code>{item.employeeCode}</code></td><td>{item.assignedSite ?? 'Unassigned'}</td><td><span className={item.documentCount < 3 ? 'doc-status incomplete' : 'doc-status'}><FileCheck2 size={15}/> {item.documentCount}{t("/3 complete")}</span></td><td><StatusBadge value={item.employmentStatus}/></td><td><MoreHorizontal size={18} className="muted-icon"/></td></tr>)}</tbody></table>{!data?.guards.length && <EmptyState title={t("No guards found")} description={t("Try another search phrase.")} icon={<Users />}/>}</section>}{guard && <div className="drawer-backdrop" onClick={() => setSelected(undefined)}><aside className="drawer" onClick={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelected(undefined)}><X /></button><UserIdentity id={guard.id} name={guard.name} photoUrl={guard.profilePhotoUrl} meta={`${guard.employeeCode} · ${guard.village ?? 'No village'}`}/><div className="profile-list"><div><span>{t("Assigned site")}</span><strong>{guard.assignedSite ?? 'Not assigned'}</strong></div><div><span>{t("Monthly salary")}</span><strong>₹{guard.monthlySalary.toLocaleString('en-IN')}</strong></div><div><span>{t("Documents")}</span><strong>{guard.documentCount}{t("/3 complete")}</strong></div><div><span>Employment</span><StatusBadge value={guard.employmentStatus}/></div></div><button className="button secondary full" onClick={() => setToast('Open the profile from the guard identity above.')}>{t("Open full profile ")}<ArrowUpRight size={16}/></button></aside></div>}{toast && <Toast message={toast} onClose={() => setToast('')}/>}</>;
}
export function AttendancePage() { const { data, isLoading } = useQuery({ queryKey: ['attendance'], queryFn: () => getData<{
        attendance: Array<{
            id: string;
            guardId?: string;
            guard?: string;
            site?: string;
            type: string;
            status: string;
            capturedAt: string;
        }>;
    }>('/attendance/history') }); return <><PageHeader eyebrow="FIELD OPERATIONS" title={t("Attendance")} description={t("Review shift evidence and verification events.")} action={<a className="button secondary" href="/api/reports/attendance.csv" target="_blank" rel="noreferrer">Export CSV</a>}/><div className="stat-grid compact"><StatCard label="Today's records" value={data?.attendance.length ?? 0} icon={<CheckCircle2 />}/><StatCard label="Verified" value={data?.attendance.filter((i) => i.status === 'VERIFIED').length ?? 0} icon={<Shield />} tone="green"/><StatCard label="Coverage" value="100%" icon={<Activity />} tone="blue"/></div>{isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th>{t("Guard")}</th><th>{t("Site")}</th><th>Event</th><th>{t("Captured")}</th><th>{t("Status")}</th></tr></thead><tbody>{data?.attendance.map((item) => <tr key={item.id}><td>{item.guardId ? <UserIdentity id={item.guardId} name={item.guard ?? 'Unknown guard'} photoUrl={`/api/guards/${item.guardId}/photo`}/> : <strong>{item.guard ?? 'Unknown guard'}</strong>}</td><td>{item.site}</td><td><span className="event-label">{item.type.replaceAll('_', ' ')}</span></td><td>{format(new Date(item.capturedAt), 'dd MMM · HH:mm')}</td><td><StatusBadge value={item.status}/></td></tr>)}</tbody></table>{!data?.attendance.length && <EmptyState title={t("No attendance records")} description={t("Photo-based field activity will appear here.")}/>}</section>}</>; }
export function SitesPage() { const { data, isLoading } = useQuery({ queryKey: ['sites'], queryFn: () => getData<{
        sites: Array<{
            id: string;
            siteCode: string;
            siteName: string;
            siteType: string;
            assignedGuards: string[];
            status: string;
        }>;
    }>('/sites') }); return <><PageHeader eyebrow="SITES" title={t("Sites")} description={t("Configure the places where duty is assigned.")} action={<button className="button primary"><Plus size={17}/>{t(" Add site")}</button>}/>{isLoading ? <LoadingState /> : <div className="site-card-grid">{data?.sites.map((site) => <article className="site-card panel" key={site.id}><div className="site-card-top"><span className="site-type">{site.siteType}</span><StatusBadge value={site.status}/></div><div className="site-symbol"><MapPinned size={21}/></div><h2>{site.siteName}</h2><code>{site.siteCode}</code><div className="site-card-meta"><span><Users size={15}/> {site.assignedGuards.length}{t(" guards")}</span></div></article>)}</div>}</>; }
export function IncidentsPage() { const client = useQueryClient(); const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['incidents'], queryFn: () => getData<{
        incidents: Array<{
            id: string;
            guardId?: string;
            guard?: string;
            site?: string;
            category: string;
            description: string;
            status: string;
            severity?: string;
            priority?: string;
            capturedAt: string;
        }>;
    }>('/incidents') }); const update = useMutation({ mutationFn: ({ id, status, decisionReason }: {
        id: string;
        status: string;
        decisionReason?: string;
    }) => api.patch(`/incidents/${id}`, { status, ...(decisionReason ? { decisionReason } : {}) }), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['incidents'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]); } }); if (isError)
    return <ErrorState onRetry={() => void refetch()}/>; return <><PageHeader eyebrow="SAFETY & RESPONSE" title={t("Incidents")} description={t("Keep every field issue visible until it is resolved.")}/>{update.isError && <ErrorState onRetry={() => update.reset()} message="Incident could not be updated. Please retry."/>}<div className="incident-summary"><span><AlertTriangle size={20}/> {data?.incidents.filter((i) => i.status === 'OPEN').length ?? 0}{t(" open incidents")}</span><span><CheckCircle2 size={20}/> {data?.incidents.filter((i) => i.status === 'RESOLVED').length ?? 0}{t(" resolved this month")}</span></div>{isLoading ? <LoadingState /> : <div className="incident-list">{!data?.incidents.length && <EmptyState title={t("No incidents")} description={t("Reported incidents will appear here.")}/>}{data?.incidents.map((item) => <article className="panel incident-card" key={item.id}><div className="incident-card-head"><div className="incident-icon"><AlertTriangle size={20}/></div><div>{item.guardId ? <UserIdentity id={item.guardId} name={item.guard ?? 'Unknown guard'} photoUrl={`/api/guards/${item.guardId}/photo`} meta={`${item.category.replaceAll('_', ' ')} · ${item.site ?? 'No site'} · ${item.severity ?? 'MEDIUM'} / ${item.priority ?? 'NORMAL'}`}/> : <><span className="eyebrow">{item.category.replaceAll('_', ' ')}</span><h2>{item.guard ?? item.description}</h2></>}<p>{item.description} · {format(new Date(item.capturedAt), 'dd MMM yyyy, HH:mm')}</p></div><StatusBadge value={item.status}/></div>{item.status !== 'RESOLVED' && <div className="incident-actions"><button className="button secondary" onClick={() => update.mutate({ id: item.id, status: 'ACKNOWLEDGED' })}>{t("Acknowledge")}</button><button className="button primary" onClick={() => update.mutate({ id: item.id, status: 'RESOLVED', decisionReason: 'Resolution reviewed by operations manager' })}>{t("Mark resolved")}</button></div>}</article>)}</div>}</>; }
export function SalaryPage() { const client = useQueryClient(); const { data, isLoading } = useQuery({ queryKey: ['salaries'], queryFn: () => getData<{
        salaries: Array<{
            id: string;
            guardId?: string;
            guard?: string;
            month: number;
            year: number;
            attendanceDays: number;
            finalSalary: number;
            status: string;
        }>;
    }>('/salaries') }); const pay = useMutation({ mutationFn: (id: string) => api.post(`/salaries/${id}/mark-paid`), onSuccess: () => client.invalidateQueries({ queryKey: ['salaries', 'dashboard'] }) }); return <><PageHeader eyebrow="PAYROLL RECORDS" title={t("Salary")} description={t("Record external payments with a clear audit trail.")}/><div className="salary-banner"><div><span className="eyebrow">{t("SEPTEMBER 2026 PAYABLE")}</span><strong>₹{(data?.salaries.reduce((sum, item) => sum + item.finalSalary, 0) ?? 0).toLocaleString('en-IN')}</strong><p>{t("Marking a salary paid records the company decision; it does not transfer money.")}</p></div><CircleDollarSign size={42}/></div>{isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th>{t("Guard")}</th><th>{t("Period")}</th><th>{t("Attendance")}</th><th>{t("Final salary")}</th><th>{t("Status")}</th><th /></tr></thead><tbody>{data?.salaries.map((item) => <tr key={item.id}><td>{item.guardId ? <UserIdentity id={item.guardId} name={item.guard ?? 'Unknown guard'} photoUrl={`/api/guards/${item.guardId}/photo`}/> : <strong>{item.guard ?? 'Unknown guard'}</strong>}</td><td>{item.month}/{item.year}</td><td>{item.attendanceDays}{t(" days")}</td><td><strong>₹{item.finalSalary.toLocaleString('en-IN')}</strong></td><td><StatusBadge value={item.status}/></td><td>{item.status === 'PENDING' && <button className="button small primary" onClick={() => pay.mutate(item.id)}>{t("Mark paid")}</button>}</td></tr>)}</tbody></table></section>}</>; }
