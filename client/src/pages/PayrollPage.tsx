import { CircleDollarSign } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getData } from '../lib/api';
import { PageHeader, LoadingState, StatusBadge, UserIdentity } from '../components/ui';

type PayrollRow = { id: string; guardId?: string; guard?: string; month: number; year: number; attendanceDays: number; finalSalary: number; netPayable?: number; workflowStatus?: string; status: string };

export function PayrollPage() {
  const client = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['payroll'], queryFn: () => getData<{ salaries: PayrollRow[] }>('/payroll') });
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'lock' | 'pay' }) => api.patch(`/payroll/${id}/${action}`, action === 'pay' ? { paymentReference: window.prompt('Payment reference') ?? '' } : {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ['payroll'] }),
  });
  if (isError) return <div className="error-callout">Payroll could not be loaded. <button onClick={() => void refetch()}>Retry</button></div>;
  const actionFor = (row: PayrollRow) => row.workflowStatus === 'REVIEW' ? 'approve' : row.workflowStatus === 'APPROVED' ? 'lock' : row.workflowStatus === 'LOCKED' ? 'pay' : undefined;
  return <>
    <PageHeader eyebrow="PAYROLL WORKFLOW" title="Payroll" description="Review, approve, lock and record external payments without altering historical paid records." />
    {transition.isError && <div className="error-callout" role="alert">Payroll action could not be completed. Please retry.</div>}
    <div className="salary-banner"><div><span className="eyebrow">VISIBLE PAYROLL RECORDS</span><strong>₹{(data?.salaries.reduce((sum, item) => sum + Number(item.netPayable ?? item.finalSalary ?? 0), 0) ?? 0).toLocaleString('en-IN')}</strong><p>All values come from approved attendance and explicit company inputs.</p></div><CircleDollarSign size={42} /></div>
    {isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th>Guard</th><th>Period</th><th>Payable days</th><th>Net payable</th><th>Workflow</th><th /></tr></thead><tbody>{data?.salaries.map((item) => { const action = actionFor(item); return <tr key={item.id}><td>{item.guardId ? <UserIdentity id={item.guardId} name={item.guard ?? 'Unknown guard'} photoUrl={`/api/guards/${item.guardId}/photo`} /> : item.guard}</td><td>{item.month}/{item.year}</td><td>{item.attendanceDays}</td><td><strong>₹{Number(item.netPayable ?? item.finalSalary).toLocaleString('en-IN')}</strong></td><td><StatusBadge value={item.workflowStatus ?? item.status} /></td><td>{action && <button className="button small primary" disabled={transition.isPending} onClick={() => transition.mutate({ id: item.id, action })}>{action === 'pay' ? 'Record payment' : action}</button>}{(item.workflowStatus === 'PAID' || item.workflowStatus === 'RECONCILED' || item.status === 'PAID') && <a className="link-button" href={`/api/payroll/${item.id}/payslip`} target="_blank" rel="noreferrer">Payslip</a>}</td></tr>; })}</tbody></table></section>}
  </>;
}
