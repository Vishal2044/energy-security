import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Activity as ActivityIcon, Circle as NeutralIcon, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Eye, EyeOff, FileText, Loader2, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Pagination } from '../../../shared/pagination';
import { t, translateText, translateValue, useLanguage } from '../locales/runtime';

export function statusTone(value: string) {
  const normalized = value.toUpperCase();
  if (['VERIFIED', 'PAID', 'RESOLVED', 'APPROVED', 'COMPLETED', 'RECONCILED'].includes(normalized)) return 'positive';
  if (['REJECTED', 'FAILED', 'CRITICAL', 'EMERGENCY', 'MISSED'].includes(normalized)) return 'danger';
  if (['PENDING', 'REVIEW', 'MANUAL_REVIEW', 'ACKNOWLEDGED', 'DRAFT', 'OPEN', 'HIGH', 'PENDING_SYNC'].includes(normalized)) return 'warning';
  if (['ACTIVE', 'SENT', 'OPENED', 'SUBMITTED', 'INFORMATION'].includes(normalized)) return 'info';
  return 'muted';
}
export function StatusBadge({ value }: { value: string }) {
  const language = useLanguage(); const tone = statusTone(value);
  const Icon = tone === 'positive' ? CheckCircle2 : tone === 'warning' || tone === 'danger' ? CircleAlert : tone === 'info' ? ActivityIcon : NeutralIcon;
  return <span className={`badge ${tone}`}><Icon size={14} aria-hidden="true" />{translateValue(value, language)}</span>;
}
export function StatCard({ label, value, icon, tone = 'blue', detail }: { label: string; value: string | number; icon: ReactNode; tone?: string; detail?: string }) { const language = useLanguage(); const reducedMotion = useReducedMotion(); return <motion.div className={`stat-card tone-${tone}`} whileHover={reducedMotion ? undefined : { y: -2 }}><div className="stat-icon">{icon}</div><div><p>{translateText(label, language)}</p><strong>{value}</strong>{detail && <small>{translateText(detail, language)}</small>}</div></motion.div>; }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { const language = useLanguage(); return <div className="page-header"><div><span className="eyebrow">{translateText(eyebrow ?? 'DG ENERGY', language)}</span><h1>{translateText(title, language)}</h1>{description && <p>{translateText(description, language)}</p>}</div>{action}</div>; }
export function EmptyState({ title, description, icon = <FileText size={22} /> }: { title: string; description?: string; icon?: ReactNode }) { const language = useLanguage(); return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{translateText(title, language)}</h3>{description && <p>{translateText(description, language)}</p>}</div>; }
export function LoadingState() { const language = useLanguage(); return <div className="loading-state" role="status" aria-live="polite"><Loader2 className="spin" size={22} aria-hidden="true" /> {language === 'gu' ? 'માહિતી લાવવામાં આવી રહી છે…' : 'Loading…'}</div>; }
export function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const language = useLanguage();
  return <div className="error-callout" role="alert"><CircleAlert size={20} aria-hidden="true" /><span>{message ? translateText(message, language) : language === 'gu' ? 'માહિતી લાવી શકાઈ નથી. ફરી પ્રયાસ કરો.' : 'Information could not be loaded. Please try again.'}</span><button type="button" onClick={onRetry}>{language === 'gu' ? 'ફરી પ્રયાસ' : 'Retry'}</button></div>;
}
export function PaginationControls({ pagination, page, onPageChange, busy = false }: { pagination?: Pagination; page: number; onPageChange: (page: number) => void; busy?: boolean }) {
  const language = useLanguage(); const gu = language === 'gu';
  if (!pagination || pagination.total <= pagination.pageSize || pagination.totalPages <= 1) return null;
  const first = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const last = Math.min(pagination.page * pagination.pageSize, pagination.total);
  const windowStart = Math.max(1, Math.min(page - 1, pagination.totalPages - 2));
  const windowEnd = Math.min(pagination.totalPages, windowStart + 2);
  const pages = Array.from(new Set([1, ...Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index), pagination.totalPages])).sort((a, b) => a - b);
  return <nav className={`pagination-controls${busy ? ' is-busy' : ''}`} aria-label={gu ? 'યાદીના પાનાં' : 'List pagination'} aria-busy={busy}>
    <div className="pagination-track">
      <button type="button" className="pagination-button pagination-arrow" aria-label={gu ? 'પાછલું પાનું' : 'Previous page'} disabled={busy || page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={18} aria-hidden="true" /><span>{gu ? 'પાછલું' : 'Previous'}</span></button>
      <div className="pagination-pages">
        {pages.map((number, index) => <span className="pagination-item" key={number}>
          {index > 0 && number - pages[index - 1]! > 1 && <span className="pagination-ellipsis" aria-hidden="true">…</span>}
          <button type="button" className={`pagination-button pagination-number${number === page ? ' is-current' : ''}${number < windowStart || number > windowEnd ? ' pagination-boundary' : ''}`} aria-label={gu ? `પાનું ${number}` : `Page ${number}`} aria-current={number === page ? 'page' : undefined} disabled={busy} onClick={() => { if (number !== page) onPageChange(number); }}>{number}</button>
        </span>)}
      </div>
      <button type="button" className="pagination-button pagination-arrow" aria-label={gu ? 'આગલું પાનું' : 'Next page'} disabled={busy || page >= pagination.totalPages} onClick={() => onPageChange(page + 1)}><span>{gu ? 'આગલું' : 'Next'}</span><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
    <div className="pagination-meta">
      <span className="pagination-count"><strong>{first}–{last}</strong> / {pagination.total} {gu ? 'રેકોર્ડ' : 'entries'}</span>
      <span className="pagination-meta-divider" aria-hidden="true" />
      <span className="pagination-status" role="status" aria-live="polite" aria-atomic="true">{busy ? <><Loader2 size={14} className="spin" aria-hidden="true" />{gu ? 'લાવવામાં આવી રહ્યું છે…' : 'Updating…'}</> : <>{gu ? 'પાનું' : 'Page'} {pagination.page} / {pagination.totalPages}</>}</span>
    </div>
  </nav>;
}
export function PageLoader() { const language = useLanguage(); return <main className="app-loader" role="status" aria-live="polite" aria-label={language === 'gu' ? 'DG Energy લોડ થઈ રહ્યું છે' : 'Loading DG Energy'}><div className="app-loader-orb"><span className="app-loader-mark">E</span></div><div className="app-loader-copy"><strong>DG ENERGY</strong><span>{language === 'gu' ? 'તમારું કાર્યસ્થળ તૈયાર થઈ રહ્યું છે' : 'Preparing your workspace'}</span><i aria-hidden="true"><b /><b /><b /></i></div></main>; }
export function Toast({ message, onClose, type = 'success' }: { message: string; onClose: () => void; type?: 'success' | 'error' }) { const language = useLanguage(); const reducedMotion = useReducedMotion(); return <motion.div transition={{ duration: reducedMotion ? 0 : .18 }} initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`toast ${type}`} role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'}><span>{type === 'success' ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}</span>{translateText(message, language)}<button type="button" onClick={onClose} aria-label={language === 'gu' ? 'બંધ કરો' : 'Close'}><X size={15} /></button></motion.div>; }
export function SearchBox({ value, onChange, placeholder = 'Search records…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) { const language = useLanguage(); return <label className="search-box"><Search size={17} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={translateText(placeholder, language)} /></label>; }
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'; }
export function UserAvatar({ name, src, fallbackSrc, className = '' }: { name: string; src?: string; fallbackSrc?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  useEffect(() => setFallbackFailed(false), [fallbackSrc]);
  return <span className={`avatar user-avatar ${className}`}>{src && !failed ? <img src={src} alt={`${name} profile`} onError={() => setFailed(true)} /> : fallbackSrc && !fallbackFailed ? <img src={fallbackSrc} alt={`${name} profile`} onError={() => setFallbackFailed(true)} /> : <span className="avatar-fallback">{initials(name)}</span>}</span>;
}
export function PreviewImage({ src, alt }: { src: string; alt: string }) {
  const language = useLanguage();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setFailed(false); }, [src]);
  if (failed) return <ErrorState message={language === 'gu' ? 'ફોટો ખોલી શકાયો નથી.' : 'Image could not be loaded.'} onRetry={() => { setFailed(false); setAttempt((value) => value + 1); }} />;
  return <img key={`${src}-${attempt}`} src={src} alt={alt} onError={() => setFailed(true)} />;
}
export function UserIdentity({ id, name, photoUrl, meta, className = '' }: { id: string; name: string; photoUrl?: string; meta?: ReactNode; className?: string }) {
  return <Link to={`/profile/${id}`} className={`user-identity ${className}`} aria-label={`Open ${name} profile`}><UserAvatar name={name} src={photoUrl} /><span className="user-identity-copy"><strong>{name}</strong>{meta && <span>{meta}</span>}</span></Link>;
}
export function PasswordInput({ value, onChange, placeholder, autoComplete, required = false, minLength }: { value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; placeholder?: string; autoComplete?: string; required?: boolean; minLength?: number }) {
  const language = useLanguage();
  const [visible, setVisible] = useState(false);
  return <span className="password-field"><input type={visible ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} required={required} minLength={minLength} /><button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={t(visible ? 'Hide password' : 'Show password')}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>;
}
export type DropdownOption = { value: string; label: string; description?: string; disabled?: boolean };
export function Dropdown({ value, onChange, options, placeholder = 'Select an option', disabled = false, required = false }: { value: string; onChange: (value: string) => void; options: DropdownOption[]; placeholder?: string; disabled?: boolean; required?: boolean }) {
  const language = useLanguage(); const id = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  useEffect(() => { if (open) rootRef.current?.querySelector<HTMLButtonElement>('[data-option-index="' + activeIndex + '"]')?.focus(); }, [open, activeIndex]);
  function show() { setActiveIndex(enabled.includes(options.findIndex((option) => option.value === value)) ? options.findIndex((option) => option.value === value) : enabled[0] ?? 0); setOpen(true); }
  return <div className={'dropdown-field ' + (open ? 'open' : '')} ref={rootRef} onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') setOpen(false);
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); if (!open) { show(); return; }
      const current = enabled.indexOf(activeIndex);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
      if (enabled[next] !== undefined) setActiveIndex(enabled[next]);
    } else if (open && event.key.length === 1 && event.key !== ' ') {
      const match = enabled.find((index) => (translateText(options[index]?.label ?? '', language) ?? '').toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (match !== undefined) setActiveIndex(match);
    }
  }}>
    {required && <input className="dropdown-validation" value={value} onChange={() => undefined} required aria-label={translateText(placeholder, language)} tabIndex={-1} onInvalid={(event) => { event.preventDefault(); triggerRef.current?.focus(); }} />}
    <button ref={triggerRef} type="button" className="dropdown-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={() => open ? close() : show()}><span className={selected ? '' : 'placeholder'}>{translateText(selected?.label ?? placeholder, language)}</span><ChevronDown size={18} aria-hidden="true" /></button>
    {open && <div id={id} className="dropdown-menu" role="listbox" aria-label={translateText(placeholder, language)}>{options.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} tabIndex={index === activeIndex ? 0 : -1} data-option-index={index} className={'dropdown-option ' + (option.value === value ? 'selected' : '')} disabled={option.disabled} key={option.value} onClick={() => { onChange(option.value); close(); }}><span><strong>{translateText(option.label, language)}</strong>{option.description && <small>{translateText(option.description, language)}</small>}</span>{option.value === value && <Check size={17} aria-hidden="true" />}</button>)}</div>}
  </div>;
}

