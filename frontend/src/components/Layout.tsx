import React from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { 
  LogOut,
  User,
  BarChart3,
  Inbox,
  Server,
  Link2,
  History,
  Sun,
  Moon
} from 'lucide-react';
import { Button } from './ui/Button';
import { NotificationBell } from './ui/NotificationBell';

export const Layout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [dark, setDark] = React.useState(() => localStorage.getItem('theme') === 'dark');

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  if (!user) {
    return <Navigate to="/login" />;
  }

  const isAdmin = user.role === 'admin';
  const navigation = [
    { name: 'Requests', href: '/admin/requests', icon: Inbox, show: isAdmin },
    { name: 'Inventory', href: '/admin/inventory', icon: Server, show: isAdmin },
    { name: 'Assignments', href: '/admin/assignments', icon: Link2, show: isAdmin },
    { name: 'History', href: '/admin/history', icon: History, show: isAdmin },
    {
      name: 'My Requests',
      href: '/requests',
      icon: Inbox,
      show: !isAdmin,
    },
    {
      name: 'Support Tickets',
      href: '/tickets',
      icon: Inbox,
      show: !isAdmin,
    },
    {
      name: 'Agent Dashboard',
      href: '/agent-dashboard',
      icon: BarChart3,
      show: user.role === 'agent',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r border-gray-200 bg-white md:block">
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Operations</p>
            <h1 className="text-lg font-semibold text-gray-900">IT Resource Desk</h1>
          </div>
        </div>
        
        <nav className="mt-6 px-3" aria-label="Primary navigation">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Workspace</p>
          <ul className="space-y-1">
            {navigation
              .filter(item => item.show)
              .map((item) => {
                const isActive = 'exact' in item && item.exact
                  ? location.pathname === item.href
                  : location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <item.icon className="mr-3 h-5 w-5" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">{user.email}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role}{user.department ? ` · ${user.department}` : ''}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="ml-2"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="md:pl-64">
        {/* Top header with notifications */}
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-[var(--surface)] px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center justify-between">
            <div className="md:hidden">
              <p className="text-sm font-semibold text-gray-900">IT Resource Desk</p>
              <p className="text-xs text-gray-500">{isAdmin ? 'Admin operations' : 'Service desk'}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={() => setDark(value => !value)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            {user.role !== 'admin' && <NotificationBell />}
            </div>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-[var(--surface)] px-4 py-2 md:hidden" aria-label="Mobile navigation">
          {navigation.filter(item => item.show).map(item => {
            const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600'}`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        <main className="mx-auto max-w-[1600px] p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};