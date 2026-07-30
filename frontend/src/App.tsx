import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { ProtectedRoute, RequireRole, RequirePermission } from '@/routes/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { PERMISSIONS } from '@/lib/permissions';
import LoginPage from '@/pages/LoginPage';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const LeadsListPage = lazy(() => import('@/pages/leads/LeadsListPage'));
const LeadDetailPage = lazy(() => import('@/pages/leads/LeadDetailPage'));
const CompaniesListPage = lazy(() => import('@/pages/companies/CompaniesListPage'));
const CompanyDetailPage = lazy(() => import('@/pages/companies/CompanyDetailPage'));
const ContactsListPage = lazy(() => import('@/pages/contacts/ContactsListPage'));
const ContactDetailPage = lazy(() => import('@/pages/contacts/ContactDetailPage'));
const CampaignsListPage = lazy(() => import('@/pages/campaigns/CampaignsListPage'));
const CampaignDetailPage = lazy(() => import('@/pages/campaigns/CampaignDetailPage'));
const MeetingsPage = lazy(() => import('@/pages/MeetingsPage'));
const TasksPage = lazy(() => import('@/pages/TasksPage'));
const DocumentsPage = lazy(() => import('@/pages/DocumentsPage'));
const ActivitiesPage = lazy(() => import('@/pages/ActivitiesPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const AuditLogsPage = lazy(() => import('@/pages/AuditLogsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function PageFallback() {
  return (
    <div className="flex h-64 w-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

export default function App() {
  useAuthBootstrap();

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route path="/leads" element={<LeadsListPage />} />
          <Route path="/leads/:id" element={<LeadDetailPage />} />

          <Route path="/companies" element={<CompaniesListPage />} />
          <Route path="/companies/:id" element={<CompanyDetailPage />} />

          <Route path="/contacts" element={<ContactsListPage />} />
          <Route path="/contacts/:id" element={<ContactDetailPage />} />

          <Route path="/campaigns" element={<CampaignsListPage />} />
          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />

          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/activities" element={<ActivitiesPage />} />

          <Route
            path="/reports"
            element={
              <RequirePermission permission={PERMISSIONS.REPORTS_VIEW}>
                <ReportsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/users"
            element={
              <RequireRole roles={['ADMIN']}>
                <UsersPage />
              </RequireRole>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <RequirePermission permission={PERMISSIONS.AUDIT_LOGS_VIEW}>
                <AuditLogsPage />
              </RequirePermission>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
