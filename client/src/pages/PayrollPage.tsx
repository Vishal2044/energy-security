import { useState } from 'react';
import { ManagementDutyCalendar, type DutyCalendarSelection } from '../components/attendance/ManagementDutyCalendar';
import type { PhotoSalary } from '../../../shared/photoDuty';
import { useLanguage } from '../locales/runtime';
import { PhotoPayroll } from '../components/PhotoPayroll';
import { PaginationControls } from '../components/ui';
import { usePageQuery } from '../lib/pagination';
import { t } from '../locales/runtime';
import { CircleDollarSign } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getData } from '../lib/api';
import { EmptyState, PageHeader, LoadingState, StatusBadge, UserIdentity } from '../components/ui';
type PayrollRow = {
    id: string;
    guardId?: string;
    guard?: string;
    month: number;
    year: number;
    attendanceDays: number;
    finalSalary: number;
    netPayable?: number;
    workflowStatus?: string;
    status: string;
};
function LegacyPayrollPage() {
    const client = useQueryClient();
    const pageQuery = usePageQuery<{
        salaries: PayrollRow[];
    }>(['payroll'], '/payroll', {});
    const { data, isLoading, isError, refetch } = pageQuery;
    const transition = useMutation({
        mutationFn: ({ id, action }: {
            id: string;
            action: 'approve' | 'lock' | 'pay';
        }) => api.patch(`/payroll/${id}/${action}`, action === 'pay' ? { paymentReference: window.prompt('Payment reference') ?? '' } : {}),
        onSuccess: () => client.invalidateQueries({ queryKey: ['payroll'] }),
    });
    if (isError)
        return <div className="error-callout">{t("Payroll could not be loaded. ")}<button onClick={() => void refetch()}>{t("Retry")}</button></div>;
    const actionFor = (row: PayrollRow) => row.workflowStatus === 'REVIEW' ? 'approve' : row.workflowStatus === 'APPROVED' ? 'lock' : row.workflowStatus === 'LOCKED' ? 'pay' : undefined;
    return <>
    <PageHeader eyebrow="PAYROLL WORKFLOW" title={t("Payroll")} description={t("Review, approve, lock and record external payments without altering historical paid records.")}/>
    {transition.isError && <div className="error-callout" role="alert">{t("Payroll action could not be completed. Please retry.")}</div>}
    <div className="salary-banner"><div><span className="eyebrow">{t("VISIBLE PAYROLL RECORDS")}</span><strong>₹{(data?.salaries.reduce((sum, item) => sum + Number(item.netPayable ?? item.finalSalary ?? 0), 0) ?? 0).toLocaleString('en-IN')}</strong><p>{t("All values come from approved attendance and explicit company inputs.")}</p></div><CircleDollarSign size={42}/></div>
    {isLoading ? <LoadingState /> : <section className="panel table-panel"><table><thead><tr><th scope="col">#</th><th>{t("Guard")}</th><th>{t("Period")}</th><th>{t("Payable days")}</th><th>{t("Net payable")}</th><th>{t("Workflow")}</th><th /></tr></thead><tbody>{data?.salaries.map((item, index) => { const action = actionFor(item); return <tr key={item.id}><td className="list-index">{pageQuery.startIndex + index + 1}</td><td>{item.guardId ? <UserIdentity id={item.guardId} name={item.guard ?? 'Unknown guard'} photoUrl={`/api/guards/${item.guardId}/photo`}/> : item.guard}</td><td>{item.month}/{item.year}</td><td>{item.attendanceDays}</td><td><strong>₹{Number(item.netPayable ?? item.finalSalary).toLocaleString('en-IN')}</strong></td><td><StatusBadge value={item.workflowStatus ?? item.status}/></td><td>{action && <button className="button small primary" disabled={transition.isPending} onClick={() => transition.mutate({ id: item.id, action })}>{action === 'pay' ? 'Record payment' : action}</button>}{(item.workflowStatus === 'PAID' || item.workflowStatus === 'RECONCILED' || item.status === 'PAID') && <a className="link-button" href={`/api/payroll/${item.id}/payslip`} target="_blank" rel="noreferrer">{t("Payslip")}</a>}</td></tr>; })}</tbody></table><PaginationControls pagination={pageQuery.pagination} page={pageQuery.page} onPageChange={pageQuery.setPage} busy={pageQuery.isFetching} />{!data?.salaries.length && <EmptyState title={t("No salary records")} description={t("Salary records will appear here when available.")}/>}</section>}
  </>;
}

export function PayrollPage({ canCredit = true }: { canCredit?: boolean }) {
    const gu = useLanguage() === 'gu';
    const [selection, setSelection] = useState<DutyCalendarSelection>();
    function showSalary(salary: PhotoSalary) {
        setSelection({ guardId: salary.guardId, guardName: salary.guard, period: `${salary.year}-${String(salary.month).padStart(2, '0')}` });
        window.requestAnimationFrame(() => document.querySelector('.management-calendar-section')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
    }
    return <><PhotoPayroll management canCredit={canCredit} onSalarySelect={showSalary}/><ManagementDutyCalendar key={selection ? `${selection.guardId}-${selection.period}` : 'choose'} earnings initialSelection={selection}/>{canCredit && <details className="panel management-history-panel"><summary>{gu ? 'અગાઉના પગાર રેકોર્ડ' : 'Previous salary records'}</summary><LegacyPayrollPage/></details>}</>;
}
