import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { indiaBusinessDate } from '../../../shared/time';
import { useLanguage } from '../locales/runtime';
import { Dialog } from './ui';

export type CalendarDayContent = { detail?: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'brand' | 'muted'; disabled?: boolean; description?: string };
type CalendarProps = {
  period: string;
  onPeriodChange: (period: string) => void;
  selectedDate?: string;
  onDateSelect?: (date: string) => void;
  getDayContent?: (date: string) => CalendarDayContent;
  minPeriod?: string;
  maxPeriod?: string;
  selectionMode?: 'date' | 'month';
  footer?: ReactNode;
  busy?: boolean;
};

export function calendarDates(period: string) {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return { offset: new Date(Date.UTC(year, month - 1, 1)).getUTCDay(), dates: Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, index) => `${period}-${String(index + 1).padStart(2, '0')}`) };
}

export function PlatformCalendar({ period, onPeriodChange, selectedDate, onDateSelect, getDayContent, minPeriod = '2020-01', maxPeriod = '2100-12', selectionMode = 'date', footer, busy = false }: CalendarProps) {
  const gu = useLanguage() === 'gu';
  const locale = gu ? 'gu-IN' : 'en-IN';
  const today = indiaBusinessDate(new Date());
  const [view, setView] = useState<'dates' | 'months' | 'years'>(selectionMode === 'month' ? 'months' : 'dates');
  const root = useRef<HTMLElement>(null);
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current !== view) {
      const target = view === 'dates'
        ? root.current?.querySelector<HTMLButtonElement>('.platform-calendar-selectors button')
        : root.current?.querySelector<HTMLButtonElement>('.platform-calendar-choice-grid button.selected:not(:disabled)') ?? root.current?.querySelector<HTMLButtonElement>('.platform-calendar-choice-grid button:not(:disabled)');
      target?.focus();
      previousView.current = view;
    }
  }, [view]);
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const [yearPage, setYearPage] = useState(Math.floor(year / 12) * 12);
  const [browsingYear, setBrowsingYear] = useState(year);
  useEffect(() => {
    const nextYear = Number(period.slice(0, 4));
    setBrowsingYear(nextYear);
    setYearPage(Math.floor(nextYear / 12) * 12);
    setView(selectionMode === 'month' ? 'months' : 'dates');
  }, [period, selectionMode]);
  const pickerYear = view === 'months' ? browsingYear : year;
  const headingId = useId();
  const monthName = (index: number, short = false) => new Date(Date.UTC(2026, index, 1)).toLocaleDateString(locale, { month: short ? 'short' : 'long', timeZone: 'UTC' });
  const inRange = (value: string) => value >= minPeriod && value <= maxPeriod;
  const choosePeriod = (value: string) => { if (inRange(value)) { onPeriodChange(value); setBrowsingYear(Number(value.slice(0, 4))); setView(selectionMode === 'month' ? 'months' : 'dates'); } };
  const previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  const minYear = Number(minPeriod.slice(0, 4));
  const maxYear = Number(maxPeriod.slice(0, 4));
  const canBack = view === 'years' ? yearPage > minYear : view === 'months' ? pickerYear > minYear : inRange(previous);
  const canNext = view === 'years' ? yearPage + 11 < maxYear : view === 'months' ? pickerYear < maxYear : inRange(next);
  const navigate = (direction: number) => {
    if (view === 'years') setYearPage((value) => value + direction * 12);
    else if (view === 'months') setBrowsingYear((value) => value + direction);
    else choosePeriod(direction < 0 ? previous : next);
  };
  const { offset, dates } = calendarDates(period);
  return <section ref={root} className="platform-calendar" aria-labelledby={headingId} aria-busy={busy}>
    <header className="platform-calendar-header"><div><span className="platform-calendar-eyebrow" id={headingId}><CalendarDays size={14} aria-hidden="true"/>{gu ? 'કેલેન્ડર' : 'CALENDAR'}</span><div className="platform-calendar-selectors"><button type="button" className={view === 'months' ? 'active' : ''} aria-label={gu ? 'મહિનો પસંદ કરો' : 'Choose month'} aria-expanded={view === 'months'} onClick={() => { setBrowsingYear(year); setView(view === 'months' && selectionMode === 'date' ? 'dates' : 'months'); }}>{monthName(month - 1)}<ChevronDown size={14}/></button><button type="button" className={view === 'years' ? 'active' : ''} aria-label={gu ? 'વર્ષ પસંદ કરો' : 'Choose year'} aria-expanded={view === 'years'} onClick={() => { setYearPage(Math.floor(pickerYear / 12) * 12); setView(view === 'years' ? 'months' : 'years'); }}>{view === 'years' ? `${yearPage}–${yearPage + 11}` : pickerYear}<ChevronDown size={14}/></button></div></div><div className="platform-calendar-navigation"><button type="button" disabled={!canBack} aria-label={gu ? 'પાછલું' : 'Previous'} onClick={() => navigate(-1)}><ChevronLeft size={18}/></button><button type="button" disabled={!canNext} aria-label={gu ? 'આગલું' : 'Next'} onClick={() => navigate(1)}><ChevronRight size={18}/></button></div></header>
    {view === 'years' ? <div className="platform-calendar-choice-grid" aria-label={gu ? 'વર્ષ' : 'Years'}>{Array.from({ length: 12 }, (_, index) => yearPage + index).map((value) => <button type="button" disabled={value < minYear || value > maxYear} className={value === year ? 'selected' : ''} aria-pressed={value === year} key={value} onClick={() => { setBrowsingYear(value); setView('months'); }}><strong>{value}</strong>{value === year && <Check size={14} aria-hidden="true"/>}</button>)}</div> : view === 'months' ? <div className="platform-calendar-choice-grid" aria-label={gu ? 'મહિના' : 'Months'}>{Array.from({ length: 12 }, (_, index) => {
      const value = `${pickerYear}-${String(index + 1).padStart(2, '0')}`;
      return <button type="button" disabled={!inRange(value)} className={value === period ? 'selected' : ''} aria-pressed={value === period} key={value} onClick={() => choosePeriod(value)}><strong>{monthName(index, true)}</strong><small>{pickerYear}</small>{value === period && <Check size={14} aria-hidden="true"/>}</button>;
    })}</div> : <>
      <div className="platform-calendar-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index}>{new Date(Date.UTC(2026, 0, 4 + index)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })}</span>)}</div>
      <div className="platform-calendar-dates">{Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true"/>)}{dates.map((date, index) => {
        const content = getDayContent?.(date);
        const label = new Date(`${date}T12:00:00+05:30`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
        return <button type="button" key={date} className={`platform-calendar-day tone-${content?.tone ?? 'muted'}${selectedDate === date ? ' selected' : ''}${date === today ? ' today' : ''}`} disabled={content?.disabled || !onDateSelect} aria-pressed={selectedDate === date} aria-current={date === today ? 'date' : undefined} aria-label={`${label}${content?.description ? ` · ${content.description}` : ''}`} onClick={() => onDateSelect?.(date)}><strong>{(index + 1).toLocaleString(locale)}</strong>{content && <span className="platform-calendar-dot" aria-hidden="true"/>}{content?.detail !== undefined && <small>{content.detail}</small>}</button>;
      })}</div>
    </>}
    <footer className="platform-calendar-footer"><div className="platform-calendar-footer-actions"><span>{gu ? 'ભારતીય સમય' : 'India time'} · IST</span><button type="button" disabled={!inRange(today.slice(0, 7))} onClick={() => choosePeriod(today.slice(0, 7))}>{gu ? 'આ મહિનો' : 'This month'}</button></div>{footer}</footer>
  </section>;
}

export function PlatformMonthPicker({ value, onChange, label, min, max, disabled = false }: { value: string; onChange: (value: string) => void; label: string; min?: string; max?: string; disabled?: boolean }) {
  const gu = useLanguage() === 'gu';
  const [open, setOpen] = useState(false);
  const title = new Date(`${value}-01T12:00:00+05:30`).toLocaleDateString(gu ? 'gu-IN' : 'en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return <div className="platform-month-picker"><button type="button" className="platform-month-trigger" disabled={disabled} aria-label={`${label}: ${title}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><CalendarDays size={18} aria-hidden="true"/><span>{title}</span><ChevronDown size={16} aria-hidden="true"/></button>{open && <Dialog label={label} className="platform-calendar-dialog" onClose={() => setOpen(false)}><div className="platform-calendar-dialog-title"><strong>{label}</strong><button type="button" aria-label={gu ? 'બંધ કરો' : 'Close'} onClick={() => setOpen(false)}><X size={18}/></button></div><PlatformCalendar period={value} onPeriodChange={(next) => { onChange(next); setOpen(false); }} selectionMode="month" minPeriod={min} maxPeriod={max}/></Dialog>}</div>;
}
