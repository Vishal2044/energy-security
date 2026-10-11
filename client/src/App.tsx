import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, Banknote, CalendarDays, ClipboardList, FileText, LayoutDashboard, LogOut, MapPinned, Menu, Moon, Search, ShieldCheck, Sun, Users, X } from 'lucide-react';
import { advanceApiSession, api, getData } from './lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { clearLegacyApiCache } from './lib/session';
import { PageLoader, PasswordInput, UserAvatar } from './components/ui';
import type { SessionUser } from '../../shared/types';
import { copy } from './locales';
import { setLanguage, toggleLanguage, translateValue, useLanguage } from './locales/runtime';
import { GuardApp } from './pages/guard/GuardApp';
import { DocumentsPage, IncidentsPage } from './pages/Management';
import { PayrollPage as SalaryPage } from './pages/PayrollPage';
import { ManagementGuardsPage } from './pages/ManagementGuards';
import { ManagementAttendancePage } from './pages/ManagementAttendance';
import { AdminAuditPage } from './pages/AdminAudit';
import { AdminDashboardPage } from './pages/AdminDashboard';
import { AdminSitesPage } from './pages/AdminSites';
import { AdminSiteFormPage } from './pages/AdminSiteForm';
import { AdminTeamPage } from './pages/AdminTeam';
import { AdminUserFormPage } from './pages/AdminUserForm';
import { AdminGuardEditPage } from './pages/AdminGuardEdit';
import { UserProfilePage } from './pages/UserProfile';
import { OperationsBoardPage } from './pages/OperationsBoard';

const loginCopy = {
  en: { eyebrow: 'SECURITY OPERATIONS', title: 'Welcome back.', description: 'Sign in to your secure operations workspace.', email: 'Email address', password: 'Password', error: 'Email or password is incorrect. Please try again.', loading: 'Signing in…', submit: 'Sign in', demo: 'Demo access' },
  gu: { eyebrow: 'સુરક્ષા કામગીરી', title: 'ફરી સ્વાગત છે.', description: 'તમારા સુરક્ષિત કામગીરી કાર્યસ્થળમાં સાઇન ઇન કરો.', email: 'ઇમેઇલ સરનામું', password: 'પાસવર્ડ', error: 'ઇમેઇલ અથવા પાસવર્ડ ખોટો છે. ફરી પ્રયાસ કરો.', loading: 'સાઇન ઇન થઈ રહ્યું છે…', submit: 'સાઇન ઇન', demo: 'ડેમો ઍક્સેસ' },
} as const;

function Login({ onLogin }: { onLogin: (user: SessionUser) => void | Promise<void> }) {
  const language = useLanguage(); const text = loginCopy[language];
  const [email, setEmail] = useState('admin@dgenergy.local'); const [password, setPassword] = useState('demo1234'); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setLoading(true); setError(''); try { const result = await api.post('/auth/login', { email, password }); await onLogin(result.data.data.user); } catch { setError(text.error); } finally { setLoading(false); } }
  return <main className="login-page"><div className="login-decoration"><div className="orb orb-a" /><div className="orb orb-b" /><div className="login-quote"><span className="brand-mark large">DG</span><p>“Simple tools make safer sites.”</p><small>Elector · Devbhumi Dwarka</small></div></div><section className="login-panel"><div className="brand-lockup"><span className="brand-mark">DG</span><span>ELECTOR</span></div><button type="button" className="login-language-toggle" onClick={() => setLanguage(toggleLanguage(language))}>{language === 'en' ? 'ગુજરાતી' : 'English'}</button><div className="login-copy"><span className="eyebrow">{text.eyebrow}</span><h1>{text.title}</h1><p>{text.description}</p></div><form onSubmit={submit}><label>{text.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label>{text.password}<PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <div className="error-callout" role="alert">{error}</div>}<button className="button primary full login-button" disabled={loading}>{loading ? text.loading : text.submit} <span aria-hidden="true">→</span></button></form><div className="demo-hint"><strong>{text.demo}</strong><span>admin@dgenergy.local · demo1234</span></div></section></main>;
}

const nav = [{ to: '/', label: 'dashboard', icon: LayoutDashboard }, { to: '/operations', label: 'operations', icon: CalendarDays }, { to: '/guards', label: 'guards', icon: Users }, { to: '/attendance', label: 'attendance', icon: Activity }, { to: '/sites', label: 'sites', icon: MapPinned }, { to: '/team', label: 'team', icon: ShieldCheck }, { to: '/incidents', label: 'incidents', icon: AlertTriangle }, { to: '/salary', label: 'salaries', icon: Banknote }, { to: '/documents', label: 'documents', icon: FileText }, { to: '/audit', label: 'audit', icon: ClipboardList }];

