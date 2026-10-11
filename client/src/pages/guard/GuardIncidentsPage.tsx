import { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getData } from '../../lib/api';
import { IncidentForm } from '../../components/incidents/IncidentForm';
import { translateValue, useLanguage } from '../../locales/runtime';
import type { Incident } from './types';

const incidentLabels: Record<string, [string, string]> = { THEFT: ['Theft', 'ચોરી'], LOCK_DAMAGE: ['Lock damage', 'તાળું તૂટેલું'], FENCE_DAMAGE: ['Fence damage', 'વાડને નુકસાન'], SUSPICIOUS_ACTIVITY: ['Suspicious activity', 'શંકાસ્પદ પ્રવૃત્તિ'], EQUIPMENT_DAMAGE: ['Equipment damage', 'સાધનને નુકસાન'], OTHER: ['Other issue', 'બીજી સમસ્યા'] };
export function GuardIncidentsPage() {
  const language = useLanguage(); const [form, setForm] = useState(false); const { data, isLoading } = useQuery({ queryKey: ['guard-incidents'], queryFn: () => getData<{ incidents: Incident[] }>('/incidents') }); const label = (value: string) => incidentLabels[value]?.[language === 'gu' ? 1 : 0] ?? translateValue(value, language);
  if (form) return <IncidentForm onDone={() => setForm(false)} onCancel={() => setForm(false)} />;
  return <div className="guard-list-page"><div className="guard-page-title"><div className="guard-icon-bubble danger"><AlertTriangle /></div><div><span className="eyebrow">ELECTOR</span><h1>{language === 'gu' ? 'મારી ઘટનાઓ' : 'My incidents'}</h1></div></div><button className="guard-primary-button" onClick={() => setForm(true)}><Plus size={20} /> {language === 'gu' ? 'સમસ્યાની જાણ કરો' : 'Report a problem'}</button>{isLoading && <div className="guard-loading">{language === 'gu' ? 'માહિતી લાવવામાં આવી રહી છે…' : 'Loading…'}</div>}<div className="guard-incident-list">{data?.incidents.map((item) => <article className="guard-incident-card" key={item.id}><div className="guard-incident-top"><span className="guard-incident-category"><AlertTriangle size={17} /> {label(item.category)}</span><span className={`guard-status-pill ${item.status.toLowerCase()}`}>{translateValue(item.status, language)}</span></div><strong>{new Date(item.capturedAt).toLocaleDateString(language === 'gu' ? 'gu-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</strong>{item.description && <p>{item.description}</p>}</article>)}{!isLoading && !data?.incidents.length && <div className="guard-empty">{language === 'gu' ? 'હજી કોઈ સમસ્યાની જાણ કરવામાં આવી નથી.' : 'No incidents have been reported yet.'}</div>}</div></div>;
}
