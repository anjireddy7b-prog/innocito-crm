import { Outlet } from 'react-router-dom';
import { TopNav } from '@/components/layout/TopNav';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col bg-background">
      <TopNav />
      <div className="chrome-fill flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="ml-0 mr-3 mt-3 min-h-[calc(100%-0.75rem)] rounded-tl-2xl rounded-tr-2xl border border-border bg-background shadow-md">
            <div className="container max-w-[1600px] py-6">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
