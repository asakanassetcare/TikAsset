import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Badge from '../../components/ui/Badge'
import Select from '../../components/ui/Select'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'
import { Receipt } from 'lucide-react'

const STATUS_OPTS = [
  { value: '',                    label: 'ทุกสถานะ' },
  { value: 'pending',             label: 'รอชำระ' },
  { value: 'overdue',             label: 'เกินกำหนด' },
  { value: 'paid_pending_approve',label: 'รอยืนยัน' },
  { value: 'paid',                label: 'ชำระแล้ว' },
  { value: 'cancelled',           label: 'ยกเลิก' },
]

const TYPE_OPTS = [
  { value: '',                 label: 'ทุกประเภท' },
  { value: 'contract_initial', label: 'ประกัน+ล่วงหน้า' },
  { value: 'monthly_rent',     label: 'ค่าเช่ารายเดือน' },
  { value: 'addon',            label: 'ค่าบริการเสริม' },
  { value: 'final_settlement', label: 'เคลียร์ Move-out' },
  { value: 'other',            label: 'อื่นๆ' },
]

const TYPE_LABEL = {
  contract_initial: 'ประกัน+ล่วงหน้า',
  monthly_rent:     'ค่าเช่ารายเดือน',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินจอง',
  other:            'อื่นๆ',
}

export default function InvoicesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [invoices,     setInvoices]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState(location.state?.filterStatus ?? '')
  const [filterType,   setFilterType]   = useState('')

  useEffect(() => { fetchInvoices() }, [])

  async function fetchInvoices() {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, billing_period, total_amount, status, due_date, issue_date, rooms(room_number, buildings(name)), tenants(full_name)')
      .order('created_at', { ascending: false })
      .limit(200)
    setInvoices(data ?? [])
    setLoading(false)
  }

  const filtered = invoices.filter(inv => {
    if (filterStatus && inv.status !== filterStatus) return false
    if (filterType   && inv.invoice_type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.tenants?.full_name?.toLowerCase().includes(q) ||
        inv.rooms?.room_number?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const STATUS_COLOR = {
    pending:              'border-l-gray-300',
    overdue:              'border-l-red-400',
    paid_pending_approve: 'border-l-yellow-400',
    paid:                 'border-l-green-400',
    cancelled:            'border-l-gray-200',
    rejected:             'border-l-red-300',
  }

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ใบแจ้งหนี้</h1>
          <p className="mt-1 text-sm text-gray-500">{filtered.length} รายการ</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขใบแจ้งหนี้ ผู้เช่า หรือห้อง..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <Select options={STATUS_OPTS} value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-40" />
        <Select options={TYPE_OPTS}   value={filterType}   onChange={e => setFilterType(e.target.value)}   className="w-44" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Receipt} title="ไม่มีใบแจ้งหนี้" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(inv => (
            <div
              key={inv.id}
              onClick={() => navigate(`/invoices/${inv.id}`)}
              className={`flex items-center justify-between rounded-xl border border-gray-100 border-l-4 bg-white px-4 py-3.5 cursor-pointer hover:shadow-md transition-all ${STATUS_COLOR[inv.status] ?? 'border-l-gray-200'}`}
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{inv.invoice_number}</p>
                <p className="text-xs text-gray-500">
                  {inv.rooms?.buildings?.name} · ห้อง {inv.rooms?.room_number}
                  {' · '}{inv.tenants?.full_name}
                </p>
                <p className="text-xs text-gray-400">
                  {TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}
                  {inv.billing_period ? ` · ${inv.billing_period}` : ''}
                  {' · ครบ '}{formatThaiDate(inv.due_date)}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-semibold text-gray-900">฿{Number(inv.total_amount).toLocaleString('th-TH')}</span>
                <Badge variant={inv.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
