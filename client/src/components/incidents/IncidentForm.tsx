import { useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ChevronLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { CameraCapture } from '../CameraCapture';

const categories = [
  ['THEFT', 'ચોરી'], ['LOCK_DAMAGE', 'તાળું તૂટેલું'], ['FENCE_DAMAGE', 'વાડને નુકસાન'], ['SUSPICIOUS_ACTIVITY', 'શંકાસ્પદ વ્યક્તિ / પ્રવૃત્તિ'], ['EQUIPMENT_DAMAGE', 'સાધનને નુકસાન'], ['OTHER', 'બીજી સમસ્યા']
] as const;

export function IncidentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [category, setCategory] = useState<string>(''); const [description, setDescription] = useState(''); const [photo, setPhoto] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [camera, setCamera] = useState(false); const client = useQueryClient();
  async function submit() {
    if (!category) { setError('સમસ્યા પસંદ કરો.'); return; } setLoading(true); setError('');
    const body: Record<string, string> = { category, description, photo };
    try { await api.post('/incidents', body); client.invalidateQueries({ queryKey: ['guard-incidents'] }); onDone(); } catch (caught) { setError(caught instanceof Error ? 'જાણ કરી શકાઈ નથી. ફરી પ્રયાસ કરો.' : 'જાણ કરી શકાઈ નથી. ફરી પ્રયાસ કરો.'); } finally { setLoading(false); }
  }
  if (camera) return <div className="guard-form-page"><button className="guard-back-button" onClick={() => setCamera(false)}><ChevronLeft /> પાછા</button><h1>સમસ્યાનો ફોટો</h1><CameraCapture onCapture={(value) => { setPhoto(value.photo); setCamera(false); }} onCancel={() => setCamera(false)} /></div>;
  return <div className="guard-form-page"><button className="guard-back-button" onClick={onCancel}><ChevronLeft /> પાછા</button><div className="guard-page-title"><div className="guard-icon-bubble danger"><AlertTriangle /></div><div><span className="eyebrow">ELECTOR</span><h1>સમસ્યાની જાણ કરો</h1></div></div><p className="guard-muted">તમારી ફરજની જગ્યા આપમેળે ઉમેરાશે.</p><div className="incident-category-grid">{categories.map(([value, label]) => <button key={value} className={category === value ? 'selected' : ''} onClick={() => setCategory(value)}>{label}</button>)}</div><button className="guard-photo-button" onClick={() => setCamera(true)}><Camera size={21} /><span>{photo ? 'ફોટો ફરી લો' : 'ફોટો પાડો'}</span></button>{photo && <img className="incident-preview" src={photo} alt="સમસ્યાનો ફોટો" />}<label className="guard-field"><span>થોડી માહિતી (જરૂરી નથી)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={4} placeholder="શું થયું છે?" /></label>{error && <div className="guard-error">{error}</div>}<button className="guard-primary-button" disabled={loading || !category} onClick={submit}>{loading ? 'મોકલવામાં આવી રહ્યું છે…' : <><CheckCircle2 size={20} /> જાણ કરો</>}</button></div>;
}
