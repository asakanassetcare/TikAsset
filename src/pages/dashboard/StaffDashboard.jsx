import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, FileText, CalendarClock, DoorOpen, Wrench, Hash, LogOut, Search, X, AlertCircle, LogIn } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import { PageSpinner } from '../../components/ui/Spinner'

export default function StaffDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState([])
  const [moveInReadyContracts, setMoveInReadyContracts] = useState([])
  const [pendingContracts, setPendingContracts] = useState([])
  const [expiringContracts, setExpiringContracts] = useState([])
  const [roomStats, setRoomStats] = useState({ total: 0, available: 0, reserved: 0 })
  const [maintenanceActive, setMaintenanceActive] = useState(0)
  const [pendingMoveOuts,   setPendingMoveOuts]   = useState(0)
  const [debtSettlements,   setDebtSettlements]   = useState([])
  const [overdueInvoices,   setOverdueInvoices]   = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => { if (profile?.id) fetchAll() }, [profile?.id])

  async function fetchAll() {
    const in30  = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const overdueCutoff = new Date(now.getTime() - 5 * 86400_000).toISOString().slice(0, 10)

    const [bk, moveInReady, pending, expiring, rooms, maintenance, moveOuts, overdue, debts] = await Promise.all([
      supabase.from('bookings').select(`
        id, booking_number, created_at,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `).eq('created_by', profile.id).eq('status', 'waiting').order('created_at', { ascending: false }),

      supabase.from('contracts').select(`
        id, contract_number, move_in_date,
        rooms(room_number, buildings(name)),
        tenants(full_name),
        invoices(id, invoice_number, invoice_type, status, total_amount)
      `).eq('assigned_staff_id', profile.id)
        .eq('status', 'approved')
        .is('actual_move_in_at', null)
        .order('move_in_date', { ascending: true }),

      supabase.from('contracts').select(`
        id, contract_number,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `).eq('assigned_staff_id', profile.id).eq('status', 'pending_approve')
        .order('created_at', { ascending: false }),

      supabase.from('contracts').select(`
        id, contract_number, contract_end_date,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `).eq('assigned_staff_id', profile.id).eq('status', 'active')
        .lte('contract_end_date', in30).gte('contract_end_date', today)
        .order('contract_end_date'),

      supabase.from('rooms').select('id, status'),

      supabase.from('maintenance_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['reported', 'in_progress']),

      supabase.from('move_outs')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', profile.id)
        .eq('status', 'pending_accounting'),

      supabase.from('invoices').select(`
        id, invoice_number, total_amount, due_date, status,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `).or(`status.eq.overdue,and(status.eq.pending,due_date.lte.${overdueCutoff})`)
        .order('due_date').limit(20),

      supabase.from('settlements').select(`
        id, amount,
        move_outs(id, move_out_number, settlement_deadline, rooms(room_number, buildings(name)), tenants(full_name))
      `).eq('direction', 'charge_from_tenant').eq('status', 'pending').order('created_at'),
    ])

    const allRooms = rooms.data ?? []
    setRoomStats({
      total:     allRooms.length,
      available: allRooms.filter(r => r.status === 'available').length,
      reserved:  allRooms.filter(r => r.status === 'reserved').length,
    })
    setBookings(bk.data ?? [])
    setMoveInReadyContracts((moveInReady.data ?? []).filter(c => {
      const requiredInvoices = (c.invoices ?? []).filter(inv => ['contract_initial', 'monthly_rent'].includes(inv.invoice_type))
      return requiredInvoices.length > 0 && requiredInvoices.every(inv => inv.status === 'paid')
    }))
    setPendingContracts(pending.data ?? [])
    setExpiringContracts(expiring.data ?? [])
    setMaintenanceActive(maintenance.count ?? 0)
    setPendingMoveOuts(moveOuts.count ?? 0)
    setDebtSettlements(debts.data ?? [])
    setOverdueInvoices(overdue.data ?? [])
    setLoading(false)
  }

  if (loading) return <PageSpinner />

  function filterItems(items) {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(i =>
      i.contract_number?.toLowerCase().includes(q) ||
      i.booking_number?.toLowerCase().includes(q) ||
      i.invoice_number?.toLowerCase().includes(q) ||
      i.rooms?.room_number?.toLowerCase().includes(q) ||
      i.tenants?.full_name?.toLowerCase().includes(q)
    )
  }

  const filteredExpiring  = filterItems(expiringContracts)
  const filteredMoveIns   = filterItems(moveInReadyContracts)
  const filteredPending   = filterItems(pendingContracts)
  const filteredBookings  = filterItems(bookings)
  const filteredOverdue   = filterItems(overdueInvoices)
  const filteredDebts     = debtSettlements.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const mo = s.move_outs
    return mo?.move_out_number?.toLowerCase().includes(q) ||
           mo?.rooms?.room_number?.toLowerCase().includes(q) ||
           mo?.tenants?.full_name?.toLowerCase().includes(q)
  })
  const hasItems   = expiringContracts.length > 0 || moveInReadyContracts.length > 0 || pendingContracts.length > 0 || bookings.length > 0 || overdueInvoices.length > 0 || debtSettlements.length > 0
  const hasResults = filteredExpiring.length > 0 || filteredMoveIns.length > 0 || filteredPending.length > 0 || filteredBookings.length > 0 || filteredOverdue.length > 0 || filteredDebts.length > 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">สวัสดี, {profile?.full_name}</h1>
        <p className="mt-1 text-sm text-gray-500">งานของคุณวันนี้</p>
      </div>

      {/* ภาพรวมอาคาร */}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">ภาพรวมอาคาร</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Hash}      label="ห้องทั้งหมด"        value={roomStats.total}     color="blue"
          onClick={() => navigate('/rooms')} />
        <StatCard icon={DoorOpen}  label="ห้องว่าง"            value={roomStats.available} color="green"
          onClick={() => navigate('/rooms', { state: { filterStatus: 'available' } })} />
        <StatCard icon={BookOpen}  label="จองล่วงหน้า"         value={roomStats.reserved}  color="amber"
          onClick={() => navigate('/rooms', { state: { filterStatus: 'reserved' } })} />
        <StatCard icon={Wrench}    label="งานซ่อมค้าง"         value={maintenanceActive}   color="gray"
          onClick={() => navigate('/maintenance')} />
      </div>

      {/* งานของคุณ */}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">งานของคุณ</p>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={BookOpen}      label="Booking รอแปลงสัญญา"   value={bookings.length}          color="amber"
          onClick={() => navigate('/bookings',  { state: { filterStatus: 'waiting' } })} />
        <StatCard icon={LogIn}         label="รอบันทึกเข้าพัก"       value={moveInReadyContracts.length} color="green"
          onClick={() => document.getElementById('section-move-in')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <StatCard icon={FileText}      label="สัญญารออนุมัติ"        value={pendingContracts.length}  color="purple"
          onClick={() => navigate('/contracts', { state: { filterStatus: 'pending_approve' } })} />
        <StatCard icon={CalendarClock} label="สัญญาใกล้หมด (30 วัน)" value={expiringContracts.length} color="red"
          onClick={() => navigate('/contracts', { state: { filterStatus: 'active' } })} />
        <StatCard icon={LogOut}        label="ย้ายออกรออนุมัติ"       value={pendingMoveOuts}          color="orange"
          onClick={() => navigate('/move-outs', { state: { filterStatus: 'pending_accounting' } })} />
        <StatCard icon={AlertCircle}   label="ค้างชำระ"               value={overdueInvoices.length}   color="red"
          onClick={() => navigate('/invoices',  { state: { filterStatus: 'overdue' } })} />
        {debtSettlements.length > 0 && (
          <StatCard icon={AlertCircle} label="ติดตามหนี้ move-out" value={debtSettlements.length} color="red"
            onClick={() => navigate('/move-outs')} />
        )}
      </div>

      {hasItems && (
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขสัญญา, booking, ห้อง, หรือชื่อผู้เช่า..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {filteredDebts.length > 0 && (
        <Section title="ติดตามหนี้ Move-out" count={filteredDebts.length} accent="border-red-500">
          {filteredDebts.map(s => {
            const mo = s.move_outs
            return (
              <ItemRow
                key={s.id}
                number={mo?.move_out_number ?? '-'}
                sub={`${mo?.rooms?.buildings?.name} · ห้อง ${mo?.rooms?.room_number} · ${mo?.tenants?.full_name}`}
                tag={<Tag color="red">฿{Number(s.amount).toLocaleString('th-TH')}</Tag>}
                actionLabel="บันทึกรับชำระ"
                onClick={() => navigate(`/move-outs/${mo?.id}`)}
              />
            )
          })}
        </Section>
      )}

      {filteredOverdue.length > 0 && (
        <Section title="ค้างชำระ — ต้องติดตาม" count={filteredOverdue.length} accent="border-red-400">
          {filteredOverdue.map(inv => {
            const daysOver = Math.ceil((new Date() - new Date(inv.due_date)) / 86400_000)
            return (
              <ItemRow
                key={inv.id}
                number={inv.invoice_number}
                sub={`${inv.rooms?.buildings?.name} · ห้อง ${inv.rooms?.room_number} · ${inv.tenants?.full_name}`}
                tag={
                  <div className="flex items-center gap-1.5">
                    <Tag color="red">฿{Number(inv.total_amount).toLocaleString('th-TH')}</Tag>
                    <Tag color="orange">{daysOver <= 0 ? 'ครบวันนี้' : `เกิน ${daysOver} วัน`}</Tag>
                  </div>
                }
                actionLabel="ดู Invoice"
                onClick={() => navigate(`/invoices/${inv.id}`)}
              />
            )
          })}
        </Section>
      )}

      {filteredExpiring.length > 0 && (
        <Section title="สัญญาใกล้หมด" count={filteredExpiring.length} accent="border-red-400">
          {filteredExpiring.map(c => {
            const daysLeft = Math.ceil((new Date(c.contract_end_date) - new Date()) / 86400_000)
            return (
              <ItemRow
                key={c.id}
                number={c.contract_number}
                sub={`${c.rooms?.buildings?.name} · ห้อง ${c.rooms?.room_number} · ${c.tenants?.full_name}`}
                tag={<Tag color="red">อีก {daysLeft} วัน</Tag>}
                actionLabel="ดูสัญญา"
                onClick={() => navigate(`/contracts/${c.id}`)}
              />
            )
          })}
        </Section>
      )}

      {filteredMoveIns.length > 0 && (
        <Section id="section-move-in" title="รอบันทึกเข้าพัก" count={filteredMoveIns.length} accent="border-green-400">
          {filteredMoveIns.map(c => (
            <ItemRow
              key={c.id}
              number={c.contract_number}
              sub={`${c.rooms?.buildings?.name} · ห้อง ${c.rooms?.room_number} · ${c.tenants?.full_name}`}
              tag={<Tag color="green">{c.move_in_date ? `กำหนด ${formatDate(c.move_in_date)}` : 'พร้อมเข้าพัก'}</Tag>}
              actionLabel="บันทึกเข้าพัก"
              onClick={() => navigate(`/contracts/${c.id}`)}
            />
          ))}
        </Section>
      )}

      {filteredPending.length > 0 && (
        <Section title="สัญญารออนุมัติ" count={filteredPending.length} accent="border-purple-400">
          {filteredPending.map(c => (
            <ItemRow
              key={c.id}
              number={c.contract_number}
              sub={`${c.rooms?.buildings?.name} · ห้อง ${c.rooms?.room_number} · ${c.tenants?.full_name}`}
              tag={<Tag color="purple">รอ Executive</Tag>}
              actionLabel="ดูสัญญา"
              onClick={() => navigate(`/contracts/${c.id}`)}
            />
          ))}
        </Section>
      )}

      {filteredBookings.length > 0 && (
        <Section title="Booking รอแปลงสัญญา" count={filteredBookings.length} accent="border-amber-400">
          {filteredBookings.map(b => (
            <ItemRow
              key={b.id}
              number={b.booking_number}
              sub={`${b.rooms?.buildings?.name} · ห้อง ${b.rooms?.room_number} · ${b.tenants?.full_name}`}
              tag={<Tag color="amber">รอแปลง</Tag>}
              actionLabel="ดู Booking"
              onClick={() => navigate(`/bookings/${b.id}`)}
            />
          ))}
        </Section>
      )}

      {hasItems && !hasResults && (
        <p className="mt-8 text-center text-sm text-gray-400">ไม่พบรายการที่ตรงกับ "{search}"</p>
      )}

      {!hasItems && (
        <div className="mt-24 flex flex-col items-center text-center">
          <FileText className="mb-3 h-14 w-14 text-gray-300" />
          <p className="font-medium text-gray-700">ไม่มีงานค้างในขณะนี้</p>
          <p className="mt-1 text-sm text-gray-400">สัญญา booking และใบแจ้งหนี้ทุกรายการเรียบร้อยแล้ว</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, onClick }) {
  const map = {
    amber:  { bg: 'bg-amber-50',  icon: 'text-amber-500',  val: 'text-amber-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500', val: 'text-purple-700' },
    red:    { bg: 'bg-red-50',    icon: 'text-red-500',    val: 'text-red-700' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-500',  val: 'text-green-700' },
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-500',   val: 'text-blue-700' },
    gray:   { bg: 'bg-gray-50',   icon: 'text-gray-400',   val: 'text-gray-700' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-500', val: 'text-orange-700' },
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
      <div className="min-w-0">
        <p className="truncate text-xs leading-tight text-gray-500">{label}</p>
        <p className={`text-2xl font-bold leading-tight ${c.val}`}>{value}</p>
      </div>
    </div>
  )
}

function Section({ id, title, count, accent, children }) {
  return (
    <div id={id} className="mb-6">
      <div className={`mb-3 flex items-center gap-2 border-l-4 pl-3 ${accent}`}>
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <span className="text-xs text-gray-400">{count} รายการ</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function Tag({ color, children }) {
  const map = {
    red:    'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    amber:  'bg-amber-50 text-amber-600',
    orange: 'bg-orange-50 text-orange-600',
    green:  'bg-green-50 text-green-600',
  }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${map[color]}`}>
      {children}
    </span>
  )
}

function ItemRow({ number, sub, tag, actionLabel, onClick }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 transition-all hover:shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{number}</p>
        <p className="truncate text-xs text-gray-500">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {tag}
        <Button size="sm" variant="secondary" onClick={onClick}>{actionLabel}</Button>
      </div>
    </div>
  )
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}
