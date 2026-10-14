import { FileText, FolderOpen } from 'lucide-react';
import { GuardPageHeading } from '../../components/guard/GuardPageHeading';
import { useQuery } from '@tanstack/react-query';
import { getData } from '../../lib/api';
import { ErrorState, LoadingState } from '../../components/ui';
import { useLanguage, translateValue } from '../../locales/runtime';
import type { DocumentStatus } from './types';
export function GuardDocumentsPage({ guardId }: { guardId?: string }) {
  const language = useLanguage(); const gu = language === 'gu';
  const query = useQuery({ queryKey: ['guard-documents', guardId], queryFn: () => getData<{ documents: DocumentStatus[] }>(`/guards/${guardId}/documents`), enabled: Boolean(guardId) });
  if (query.isLoading) return <LoadingState/>;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()}/>;
  return <div className="guard-list-page"><GuardPageHeading icon={<FolderOpen />} title={gu ? 'મારા દસ્તાવેજો' : 'My documents'} description={gu ? 'તમારા દસ્તાવેજો એક જ જગ્યાએ.' : 'Your documents, all in one place.'} /><p className="guard-note">{gu ? 'દસ્તાવેજો એડમિન અથવા સુપરવાઇઝર ઉમેરે છે. ફેરફાર માટે તેમનો સંપર્ક કરો.' : 'Documents are added by your admin or supervisor. Contact them for changes.'}</p>{query.data?.documents.map((doc) => <article className="guard-document-card" key={doc.id}><span className="guard-record-icon" aria-hidden="true"><FileText size={20}/></span><div><strong>{translateValue(doc.type, language)}</strong><span>{doc.originalName}</span></div>{doc.id && <a className="button secondary" href={`/api/documents/${doc.id}/preview`} target="_blank" rel="noreferrer">{gu ? 'જુઓ' : 'View'}</a>}</article>)}{!query.data?.documents.length && <div className="guard-empty">{gu ? 'હજી દસ્તાવેજો ઉમેરાયા નથી.' : 'No documents added yet.'}</div>}</div>;
}
