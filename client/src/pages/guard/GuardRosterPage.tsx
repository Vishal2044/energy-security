import { CalendarDays, Clock3 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getData } from '../../lib/api';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';
import { translateValue, useLanguage } from '../../locales/runtime';

type Roster = { id: string; businessDate: string; shiftType: string; startAt: string; endAt: string; status: string; site?: { siteCode?: string; siteName?: string } };

export function GuardRosterPage() {
  const language = useLanguage();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['guard-rosters-page'], queryFn: () => getData<{ rosters: Roster[] }>('/rosters', { from: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }) });
  const acknowledge = useMutation({ mutationFn: (id: string) => api.post(`/rosters/${id}/acknowledge`), onSuccess: () => client.invalidateQueries({ queryKey: ['guard-rosters-page'] }) });

  if (query.isError) return <div className="error-callout" role="alert">{language === 'gu' ? 'ડ્યુટી શેડ્યૂલ લાવી શકાયું નથી.' : 'Duty schedule could not be loaded.'} <button onClick={() => void query.refetch()}>{language === 'gu' ? 'ફરી પ્રયાસ' : 'Retry'}</button></div>;
  if (query.isLoading || !query.data) return <LoadingState />;

  return <>
    <PageHeader eyebrow={language === 'gu' ? 'મારી ફરજ' : 'MY DUTY'} title={language === 'gu' ? 'સોંપાયેલ રોસ્ટર' : 'Assigned roster'} description={language === 'gu' ? 'તમારી સાઇટ, શિફ્ટનો સમય અને સ્વીકૃતિની સ્થિતિ જુઓ.' : 'Review your assigned site, shift time and acknowledgement status.'} />
    {acknowledge.isError && <div className="error-callout" role="alert">{language === 'gu' ? 'ફરજ સ્વીકારી શકાયી નથી.' : 'Duty could not be acknowledged. Please retry.'}</div>}
    <section className="panel" style={{ padding: 23 }}>
      {query.data.rosters.length ? <div className="activity-list">{query.data.rosters.map((roster) => <div className="activity-row" key={roster.id}><div className="activity-icon"><CalendarDays size={17} /></div><div><strong>{roster.businessDate} · {translateValue(roster.shiftType, language)}</strong><span>{roster.site?.siteCode ?? ''} {roster.site?.siteName ?? ''} · {new Date(roster.startAt).toLocaleTimeString(language === 'gu' ? 'gu-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} - {new Date(roster.endAt).toLocaleTimeString(language === 'gu' ? 'gu-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</span></div><div>{roster.status === 'ACKNOWLEDGED' ? <StatusBadge value={roster.status} /> : roster.status !== 'CANCELLED' ? <button className="button small secondary" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(roster.id)}><Clock3 size={13} /> {language === 'gu' ? 'સ્વીકારો' : 'Acknowledge'}</button> : <StatusBadge value={roster.status} />}</div></div>)}</div> : <EmptyState title={language === 'gu' ? 'કોઈ ફરજ સોંપાઈ નથી' : 'No duty assigned'} description={language === 'gu' ? 'તમારા મેનેજર અહીં આગામી રોસ્ટર પ્રકાશિત કરશે.' : 'Your manager will publish the next duty roster here.'} icon={<CalendarDays />} />}
    </section>
  </>;
}
