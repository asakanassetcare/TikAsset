import { useState } from 'react'
import RequireRole from '../../components/auth/RequireRole'
import CompanyTab from './tabs/CompanyTab'
import InvoiceTab from './tabs/InvoiceTab'
import ContractTab from './tabs/ContractTab'
import NotificationTab from './tabs/NotificationTab'
import ProjectsTab from './tabs/ProjectsTab'
import BuildingsTab from './tabs/BuildingsTab'
import RoomsConfigTab from './tabs/RoomsConfigTab'

const TABS = [
  { id: 'company',      label: 'บริษัท' },
  { id: 'invoice',      label: 'ใบแจ้งหนี้' },
  { id: 'contract',     label: 'สัญญา' },
  { id: 'notification', label: 'การแจ้งเตือน' },
  { id: 'projects',     label: 'โครงการ' },
  { id: 'buildings',    label: 'อาคาร' },
  { id: 'rooms',        label: 'ห้อง' },
]

function TabContent({ tab }) {
  switch (tab) {
    case 'company':      return <CompanyTab />
    case 'invoice':      return <InvoiceTab />
    case 'contract':     return <ContractTab />
    case 'notification': return <NotificationTab />
    case 'projects':     return <ProjectsTab />
    case 'buildings':    return <BuildingsTab />
    case 'rooms':        return <RoomsConfigTab />
    default:             return null
  }
}

export default function SettingsPage() {
  const [active, setActive] = useState('company')

  return (
    <RequireRole roles={['super_admin', 'head_staff']} fallback={
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
    }>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">ตั้งค่าระบบ</h1>
        <p className="mt-1 text-sm text-gray-500">จัดการข้อมูลบริษัท ใบแจ้งหนี้ และค่าเริ่มต้น</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`
              px-4 py-2.5 text-sm font-medium transition-colors
              ${active === t.id
                ? 'border-b-2 border-blue-600 text-blue-700 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            {t.label}
          </button>
        ))}
      </div>

      <TabContent tab={active} />
    </RequireRole>
  )
}
