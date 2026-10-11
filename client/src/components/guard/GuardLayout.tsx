import { useEffect, useState } from 'react';
import { Bell, CalendarDays, FileText, Home, LogOut, Moon, Sun, WalletCards } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getData, api, currentApiSession } from '../../lib/api';
import { UserAvatar } from '../../components/ui';
import type { SessionUser } from '../../../../shared/types';
import { guardCopy } from '../../locales/guard';
import { setLanguage, toggleLanguage, useLanguage } from '../../locales/runtime';
import type { GuardNotification } from '../../pages/guard/types';
import { subscribeForPush } from '../../lib/push';
import { drainCaptures, pendingCount } from '../../lib/offline';

export function GuardLayout({ user, onLogout, children }: { user: SessionUser; onLogout: () => void; children: React.ReactNode }) {
  const [dark, setDark] = useState(() => localStorage.getItem('dg-guard-dark') === '1');
  const [pendingUploads, setPendingUploads] = useState(0);
  const [syncFailed, setSyncFailed] = useState(false);
  const location = useLocation();
  const language = useLanguage();
  const copy = guardCopy[language];
  const { data } = useQuery({ queryKey: ['guard-notifications', user.guardId], queryFn: () => getData<{ notifications: GuardNotification[] }>('/notifications'), refetchInterval: 30000, enabled: Boolean(user.guardId) });
  const unread = data?.notifications.filter((item) => item.status !== 'READ').length ?? 0;

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('dg-guard-dark', dark ? '1' : '0'); }, [dark]);
  useEffect(() => { void subscribeForPush(); }, [user.id]);
  useEffect(() => {
    let active = true;
    const generation = currentApiSession();
    const controller = new AbortController();
    const isCurrent = () => active && generation === currentApiSession();
    const refresh = () => { void pendingCount().then((count) => { if (isCurrent()) setPendingUploads(count); }); };
    const sync = () => {
      refresh();
      if (navigator.onLine && user.guardId && isCurrent()) void drainCaptures((item) => api.post(item.endpoint, item.body, { signal: controller.signal }).then(() => undefined), user.guardId, isCurrent).then((failed) => { if (isCurrent()) setSyncFailed(failed); }).finally(refresh);
    };
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('dg-offline-retry', sync);
    return () => { active = false; controller.abort(); window.removeEventListener('online', sync); window.removeEventListener('dg-offline-retry', sync); };
  }, [user.guardId]);

  const nav = [{ to: '/guard', label: copy.home, icon: Home }, { to: '/guard/rosters', label: language === 'gu' ? 'ડ્યુટી રોસ્ટર' : 'Duty roster', icon: CalendarDays }, { to: '/guard/attendance', label: copy.attendance, icon: FileText }, { to: '/guard/salary', label: copy.salary, icon: WalletCards }, { to: '/guard/documents', label: copy.documents, icon: FileText }];
  return <main className="guard-app"><header className="guard-app-header"><div className="guard-brand"><span className="brand-mark">DG</span><span>ELECTOR</span></div><div className="guard-header-actions">{syncFailed && <span className="offline-pill" role="status">{language === 'gu' ? 'બાકી અપલોડ ફરી પ્રયાસ જરૂરી' : 'Retry pending uploads'}</span>}{pendingUploads > 0 && <button type="button" className="offline-pill" onClick={() => window.dispatchEvent(new Event('dg-offline-retry'))}>{pendingUploads} {language === 'gu' ? 'બાકી અપલોડ' : 'pending upload'} · {copy.retry}</button>}<NavLink to="/guard/notifications" className="guard-icon-button" aria-label={copy.notifications}><Bell size={21} />{unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}</NavLink><button className="guard-icon-button" onClick={() => setDark((value) => !value)} aria-label={language === 'gu' ? 'થીમ બદલો' : 'Toggle theme'}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button><button className="guard-language-toggle" onClick={() => setLanguage(toggleLanguage(language))} aria-label={language === 'gu' ? 'ભાષા બદલો' : 'Change language'}>{language === 'en' ? 'ગુજરાતી' : 'English'}</button><NavLink to={`/profile/${user.id}`} className="guard-icon-button guard-profile-link" aria-label={copy.profile}><UserAvatar name={user.name} src={user.profilePhotoUrl} className="guard-header-avatar" /></NavLink><button className="guard-icon-button" onClick={onLogout} aria-label={copy.logout}><LogOut size={20} /></button></div></header><section className="guard-app-content">{children}</section><nav className="guard-bottom-nav" aria-label="Guard navigation">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/guard'} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>{location.pathname === '/guard' && <div className="guard-footer">Elector Security</div>}</main>;
}
