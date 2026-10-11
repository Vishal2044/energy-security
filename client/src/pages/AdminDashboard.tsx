import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Image as ImageIcon, MapPinned, Shield, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getData } from '../lib/api';
import { EmptyState, LoadingState, PageHeader, StatCard } from '../components/ui';

type DashboardData = {
  totalGuards: number;
  onDuty: number;
  notStarted: number;
  verificationPending: number;
  missedVerification: number;
  openIncidents: number;
  activeSites: number;
  pendingSalaries: number;
  teamMembers: number;
  trend: Array<{ day: string; value: number }>;
  siteStats: Array<{ site: string; attendance: number }>;
  activities: Array<{ id: string; title: string; detail: string; kind: string; at: string }>;
};

type RecentAttendance = {
  id: string;
  guard?: string;
  site?: string;
  photo?: string;
  capturedAt: string;
  status: string;
};

export function AdminDashboardPage({ adminView = true }: { adminView?: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => getData<DashboardData>('/dashboard') });
  const recentAttendance = useQuery({ queryKey: ['dashboard-attendance'], queryFn: () => getData<{ attendance: RecentAttendance[] }>('/attendance/history?limit=4') });
  if (isError) return <div className="error-callout">Dashboard could not be loaded. <button onClick={() => void refetch()}>Retry</button></div>;
  if (isLoading || !data) return <LoadingState />;

  return <>
    <PageHeader eyebrow="ADMIN CONTROL CENTER" title="Good morning, admin" description="Set up your workforce, sites and security operations from one place." action={adminView ? <Link className="button primary" to="/team">Manage team <ArrowUpRight size={16} /></Link> : undefined} />
    <div className="stat-grid">
      <StatCard label="Active guards" value={data.totalGuards} icon={<Users />} detail={`${data.onDuty} currently on duty`} />
      <StatCard label="Active sites" value={data.activeSites} icon={<MapPinned />} tone="green" detail="Ready for assignments" />
      {adminView && <StatCard label="Security managers" value={data.teamMembers} icon={<Shield />} tone="blue" detail="Admin-managed accounts" />}
      <StatCard label="Open incidents" value={data.openIncidents} icon={<AlertTriangle />} tone="rose" detail="Needs attention" />
    </div>
    <div className="dashboard-grid">
      <section className="panel chart-panel">
        <div className="panel-heading"><div><span className="eyebrow">LAST 7 DAYS</span><h2>Verified shift starts</h2></div><span className="trend-up"><CheckCircle2 size={15} /> Live data</span></div>
        {data.trend.some((item) => item.value > 0) ? <div className="bar-chart">{data.trend.map((item) => <div className="bar-col" key={item.day}><div className="bar" style={{ height: `${Math.max(25, item.value * 35)}px` }}><span>{item.value}</span></div><small>{item.day}</small></div>)}</div> : <EmptyState title="No attendance yet" description="Verified guard activity will appear here after the first shift starts." icon={<Activity />} />}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">SITE HEALTH</span><h2>Attendance by site</h2></div><MapPinned size={19} className="muted-icon" /></div>{data.siteStats.length ? <div className="site-health">{data.siteStats.map((item) => <div className="health-row" key={item.site}><span>{item.site}</span><div className="progress"><span style={{ width: `${item.attendance}%` }} /></div><strong>{item.attendance}%</strong></div>)}</div> : <EmptyState title="No sites configured" description="Add your first site before assigning guards." icon={<MapPinned />} />}</section>
    </div>
    <div className="bottom-grid">
      <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">AUDITABLE ACTIVITY</span><h2>Recent activity</h2></div>{adminView && <Link className="link-button" to="/audit">View audit <ArrowUpRight size={15} /></Link>}</div>{data.activities.length ? <div className="activity-list">{data.activities.map((item) => <div className="activity-row" key={item.id}><div className={`activity-icon ${item.kind}`}><CheckCircle2 size={17} /></div><div><strong>{item.title}</strong><span>{item.detail}</span></div><time>{format(new Date(item.at), 'HH:mm')}</time></div>)}</div> : <EmptyState title="No activity yet" description="Admin actions and field events will appear here." />}</section>
      <section className="panel quick-panel"><span className="eyebrow">SETUP STATUS</span><h2>Workspace readiness</h2><div className="pulse-item"><span>Guards not started</span><strong>{data.notStarted}</strong></div><div className="pulse-item"><span>Pending verifications</span><strong>{data.verificationPending}</strong></div><div className="pulse-item"><span>Missed verifications</span><strong>{data.missedVerification}</strong></div>{adminView && <div className="pulse-item"><span>Pending salaries</span><strong>{data.pendingSalaries}</strong></div>}</section>
    </div>
    <section className="panel dashboard-evidence-panel"><div className="panel-heading"><div><span className="eyebrow">PHOTO EVIDENCE</span><h2>Recent attendance images</h2></div><Link className="link-button" to="/attendance">Open attendance review <ArrowUpRight size={15} /></Link></div>{recentAttendance.isLoading ? <LoadingState /> : recentAttendance.isError ? <div className="error-callout">Attendance images could not be loaded. / હાજરીના ફોટા લાવી શકાઈ નથી. <button onClick={() => void recentAttendance.refetch()}>Retry / ફરી પ્રયાસ</button></div> : recentAttendance.data?.attendance?.length ? <div className="dashboard-evidence-grid">{recentAttendance.data.attendance.map((item) => <Link className="dashboard-evidence-card" to="/attendance" key={item.id}>{item.photo ? <img src={item.photo} alt={`Attendance evidence for ${item.guard ?? 'guard'}`} /> : <div className="dashboard-evidence-missing"><ImageIcon size={24} /></div>}<div><strong>{item.guard ?? 'Unknown guard'}</strong><span>{item.site ?? 'Unknown site'}</span><small>{format(new Date(item.capturedAt), 'dd MMM yyyy, HH:mm')}</small><em>{item.status.replaceAll('_', ' ')}</em></div></Link>)}</div> : <EmptyState title="No attendance images yet" description="Uploaded guard images will appear here after the first submission." icon={<ImageIcon />} />}</section>
  </>;
}
