import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDateTime } from '../../lib/date'

export default function NotificationsPage() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [markingAll,    setMarkingAll]    = useState(false)

  useEffect(() => {
    if (!session?.user) return
    fetchAll()

    const channel = supabase
      .channel('notif-page')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${session.user.id}` },
        () => fetchAll(),
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session?.user?.id])

  async function fetchAll() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setNotifications(data ?? [])
    setLoading(false)
  }

  async function markRead(n) {
    if (n.read_at) {
      if (n.link_url) navigate(n.link_url)
      return
    }
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
    if (n.link_url) navigate(n.link_url)
  }

  async function markAllRead() {
    setMarkingAll(true)
    await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', session.user.id)
      .is('read_at', null)
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    setMarkingAll(false)
  }

  if (loading) return <PageSpinner />

  const unread = notifications.filter(n => !n.read_at).length

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">การแจ้งเตือน</h1>
          <p className="mt-1 text-sm text-gray-500">
            {notifications.length} รายการ
            {unread > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                {unread} ยังไม่อ่าน
              </span>
            )}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="secondary" size="sm" icon={<CheckCheck className="h-4 w-4" />}
            loading={markingAll} onClick={markAllRead}>
            อ่านทั้งหมด
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="ไม่มีการแจ้งเตือน" />
      ) : (
        <div className="flex flex-col divide-y divide-gray-50 rounded-xl border border-gray-100 bg-white overflow-hidden max-w-2xl">
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => markRead(n)}
              className={`flex cursor-pointer gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors
                ${!n.read_at ? 'bg-blue-50/40' : ''}`}
            >
              <div className="mt-1 shrink-0">
                {!n.read_at
                  ? <span className="flex h-2 w-2 rounded-full bg-blue-500" />
                  : <span className="flex h-2 w-2 rounded-full bg-transparent" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.read_at ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {n.title}
                </p>
                {n.body && <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{n.body}</p>}
                <p className="mt-1 text-xs text-gray-400">{formatThaiDateTime(n.created_at)}</p>
              </div>
              {n.link_url && (
                <div className="shrink-0 self-center">
                  <span className="text-xs text-blue-600">ดู →</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
