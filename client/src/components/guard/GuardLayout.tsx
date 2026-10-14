import { t } from '../../locales/runtime';
import { useThemePreference } from '../../lib/theme';
import { Bell, FileText, Home, Languages, LogOut, Moon, Sun, WalletCards } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getData } from '../../lib/api';
import { UserAvatar } from '../../components/ui';
import type { SessionUser } from '../../../../shared/types';
import { guardCopy } from '../../locales/guard';
import { setLanguage, useLanguage } from '../../locales/runtime';
import type { GuardNotification } from '../../pages/guard/types';


export function GuardLayout({ user, onLogout, children }: {
    user: SessionUser;
    onLogout: () => void;
    children: React.ReactNode;
}) {
    const [dark, setDark] = useThemePreference('dg-guard-dark');
    const location = useLocation();
    const language = useLanguage();
    const copy = guardCopy[language];
    const { data } = useQuery({ queryKey: ['guard-notifications', user.guardId], queryFn: () => getData<{
            notifications: GuardNotification[]; unreadCount: number;
        }>('/notifications'), refetchInterval: 30000, enabled: Boolean(user.guardId) });
    const unread = data?.unreadCount ?? 0;
    const profilePath = `/profile/${user.id}`;
    const isProfile = location.pathname === profilePath || location.pathname === '/guard/profile';
    const photoUrl = user.profilePhotoUrl || (user.guardId ? `/api/guards/${user.guardId}/photo` : undefined);
    const nav = [{ to: '/guard', label: copy.home, icon: Home }, { to: '/guard/attendance', label: copy.attendance, icon: FileText }, { to: '/guard/salary', label: copy.salary, icon: WalletCards }, { to: '/guard/documents', label: copy.documents, icon: FileText }];
    return <main className="guard-app">
        <header className="guard-app-header">
            <div className="guard-brand"><span className="brand-mark">DG</span><span>DG ENERGY</span></div>
            <div className="guard-header-actions">
                <button type="button" className="guard-language-switch" lang={language === 'en' ? 'gu' : 'en'} aria-label={language === 'en' ? 'Switch to Gujarati' : 'અંગ્રેજીમાં બદલો'} title={language === 'en' ? 'Switch to Gujarati' : 'અંગ્રેજીમાં બદલો'} onClick={() => setLanguage(language === 'en' ? 'gu' : 'en')}>
                    <Languages size={15} aria-hidden="true"/><span>{language === 'en' ? 'ગુજ' : 'Eng'}</span>
                </button>
            </div>
        </header>
        <section className="guard-app-content">
            {isProfile && <section className="panel guard-profile-actions" aria-label={language === 'gu' ? 'પ્રોફાઇલ સેટિંગ્સ' : 'Profile settings'}>
                <h2>{language === 'gu' ? 'સેટિંગ્સ' : 'Settings'}</h2>
                <div>
                    <button type="button" className="button secondary" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={20}/> : <Moon size={20}/>}<span>{language === 'gu' ? (dark ? 'લાઇટ થીમ' : 'ડાર્ક થીમ') : (dark ? 'Light theme' : 'Dark theme')}</span></button>
                    <NavLink to="/guard/notifications" className="button secondary"><Bell size={20}/><span>{copy.notifications}{unread > 0 && ` (${unread > 9 ? '9+' : unread})`}</span></NavLink>
                    <button type="button" className="button secondary" onClick={onLogout}><LogOut size={20}/><span>{copy.logout}</span></button>
                </div>
            </section>}
            {children}
        </section>
        <nav className="guard-bottom-nav" aria-label={t("Guard navigation")}>
            {nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/guard'} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={20}/><span>{label}</span></NavLink>)}
            <NavLink to={profilePath} className={isProfile ? 'active guard-bottom-profile' : 'guard-bottom-profile'} aria-current={isProfile ? 'page' : undefined}>
                <UserAvatar name={user.name} src={photoUrl} fallbackSrc="/profile-fallback.svg" className="guard-bottom-avatar"/><span>{copy.profile}</span>
            </NavLink>
        </nav>
        {location.pathname === '/guard' && <div className="guard-footer">DG Energy</div>}
    </main>;
}
