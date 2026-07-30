import { Outlet } from 'react-router-dom';
import { TopNav } from '@/components/layout/TopNav';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col bg-background">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="container max-w-[1600px] py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
