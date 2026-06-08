import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Select from '../../components/ui/Select'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import ContractFormModal from '../../components/contracts/ContractFormModal'
import { formatThaiDate } from '../../lib/date'
import { FileText } from 'lucide-react'

const STATUS_OPTS = [
  { value: '',               label: 'ทุกสถานะ' },
  { value: 'pending_approve',label: 'รออนุมัติ' },
  { value: 'approved',       label: 'อนุมัติแล้ว' },
  { value: 'active',         label: 'กำลังเช่า' },
  { value: 'expired',        label: 'หมดสัญญา' },
  { value: 'terminated',     label: 'ยกเลิกก่อนกำหนด' },
  { value: 'rejected',       label: 'ถูกปฏิเสธ' },
  { value: 'cancelled',      label: 'ยกเลิก' },
]

export default function ContractsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [contracts, setContracts] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [search,    setSearch]    = useState('')
  const [filterStatus, setFilterStatus] = useState(location.state?.filterStatus ?? '')

  useEffect(() => { fetchContracts() }, [])

  async function fetchContracts() {
    const { data } = await supabase
      .from('contracts')
      .select(`
        id, contract_number, status, contract_start_date, contract_end_date, monthly_rent, created_at,
        rooms(room_number, buildings(name)),
        tenants(full_name),
        profiles!assigned_staff_id(full_name)
      `)
      .order('created_at', { ascending: false })
    setContracts(data ?? [])
    setLoading(false)
  }

  const filtered = contracts.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        c.contract_number?.toLowerCase().includes(q) ||
        c.tenants?.full_name?.toLowerCase().includes(q) ||
        c.rooms?.room_number?.toLowerCase().includes(q) ||
        c.rooms?.buildings?.name?.toLowerCase().includes(q)
      )
    }
    return true
  })

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">สัญญา</h1>
          <p className="mt-1 text-sm text-gray-500">{filtered.length} รายการ</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal(true)}>สร้างสัญญา</Button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขสัญญา ผู้เช่า หรือห้อง..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select options={STATUS_OPTS} value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-44" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="ไม่มีสัญญา" action={<Button onClick={() => setModal(true)} icon={<Plus className="h-4 w-4" />}>สร้างสัญญา</Button>} />
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          {filtered.map((c, i) => (
            <div
              key={c.id}
              onClick={() => navigate(`/contracts/${c.id}`)}
              className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{c.contract_number}</p>
                <p className="text-xs text-gray-500">
                  {c.rooms?.buildings?.name} · ห้อง {c.rooms?.room_number}
                  {' · '}{c.tenants?.full_name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatThaiDate(c.contract_start_date)} – {formatThaiDate(c.contract_end_date)}
                  {c.profiles?.full_name ? ` · ${c.profiles.full_name}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 hidden sm:block">
                  ฿{Number(c.monthly_rent).toLocaleString('th-TH')}/เดือน
                </span>
                <Badge variant={c.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      <ContractFormModal
        open={modal}
        onClose={() => setModal(false)}
        onSaved={(id) => { setModal(false); if (id) navigate(`/contracts/${id}`); else fetchContracts() }}
      />
    </div>
  )
}
