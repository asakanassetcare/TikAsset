import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock3, PlayCircle, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'

export default function ServiceDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [reported, setReported] = useState([])
  const [inProgress, setInProgress] = useState([])
  const [completedCount, setCompletedCount] = useState(0)
  const [updating, setUpdating] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [active, done] = await Promise.all([
      supabase.from('maintenance_requests').select(`
        id, maintenance_number, title, status, reported_at,
        contact_name, contact_phone, preferred_start_date, preferred_due_date,
        buildings(name), rooms(room_number)
      `).in('status', ['reported', 'in_progress']).order('created_at', { ascending: false }),
      supabase.from('maintenance_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed'),
    ])
    const items = active.data ?? []
    setReported(items.filter(i => i.status === 'reported'))
    setInProgress(items.filter(i => i.status === 'in_progress'))
    setCompletedCount(done.count ?? 0)
    setLoading(false)
  }

  async function updateStatus(id, newStatus) {
    setUpdating(id)
    await supabase.from('maintenance_requests').update({ status: newStatus }).eq('id', id)
    setUpdating(null)
    fetchAll()
  }

  if (loading) return <PageSpinner />

  function filterItems(items) {
    if (!search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter(i =>
      i.maintenance_number?.toLowerCase().includes(q) ||
      i.rooms?.room_number?.toLowerCase().includes(q) ||
      i.contact_phone?.toLowerCase().includes(q)
    )
  }

  const filteredReported   = filterItems(reported)
  const filteredInProgress = filterItems(inProgress)
  const hasWork = reported.length > 0 || inProgress.length > 0
  const hasResults = filteredReported.length > 0 || filteredInProgress.length > 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">สวัสดี, {profile?.full_name}</h1>
        <p className="mt-1 text-sm text-gray-500">งานของคุณวันนี้</p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard icon={Clock3}       label="รอดำเนินการ" value={reported.length}   color="amber"
          onClick={() => navigate('/maintenance', { state: { filterStatus: 'reported' } })} />
        <StatCard icon={PlayCircle}   label="กำลังทำ"     value={inProgress.length} color="blue"
          onClick={() => navigate('/maintenance', { state: { filterStatus: 'in_progress' } })} />
        <StatCard icon={CheckCircle2} label="เสร็จแล้ว"   value={completedCount}    color="green"
          onClick={() => navigate('/maintenance', { state: { filterStatus: 'completed' } })} />
      </div>

      {hasWork && (
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขงาน, ห้อง, หรือเบอร์ติดต่อ..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {filteredInProgress.length > 0 && (
        <Section title="กำลังดำเนินการ" count={filteredInProgress.length} accent="border-blue-400">
          {filteredInProgress.map(item => (
            <JobCard
              key={item.id}
              item={item}
              actionLabel="งานเสร็จแล้ว"
              actionVariant="primary"
              updating={updating === item.id}
              onUpdate={() => updateStatus(item.id, 'completed')}
              onNavigate={() => navigate(`/maintenance/${item.id}`)}
            />
          ))}
        </Section>
      )}

      {filteredReported.length > 0 && (
        <Section title="รอดำเนินการ" count={filteredReported.length} accent="border-amber-400">
          {filteredReported.map(item => (
            <JobCard
              key={item.id}
              item={item}
              actionLabel="เริ่มงาน"
              actionVariant="outline"
              updating={updating === item.id}
              onUpdate={() => updateStatus(item.id, 'in_progress')}
              onNavigate={() => navigate(`/maintenance/${item.id}`)}
            />
          ))}
        </Section>
      )}

      {hasWork && !hasResults && (
        <p className="mt-8 text-center text-sm text-gray-400">ไม่พบงานที่ตรงกับ "{search}"</p>
      )}

      {!hasWork && (
        <div className="mt-24 flex flex-col items-center text-center">
          <CheckCircle2 className="mb-3 h-14 w-14 text-green-400" />
          <p className="font-medium text-gray-700">ไม่มีงานค้างแล้ว</p>
          <p className="mt-1 text-sm text-gray-400">เยี่ยมมาก! งานเสร็จทั้งหมดแล้ว</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, onClick }) {
  const map = {
    amber: { bg: 'bg-amber-50', icon: 'text-amber-500', val: 'text-amber-700' },
    blue:  { bg: 'bg-blue-50',  icon: 'text-blue-500',  val: 'text-blue-700' },
    green: { bg: 'bg-green-50', icon: 'text-green-500', val: 'text-green-700' },
  }
  const c = map[color]
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-4 py-3.5 transition-all ${c.bg} ${
        onClick ? 'cursor-pointer hover:brightness-95 active:scale-[0.98]' : ''
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${c.icon}`} />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-2xl font-bold leading-tight ${c.val}`}>{value}</p>
      </div>
    </div>
  )
}

function Section({ title, count, accent, children }) {
  return (
    <div className="mb-6">
      <div className={`mb-3 flex items-center gap-2 border-l-4 pl-3 ${accent}`}>
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <span className="text-xs text-gray-400">{count} งาน</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function JobCard({ item, actionLabel, actionVariant, updating, onUpdate, onNavigate }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 transition-all hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onNavigate}>
          <p className="truncate text-sm font-semibold text-gray-900">
            {item.maintenance_number} · {item.title}
          </p>
          <p className="text-xs text-gray-500">
            {item.buildings?.name ?? 'พื้นที่ส่วนกลาง'}
            {item.rooms?.room_number ? ` · ห้อง ${item.rooms.room_number}` : ''}
          </p>
          {(item.contact_name || item.contact_phone) && (
            <p className="mt-0.5 text-xs text-gray-400">
              ติดต่อ: {item.contact_name || '-'}
              {item.contact_phone ? ` · ${item.contact_phone}` : ''}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.preferred_start_date && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                เข้า {formatThaiDate(item.preferred_start_date)}
              </span>
            )}
            {item.preferred_due_date && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                เสร็จ {formatThaiDate(item.preferred_due_date)}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant={actionVariant} loading={updating} onClick={onUpdate}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}
