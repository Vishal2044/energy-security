import { useState } from 'react';
import { usePageQuery } from '../../lib/pagination';
import { useLanguage } from '../../locales/runtime';
import { Dialog, ErrorState, LoadingState, PaginationControls, PreviewImage } from '../ui';

export function HistoricalAttendanceRecords() {
  const gu = useLanguage() === 'gu'; const [preview, setPreview] = useState('');
  const query = usePageQuery<{ attendance: { id: string; guard?: string; capturedAt: string; type: string; photo?: string }[] }>(['legacy-attendance'], '/attendance/history', { legacy: 'true' });
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()}/>;
  if (query.isLoading) return <LoadingState/>;
  return <><div className="activity-list">{query.data?.attendance.map((item) => <div key={item.id} className="activity-row"><div><strong>{item.guard}</strong><p>{new Date(item.capturedAt).toLocaleString(gu ? 'gu-IN' : 'en-IN', { timeZone: 'Asia/Kolkata' })} · {item.type}</p></div>{item.photo && <button className="button secondary" onClick={() => setPreview(item.photo!)}>{gu ? 'ફોટો જુઓ' : 'View photo'}</button>}</div>)}</div>{!query.data?.attendance.length && <p>{gu ? 'અગાઉના હાજરી રેકોર્ડ નથી.' : 'No previous attendance records.'}</p>}<PaginationControls pagination={query.pagination} page={query.page} onPageChange={query.setPage} busy={query.isFetching}/>{preview && <Dialog className="image-dialog" label={gu ? 'હાજરી ફોટો' : 'Attendance photo'} onClose={() => setPreview('')}><button className="button secondary" onClick={() => setPreview('')}>{gu ? 'બંધ કરો' : 'Close'}</button><PreviewImage src={preview} alt={gu ? 'હાજરી ફોટો' : 'Attendance photo'}/></Dialog>}</>;
}
