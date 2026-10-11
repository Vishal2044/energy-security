import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, MapPinned, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getData } from '../lib/api';
import { EmptyState, LoadingState, PageHeader, StatCard } from '../components/ui';

type OperationsData = {
  businessDate: string;
  summary: { sites: number; rostered: number; attendanceSubmitted: number; pendingAttendance: number; openIncidents: number; pendingLeaveRequests: number };
  sites: Array<{ siteCode: string; siteName: string; assignedGuards: number; expectedCoverage: number; rostered: number; attendanceSubmitted: number; pendingAttendance: number; shortage: number; openIncidents: number }>;
  upcomingChanges: Array<{ id: string; businessDate: string; shiftType: string; startAt: string; endAt: string; guardId: string; siteId: string }>;
  escalationQueue: Array<{ id: string; category: string; severity?: string; priority?: string; status: string; description?: string }>;
};

export function OperationsBoardPage() {
  const query = useQuery({ queryKey: ['operations-dashboard'], queryFn: () => getData<OperationsData>('/operations/dashboard'), refetchInterval: 60000 });
  if (query.isLoading || !query.data) return <LoadingState />;
  if (query.isError) return <div className="error-callout">Operations dashboard could not be loaded. <button onClick={() => void query.refetch()}>Retry</button></div>;
  const data = query.data;
  return <>
    <PageHeader eyebrow="OPERATIONS CONTROL" title="Daily operations" description={`Roster, coverage and escalation visibility for ${data.businessDate}.`} action={<button className="button secondary" onClick={() => void query.refetch()}>Refresh</button>} />
    <div className="stat-grid">
      <StatCard label="Rostered guards" value={data.summary.rostered} icon={<Users />} detail={`${data.summary.sites} sites in scope`} />
      <StatCard label="Attendance submitted" value={data.summary.attendanceSubmitted} icon={<CheckCircle2 />} tone="green" detail={`${data.summary.pendingAttendance} still pending`} />
      <StatCard label="Open incidents" value={data.summary.openIncidents} icon={<AlertTriangle />} tone="rose" detail="Needs acknowledgement or closure" />
      <StatCard label="Pending leave" value={data.summary.pendingLeaveRequests} icon={<CalendarDays />} tone="amber" detail="Manager decision required" />
    </div>
    <section className="panel table-panel">
      <div className="panel-heading" style={{ padding: 23 }}><div><span className="eyebrow">SITE COVERAGE</span><h2>Today&apos;s deployment</h2></div><MapPinned size={19} className="muted-icon" /></div>
      {data.sites.length ? <table><thead><tr><th>Site</th><th>Assigned</th><th>Coverage</th><th>Attendance</th><th>Exceptions</th></tr></thead><tbody>{data.sites.map((site) => <tr key={site.siteCode}><td><strong>{site.siteName}</strong><br /><code>{site.siteCode}</code></td><td>{site.assignedGuards}</td><td>{site.rostered}/{site.expectedCoverage}</td><td>{site.attendanceSubmitted}/{site.rostered}</td><td>{site.shortage > 0 && <span className="badge warning">Short {site.shortage}</span>} {site.openIncidents > 0 && <span className="badge positive">Incidents {site.openIncidents}</span>} {!site.shortage && !site.openIncidents && <span className="badge positive">On track</span>}</td></tr>)}</tbody></table> : <EmptyState title="No sites in scope" description="Assign sites to the security manager or configure an active site." icon={<MapPinned />} />}
    </section>
    <div className="bottom-grid" style={{ marginTop: 22 }}>
      <section className="panel table-panel"><div className="panel-heading" style={{ padding: 23 }}><div><span className="eyebrow">ROSTER CHANGE QUEUE</span><h2>Upcoming duties</h2></div><ClipboardList size={19} className="muted-icon" /></div>{data.upcomingChanges.length ? <table><thead><tr><th>Date</th><th>Shift</th><th>Time</th><th>Guard</th></tr></thead><tbody>{data.upcomingChanges.map((item) => <tr key={item.id}><td>{item.businessDate}</td><td>{item.shiftType}</td><td>{new Date(item.startAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td><td><code>{item.guardId}</code></td></tr>)}</tbody></table> : <EmptyState title="No upcoming roster changes" description="Newly created duties will appear here." />}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ESCALATION QUEUE</span><h2>Open incidents</h2></div><AlertTriangle size={19} className="muted-icon" /></div>{data.escalationQueue.length ? <div className="activity-list">{data.escalationQueue.map((item) => <div className="activity-row" key={item.id}><div className="activity-icon incident"><AlertTriangle size={17} /></div><div><strong>{item.category.replaceAll('_', ' ')}</strong><span>{item.severity ?? 'MEDIUM'} · {item.priority ?? 'NORMAL'} · {item.status}</span></div></div>)}</div> : <EmptyState title="No open incidents" description="The escalation queue is clear for this scope." icon={<CheckCircle2 />} />}</section>
    </div>
  </>;
}
