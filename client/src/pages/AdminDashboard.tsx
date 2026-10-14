import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Camera, Users, MapPinned, AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { addBusinessDays } from '../../../shared/photoDuty';
import { getData } from '../lib/api';
import { useLanguage } from '../locales/runtime';
import { ErrorState, LoadingState, PageHeader, StatCard } from '../components/ui';
export type PhotoOperationsData = {
  businessDate: string;
  summary: { sites: number; rostered: number; attendanceSubmitted: number; pendingAttendance: number; receivedPhotos: number; missedPhotos: number; absentGuards: number; unconfiguredGuards: number; openIncidents: number };
  sites: { siteCode: string; siteName: string; assignedGuards: number; expectedCoverage: number; rostered: number; attendanceSubmitted: number; shortage: number; receivedPhotos: number; missedPhotos: number; openIncidents: number }[];
  trend: { day: string; value: number }[];
  recentPhotos: { id: string; guard?: string; photo?: string; capturedAt: string }[];
};
export function AdminDashboardPage({ adminView = true }: { adminView?: boolean }) {
  const gu = useLanguage() === 'gu';
  const query = useQuery({ queryKey: ['photo-operations'], queryFn: () => getData<PhotoOperationsData>('/photo-duty/operations'), refetchInterval: 30000 });
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()}/>;
  if (query.isLoading || !query.data) return <LoadingState/>;
  const data = query.data;
  const dateLabel = new Date(`${data.businessDate}T12:00:00+05:30`).toLocaleDateString(gu ? 'gu-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const trendMax = Math.max(1, ...data.trend.map((day) => day.value));
  const trendTotal = data.trend.reduce((sum, day) => sum + day.value, 0);
  return <div className="management-dashboard">
    <PageHeader eyebrow={adminView ? 'ADMIN OVERVIEW' : 'SITE OVERVIEW'} title={gu ? 'સુરક્ષા કામગીરી ડેશબોર્ડ' : 'Security operations dashboard'} description={`${dateLabel} · IST`} action={<Link className="button primary" to="/users/new">{gu ? 'ગાર્ડ ઉમેરો' : 'Add guard'}</Link>}/>
    <div className="management-context-strip"><span>{gu ? 'આજની કામગીરી અને ચાલુ રાતની ફરજ' : 'Today’s operations and ongoing night duty'}</span><Link to="/operations">{gu ? 'સાઇટ પ્રમાણે જુઓ →' : 'Explore by site →'}</Link></div>
    <div className="stat-grid management-stat-grid">
      <StatCard label={gu ? 'સક્રિય સાઇટ' : 'Active sites'} value={data.summary.sites} icon={<MapPinned/>} detail={gu ? 'તમારા ઍક્સેસમાં આવતી સાઇટ' : 'Within your permitted site access'}/>
      <StatCard label={gu ? 'નક્કી કરેલ ફરજ' : 'Scheduled duties'} value={data.summary.rostered} icon={<Users/>} detail={gu ? 'ફોટો શેડ્યૂલ ધરાવતા ગાર્ડ' : 'Guards with configured photo duty'}/>
      <StatCard label={gu ? 'ફોટો મોકલનાર ગાર્ડ' : 'Guards with photos'} value={data.summary.attendanceSubmitted} icon={<CheckCircle2/>} tone="green" detail={gu ? 'ઓછામાં ઓછો એક ફોટો મળ્યો' : 'At least one photo received'}/>
      <StatCard label={gu ? 'હજી ફોટો નથી' : 'No photos yet'} value={data.summary.pendingAttendance} icon={<Clock3/>} tone="amber" detail={gu ? 'ફોટો બાકી; ફરજ હજી ચાલુ હોઈ શકે' : 'Includes duties still in progress'}/>
      <StatCard label={gu ? 'મળેલા ફોટો' : 'Received photos'} value={data.summary.receivedPhotos} icon={<Camera/>} tone="green" detail={gu ? 'દરેક ફોટો તેના દર પ્રમાણે કમાણી કરે' : 'Each photo earns its recorded rate'}/>
      <StatCard label={gu ? 'ચૂકેલા ફોટો' : 'Missed photos'} value={data.summary.missedPhotos} icon={<AlertTriangle/>} tone="rose" detail={gu ? 'સમય પૂરો થયો; આ ફોટોનો પગાર નહીં' : 'Closed slots without a photo · unpaid'}/>
      <StatCard label={gu ? 'ગેરહાજર ગાર્ડ' : 'Absent guards'} value={data.summary.absentGuards} icon={<Users/>} tone="rose" detail={gu ? 'ફરજ પૂરી થઈ અને એક પણ ફોટો નથી' : 'Duty finished with zero photos'}/>
      <StatCard label={gu ? 'ખુલ્લી ઘટનાઓ' : 'Open incidents'} value={data.summary.openIncidents} icon={<AlertTriangle/>} tone="amber" detail={gu ? 'ધ્યાન આપવાની બાકી ઘટનાઓ' : 'Incidents still requiring attention'}/>
    </div>
    {data.summary.unconfiguredGuards > 0 && <div className="management-setup-notice"><AlertTriangle size={20} aria-hidden="true"/><span><strong>{data.summary.unconfiguredGuards} {gu ? 'ગાર્ડનું શેડ્યૂલ બાકી' : 'guards need duty setup'}</strong><small>{gu ? 'દિવસ/રાતની ફરજ અને પ્રતિ ફોટો દર નક્કી કરો.' : 'Configure day/night duty and a per-photo rate.'}</small></span><Link className="button secondary small" to="/guards">{gu ? 'ગાર્ડ જુઓ' : 'View guards'}</Link></div>}
    <div className="management-dashboard-panels">
      <section className="panel management-trend-panel"><div className="panel-heading"><div><span className="eyebrow">{gu ? 'છેલ્લા 7 દિવસ' : 'LAST 7 DAYS'}</span><h2>{gu ? 'મળેલા ફરજના ફોટો' : 'Received duty photos'}</h2></div><span className="management-chart-total"><strong>{trendTotal}</strong><small>{gu ? 'કુલ ફોટો' : 'total photos'}</small></span></div><p className="management-panel-note">{gu ? 'દરેક કૉલમ ફરજની તારીખ પ્રમાણે મળેલા ફોટોની સંખ્યા બતાવે છે.' : 'Each column counts received photos by the duty’s starting date.'}</p><div className="bar-chart">{data.trend.map((day,index) => { const date = addBusinessDays(data.businessDate, index - data.trend.length + 1); const label = new Date(`${date}T12:00:00+05:30`).toLocaleDateString(gu ? 'gu-IN' : 'en-IN', {day:'numeric',month:'short',timeZone:'Asia/Kolkata'}); return <div className="bar-col" key={date} aria-label={`${label}: ${day.value} ${gu ? 'ફોટો' : 'photos'}`}><div className={`bar${day.value === 0 ? ' empty' : ''}`} style={{ height: `${Math.max(4, day.value / trendMax * 145)}px` }}><span>{day.value}</span></div><small>{label}</small></div>; })}</div></section>
      <section className="panel management-shortcuts"><span className="eyebrow">{gu ? 'ઝડપી ઍક્સેસ' : 'QUICK ACCESS'}</span><h2>{gu ? 'આગળ શું જોવું છે?' : 'Explore your workspace'}</h2><Link to="/attendance"><Camera size={20}/><span><strong>{gu ? 'હાજરી કેલેન્ડર' : 'Attendance calendar'}</strong><small>{gu ? 'તારીખ અને ગાર્ડ પ્રમાણે ફોટો' : 'Photos by date and guard'}</small></span><b aria-hidden="true">→</b></Link><Link to="/salary"><CheckCircle2 size={20}/><span><strong>{gu ? 'પગાર અને રોજની કમાણી' : 'Salary & daily earnings'}</strong><small>{gu ? 'ફોટો, કમાણી અને ચૂકવણી' : 'Photos, earnings and payments'}</small></span><b aria-hidden="true">→</b></Link><Link to="/incidents"><AlertTriangle size={20}/><span><strong>{gu ? 'ઘટનાઓ' : 'Incidents'}</strong><small>{gu ? 'બાકી ઘટનાઓની વિગતો' : 'Review outstanding incidents'}</small></span><b aria-hidden="true">→</b></Link></section>
    </div>
    <section className="panel dashboard-evidence-panel"><div className="panel-heading"><div><span className="eyebrow">{gu ? 'તાજેતરની માહિતી' : 'RECENT ACTIVITY'}</span><h2>{gu ? 'તાજેતરના લાઇવ ફોટો' : 'Recent live photos'}</h2></div><Link className="button secondary small" to="/attendance">{gu ? 'બધા જુઓ' : 'View all'}</Link></div><div className="dashboard-evidence-grid">{data.recentPhotos.map((photo) => <Link key={photo.id} className="dashboard-evidence-card" to="/attendance">{photo.photo ? <img src={photo.photo} loading="lazy" alt={gu ? 'હાજરી ફોટો' : 'Duty photo'}/> : <span className="management-photo-placeholder"><Camera size={24}/></span>}<strong>{photo.guard || (gu ? 'ગાર્ડ' : 'Guard')}</strong><small>{new Date(photo.capturedAt).toLocaleString(gu ? 'gu-IN' : 'en-IN', { timeZone: 'Asia/Kolkata' })}</small></Link>)}</div>{!data.recentPhotos.length && <div className="management-empty-inline"><Camera size={24}/><span>{gu ? 'હજી ફોટો મળ્યા નથી.' : 'No live photos received yet.'}</span></div>}</section>
  </div>;
}
