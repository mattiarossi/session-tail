import { Link, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';

import { FilterBar } from '~/components/filter-bar';
import { FollowPanel } from '~/components/follow-panel';
import { Sidebar } from '~/components/sidebar';
import { FilterProvider, usePreferencePatch, usePreferences } from '~/hooks/use-filter';

export const Route = createRootRoute({ component: RootComponent });

function LoadingBar() {
  const isLoading = useRouterState({ select: s => s.status === 'pending' });
  if (!isLoading) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-blue-100">
      <div className="h-full animate-[loading_1.2s_ease-in-out_infinite] bg-blue-500" />
    </div>
  );
}

function RootComponent() {
  const prefs = usePreferences();
  const patch = usePreferencePatch();
  const sidebar = prefs.sidebar_open;
  const setSidebar = (open: boolean) => patch({ sidebar_open: open });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'b' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) setSidebar(!sidebar);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // the interface's base font: Tailwind's sizes are rem, so the whole page follows the root
  useEffect(() => {
    document.documentElement.style.fontSize = `${prefs.ui_font_size}px`;
  }, [prefs.ui_font_size]);
  return (
    <FilterProvider>
    <div className="flex h-full flex-col" style={{ '--log-font': `${prefs.font_size}px` } as React.CSSProperties}>
      <LoadingBar />
      <nav className="flex shrink-0 items-center gap-6 border-b border-gray-200 bg-white px-4 py-2">
        <Link to="/" className="flex items-center gap-2 text-base font-bold text-gray-900">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gray-900 text-[10px] font-bold text-white">st</span>
          session-tail
        </Link>
        <div className="flex gap-1">
          <button
            onClick={() => setSidebar(!sidebar)}
            title="show or hide the sessions (b)"
            className={`rounded px-2.5 py-1 text-sm font-medium ${sidebar ? 'text-gray-600 hover:bg-gray-100' : 'bg-gray-100 text-gray-900'}`}
          >
            sessions
          </button>
          <NavLink to="/">Stream</NavLink>
          <NavLink to="/preferences">Preferences</NavLink>
        </div>
        <span className="flex-1" />
        <FilterBar />
      </nav>
      <div className="flex min-h-0 flex-1">
        {sidebar ? (
          <aside className="relative w-60 shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
            <button
              onClick={() => setSidebar(false)}
              title="hide the sessions (b)"
              className="absolute top-1 right-1 z-10 rounded px-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              ◀
            </button>
            <Sidebar />
          </aside>
        ) : (
          <button
            onClick={() => setSidebar(true)}
            title="show the sessions (b)"
            className="w-5 shrink-0 border-r border-gray-200 bg-white text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ▶
          </button>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
          <FollowPanel />
        </main>
      </div>
    </div>
    </FilterProvider>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded px-2.5 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      activeProps={{ className: 'rounded px-2.5 py-1 text-sm font-medium bg-blue-50 text-blue-700' }}
      activeOptions={{ exact: to === '/' }}
    >
      {children}
    </Link>
  );
}
