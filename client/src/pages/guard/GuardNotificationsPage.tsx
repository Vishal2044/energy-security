import { Bell } from 'lucide-react';
import { GuardPageHeading } from '../../components/guard/GuardPageHeading';
import { usePageQuery } from '../../lib/pagination';
import { ErrorState, LoadingState, PaginationControls } from '../../components/ui';
import { useLanguage } from '../../locales/runtime';
import type { GuardNotification } from './types';
export function GuardNotificationsPage() {
  const gu = useLanguage() === 'gu';
  const query = usePageQuery<{ notifications: GuardNotification[] }>(['guard-notifications-page'], '/notifications', {});
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()}/>;
  return <div className="guard-list-page"><GuardPageHeading icon={<Bell />} title={gu ? 'સૂચનાઓ' : 'Notifications'} description={gu ? 'ફરજ અને પગારની નવી માહિતી.' : 'Updates about your duty and salary.'} />{query.isLoading ? <LoadingState/> : query.data?.notifications.map((item) => <article className={`guard-notification-card ${item.status === 'UNREAD' ? 'unread' : ''}`} key={item.id}><span className="guard-record-icon" aria-hidden="true"><Bell size={18}/></span><div><strong>{item.title}</strong><p>{item.body}</p><time>{new Date(item.createdAt).toLocaleString(gu ? 'gu-IN' : 'en-IN', { timeZone: 'Asia/Kolkata' })}</time></div></article>)}{!query.isLoading && !query.data?.notifications.length && <div className="guard-empty">{gu ? 'હજી કોઈ સૂચના નથી.' : 'No notifications yet.'}</div>}<PaginationControls pagination={query.pagination} page={query.page} onPageChange={query.setPage} busy={query.isFetching}/></div>;
}
