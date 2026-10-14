import { GuardDutyOverview } from '../../components/guard/GuardDutyOverview';
import { HistoricalAttendanceRecords } from '../../components/attendance/HistoricalAttendanceRecords';
import { useLanguage } from '../../locales/runtime';
export function GuardAttendancePage() { const gu = useLanguage() === 'gu'; return <><GuardDutyOverview/><details className="panel guard-history-panel"><summary>{gu ? 'અગાઉના હાજરી રેકોર્ડ' : 'Previous attendance records'}</summary><HistoricalAttendanceRecords/></details></>; }