/** Shared preview shell: focus containment, Escape, backdrop close and focus restoration. */
export function Dialog({ children, onClose, label, className, backdropClassName = 'image-dialog-backdrop' }: { children: ReactNode; onClose: () => void; label: string; className: string; backdropClassName?: string }) {
  const language = useLanguage();
  const accessibleLabel = label.startsWith('Preview ') ? t('Preview') + ' ' + label.slice(8) : translateText(label, language);
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const element = ref.current;
    const selector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),iframe,[tabindex]:not([tabindex="-1"])';
    const focusable = () => Array.from(element?.querySelectorAll<HTMLElement>(selector) ?? []).filter((item) => item.getClientRects().length > 0);
    const siblings = Array.from(document.body.children).filter((item): item is HTMLElement => item instanceof HTMLElement && !item.contains(element));
    const priorInert = siblings.map((item) => item.inert);
    siblings.forEach((item) => { item.inert = true; });
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    (focusable()[0] ?? element)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable(); const first = items[0]; const last = items[items.length - 1];
      if (!first) { event.preventDefault(); element?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; siblings.forEach((item, index) => { item.inert = priorInert[index]; }); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className={backdropClassName} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className={className} role="dialog" aria-modal="true" aria-label={accessibleLabel} tabIndex={-1}>{children}</section></div>, document.body);
}
