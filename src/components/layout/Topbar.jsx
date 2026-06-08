import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PanelLeftClose, PanelLeft, ChevronDown, Lock, LogOut, Menu } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'

const ROLE_LABEL = {
  super_admin: 'Super Admin',
  executive:   'ผู้บริหาร',
  accounting:  'บัญชี',
  head_staff:  'Manager',
  staff:       'พนักงาน',
}

export default function Topbar({ collapsed, onToggle, onMobileToggle }) {
  const { profile, role, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 gap-4">
      {/* Left */}
      <div className="flex items-center gap-1">
        {/* Mobile: hamburger to open drawer */}
        <button
          onClick={onMobileToggle}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors lg:hidden"
          title="เมนู"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* Desktop: collapse/expand sidebar */}
        <button
          onClick={onToggle}
          className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors lg:block"
          title={collapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'}
        >
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <GlobalSearch />
        <NotificationBell />

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-gray-100 transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-semibold shrink-0">
              {profile?.full_name?.[0] ?? '?'}
            </div>
            <div className="hidden sm:block text-left leading-tight">
              <p className="text-sm font-medium text-gray-900 leading-tight">{profile?.full_name ?? '-'}</p>
              <p className="text-[11px] text-gray-400">{ROLE_LABEL[role] ?? role}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-gray-100 bg-white shadow-lg py-1">
              <div className="border-b border-gray-100 px-3 py-2.5">
                <p className="text-sm font-medium text-gray-900">{profile?.full_name}</p>
                <p className="text-xs text-gray-400">{profile?.email}</p>
              </div>
              <button
                onClick={() => { navigate('/change-password'); setMenuOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Lock className="h-4 w-4 text-gray-400" />
                เปลี่ยนรหัสผ่าน
              </button>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
