import { PhotoDutyRecords } from '../components/attendance/PhotoDutyRecords';
import { HistoricalAttendanceRecords } from '../components/attendance/HistoricalAttendanceRecords';
import { useLanguage } from '../locales/runtime';
import { ManagementDutyCalendar } from '../components/attendance/ManagementDutyCalendar';
import { PageHeader } from '../components/ui';
export function ManagementAttendancePage() { const gu = useLanguage() === 'gu'; return <><PageHeader eyebrow="ATTENDANCE" title={gu ? 'હાજરી અને ફોટો' : 'Attendance & photos'} description={gu ? 'માસિક કેલેન્ડર, ગાર્ડની હાજરી અને દરેક ફોટોની વિગત.' : 'Explore the monthly calendar, guard attendance and individual photo records.'}/><ManagementDutyCalendar/><details className="panel management-history-panel" open><summary>{gu ? 'બધા ગાર્ડના ફોટો રેકોર્ડ' : 'All guard photo records'}</summary><PhotoDutyRecords management/></details><details className="panel management-history-panel"><summary>{gu ? 'અગાઉના હાજરી રેકોર્ડ' : 'Previous attendance records'}</summary><HistoricalAttendanceRecords/></details></>; }
