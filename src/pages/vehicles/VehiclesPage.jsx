import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import Select from '../../components/ui/Select'
import { PageSpinner } from '../../components/ui/Spinner'

const STATUS_OPTS = [
  { value: 'active', label: 'เฉพาะ active' },
  { value: 'all',    label: 'รวม inactive' },
]

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([])
  const [contractsByTenant, setContractsByTenant] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  useEffect(() => { fetchVehicles() }, [])

  async function fetchVehicles() {
    setLoading(true)
    const { data: vehicleRows } = await supabase
      .from('tenant_vehicles')
      .select('id, tenant_id, plate_number, note, created_at, tenants(id, full_name, phone)')
      .order('plate_number')

    const rows = vehicleRows ?? []
    setVehicles(rows)

    const tenantIds = [...new Set(rows.map(v => v.tenant_id).filter(Boolean))]
    if (tenantIds.length > 0) {
      const { data: contracts } = await supabase
        .from('contracts')
        .select(`
          id, contract_number, tenant_id, status, contract_start_date, contract_end_date,
          rooms(id, room_number, buildings(name))
        `)
        .in('tenant_id', tenantIds)
        .order('created_at', { ascending: false })

      const map = {}
      for (const contract of contracts ?? []) {
        const existing = map[contract.tenant_id]
        if (!existing || contract.status === 'active') {
          map[contract.tenant_id] = contract
        }
      }
      setContractsByTenant(map)
    } else {
      setContractsByTenant({})
    }

    setLoading(false)
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()

    return vehicles
      .map(vehicle => {
        const contract = contractsByTenant[vehicle.tenant_id] ?? null
        const isActive = contract?.status === 'active'
        return { ...vehicle, contract, isActive }
      })
      .filter(vehicle => statusFilter === 'all' || vehicle.isActive)
      .filter(vehicle => {
        if (!q) return true
        return (
          vehicle.plate_number?.toLowerCase().includes(q) ||
          vehicle.tenants?.full_name?.toLowerCase().includes(q) ||
          vehicle.tenants?.phone?.includes(q) ||
          vehicle.contract?.contract_number?.toLowerCase().includes(q) ||
          vehicle.contract?.rooms?.room_number?.toLowerCase().includes(q) ||
          vehicle.contract?.rooms?.buildings?.name?.toLowerCase().includes(q)
        )
      })
  }, [vehicles, contractsByTenant, search, statusFilter])

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">รถยนต์</h1>
          <p className="mt-1 text-sm text-gray-500">
            {rows.length} รายการ{statusFilter === 'active' ? ' active' : ' ทั้งหมด'}
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาทะเบียน ผู้เช่า เบอร์โทร ห้อง หรือสัญญา..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select
          options={STATUS_OPTS}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="w-44"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Car}
          title={statusFilter === 'active' ? 'ไม่มีรถยนต์ของผู้เช่า active' : 'ไม่มีข้อมูลรถยนต์'}
          description="เพิ่มทะเบียนรถได้จากหน้ารายละเอียดผู้เช่า"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
          <div className="grid grid-cols-[1.1fr_1.4fr_1.4fr_0.8fr] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-500 max-lg:hidden">
            <span>ทะเบียน</span>
            <span>ผู้เช่า</span>
            <span>ห้อง / สัญญา</span>
            <span className="text-right">สถานะ</span>
          </div>

          {rows.map((vehicle, index) => {
            const contract = vehicle.contract
            const room = contract?.rooms
            return (
              <div
                key={vehicle.id}
                className={`grid grid-cols-[1.1fr_1.4fr_1.4fr_0.8fr] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-gray-50 max-lg:grid-cols-1 max-lg:gap-2 ${index > 0 ? 'border-t border-gray-50' : ''}`}
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-gray-900">{vehicle.plate_number}</p>
                  {vehicle.note && <p className="mt-0.5 text-xs text-gray-400">{vehicle.note}</p>}
                </div>

                <div>
                  <Link to={`/tenants/${vehicle.tenant_id}`} className="text-sm font-medium text-blue-700 hover:underline">
                    {vehicle.tenants?.full_name ?? 'ไม่พบผู้เช่า'}
                  </Link>
                  {vehicle.tenants?.phone && <p className="mt-0.5 text-xs text-gray-500">{vehicle.tenants.phone}</p>}
                </div>

                <div>
                  {contract ? (
                    <>
                      <p className="text-sm text-gray-800">
                        {room?.buildings?.name ?? '-'} ห้อง {room?.room_number ?? '-'}
                      </p>
                      <Link to={`/contracts/${contract.id}`} className="mt-0.5 inline-block text-xs text-blue-600 hover:underline">
                        {contract.contract_number}
                      </Link>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">ไม่มีสัญญาในระบบ</p>
                  )}
                </div>

                <div className="flex justify-end max-lg:justify-start">
                  <Badge variant={vehicle.isActive ? 'active' : 'default'} label={vehicle.isActive ? 'active' : 'inactive'} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
