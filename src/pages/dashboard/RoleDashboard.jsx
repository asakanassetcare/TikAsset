import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import Dashboard from '../Dashboard'
import ServiceDashboard from './ServiceDashboard'
import StaffDashboard from './StaffDashboard'
import AccountingDashboard from './AccountingDashboard'

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'executive',   label: 'Executive' },
  { value: 'accounting',  label: 'Accounting' },
  { value: 'head_staff',  label: 'Manager' },
  { value: 'staff',       label: 'Staff' },
  { value: 'service',     label: 'Service' },
]

function dashboardForRole(role) {
  if (role === 'service')    return <ServiceDashboard />
  if (role === 'staff')      return <StaffDashboard />
  if (role === 'head_staff') return <StaffDashboard />
  if (role === 'accounting') return <AccountingDashboard />
  return <Dashboard />
}

export default function RoleDashboard() {
  const { role } = useAuth()
  const [viewAs, setViewAs] = useState(role)

  if (role === 'service')    return <ServiceDashboard />
  if (role === 'staff')      return <StaffDashboard />
  if (role === 'head_staff') return <StaffDashboard />
  if (role === 'accounting') return <AccountingDashboard />
  if (role === 'executive')  return <Dashboard />

  return (
    <div>
      {role === 'super_admin' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
          <span className="shrink-0 text-xs font-medium text-gray-500">ดูมุมมอง:</span>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setViewAs(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  viewAs === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {dashboardForRole(role === 'super_admin' ? viewAs : role)}
    </div>
  )
}
