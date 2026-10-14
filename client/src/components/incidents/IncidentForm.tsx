import { useState } from 'react';
import { AlertTriangle, Image, CheckCircle2, ChevronLeft, LockKeyhole, Eye, Wrench, CircleHelp, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../locales/runtime';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { CameraCapture } from '../CameraCapture';

const categories = [
  ['THEFT', 'ચોરી'], ['LOCK_DAMAGE', 'તાળું તૂટેલું'], ['FENCE_DAMAGE', 'વાડને નુકસાન'], ['SUSPICIOUS_ACTIVITY', 'શંકાસ્પદ વ્યક્તિ / પ્રવૃત્તિ'], ['EQUIPMENT_DAMAGE', 'સાધનને નુકસાન'], ['OTHER', 'બીજી સમસ્યા']
] as const;

export function IncidentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const language = useLanguage(); const gu = language === 'gu';
  const englishLabels: Record<string, string> = { THEFT: 'Theft', LOCK_DAMAGE: 'Lock damage', FENCE_DAMAGE: 'Fence damage', SUSPICIOUS_ACTIVITY: 'Suspicious activity', EQUIPMENT_DAMAGE: 'Equipment damage', OTHER: 'Other problem' };
  const icons: Record<string, typeof AlertTriangle> = { THEFT: ShieldAlert, LOCK_DAMAGE: LockKeyhole, FENCE_DAMAGE: AlertTriangle, SUSPICIOUS_ACTIVITY: Eye, EQUIPMENT_DAMAGE: Wrench, OTHER: CircleHelp };
  const [category, setCategory] = useState<string>(''); const [description, setDescription] = useState(''); const [photo, setPhoto] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [camera, setCamera] = useState(false); const client = useQueryClient();
  async function submit() {
    if (!category) { setError(gu ? 'સમસ્યા પસંદ કરો.' : 'Select a problem category.'); return; } setLoading(true); setError('');
    const body: Record<string, string> = { category, description, photo };
    try { await api.post('/incidents', body); client.invalidateQueries({ queryKey: ['guard-incidents'] }); onDone(); } catch { setError(gu ? 'જાણ કરી શકાઈ નથી. ફરી પ્રયાસ કરો.' : 'The incident could not be submitted. Please retry.'); } finally { setLoading(false); }
  }
  if (camera) return <div className="guard-form-page"><button className="guard-back-button" onClick={() => setCamera(false)}><ChevronLeft /> {gu ? 'પાછા' : 'Back'}</button><h1>{gu ? 'સમસ્યાનો ફોટો' : 'Incident image'}</h1><CameraCapture purpose="incident" onCapture={(value) => { setPhoto(value.photo); setCamera(false); }} onCancel={() => setCamera(false)} /></div>;
  return <div className="guard-form-page"><button className="guard-back-button" onClick={onCancel}><ChevronLeft /> {gu ? 'પાછા' : 'Back'}</button><div className="guard-page-title"><div className="guard-icon-bubble danger"><AlertTriangle /></div><div><span className="eyebrow">DG ENERGY</span><h1>{gu ? 'સમસ્યાની જાણ કરો' : 'Report an incident'}</h1></div></div><p className="guard-muted">{gu ? 'તમારી ફરજની જગ્યા આપમેળે ઉમેરાશે.' : 'Your assigned site will be included automatically.'}</p><div className="incident-category-grid">{categories.map(([value, label]) => { const Icon = icons[value] ?? AlertTriangle; return <button type="button" key={value} aria-pressed={category === value} className={category === value ? 'selected' : ''} onClick={() => setCategory(value)}><Icon size={20} aria-hidden="true" />{gu ? label : englishLabels[value]}</button>; })}</div><button className="guard-photo-button" onClick={() => setCamera(true)}><Image size={21} /><span>{gu ? (photo ? 'બીજો ફોટો પસંદ કરો' : 'ફોટો પસંદ કરો') : (photo ? 'Choose another image' : 'Choose image')}</span></button>{photo && <img className="incident-preview" src={photo} alt={gu ? 'સમસ્યાનો ફોટો' : 'Incident image'} />}<label className="guard-field"><span>{gu ? 'થોડી માહિતી (જરૂરી નથી)' : 'Details (optional)'}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={4} placeholder={gu ? 'શું થયું છે?' : 'What happened?'} /></label>{error && <div className="guard-error" role="alert">{error}</div>}<button className="guard-primary-button" disabled={loading || !category} onClick={submit}>{loading ? (gu ? 'મોકલવામાં આવી રહ્યું છે…' : 'Submitting…') : <><CheckCircle2 size={20} /> {gu ? 'જાણ કરો' : 'Submit incident'}</>}</button></div>;
}
