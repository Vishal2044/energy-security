import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Users } from 'lucide-react';
import { currentApiSession, getData } from '../../lib/api';
import { useLanguage } from '../../locales/runtime';
import { indiaBusinessDate } from '../../../../shared/time';
import { GuardDutyOverview } from '../guard/GuardDutyOverview';
import { Dropdown, ErrorState, LoadingState } from '../ui';

export type DutyCalendarSelection = { guardId: string; period: string; guardName?: string };

export function ManagementDutyCalendar({ earnings = false, initialSelection }: { earnings?: boolean; initialSelection?: DutyCalendarSelection }) {
  const gu = useLanguage() === 'gu';
  const [guardId, setGuardId] = useState(initialSelection?.guardId ?? '');
  const [period, setPeriod] = useState(initialSelection?.period ?? indiaBusinessDate(new Date()).slice(0, 7));
  const guards = useQuery({ queryKey: ['photo-guard-options', currentApiSession()], queryFn: ({ signal }) => getData<{ guards: { id: string; name: string; employeeCode?: string }[] }>('/guards', undefined, signal) });
  const options = guards.data?.guards.map((guard) => ({ value: guard.id, label: `${guard.name}${guard.employeeCode ? ` · ${guard.employeeCode}` : ''}` })) ?? [];
  if (initialSelection?.guardId && !options.some((option) => option.value === initialSelection.guardId)) options.push({ value: initialSelection.guardId, label: initialSelection.guardName ?? initialSelection.guardId });
  return <section className="management-calendar-section">
    <div className="management-calendar-picker panel"><div className="management-calendar-picker-copy"><span className="management-section-icon" aria-hidden="true"><Users size={20}/></span><div><h2>{gu ? 'ગાર્ડ પ્રમાણે વિગત' : 'Explore a guard’s month'}</h2><p>{gu ? 'ગાર્ડ પસંદ કરો, પછી તારીખ પર ક્લિક કરીને વિગત જુઓ.' : 'Select a guard, then choose a date for photo and earning details.'}</p></div></div><div className="management-guard-select"><label>{gu ? 'ગાર્ડ પસંદ કરો' : 'Select guard'}</label>{guards.isLoading ? <LoadingState/> : guards.isError ? <ErrorState onRetry={() => void guards.refetch()}/> : <Dropdown value={guardId} onChange={setGuardId} options={options} placeholder={gu ? 'ગાર્ડ પસંદ કરો' : 'Choose a guard'} />}</div></div>
    {guardId ? <GuardDutyOverview key={guardId} management guardId={guardId} earnings={earnings} period={period} onPeriodChange={setPeriod}/> : <div className="management-calendar-placeholder"><CalendarDays size={30} aria-hidden="true"/><strong>{gu ? 'તમારો માસિક કેલેન્ડર અહીં દેખાશે' : 'Your monthly calendar will appear here'}</strong><p>{gu ? 'એક ગાર્ડ પસંદ કરીને હાજરી, દિવસની કમાણી અને ચાર ફોટોના સમય જુઓ.' : 'Choose a guard to see attendance, daily earnings and all four photo slots.'}</p></div>}
  </section>;
}
