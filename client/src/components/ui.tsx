import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCircle2, ChevronDown, CircleAlert, Eye, EyeOff, FileText, Loader2, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { translateText, translateValue, useLanguage } from '../locales/runtime';

export function StatusBadge({ value }: { value: string }) { const language = useLanguage(); const normalized = value.toUpperCase(); const positive = ['VERIFIED', 'PAID', 'ACTIVE', 'RESOLVED', 'APPROVED', 'COMPLETED', 'RECONCILED'].includes(normalized); const warning = ['PENDING', 'OPEN', 'MANUAL_REVIEW', 'ACKNOWLEDGED', 'DRAFT'].includes(normalized); return <span className={`badge ${positive ? 'positive' : warning ? 'warning' : 'muted'}`}><span className="dot" />{translateValue(value, language)}</span>; }
export function StatCard({ label, value, icon, tone = 'blue', detail }: { label: string; value: string | number; icon: ReactNode; tone?: string; detail?: string }) { const language = useLanguage(); return <motion.div className={`stat-card tone-${tone}`} whileHover={{ y: -3 }}><div className="stat-icon">{icon}</div><div><p>{translateText(label, language)}</p><strong>{value}</strong>{detail && <small>{translateText(detail, language)}</small>}</div></motion.div>; }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { const language = useLanguage(); return <div className="page-header"><div><span className="eyebrow">{eyebrow ?? 'ELECTOR SECURITY'}</span><h1>{translateText(title, language)}</h1>{description && <p>{translateText(description, language)}</p>}</div>{action}</div>; }
export function EmptyState({ title, description, icon = <FileText size={22} /> }: { title: string; description?: string; icon?: ReactNode }) { const language = useLanguage(); return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{translateText(title, language)}</h3>{description && <p>{translateText(description, language)}</p>}</div>; }
export function LoadingState() { const language = useLanguage(); return <div className="loading-state"><Loader2 className="spin" size={22} /> {language === 'gu' ? 'માહિતી લાવવામાં આવી રહી છે…' : 'Loading…'}</div>; }
export function PageLoader() { const language = useLanguage(); return <main className="app-loader" role="status" aria-live="polite" aria-label={language === 'gu' ? 'ઇલેક્ટર લોડ થઈ રહ્યું છે' : 'Loading Elector'}><div className="app-loader-orb"><span className="app-loader-mark">E</span></div><div className="app-loader-copy"><strong>ELECTOR</strong><span>{language === 'gu' ? 'તમારું કાર્યસ્થળ તૈયાર થઈ રહ્યું છે' : 'Preparing your workspace'}</span><i aria-hidden="true"><b /><b /><b /></i></div></main>; }
export function Toast({ message, onClose, type = 'success' }: { message: string; onClose: () => void; type?: 'success' | 'error' }) { return <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`toast ${type}`}><span>{type === 'success' ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}</span>{message}<button onClick={onClose} aria-label="Close"><X size={15} /></button></motion.div>; }
export function SearchBox({ value, onChange, placeholder = 'Search records…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="search-box"><Search size={17} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>; }
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'; }
export function UserAvatar({ name, src, className = '' }: { name: string; src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <span className={`avatar user-avatar ${className}`}>{src && !failed ? <img src={src} alt={`${name} profile`} onError={() => setFailed(true)} /> : <span className="avatar-fallback">{initials(name)}</span>}</span>;
}
export function UserIdentity({ id, name, photoUrl, meta, className = '' }: { id: string; name: string; photoUrl?: string; meta?: ReactNode; className?: string }) {
  return <Link to={`/profile/${id}`} className={`user-identity ${className}`} aria-label={`Open ${name} profile`}><UserAvatar name={name} src={photoUrl} /><span className="user-identity-copy"><strong>{name}</strong>{meta && <span>{meta}</span>}</span></Link>;
}
export function PasswordInput({ value, onChange, placeholder, autoComplete, required = false, minLength }: { value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; placeholder?: string; autoComplete?: string; required?: boolean; minLength?: number }) {
  const [visible, setVisible] = useState(false);
  return <span className="password-field"><input type={visible ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} required={required} minLength={minLength} /><button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>;
}
export type DropdownOption = { value: string; label: string; description?: string; disabled?: boolean };
export function Dropdown({ value, onChange, options, placeholder = 'Select an option', disabled = false, required = false }: { value: string; onChange: (value: string) => void; options: DropdownOption[]; placeholder?: string; disabled?: boolean; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeOnOutsideClick); document.removeEventListener('keydown', closeOnEscape); };
  }, [open]);
  return <div className={`dropdown-field ${open ? 'open' : ''}`} ref={rootRef}>{required && <input className="dropdown-validation" value={value} onChange={() => undefined} required aria-label={placeholder} tabIndex={-1} /> }<button type="button" className="dropdown-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'Enter') setOpen(true); }}><span className={selected ? '' : 'placeholder'}>{selected?.label ?? placeholder}</span><ChevronDown size={18} /></button>{open && <div className="dropdown-menu" role="listbox">{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={`dropdown-option ${option.value === value ? 'selected' : ''}`} disabled={option.disabled} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}><strong>{option.label}</strong>{option.value === value && <Check size={17} />}</button>)}</div>}</div>;
}
