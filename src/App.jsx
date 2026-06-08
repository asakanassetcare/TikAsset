import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { SettingsProvider } from './hooks/useSettings'
import RequireAuth from './components/auth/RequireAuth'
import RequireNonService from './components/auth/RequireNonService'
import AppShell from './components/layout/AppShell'

import Login from './pages/auth/Login'
import ChangePassword from './pages/auth/ChangePassword'
import RoleDashboard from './pages/dashboard/RoleDashboard'
import CalendarPage from './pages/Calendar'
import ProjectsPage from './pages/projects/ProjectsPage'
import ProjectDetailPage from './pages/projects/ProjectDetailPage'
import BuildingDetailPage from './pages/projects/BuildingDetailPage'
import BuildingsPage from './pages/buildings/BuildingsPage'
import RoomsPage from './pages/rooms/RoomsPage'
import RoomDetailPage from './pages/rooms/RoomDetailPage'
import OwnersPage from './pages/owners/OwnersPage'
import OwnerDetailPage from './pages/owners/OwnerDetailPage'
import TenantsPage from './pages/tenants/TenantsPage'
import TenantDetailPage from './pages/tenants/TenantDetailPage'
import BookingsPage from './pages/bookings/BookingsPage'
import BookingDetailPage from './pages/bookings/BookingDetailPage'
import ContractsPage from './pages/contracts/ContractsPage'
import ContractDetailPage from './pages/contracts/ContractDetailPage'
import ContractPrintPage from './pages/contracts/ContractPrintPage'
import ContractQuotationPage from './pages/contracts/ContractQuotationPage'
import InvoicesPage from './pages/invoices/InvoicesPage'
import InvoiceDetailPage from './pages/invoices/InvoiceDetailPage'
import PaymentsPage from './pages/payments/PaymentsPage'
import OwnerTransfersPage from './pages/owner-transfers/OwnerTransfersPage'
import MoveOutsPage from './pages/move-outs/MoveOutsPage'
import MoveOutDetailPage from './pages/move-outs/MoveOutDetailPage'
import MaintenancePage from './pages/maintenance/MaintenancePage'
import MaintenanceDetailPage from './pages/maintenance/MaintenanceDetailPage'
import DocumentsPage from './pages/documents/DocumentsPage'
import ReportsPage from './pages/reports/ReportsPage'
import NotificationsPage from './pages/notifications/NotificationsPage'
import SettingsPage from './pages/settings/SettingsPage'
import UsersPage from './pages/settings/UsersPage'
import ActivityLogPage from './pages/settings/ActivityLogPage'
import ApprovalsPage from './pages/ApprovalsPage'
import ManagePage from './pages/ManagePage'
import LineRegisterPage from './pages/line/LineRegisterPage'
import LineSlipPage from './pages/line/LineSlipPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/line-register" element={<LineRegisterPage />} />
            <Route path="/line-slip" element={<LineSlipPage />} />
            <Route path="/contracts/:contractId/print"     element={<RequireAuth><ContractPrintPage /></RequireAuth>} />
            <Route path="/contracts/:contractId/quotation" element={<RequireAuth><ContractQuotationPage /></RequireAuth>} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<RoleDashboard />} />
              <Route path="calendar" element={<RequireNonService><CalendarPage /></RequireNonService>} />
              <Route path="projects" element={<RequireNonService><ProjectsPage /></RequireNonService>} />
              <Route path="projects/:projectId" element={<RequireNonService><ProjectDetailPage /></RequireNonService>} />
              <Route path="projects/:projectId/buildings/:buildingId" element={<RequireNonService><BuildingDetailPage /></RequireNonService>} />
              <Route path="buildings" element={<RequireNonService><BuildingsPage /></RequireNonService>} />
              <Route path="rooms" element={<RequireNonService><RoomsPage /></RequireNonService>} />
              <Route path="rooms/:roomId" element={<RequireNonService><RoomDetailPage /></RequireNonService>} />
              <Route path="owners" element={<RequireNonService><OwnersPage /></RequireNonService>} />
              <Route path="owners/:ownerId" element={<RequireNonService><OwnerDetailPage /></RequireNonService>} />
              <Route path="tenants" element={<RequireNonService><TenantsPage /></RequireNonService>} />
              <Route path="tenants/:tenantId" element={<RequireNonService><TenantDetailPage /></RequireNonService>} />
              <Route path="manage" element={<RequireNonService><ManagePage /></RequireNonService>} />
              <Route path="bookings" element={<RequireNonService><BookingsPage /></RequireNonService>} />
              <Route path="bookings/:bookingId" element={<RequireNonService><BookingDetailPage /></RequireNonService>} />
              <Route path="contracts" element={<RequireNonService><ContractsPage /></RequireNonService>} />
              <Route path="contracts/:contractId" element={<RequireNonService><ContractDetailPage /></RequireNonService>} />
              <Route path="invoices" element={<RequireNonService><InvoicesPage /></RequireNonService>} />
              <Route path="invoices/:invoiceId" element={<RequireNonService><InvoiceDetailPage /></RequireNonService>} />
              <Route path="payments" element={<RequireNonService><PaymentsPage /></RequireNonService>} />
              <Route path="approvals" element={<RequireNonService><ApprovalsPage /></RequireNonService>} />
              <Route path="owner-transfers" element={<RequireNonService><OwnerTransfersPage /></RequireNonService>} />
              <Route path="move-outs" element={<RequireNonService><MoveOutsPage /></RequireNonService>} />
              <Route path="move-outs/:moveOutId" element={<RequireNonService><MoveOutDetailPage /></RequireNonService>} />
              <Route path="maintenance" element={<MaintenancePage />} />
              <Route path="maintenance/:maintenanceId" element={<MaintenanceDetailPage />} />
              <Route path="documents" element={<RequireNonService><DocumentsPage /></RequireNonService>} />
              <Route path="reports" element={<RequireNonService><ReportsPage /></RequireNonService>} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="settings" element={<RequireNonService><SettingsPage /></RequireNonService>} />
              <Route path="users" element={<RequireNonService><UsersPage /></RequireNonService>} />
              <Route path="activity-log" element={<RequireNonService><ActivityLogPage /></RequireNonService>} />
              <Route path="change-password" element={<ChangePassword />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
