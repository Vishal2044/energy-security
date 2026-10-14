import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Send, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useLanguage } from '../../locales/runtime';

export function LiveCameraCapture({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const gu = useLanguage() === 'gu';
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream>();
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState('');
  const [token, setToken] = useState('');
  const [recordId, setRecordId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sending = useRef(false);
  const active = useRef(true);
  const controller = useRef<AbortController>();
  useEffect(() => { active.current = true; controller.current = new AbortController(); return () => { active.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    let active = true;
    setReady(false); setError('');
    const stop = () => { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = undefined; };
    async function open() {
      if (!video.current) return;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(gu ? 'કેમેરા માટે સુરક્ષિત HTTPS કનેક્શન જરૂરી છે.' : 'Camera requires HTTPS or localhost.'); return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (!active) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; await video.current.play(); }
      } catch { if (active) setError(gu ? 'કેમેરાની પરવાનગી આપો અને ફરી પ્રયાસ કરો.' : 'Allow camera access and retry.'); }
    }
    void open();
    return () => { active = false; stop(); };
  }, [attempt, gu]);
  async function capture() {
    if (!video.current || !ready || sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const response = await api.post('/photo-duty/capture-session', {}, { signal: controller.current?.signal });
      const session = response.data.data as { captureToken: string; expiresAt: string };
      const frame = video.current;
      if (!frame || frame.readyState < 2 || !stream.current?.active) throw new Error('CAMERA_NOT_READY');
      const scale = Math.min(1, 1280 / Math.max(frame.videoWidth, frame.videoHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(frame.videoWidth * scale); canvas.height = Math.round(frame.videoHeight * scale);
      const context = canvas.getContext('2d'); if (!context) throw new Error('CAMERA_NOT_READY');
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      setPhoto(canvas.toDataURL('image/jpeg', 0.85)); setToken(session.captureToken); setRecordId(crypto.randomUUID());
      stream.current?.getTracks().forEach((track) => track.stop()); stream.current = undefined;
    } catch { setError(gu ? 'ફોટો લઈ શકાયો નથી. હાજરીનો સમય અને કેમેરા તપાસો.' : 'Could not capture. Check the attendance window and camera.'); }
    finally { sending.current = false; setBusy(false); }
  }
  async function send() {
    if (!photo || sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try { await api.post('/photo-duty/capture', { photo, captureToken: token, clientRecordId: recordId }, { signal: controller.current?.signal }); if (active.current) onDone(); }
    catch { setError(gu ? 'ફોટો મોકલાયો નથી. સમયની અંદર ફરી પ્રયાસ કરો અથવા નવો ફોટો લો.' : 'Photo could not be sent. Retry within the window or take a new photo.'); }
    finally { sending.current = false; setBusy(false); }
  }
  function retake() { setPhoto(''); setToken(''); setReady(false); setAttempt((value) => value + 1); }
  return <section className="guard-capture-screen"><div className="guard-capture-top"><div><h1>{gu ? 'લાઇવ હાજરી ફોટો' : 'Live attendance photo'}</h1><p>{gu ? 'કેમેરાથી ફોટો લો અને સમયની અંદર મોકલો.' : 'Take a photo with your camera and send it within the slot window.'}</p></div><button className="guard-icon-button" onClick={onCancel} disabled={busy} aria-label={gu ? 'બંધ કરો' : 'Close'}><X /></button></div><div className="camera-card">{photo ? <img className="capture-preview" src={photo} alt={gu ? 'લાઇવ ફોટો' : 'Live photo preview'} /> : <video ref={video} autoPlay playsInline muted className="capture-preview" onLoadedData={() => setReady(true)} />}{error && <div className="guard-error" role="alert">{error}</div>}<div className="camera-actions">{photo ? <><button className="button secondary" disabled={busy} onClick={retake}><RotateCcw size={18}/>{gu ? 'ફરી ફોટો લો' : 'Retake'}</button><button className="button primary" disabled={busy} onClick={() => void send()}><Send size={18}/>{gu ? 'મોકલો' : 'Send photo'}</button></> : <><button className="button secondary" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>{gu ? 'કેમેરા ફરી ખોલો' : 'Retry camera'}</button><button className="button primary" disabled={!ready || busy} onClick={() => void capture()}><Camera size={18}/>{busy ? (gu ? 'રાહ જુઓ…' : 'Please wait…') : (gu ? 'ફોટો લો' : 'Capture photo')}</button></>}</div><p className="guard-note">{gu ? 'ગેલેરીમાંથી અપલોડ ઉપલબ્ધ નથી. ફોટો સમયની અંદર સર્વર સુધી પહોંચવો જરૂરી છે.' : 'Gallery uploads are unavailable. The photo must reach the server before the window closes.'}</p></div></section>;
}
