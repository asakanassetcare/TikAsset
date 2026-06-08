import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, CalendarDays, DoorOpen, PackageCheck,
  Users, UserCircle, CreditCard, Wrench, FolderOpen,
  BarChart3, Bell, Settings, ShieldCheck, ClipboardList,
  CheckSquare, LayoutList,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { canManageSettings, canManageUsers } from '../../lib/permissions'

const NAV_ITEMS = [
  { to: '/',              label: 'Dashboard',        icon: LayoutDashboard, end: true },
  { to: '/calendar',      label: 'ปฏิทิน',            icon: CalendarDays, noService: true },
  { to: '/notifications', label: 'การแจ้งเตือน',      icon: Bell },

  { type: 'divider', noService: true },

  { to: '/rooms',         label: 'บริหารห้องเช่า',    icon: DoorOpen, noService: true },
  { to: '/manage',        label: 'จัดการ & ตรวจสอบ',  icon: LayoutList, noService: true },

  { type: 'divider', noService: true },

  { to: '/owners',        label: 'เจ้าของห้อง',       icon: UserCircle, noService: true },
  { to: '/tenants',       label: 'ผู้เช่า',           icon: Users, noService: true },
  { to: '/documents',     label: 'เอกสาร',            icon: FolderOpen, noService: true },
  { to: '/reports',       label: 'รายงาน',            icon: BarChart3, noService: true },

  { type: 'divider' },

  { to: '/approvals',     label: 'รออนุมัติ',          icon: CheckSquare, approvalOnly: true, noService: true },
  { to: '/payments',      label: 'บัญชี',               icon: CreditCard, accountingOnly: true, noService: true },
  { to: '/maintenance',   label: 'แจ้งซ่อม',          icon: Wrench },

  { type: 'divider', adminOnly: true },

  { to: '/settings',      label: 'ตั้งค่า',            icon: Settings, settingsOnly: true },
  { to: '/users',         label: 'ผู้ใช้งาน & สิทธิ์',  icon: ShieldCheck, userManageOnly: true },
  { to: '/activity-log',  label: 'Activity Log',       icon: ClipboardList, superAdminOnly: true },
]

export default function Sidebar({ collapsed, mobileOpen, onMobileClose }) {
  const { role } = useAuth()
  const canManageUserAccounts = canManageUsers(role)
  const canManageAppSettings = canManageSettings(role)
  const canApprove = ['super_admin', 'executive', 'head_staff'].includes(role)
  const isService = role === 'service'
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!canApprove) return
    async function fetchPendingCount() {
      const queries = []
      if (['super_admin', 'executive'].includes(role)) {
        queries.push(
          supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'pending_approve')
        )
      }
      if (['super_admin', 'head_staff'].includes(role)) {
        queries.push(
          supabase.from('payments').select('id', { count: 'exact', head: true })
            .eq('status', 'pending_approve').is('head_approved_at', null).is('head_rejected_at', null),
          supabase.from('rent_advance_payments').select('id', { count: 'exact', head: true })
            .is('head_approved_at', null).is('head_rejected_at', null),
          supabase.from('bookings').select('id', { count: 'exact', head: true })
            .not('slip_url', 'is', null).is('head_approved_at', null).is('head_rejected_at', null),
          supabase.from('receipts').select('id', { count: 'exact', head: true })
            .eq('status', 'pending').is('head_approved_at', null).is('head_rejected_at', null),
          supabase.from('settlements').select('id', { count: 'exact', head: true })
            .eq('status', 'paid_by_staff').is('head_approved_at', null).is('head_rejected_at', null),
          supabase.from('move_outs').select('id', { count: 'exact', head: true })
            .eq('status', 'pending_accounting'),
        )
      }
      const results = await Promise.all(queries)
      setPendingCount(results.reduce((sum, r) => sum + (r.count ?? 0), 0))
    }
    fetchPendingCount()
  }, [canApprove, role])

  return (
    <aside
      className={[
        'flex flex-col border-r border-gray-200 bg-white transition-all duration-200',
        // Mobile: fixed drawer, slide in/out
        'fixed inset-y-0 left-0 z-40 w-72',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: inline sidebar, always visible, collapsible width
        'lg:relative lg:inset-auto lg:z-auto lg:translate-x-0',
        collapsed ? 'lg:w-16' : 'lg:w-60',
      ].join(' ')}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-gray-100 px-4">
        {collapsed ? (
          <div className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700">
            <PackageCheck className="h-4 w-4 text-white" />
          </div>
        ) : null}
        <div className={`flex items-center gap-2.5 ${collapsed ? 'lg:hidden' : ''}`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700">
            <PackageCheck className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-gray-900">TikAsset</p>
            <p className="text-[10px] text-gray-400">บริหารการปล่อยเช่าครบวงจร</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        {NAV_ITEMS.map((item, i) => {
          if (item.type === 'divider') {
            if (item.adminOnly && !canManageUserAccounts && !canManageAppSettings) return null
            if (item.noService && isService) return null
            return <div key={i} className="my-2 border-t border-gray-100" />
          }
          if (item.adminOnly && !canManageUserAccounts && !canManageAppSettings) return null
          if (item.superAdminOnly && role !== 'super_admin') return null
          if (item.settingsOnly && !canManageAppSettings) return null
          if (item.userManageOnly && !canManageUserAccounts) return null
          if (item.accountingOnly && !['super_admin', 'accounting'].includes(role)) return null
          if (item.approvalOnly && !canApprove) return null
          if (item.noService && isService) return null

          const Icon = item.icon
          const badge = item.approvalOnly && pendingCount > 0 ? pendingCount : 0

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onMobileClose}
              className={({ isActive }) => `
                flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors
                ${isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
                ${collapsed ? 'lg:justify-center lg:px-0' : ''}
              `}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={`flex-1 ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
              {badge > 0 && (
                <span className={`rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white ${collapsed ? 'lg:hidden' : ''}`}>
                  {badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
