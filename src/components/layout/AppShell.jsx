import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  const [collapsed,   setCollapsed]   = useState(false)
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const { pathname } = useLocation()
  const fullBleed = pathname === '/line-chat'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <Topbar
          collapsed={collapsed}
          onToggle={() => setCollapsed(v => !v)}
          onMobileToggle={() => setMobileOpen(v => !v)}
        />

        <main className="flex-1 overflow-hidden flex flex-col">
          {fullBleed ? (
            <Outlet />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-screen-2xl p-4 sm:p-6">
                <Outlet />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
