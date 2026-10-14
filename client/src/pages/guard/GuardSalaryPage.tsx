import { PhotoPayroll } from '../../components/PhotoPayroll';
import { useState } from 'react';
import { indiaBusinessDate } from '../../../../shared/time';
import { GuardDutyOverview } from '../../components/guard/GuardDutyOverview';
import { PaginationControls } from '../../components/ui';
import { usePageQuery } from '../../lib/pagination';
import { CheckCircle2, Clock3, WalletCards } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getData } from '../../lib/api';
import { guardCopy } from '../../locales/guard';
import { translateValue, useLanguage } from '../../locales/runtime';
import type { Salary } from './types';
function LegacyGuardSalaryPage() {
    const language = useLanguage();
    const copy = guardCopy[language];
    const pageQuery = usePageQuery<{
        salaries: Salary[];
    }>(['guard-salaries'], '/payroll', {});
    const { data, isLoading, isError } = pageQuery;
    const salaries = data?.salaries ?? [];
    const latest = salaries[0];
    const paid = (salary: Salary) => salary.status === 'PAID' || salary.workflowStatus === 'PAID' || salary.workflowStatus === 'RECONCILED';
    return <div className="guard-list-page"><div className="guard-page-title"><div className="guard-icon-bubble"><WalletCards /></div><div><span className="eyebrow">DG ENERGY</span><h1>{copy.mySalary}</h1></div></div>{isLoading && <div className="guard-loading">{copy.loading}</div>}{isError && <div className="guard-error" role="alert">{language === 'gu' ? 'માહિતી લાવી શકાઈ નથી. ફરી પ્રયાસ કરો.' : 'Information could not be loaded. Please try again.'}</div>}{latest && <div className="guard-salary-highlight"><span>{language === 'gu' ? 'હાલનો પગાર' : 'Current salary'}</span><strong>₹{(latest.netPayable ?? latest.finalSalary).toLocaleString('en-IN')}</strong><small>{latest.month}/{latest.year} · {translateValue(latest.workflowStatus ?? latest.status, language)}</small></div>}{!isLoading && !isError && !salaries.length && <div className="guard-empty">{copy.noRecords}</div>}<div className="guard-salary-list">{salaries.map((salary, index) => <article className="guard-salary-card" key={salary.id}><div><strong><span className="inline-record-index">{pageQuery.startIndex + index + 1}</span>{new Date(salary.year, salary.month - 1).toLocaleDateString(language === 'gu' ? 'gu-IN' : 'en-IN', { month: 'long', year: 'numeric' })}</strong><span>{salary.attendanceDays} {language === 'gu' ? 'દિવસ હાજરી' : 'attendance days'} · {translateValue(salary.workflowStatus ?? salary.status, language)}</span></div><div><strong>₹{(salary.netPayable ?? salary.finalSalary).toLocaleString('en-IN')}</strong><span className={paid(salary) ? 'guard-paid' : 'guard-pending'}>{paid(salary) ? <CheckCircle2 size={16}/> : <Clock3 size={16}/>}{paid(salary) ? copy.paid : copy.pending}</span>{paid(salary) && <a href={`/api/payroll/${salary.id}/payslip`} target="_blank" rel="noreferrer">{language === 'gu' ? 'પગાર પત્રક' : 'Payslip'}</a>}</div></article>)}</div><p className="guard-note">{language === 'gu' ? 'ચૂકવણી કંપનીના રેકોર્ડ મુજબનો નિર્ણય છે. એપ બેંક ટ્રાન્સફર કરતી નથી.' : 'Payment status records the company decision. The app does not transfer money.'}</p><PaginationControls pagination={pageQuery.pagination} page={pageQuery.page} onPageChange={pageQuery.setPage} busy={pageQuery.isFetching} /></div>;
}

export function GuardSalaryPage() {
    const gu = useLanguage() === 'gu';
    const [period, setPeriod] = useState(indiaBusinessDate(new Date()).slice(0, 7));
    function showMonth(value: string) {
        setPeriod(value);
        window.requestAnimationFrame(() => document.querySelector('.guard-duty-overview')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
    }
    return <><PhotoPayroll onMonthSelect={showMonth}/><GuardDutyOverview earnings period={period} onPeriodChange={setPeriod}/><details className="panel guard-history-panel"><summary>{gu ? 'અગાઉના પગાર રેકોર્ડ' : 'Previous salary records'}</summary><LegacyGuardSalaryPage/></details></>;
}
