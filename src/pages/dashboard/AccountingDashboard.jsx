import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, AlertCircle, Timer, Search, X, TrendingUp, Clock, FileInput, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'

export default function AccountingDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  const [pendingPayments,  setPendingPayments]  = useState([])
  const [overdueInvoices,  setOverdueInvoices]  = useState([])
  const [pendingSettlements, setPendingSettlements] = useState([])
  const [unrecordedPayments,  setUnrecordedPayments]  = useState(0)
  const [moveOutsToRecord,    setMoveOutsToRecord]    = useState(0)
  const [incomeThisMonth,  setIncomeThisMonth]  = useState(0)
  const [pendingIncome,    setPendingIncome]    = useState(0)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const now    = new Date()
    const today  = now.toISOString().slice(0, 10)
    const overdueCutoff = new Date(now.getTime() - 5 * 86400_000).toISOString().slice(0, 10)
    const month0 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const month1 = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)

    const [payments, overdue, settlements, income, pending, unrecorded, draftMO] = await Promise.all([
      supabase.from('payments').select(`
        id, amount, paid_date,
        invoices(invoice_number, rooms(room_number, buildings(name)), tenants(full_name))
      `).eq('status', 'pending_approve').not('head_approved_at', 'is', null).order('created_at', { ascending: true }),

      supabase.from('invoices').select(`
        id, invoice_number, total_amount, due_date,
        rooms(room_number, buildings(name)), tenants(full_name)
      `).or(`status.eq.overdue,and(status.eq.pending,due_date.lte.${overdueCutoff})`).order('due_date').limit(10),

      supabase.from('settlements').select(`
        id, amount, direction, status, head_approved_at,
        move_outs(id, move_out_number, settlement_deadline, rooms(room_number, buildings(name)), tenants(full_name))
      `).in('status', ['pending', 'processing', 'paid_by_staff']).order('created_at', { ascending: true }),

      supabase.from('payments').select('amount')
        .eq('status', 'approved')
        .gte('paid_date', month0).lt('paid_date', month1),

      supabase.from('invoices').select('total_amount')
        .in('status', ['pending', 'overdue']),

      supabase.from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .is('accounting_recorded_at', null),

      supabase.from('settlements')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paid_by_staff')
        .not('head_approved_at', 'is', null),
    ])

    setPendingPayments(payments.data ?? [])
    setOverdueInvoices(overdue.data ?? [])
    setPendingSettlements((settlements.data ?? []).filter(s =>
      s.status === 'pending' ||
      s.status === 'processing' ||
      (s.status === 'paid_by_staff' && s.head_approved_at)
    ))
    setUnrecordedPayments(unrecorded.count ?? 0)
    setMoveOutsToRecord(draftMO.count ?? 0)
    setIncomeThisMonth((income.data ?? []).reduce((s, p) => s + Number(p.amount), 0))
    setPendingIncome((pending.data ?? []).reduce((s, i) => s + Number(i.total_amount), 0))
    setLoading(false)
  }

  if (loading) return <PageSpinner />

  function filterItems(items, keys) {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(i => keys.some(fn => fn(i)?.toLowerCase().includes(q)))
  }

  const filteredPayments    = filterItems(pendingPayments,  [
    i => i.invoices?.invoice_number,
    i => i.invoices?.rooms?.room_number,
    i => i.invoices?.tenants?.full_name,
  ])
  const filteredOverdue     = filterItems(overdueInvoices, [
    i => i.invoice_number,
    i => i.rooms?.room_number,
    i => i.tenants?.full_name,
  ])
  const filteredSettlements = filterItems(pendingSettlements, [
    i => i.move_outs?.move_out_number,
    i => i.move_outs?.rooms?.room_number,
    i => i.move_outs?.tenants?.full_name,
  ])

  const hasItems   = pendingPayments.length > 0 || overdueInvoices.length > 0 || pendingSettlements.length > 0
  const hasResults = filteredPayments.length > 0 || filteredOverdue.length > 0 || filteredSettlements.length > 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">สวัสดี, {profile?.full_name}</h1>
        <p className="mt-1 text-sm text-gray-500">งานของคุณวันนี้</p>
      </div>

      {/* Income summary */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-green-50 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <p className="text-xs text-gray-500">รับแล้วเดือนนี้</p>
          </div>
          <p className="text-2xl font-bold text-green-700">
            ฿{incomeThisMonth.toLocaleString('th-TH')}
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <p className="text-xs text-gray-500">รอรับ (pending + overdue)</p>
          </div>
          <p className="text-2xl font-bold text-amber-700">
            ฿{pendingIncome.toLocaleString('th-TH')}
          </p>
        </div>
      </div>

      {/* รอบันทึก */}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">รอบันทึก</p>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard icon={FileInput}     label="Payment รอบันทึก"   value={unrecordedPayments} color="blue"
          onClick={() => navigate('/payments', { state: { section: 'payments',  tab: 'pending' } })} />
        <StatCard icon={ClipboardList} label="Move-out รอบันทึก"  value={moveOutsToRecord}   color="indigo"
          onClick={() => navigate('/payments', { state: { section: 'move_outs', tab: 'pending' } })} />
      </div>

      {/* รออนุมัติ */}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">รออนุมัติ</p>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={CreditCard}  label="Payment รออนุมัติ"   value={pendingPayments.length}    color="amber"
          onClick={() => navigate('/payments')} />
        <StatCard icon={AlertCircle} label="Invoice ค้างชำระ"    value={overdueInvoices.length}    color="red"
          onClick={() => navigate('/invoices',  { state: { filterStatus: 'overdue' } })} />
        <StatCard icon={Timer}       label="Settlement ค้าง"     value={pendingSettlements.length} color="purple"
          onClick={() => navigate('/move-outs')} />
      </div>

      {/* Search */}
      {hasItems && (
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลข invoice, payment, ห้อง, หรือชื่อผู้เช่า..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Payment slip pending */}
      {filteredPayments.length > 0 && (
        <Section title="Payment รออนุมัติ" count={filteredPayments.length} accent="border-amber-400">
          {filteredPayments.map(p => (
            <ItemRow
              key={p.id}
              number={p.invoices?.invoice_number ?? '-'}
              sub={`${p.invoices?.rooms?.buildings?.name} · ห้อง ${p.invoices?.rooms?.room_number} · ${p.invoices?.tenants?.full_name}`}
              tag={<Tag color="amber">฿{Number(p.amount).toLocaleString('th-TH')}</Tag>}
              actionLabel="อนุมัติ"
              onClick={() => navigate('/payments')}
            />
          ))}
        </Section>
      )}

      {/* Overdue invoices */}
      {filteredOverdue.length > 0 && (
        <Section title="Invoice ค้างชำระ" count={filteredOverdue.length} accent="border-red-400">
          {filteredOverdue.map(inv => {
            const daysOver = Math.ceil((new Date() - new Date(inv.due_date)) / 86400_000)
            return (
              <ItemRow
                key={inv.id}
                number={inv.invoice_number}
                sub={`${inv.rooms?.buildings?.name} · ห้อง ${inv.rooms?.room_number} · ${inv.tenants?.full_name}`}
                tag={<Tag color="red">เกิน {daysOver} วัน</Tag>}
                actionLabel="ดู Invoice"
                onClick={() => navigate(`/invoices/${inv.id}`)}
              />
            )
          })}
        </Section>
      )}

      {/* Settlements: refund to tenant */}
      {filteredSettlements.filter(s => s.direction === 'refund_to_tenant').length > 0 && (
        <Section title="รอโอนเงินคืนผู้เช่า" count={filteredSettlements.filter(s => s.direction === 'refund_to_tenant').length} accent="border-blue-400">
          {filteredSettlements.filter(s => s.direction === 'refund_to_tenant').map(s => {
            const mo = s.move_outs
            const deadline = mo?.settlement_deadline
            const daysLeft = deadline ? Math.ceil((new Date(deadline) - new Date()) / 86400_000) : null
            const tagColor = daysLeft != null && daysLeft <= 3 ? 'red' : 'purple'
            return (
              <ItemRow
                key={s.id}
                number={mo?.move_out_number ?? '-'}
                sub={`${mo?.rooms?.buildings?.name} · ห้อง ${mo?.rooms?.room_number} · ${mo?.tenants?.full_name}`}
                tag={
                  daysLeft != null
                    ? <Tag color={tagColor}>{daysLeft >= 0 ? `ครบใน ${daysLeft} วัน` : `เกิน ${Math.abs(daysLeft)} วัน`}</Tag>
                    : <Tag color="purple">฿{Number(s.amount).toLocaleString('th-TH')}</Tag>
                }
                actionLabel="โอนเงิน"
                onClick={() => navigate(`/move-outs/${mo?.id}`)}
              />
            )
          })}
        </Section>
      )}

      {/* Settlements: charge from tenant */}
      {filteredSettlements.filter(s => s.direction === 'charge_from_tenant').length > 0 && (
        <Section title="ติดตามหนี้จากผู้เช่า" count={filteredSettlements.filter(s => s.direction === 'charge_from_tenant').length} accent="border-red-400">
          {filteredSettlements.filter(s => s.direction === 'charge_from_tenant').map(s => {
            const mo = s.move_outs
            const isPaidByStaff = s.status === 'paid_by_staff'
            return (
              <ItemRow
                key={s.id}
                number={mo?.move_out_number ?? '-'}
                sub={`${mo?.rooms?.buildings?.name} · ห้อง ${mo?.rooms?.room_number} · ${mo?.tenants?.full_name}`}
                tag={
                  isPaidByStaff
                    ? <Tag color="orange">Staff รับแล้ว รอยืนยัน</Tag>
                    : <Tag color="red">ติดตามหนี้ ฿{Number(s.amount).toLocaleString('th-TH')}</Tag>
                }
                actionLabel={isPaidByStaff ? 'ยืนยัน' : 'ดูรายละเอียด'}
                onClick={() => navigate(`/move-outs/${mo?.id}`)}
              />
            )
          })}
        </Section>
      )}

      {hasItems && !hasResults && (
        <p className="mt-8 text-center text-sm text-gray-400">ไม่พบรายการที่ตรงกับ "{search}"</p>
      )}

      {!hasItems && (
        <div className="mt-24 flex flex-col items-center text-center">
          <CreditCard className="mb-3 h-14 w-14 text-gray-300" />
          <p className="font-medium text-gray-700">ไม่มีงานค้างในขณะนี้</p>
          <p className="mt-1 text-sm text-gray-400">รายการทางการเงินทุกรายการเรียบร้อยแล้ว</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, onClick }) {
  const map = {
    amber:  { bg: 'bg-amber-50',  icon: 'text-amber-500',  val: 'text-amber-700' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-500', val: 'text-orange-700' },
    red:    { bg: 'bg-red-50',    icon: 'text-red-500',    val: 'text-red-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500', val: 'text-purple-700' },
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-500',   val: 'text-blue-700' },
    indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-500', val: 'text-indigo-700' },
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

function Section({ title, count, accent, children }) {
  return (
    <div className="mb-6">
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
    amber:  'bg-amber-50 text-amber-700',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-100 text-orange-700',
    blue:   'bg-blue-50 text-blue-600',
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
