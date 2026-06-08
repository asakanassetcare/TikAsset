import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DoorOpen, DoorClosed, FileText, AlertCircle, BookOpen,
  TrendingUp, CheckCircle, Wrench, ArrowLeftRight, Timer, CalendarClock,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { supabase } from '../lib/supabase'
import { formatThaiDate } from '../lib/date'

function StatCard({ icon: Icon, label, value, color = 'blue', loading, onClick }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600' },
    green:  { bg: 'bg-green-50',  text: 'text-green-600' },
    red:    { bg: 'bg-red-50',    text: 'text-red-600' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
    gray:   { bg: 'bg-gray-50',   text: 'text-gray-500' },
  }
  const { bg, text } = colorMap[color] ?? colorMap.blue

  return (
    <Card
      onClick={onClick}
      className={`flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-all' : ''}`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg}`}>
        <Icon className={`h-5 w-5 ${text}`} />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-semibold text-gray-900">
          {loading ? <span className="inline-block h-5 w-12 animate-pulse rounded bg-gray-100" /> : value}
        </p>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats,            setStats]            = useState(null)
  const [loading,          setLoading]          = useState(true)
  const [expiringContracts, setExpiringContracts] = useState([])
  const [overdueInvoices,   setOverdueInvoices]   = useState([])
  const [recentPayments,    setRecentPayments]    = useState([])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    try {
      const now     = new Date()
      const today   = now.toISOString().slice(0, 10)
      const overdueCutoff = new Date(now.getTime() - 5 * 86400_000).toISOString().slice(0, 10)
      const month0  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const month1  = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
      const in30    = new Date(now.getTime() + 30 * 86400_000).toISOString().slice(0, 10)

      const [
        rooms, contracts, invoices, payments, bookings,
        maintenance, transfers, settlements, expiring,
        thisMonthIncome, overdueList, recentPmts,
      ] = await Promise.all([
        supabase.from('rooms').select('id, status', { count: 'exact' }),
        supabase.from('contracts').select('id').eq('status', 'pending_approve'),
        supabase.from('invoices').select('id').or(`status.eq.overdue,and(status.eq.pending,due_date.lte.${overdueCutoff})`),
        supabase.from('payments').select('id').eq('status', 'pending_approve'),
        supabase.from('bookings').select('id').eq('status', 'waiting'),
        supabase.from('maintenance_requests').select('id').in('status', ['reported', 'in_progress']),
        supabase.from('owner_transfers').select('id').neq('status', 'confirmed'),
        supabase.from('settlements').select('id').in('status', ['pending', 'paid_by_staff']),
        supabase.from('contracts').select(`
          id, contract_number, contract_end_date,
          rooms(room_number, buildings(name)), tenants(full_name)
        `).eq('status', 'active').lte('contract_end_date', in30).order('contract_end_date'),
        supabase.from('payments').select('amount').eq('status', 'approved')
          .gte('paid_date', month0).lt('paid_date', month1),
        supabase.from('invoices').select(`
          id, invoice_number, total_amount, due_date,
          rooms(room_number, buildings(name)), tenants(full_name)
        `).or(`status.eq.overdue,and(status.eq.pending,due_date.lte.${overdueCutoff})`).order('due_date').limit(5),
        supabase.from('payments').select(`
          id, amount, paid_date, status,
          invoices(invoice_number, rooms(room_number, buildings(name)), tenants(full_name))
        `).eq('status', 'pending_approve').order('created_at', { ascending: false }).limit(5),
      ])

      const totalRooms     = rooms.data?.length ?? 0
      const availableRooms = rooms.data?.filter(r => r.status === 'available').length ?? 0
      const incomeSum      = (thisMonthIncome.data ?? []).reduce((s, p) => s + Number(p.amount), 0)

      setStats({
        totalRooms,
        availableRooms,
        pendingContracts:   contracts.data?.length    ?? 0,
        overdueInvoices:    invoices.data?.length     ?? 0,
        pendingPayments:    payments.data?.length     ?? 0,
        waitingBookings:    bookings.data?.length     ?? 0,
        pendingMaintenance: maintenance.data?.length  ?? 0,
        pendingTransfers:   transfers.data?.length    ?? 0,
        pendingSettlements: settlements.data?.length  ?? 0,
        incomeThisMonth:    incomeSum,
        expiringCount:      expiring.data?.length     ?? 0,
      })
      setExpiringContracts(expiring.data   ?? [])
      setOverdueInvoices(overdueList.data  ?? [])
      setRecentPayments(recentPmts.data    ?? [])
    } catch {
      // graceful degradation before migration
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">ภาพรวมระบบบริหารคอนโด</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard icon={DoorOpen}       label="ห้องทั้งหมด"              value={stats?.totalRooms}          color="blue"   loading={loading}
          onClick={() => navigate('/rooms')} />
        <StatCard icon={DoorClosed}     label="ห้องว่าง"                  value={stats?.availableRooms}      color="green"  loading={loading}
          onClick={() => navigate('/rooms', { state: { filterStatus: 'available' } })} />
        <StatCard icon={TrendingUp}     label="รายได้เดือนนี้"            value={`฿${(stats?.incomeThisMonth ?? 0).toLocaleString('th-TH')}`} color="green" loading={loading}
          onClick={() => navigate('/reports')} />
        <StatCard icon={CalendarClock}  label="สัญญาใกล้ครบ (30 วัน)"   value={stats?.expiringCount}       color="amber"  loading={loading}
          onClick={() => navigate('/contracts')} />
        <StatCard icon={BookOpen}       label="จองล่วงหน้า"               value={stats?.waitingBookings}     color="amber"  loading={loading}
          onClick={() => navigate('/bookings')} />
        <StatCard icon={FileText}       label="สัญญารออนุมัติ"             value={stats?.pendingContracts}    color="purple" loading={loading}
          onClick={() => navigate('/contracts')} />
        <StatCard icon={AlertCircle}    label="ค้างชำระ"                   value={stats?.overdueInvoices}     color="red"    loading={loading}
          onClick={() => navigate('/invoices')} />
        <StatCard icon={CheckCircle}    label="รอบัญชียืนยันรับเงิน"      value={stats?.pendingPayments}     color="amber"  loading={loading}
          onClick={() => navigate('/payments')} />
        <StatCard icon={Wrench}         label="งานซ่อมค้าง"                value={stats?.pendingMaintenance}  color="gray"   loading={loading}
          onClick={() => navigate('/maintenance')} />
        <StatCard icon={ArrowLeftRight} label="โอนเจ้าของรอยืนยัน"        value={stats?.pendingTransfers}    color="blue"   loading={loading}
          onClick={() => navigate('/owner-transfers')} />
        <StatCard icon={Timer}          label="Settlement รอดำเนินการ"    value={stats?.pendingSettlements}  color="amber"  loading={loading}
          onClick={() => navigate('/move-outs')} />
      </div>

      {/* Detail lists */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Expiring contracts */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">สัญญาใกล้ครบ (30 วัน)</p>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />)}
            </div>
          ) : expiringContracts.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">ไม่มี</p>
          ) : (
            <div className="space-y-2">
              {expiringContracts.map(c => (
                <div key={c.id} onClick={() => navigate(`/contracts/${c.id}`)}
                  className="flex items-start justify-between cursor-pointer rounded-lg px-3 py-2 hover:bg-gray-50">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{c.contract_number}</p>
                    <p className="text-xs text-gray-500">{c.rooms?.buildings?.name} ห้อง {c.rooms?.room_number} · {c.tenants?.full_name}</p>
                  </div>
                  <span className="text-xs text-amber-600 font-medium shrink-0 ml-2">{formatThaiDate(c.contract_end_date)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Overdue invoices */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ค้างชำระ (ล่าสุด)</p>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />)}
            </div>
          ) : overdueInvoices.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">ไม่มี</p>
          ) : (
            <div className="space-y-2">
              {overdueInvoices.map(inv => (
                <div key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="flex items-start justify-between cursor-pointer rounded-lg px-3 py-2 hover:bg-gray-50">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{inv.invoice_number}</p>
                    <p className="text-xs text-gray-500">{inv.rooms?.buildings?.name} ห้อง {inv.rooms?.room_number} · {inv.tenants?.full_name}</p>
                  </div>
                  <span className="text-xs text-red-600 font-medium shrink-0 ml-2">฿{Number(inv.total_amount).toLocaleString('th-TH')}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Pending payments */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">รอยืนยันการชำระ</p>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />)}
            </div>
          ) : recentPayments.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">ไม่มี</p>
          ) : (
            <div className="space-y-2">
              {recentPayments.map(pmt => (
                <div key={pmt.id} onClick={() => navigate(`/invoices/${pmt.invoices?.id}`)}
                  className="flex items-start justify-between cursor-pointer rounded-lg px-3 py-2 hover:bg-gray-50">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{pmt.invoices?.invoice_number}</p>
                    <p className="text-xs text-gray-500">
                      {pmt.invoices?.rooms?.buildings?.name} ห้อง {pmt.invoices?.rooms?.room_number}
                      {' · '}{pmt.invoices?.tenants?.full_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-xs font-medium text-gray-900">฿{Number(pmt.amount).toLocaleString('th-TH')}</span>
                    <Badge variant={pmt.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
