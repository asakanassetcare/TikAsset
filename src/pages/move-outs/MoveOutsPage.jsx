import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Badge from '../../components/ui/Badge'
import Select from '../../components/ui/Select'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'
import { LogOut } from 'lucide-react'

const STATUS_OPTS_ACTIVE = [
  { value: '',                   label: 'ทุกสถานะ' },
  { value: 'draft',              label: 'รอกรอกข้อมูล' },
  { value: 'pending_accounting', label: 'รออนุมัติ' },
  { value: 'approved',           label: 'รอบัญชี' },
]

export default function MoveOutsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [moveOuts,     setMoveOuts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState(location.state?.filterStatus ?? '')
  const [activeTab,    setActiveTab]    = useState('active')

  useEffect(() => { fetchMoveOuts() }, [])

  async function fetchMoveOuts() {
    const { data } = await supabase
      .from('move_outs')
      .select(`
        id, move_out_number, move_out_date, status, deposit_amount,
        refund_amount, additional_charge, settlement_deadline, is_early_termination,
        tenants(full_name),
        rooms(room_number, buildings(name)),
        contracts(contract_number),
        settlements(direction, status, amount, accounting_slip_url, slip_url)
      `)
      .order('created_at', { ascending: false })
    setMoveOuts(data ?? [])
    setLoading(false)
  }

  const byTab = moveOuts.filter(mo =>
    activeTab === 'settled' ? mo.status === 'settled' : mo.status !== 'settled'
  )

  const filtered = byTab.filter(mo => {
    if (filterStatus && mo.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        mo.move_out_number?.toLowerCase().includes(q) ||
        mo.tenants?.full_name?.toLowerCase().includes(q) ||
        mo.rooms?.room_number?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const pendingCount = moveOuts.filter(mo => ['draft','pending_accounting'].includes(mo.status)).length
  const settledCount = moveOuts.filter(mo => mo.status === 'settled').length

  function settlementBadge(mo) {
    if (mo.status !== 'approved') return <Badge variant={mo.status} />
    const s = mo.settlements
    if (!s) return <Badge variant="approved" />
    const pill = (label, cls) => (
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
    )
    if (s.status === 'pending' && s.direction === 'refund_to_tenant')
      return pill(Number(s.amount) === 0 ? 'รอบัญชียืนยัน' : 'รอทำจ่าย', 'bg-blue-100 text-blue-700')
    if (s.status === 'processing')
      return pill('บัญชีกำลังโอนเงิน', 'bg-indigo-100 text-indigo-700')
    if (s.status === 'pending' && s.direction === 'charge_from_tenant')
      return pill('ติดตามหนี้', 'bg-red-100 text-red-700')
    if (s.status === 'paid_by_staff')
      return pill('รอบัญชียืนยัน', 'bg-amber-100 text-amber-700')
    return <Badge variant="approved" />
  }

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ย้ายออก</h1>
          <p className="mt-1 text-sm text-gray-500">{filtered.length} รายการ</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex border-b border-gray-200">
        {[
          { key: 'active',  label: 'ระหว่างดำเนินการ', count: pendingCount },
          { key: 'settled', label: 'สำเร็จ',           count: settledCount },
        ].map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setFilterStatus('') }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                activeTab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลข เจ้าของ หรือห้อง..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"><X className="h-3.5 w-3.5" /></button>}
        </div>
        {activeTab === 'active' && (
          <Select options={STATUS_OPTS_ACTIVE} value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-44" />
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={LogOut} title={activeTab === 'settled' ? 'ยังไม่มีรายการที่เสร็จสิ้น' : 'ไม่มีรายการย้ายออก'} />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(mo => (
            <div
              key={mo.id}
              onClick={() => navigate(`/move-outs/${mo.id}`)}
              className="cursor-pointer rounded-xl border border-gray-100 bg-white px-4 py-3.5 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {mo.move_out_number}
                    {mo.is_early_termination && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">ก่อนกำหนด</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {mo.rooms?.buildings?.name} ห้อง {mo.rooms?.room_number} · {mo.tenants?.full_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    ย้ายออก {formatThaiDate(mo.move_out_date)}
                    {mo.settlement_deadline ? ` · ครบ ${formatThaiDate(mo.settlement_deadline)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    {mo.refund_amount > 0 && (
                      <p className="text-sm font-bold text-green-600">คืน ฿{Number(mo.refund_amount).toLocaleString('th-TH')}</p>
                    )}
                    {mo.additional_charge > 0 && (
                      <p className="text-sm font-bold text-red-600">หัก ฿{Number(mo.additional_charge).toLocaleString('th-TH')}</p>
                    )}
                    {!mo.refund_amount && !mo.additional_charge && (
                      <p className="text-sm text-gray-400">฿0</p>
                    )}
                  </div>
                  {mo.status === 'settled' && (() => {
                    const slipPath = mo.settlements?.accounting_slip_url || mo.settlements?.slip_url
                    return slipPath ? (
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          const { data } = await supabase.storage.from('payment-slips').createSignedUrl(slipPath, 3600)
                          if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                        }}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        ดูสลิป
                      </button>
                    ) : null
                  })()}
                  {settlementBadge(mo)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
