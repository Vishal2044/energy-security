import { format } from 'date-fns';
import { ClipboardList } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getData } from '../lib/api';
import { EmptyState, LoadingState, PageHeader } from '../components/ui';

type AuditRow = { id: string; actor: string; action: string; entityType: string; entityId: string; at: string };

export function AdminAuditPage() {
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: () => getData<{ audits: AuditRow[] }>('/audit') });
  return <><PageHeader eyebrow="CONTROL & COMPLIANCE" title="Audit log" description="Review changes made by the admin team." />{isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>Time</th></tr></thead><tbody>{data?.audits.map((item) => <tr key={item.id}><td><strong>{item.action.replaceAll('_', ' ')}</strong></td><td>{item.entityType} <code>{item.entityId}</code></td><td>{item.actor}</td><td>{format(new Date(item.at), 'dd MMM yyyy, HH:mm')}</td></tr>)}</tbody></table>{!data?.audits.length && <EmptyState title="No audit entries" description="Admin actions will be recorded here." icon={<ClipboardList />} />}</section>}</>;
}
