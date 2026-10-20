import React from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import {
  LogOut, User, BarChart3, Inbox, Server, Link2, History, Sun, Moon,
  Menu, PanelLeftClose, PanelLeftOpen, X, Settings, LifeBuoy,
} from 'lucide-react';
import { NotificationBell } from './ui/NotificationBell';
import { BrandMark } from './BrandMark';

export const Layout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [dark, setDark] = React.useState(() => localStorage.getItem('theme') === 'dark');
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem('sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);
  React.useEffect(() => {
    localStorage.setItem('sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);
  React.useEffect(() => setMobileOpen(false), [location.pathname]);

  if (!user) return <Navigate to="/login" />;

  const isAdmin = user.role === 'admin';
  const navigation = [
    { name: 'Requests', href: '/admin/requests', icon: Inbox, show: isAdmin },
    { name: 'Inventory', href: '/admin/inventory', icon: Server, show: isAdmin },
    { name: 'Assignments', href: '/admin/assignments', icon: Link2, show: isAdmin },
    { name: 'History', href: '/admin/history', icon: History, show: isAdmin },
    { name: 'My Requests', href: '/requests', icon: Inbox, show: !isAdmin },
    { name: 'Support Tickets', href: '/tickets', icon: LifeBuoy, show: !isAdmin },
    { name: 'Agent Dashboard', href: '/agent-dashboard', icon: BarChart3, show: user.role === 'agent' },
    { name: 'Settings', href: '/settings', icon: Settings, show: isAdmin },
  ].filter(item => item.show);

  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(`${href}/`);

  const sidebar = (
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-transform duration-200 md:translate-x-0 ${collapsed ? 'md:w-[72px]' : ''} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className={`flex h-[76px] shrink-0 items-center border-b border-[var(--border)] ${collapsed ? 'justify-center px-3' : 'px-5'}`}>
        <BrandMark collapsed={collapsed} />
        {mobileOpen && <button aria-label="Close navigation" className="ml-auto rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] md:hidden" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button>}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-6" aria-label="Primary navigation">
        {!collapsed && <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Workspace</p>}
        <ul className="space-y-1.5">
          {navigation.map(item => {
            const active = isActive(item.href);
            return <li key={item.name}>
              <Link to={item.href} title={collapsed ? item.name : undefined} aria-label={item.name}
                className={`group flex items-center rounded-xl py-2.5 text-sm font-semibold transition-colors ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${active ? 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary-strong)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]'}`}>
                <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-[var(--primary)]' : ''}`} />{!collapsed && item.name}
              </Link>
            </li>;
          })}
        </ul>
      </nav>
      <div className={`border-t border-[var(--border)] p-3 ${collapsed ? 'flex flex-col items-center gap-3' : ''}`}>
        <div className={`flex items-center gap-3 rounded-xl bg-[var(--surface-muted)] p-2.5 ${collapsed ? 'justify-center' : ''}`} title={collapsed ? user.email : undefined}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-xs font-bold text-white">{(user.name || user.email || 'U').slice(0, 1).toUpperCase()}</div>
          {!collapsed && <div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--text)]">{user.name || user.email}</p><p className="truncate text-[11px] capitalize text-[var(--text-muted)]">{user.role}{user.department ? ` · ${user.department}` : ''}</p></div>}
        </div>
        <button type="button" onClick={logout} title="Sign out" className={`mt-2 flex items-center rounded-lg p-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-red-50 hover:text-[var(--danger)] dark:hover:bg-red-400/10 ${collapsed ? '' : 'w-full gap-2 px-3'}`}><LogOut className="h-4 w-4" />{!collapsed && 'Sign out'}</button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[var(--page)]">
      {sidebar}
      {mobileOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />}
      <div className={`min-h-screen transition-[padding] duration-200 md:pl-[248px] ${collapsed ? 'md:pl-[72px]' : ''}`}>
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            <button aria-label="Open navigation" className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] md:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button>
            <button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] md:block" onClick={() => setCollapsed(value => !value)}>
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
            <div className="hidden md:block"><p className="text-sm font-bold text-[var(--text)]">{isAdmin ? 'Admin operations' : 'Service desk'}</p><p className="text-xs text-[var(--text-muted)]">Manage resources with confidence</p></div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDark(value => !value)} className="rounded-xl p-2.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">{dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}</button>
            {user.role !== 'admin' && <NotificationBell />}
            <div className="ml-2 hidden h-8 w-px bg-[var(--border)] sm:block" />
            <div className="ml-2 hidden items-center gap-2 sm:flex"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-bold text-[var(--primary)]"><User className="h-4 w-4" /></div></div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
};
