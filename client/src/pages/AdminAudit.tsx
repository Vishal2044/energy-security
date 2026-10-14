import { PaginationControls } from '../components/ui';
import { usePageQuery } from '../lib/pagination';
import { t } from '../locales/runtime';
import { ErrorState } from '../components/ui';
import { format } from 'date-fns';
import { ClipboardList } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getData } from '../lib/api';
import { EmptyState, LoadingState, PageHeader } from '../components/ui';
type AuditRow = {
    id: string;
    actor: string;
    action: string;
    entityType: string;
    entityId: string;
    at: string;
};
export function AdminAuditPage() {
    const pageQuery = usePageQuery<{
        audits: AuditRow[];
    }>(['audit'], '/audit', {});
    const { data, isLoading, isError, refetch } = pageQuery;
    if (isError)
        return <ErrorState onRetry={() => void refetch()}/>;
    return <><PageHeader eyebrow="CONTROL & COMPLIANCE" title={t("Audit log")} description={t("Review changes made by the admin team.")}/>{isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th scope="col">#</th><th>{t("Action")}</th><th>Entity</th><th>{t("Actor")}</th><th>{t("Time")}</th></tr></thead><tbody>{data?.audits.map((item, index) => <tr key={item.id}><td className="list-index">{pageQuery.startIndex + index + 1}</td><td><strong>{item.action.replaceAll('_', ' ')}</strong></td><td>{item.entityType} <code>{item.entityId}</code></td><td>{item.actor}</td><td>{format(new Date(item.at), 'dd MMM yyyy, HH:mm')}</td></tr>)}</tbody></table><PaginationControls pagination={pageQuery.pagination} page={pageQuery.page} onPageChange={pageQuery.setPage} busy={pageQuery.isFetching} />{!data?.audits.length && <EmptyState title={t("No audit entries")} description={t("Admin actions will be recorded here.")} icon={<ClipboardList />}/>}</section>}</>;
}
