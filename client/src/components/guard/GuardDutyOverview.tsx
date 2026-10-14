import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Camera, CheckCircle2, CircleAlert, WalletCards } from 'lucide-react';
import { currentApiSession, getData } from '../../lib/api';
import { useLanguage } from '../../locales/runtime';
import { indiaBusinessDate } from '../../../../shared/time';
import type { PhotoDutyDay } from '../../../../shared/photoDuty';
import type { Pagination } from '../../../../shared/pagination';
import { PlatformCalendar } from '../PlatformCalendar';
import { Dialog, ErrorState, LoadingState, PreviewImage } from '../ui';
import { photoStatus, photoTime } from '../attendance/PhotoDutyRecords';
import { GuardMetric, GuardPageHeading } from './GuardPageHeading';

type MonthData = {
  days: PhotoDutyDay[];
  pagination: Pagination;
  summary: { workedDays: number; completeDays: number; absentDays: number; receivedPhotos: number; missedPhotos: number; earnings: number; deductions: number };
};
const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function GuardDutyOverview({ earnings = false, period: selectedPeriod, onPeriodChange, management = false, guardId }: { earnings?: boolean; period?: string; onPeriodChange?: (period: string) => void; management?: boolean; guardId?: string }) {
  const gu = useLanguage() === 'gu';
  const locale = gu ? 'gu-IN' : 'en-IN';
  const today = indiaBusinessDate(new Date());
  const [localPeriod, setLocalPeriod] = useState(today.slice(0, 7));
  const period = selectedPeriod ?? localPeriod;
  const setPeriod = (value: string) => { setLocalPeriod(value); onPeriodChange?.(value); };
  const [selection, setSelection] = useState('');
  const [preview, setPreview] = useState('');
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const query = useQuery({
    queryKey: ['photo-duty-days', management ? 'management-calendar' : 'guard-calendar', guardId, period, currentApiSession()],
    queryFn: async ({ signal }) => {
      const params = { month, year, pageSize: 20, guardId: management ? guardId : undefined };
      const first = await getData<MonthData>('/photo-duty/days', { ...params, page: 1 }, signal);
      // A guard's month has at most 31 dates. Load the second server page for the full calendar.
      const rest = first.pagination.totalPages > 1 ? await getData<MonthData>('/photo-duty/days', { ...params, page: 2 }, signal) : undefined;
      return { ...first, days: [...first.days, ...(rest?.days ?? [])] };
    },
    refetchInterval: 30000,
    enabled: !management || Boolean(guardId),
  });
  const days = query.data?.days ?? [];
  const byDate = new Map(days.map((day) => [day.businessDate, day]));
  const selectedDate = selection.startsWith(period) && byDate.has(selection) ? selection : byDate.has(today) ? today : days[0]?.businessDate;
  const selected = selectedDate ? byDate.get(selectedDate) : undefined;
  const summary = query.data?.summary;
  const dateLabel = (date: string) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return <div className={`guard-list-page guard-duty-overview${management ? ' management-calendar-overview' : ''}`}>
    <GuardPageHeading icon={earnings ? <WalletCards /> : <CalendarDays />} title={earnings ? (gu ? 'દિવસ પ્રમાણે કમાણી' : 'Day-wise earnings') : management ? (gu ? 'હાજરી કેલેન્ડર' : 'Attendance calendar') : (gu ? 'મારી હાજરી' : 'My attendance')} description={gu ? 'તારીખ પસંદ કરીને ફોટો, હાજરી અને કમાણી જુઓ.' : 'Choose a date to see your photos, attendance and earnings.'} />
    {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : query.isLoading ? <LoadingState /> : <>
      {summary && <div className="guard-metric-grid">
        <GuardMetric icon={<WalletCards size={18} />} label={gu ? 'મળેલા ફોટોની કમાણી' : 'Earned from photos'} value={money(summary.earnings)} detail={gu ? 'આ મહિના માટે' : 'For the selected month'} />
        <GuardMetric icon={<CheckCircle2 size={18} />} label={gu ? 'કામ કરેલા દિવસ' : 'Worked days'} value={summary.workedDays} detail={gu ? `${summary.completeDays} પૂર્ણ · ${summary.absentDays} ગેરહાજર` : `${summary.completeDays} complete · ${summary.absentDays} absent`} tone="success" />
        <GuardMetric icon={<Camera size={18} />} label={gu ? 'મળેલા ફોટો' : 'Received photos'} value={summary.receivedPhotos} detail={gu ? 'દરેક ફોટોની કમાણી ગણાય છે' : 'Each received photo earns its rate'} tone="success" />
        <GuardMetric icon={<CircleAlert size={18} />} label={gu ? 'ચૂકેલા ફોટોનો પગાર નહીં' : 'Missed-photo amount'} value={money(summary.deductions)} detail={gu ? `${summary.missedPhotos} ફોટો ચૂકી ગયા` : `${summary.missedPhotos} missed photos · unpaid`} tone="warning" />
      </div>}
      <PlatformCalendar period={period} onPeriodChange={(value) => { setPeriod(value); setSelection(''); }} minPeriod="2020-01" maxPeriod={today.slice(0, 7)} selectedDate={selectedDate} onDateSelect={setSelection} busy={query.isFetching} getDayContent={(date) => {
        const day = byDate.get(date);
        const tone = day?.status === 'PRESENT' ? 'success' : day?.status === 'PARTIAL' ? 'warning' : day?.status === 'ABSENT' ? 'danger' : day ? 'brand' : 'muted';
        return { tone, disabled: !day, detail: day ? (earnings ? money(day.earnings) : `${day.receivedPhotos}/${day.requiredPhotos}`) : '—', description: day ? `${photoStatus(day.status, gu)} · ${money(day.earnings)} · ${day.receivedPhotos}/${day.requiredPhotos}` : gu ? 'હાજરી રેકોર્ડ નથી' : 'No attendance record' };
      }} footer={<><div className="guard-calendar-legend"><span className="present">{gu ? 'પૂર્ણ હાજરી' : 'Complete'}</span><span className="partial">{gu ? 'આંશિક' : 'Partial'}</span><span className="absent">{gu ? 'ગેરહાજર' : 'Absent'}</span><span className="scheduled">{gu ? 'આગામી / ચાલુ' : 'Upcoming / in progress'}</span></div><p className="guard-note">{gu ? 'રંગ હાજરી બતાવે છે. તારીખ પર ટૅપ કરીને વિગત જુઓ. — એટલે હજી રેકોર્ડ નથી.' : 'Colors show attendance. Tap a date for details. — means no record yet.'}</p></>}/>
      {selected ? <section className="panel guard-selected-day"><div className="panel-heading"><div><span className="eyebrow">{gu ? 'પસંદ કરેલ દિવસ' : 'SELECTED DAY'}</span><h2>{dateLabel(selected.businessDate)}</h2><p>{selected.shiftType === 'DAY' ? (gu ? 'દિવસની ફરજ' : 'Day duty') : (gu ? 'રાતની ફરજ' : 'Night duty')} · {photoStatus(selected.status, gu)}</p></div><div className="guard-day-earning"><small>{gu ? 'કમાણી' : 'Earned'}</small><strong>{money(selected.earnings)}</strong></div></div>
        <div className="guard-day-breakdown"><span>{gu ? 'ફોટો મળ્યા' : 'Received'}<b>{selected.receivedPhotos}/{selected.requiredPhotos}</b></span><span>{gu ? 'પ્રતિ ફોટો દર' : 'Scheduled photo rate'}<b>{money(selected.photoRate)}</b></span><span>{gu ? 'ચૂકેલા ફોટોનો પગાર નહીં' : 'Missed / unpaid'}<b>{money(selected.deduction)}</b></span></div>
        <div className="photo-slot-grid">{selected.slots.map((slot) => <div key={slot.index} className={`photo-slot ${slot.status.toLowerCase()}`}><span className="guard-slot-index">{gu ? 'ફોટો' : 'Photo'} {slot.index + 1}</span><strong>{photoTime(slot.opensAt, gu)} – {photoTime(slot.closesAt, gu)}</strong><small>{photoStatus(slot.status, gu)}</small>{slot.attendance ? <b className="guard-slot-amount">{money(slot.attendance.photoRate)}</b> : slot.status === 'MISSED' ? <b className="guard-slot-amount">₹0</b> : null}{slot.attendance?.photo && <button type="button" className="attendance-photo-trigger" onClick={() => setPreview(slot.attendance!.photo!)} aria-label={gu ? 'ફોટો જુઓ' : 'View photo'}><img src={slot.attendance.photo} loading="lazy" alt={gu ? 'હાજરી ફોટો' : 'Attendance photo'} /></button>}</div>)}</div>
        <p className="guard-note">{gu ? 'કમાણી મળેલા ફોટોના નોંધાયેલા દરથી ગણાય છે. રાતની ફરજની તારીખ ફરજ શરૂ થયાનો દિવસ છે.' : 'Earnings use the rate saved with each received photo. Night duty belongs to the date it started.'}</p>
      </section> : <div className="guard-empty">{gu ? 'આ મહિના માટે હાજરી રેકોર્ડ નથી.' : 'No attendance records for this month.'}</div>}
      {earnings && <p className="guard-note guard-info-box">{gu ? 'દિવસ પ્રમાણે કમાણી હાજરીના રેકોર્ડ પરથી છે. જમા થયેલા પગારનો અંતિમ રેકોર્ડ ઉપરના પગાર પત્રકમાં જુઓ.' : 'Daily earnings show attendance records. The monthly payslip holds the final credited salary record.'}</p>}
    </>}
    {preview && <Dialog label={gu ? 'હાજરી ફોટો' : 'Attendance photo'} className="image-dialog" onClose={() => setPreview('')}><button type="button" className="button secondary" onClick={() => setPreview('')}>{gu ? 'બંધ કરો' : 'Close'}</button><PreviewImage src={preview} alt={gu ? 'હાજરી ફોટો' : 'Attendance photo'} /></Dialog>}
  </div>;
}