function Shell({ user, onLogout, children }: { user: SessionUser; onLogout: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false); const [dark, setDark] = useState(() => localStorage.getItem('dg-admin-dark') === '1'); const language = useLanguage(); const location = useLocation();
  const active = nav.find((item) => item.to === location.pathname)?.label ?? 'dashboard'; const visibleNav = nav.filter((item) => user.role === 'ADMIN' || !['team', 'audit', 'salaries', 'documents'].includes(item.label));
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('dg-admin-dark', dark ? '1' : '0'); }, [dark]);
  return <div className="app-shell"><aside className={`sidebar ${open ? 'open' : ''}`}><div className="sidebar-brand"><span className="brand-mark">DG</span><div><strong>ELECTOR</strong><small>SECURITY OS</small></div><button className="mobile-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button></div><div className="workspace-label">{copy[language].settings}</div><nav aria-label="Primary navigation">{visibleNav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={18} /><span>{copy[language][label as keyof typeof copy.en]}</span>{label === 'incidents' && <i aria-label={copy[language].open}>1</i>}</NavLink>)}</nav><div className="sidebar-bottom"><div className="site-status"><span className="live-dot" /> <span><strong>{copy[language].systemOperational}</strong><small>{copy[language].lastSync}</small></span></div><Link className="profile-button" to={`/profile/${user.id}`}><UserAvatar name={user.name} src={user.profilePhotoUrl} /><span><strong>{user.name}</strong><small>{translateValue(user.role, language)}</small></span><span className="more-dots">•••</span></Link></div></aside><div className="main-area"><header className="topbar"><button className="menu-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button><div className="topbar-title"><span className="eyebrow">ELECTOR / {active.toUpperCase()}</span><strong>{copy[language][active as keyof typeof copy.en]}</strong></div><div className="topbar-actions"><button className="topbar-icon" aria-label="Search"><Search size={18} /></button><button className="topbar-icon" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button className="lang-toggle" onClick={() => setLanguage(toggleLanguage(language))} aria-label={copy[language].language}>{language === 'en' ? 'ગુજરાતી' : 'English'}</button><Link className="profile-button compact" to={`/profile/${user.id}`}><UserAvatar name={user.name} src={user.profilePhotoUrl} /><span><strong>{user.name}</strong><small>{translateValue(user.role, language)}</small></span></Link><button className="topbar-icon" onClick={onLogout} aria-label={copy[language].logout}><LogOut size={16} /></button></div></header><main className="content">{children}</main></div></div>;
}

function App() {
  const location = useLocation(); const language = useLanguage(); const queryClient = useQueryClient(); const [user, setUser] = useState<SessionUser>(); const [authChecking, setAuthChecking] = useState(true);
  useEffect(() => { let active = true; clearLegacyApiCache().then(() => getData<{ user: SessionUser }>('/auth/me')).then((data) => { if (active) setUser(data.user); }).catch(() => { if (active) setUser(undefined); }).finally(() => { if (active) setAuthChecking(false); }); return () => { active = false; }; }, []);
  async function completeLogin(nextUser: SessionUser) { advanceApiSession(); queryClient.clear(); await clearLegacyApiCache(); setUser(nextUser); }
  async function logout() { await api.post('/auth/logout'); advanceApiSession(); queryClient.clear(); setUser(undefined); await clearLegacyApiCache(); }
  useEffect(() => { const expired = () => { advanceApiSession(); queryClient.clear(); setUser(undefined); }; window.addEventListener('dg-session-expired', expired); return () => window.removeEventListener('dg-session-expired', expired); }, [queryClient]);
  if (authChecking) return <PageLoader />; if (!user) return <Routes><Route path="*" element={<Login onLogin={completeLogin} />} /></Routes>; if (user.role === 'GUARD') return <GuardApp user={user} onLogout={logout} />;
  if (location.pathname === '/operations') return <Shell user={user} onLogout={logout}><OperationsBoardPage /></Shell>;
  return <Shell user={user} onLogout={logout}>{user.role === 'MAIN_SECURITY' && !user.assignedSiteIds?.length && <div className="error-callout" role="alert">{language === 'gu' ? 'કોઈ સાઇટ સોંપાયેલી નથી. સાઇટ ઍક્સેસ માટે એડમિનનો સંપર્ક કરો.' : 'No sites are assigned. Contact your admin for site access.'}</div>}<Routes><Route path="/" element={<AdminDashboardPage adminView={user.role === 'ADMIN'} />} /><Route path="/profile/:id" element={<UserProfilePage />} /><Route path="/users/new" element={user.role === 'ADMIN' ? <AdminUserFormPage /> : <Navigate to="/" replace />} /><Route path="/guards" element={<ManagementGuardsPage canManage={user.role === 'ADMIN'} />} /><Route path="/guards/:id/edit" element={user.role === 'ADMIN' ? <AdminGuardEditPage /> : <Navigate to="/guards" replace />} /><Route path="/attendance" element={<ManagementAttendancePage />} /><Route path="/sites/new" element={user.role === 'ADMIN' ? <AdminSiteFormPage /> : <Navigate to="/" replace />} /><Route path="/sites/:id/edit" element={user.role === 'ADMIN' ? <AdminSiteFormPage /> : <Navigate to="/" replace />} /><Route path="/sites" element={<AdminSitesPage canManage={user.role === 'ADMIN'} />} /><Route path="/team" element={user.role === 'ADMIN' ? <AdminTeamPage /> : <Navigate to="/" replace />} /><Route path="/incidents" element={<IncidentsPage />} /><Route path="/salary" element={user.role === 'ADMIN' ? <SalaryPage /> : <Navigate to="/" replace />} /><Route path="/documents" element={user.role === 'ADMIN' ? <DocumentsPage /> : <Navigate to="/" replace />} /><Route path="/audit" element={user.role === 'ADMIN' ? <AdminAuditPage /> : <Navigate to="/" replace />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Shell>;
}

export default App;
