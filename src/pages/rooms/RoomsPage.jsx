import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, X, Settings2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Select from '../../components/ui/Select'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'
import { DoorOpen } from 'lucide-react'
import { formatThaiDate } from '../../lib/date'

const STATUS_OPTS = [
  { value: '',            label: 'ทุกสถานะ' },
  { value: 'available',   label: 'ว่าง' },
  { value: 'occupied',    label: 'มีผู้เช่า' },
  { value: 'reserved',    label: 'จองแล้ว' },
  { value: 'maintenance', label: 'ซ่อมบำรุง' },
  { value: 'blocked',     label: 'ปิดใช้งาน' },
]
const OWNERSHIP_OPTS = [
  { value: '',        label: 'ทุกประเภท' },
  { value: 'owned',   label: 'ของบริษัท' },
  { value: 'managed', label: 'ฝากบริหาร' },
]

const STATUS_CHIP = [
  { key: 'available',   label: 'ว่าง',      dot: 'bg-green-500',  chip: 'bg-green-100 text-green-700' },
  { key: 'occupied',    label: 'มีผู้เช่า', dot: 'bg-blue-500',   chip: 'bg-blue-100 text-blue-700' },
  { key: 'reserved',    label: 'จองแล้ว',   dot: 'bg-orange-500', chip: 'bg-orange-100 text-orange-700' },
  { key: 'maintenance', label: 'ซ่อมบำรุง', dot: 'bg-yellow-500', chip: 'bg-yellow-100 text-yellow-700' },
]

function localDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export default function RoomsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [rooms,     setRooms]     = useState([])
  const [buildings, setBuildings] = useState([])
  const [projects,  setProjects]  = useState([])
  const [roomTypes, setRoomTypes] = useState([])
  const [loading,   setLoading]   = useState(true)

  const [search,          setSearch]          = useState('')
  const [filterProject,   setFilterProject]   = useState('')
  const [filterBuilding,  setFilterBuilding]  = useState('')
  const [filterStatus,    setFilterStatus]    = useState(location.state?.filterStatus ?? '')
  const [filterOwnership, setFilterOwnership] = useState('')
  const [filterRoomType,  setFilterRoomType]  = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: rms }, { data: blds }, { data: prjs }, { data: rts }] = await Promise.all([
      supabase.from('rooms').select(
        '*, room_types(name), owners(full_name), buildings(id, name, project_id, projects(id, name))'
      ),
      supabase.from('buildings').select('id, name, project_id').order('name'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('room_types').select('id, name').order('name'),
    ])

    const roomList = (rms ?? []).filter(r => r.is_rentable !== false)
    const roomIds  = roomList.map(r => r.id)

    // Current tenant comes from the current contract. Approved contracts reserve
    // the room until move-in; active contracts mean the tenant has moved in.
    let contractTenantMap = {}
    let contractRentMap = {}
    let currentContractMap = {}
    let currentContracts = []
    if (roomIds.length > 0) {
      const { data: cts } = await supabase
        .from('contracts')
        .select('id, room_id, status, monthly_rent, checklist_in_url, tenants(id, full_name, phone, line_user_id)')
        .in('room_id', roomIds)
        .in('status', ['pending_approve', 'approved', 'active'])
        .is('actual_move_out_at', null)
        .order('created_at', { ascending: false })

      currentContracts = cts ?? []
      for (const ct of currentContracts) {
        if (ct.room_id && !currentContractMap[ct.room_id]) currentContractMap[ct.room_id] = ct
        if (ct.room_id && ct.tenants) contractTenantMap[ct.room_id] = ct.tenants
        if (ct.room_id) contractRentMap[ct.room_id] = ct.monthly_rent
      }

      // doc completeness check
      const tenantIds   = currentContracts.map(ct => ct.tenants?.id).filter(Boolean)
      const contractIds = currentContracts.map(ct => ct.id).filter(Boolean)

      const [{ data: idCardDocs }, { data: contractPdfDocs }] = await Promise.all([
        tenantIds.length > 0
          ? supabase.from('documents').select('ref_id')
              .eq('ref_table', 'tenants')
              .in('doc_type', ['id_card_front', 'id_card_back'])
              .in('ref_id', tenantIds)
          : Promise.resolve({ data: [] }),
        contractIds.length > 0
          ? supabase.from('documents').select('ref_id')
              .eq('ref_table', 'contracts')
              .eq('doc_type', 'contract_pdf')
              .in('ref_id', contractIds)
          : Promise.resolve({ data: [] }),
      ])

      const tenantHasIdCard  = new Set((idCardDocs ?? []).map(d => d.ref_id))
      const contractHasPdf   = new Set((contractPdfDocs ?? []).map(d => d.ref_id))

      for (const ct of currentContracts) {
        if (!ct.room_id) continue
        const incomplete =
          !tenantHasIdCard.has(ct.tenants?.id) ||
          !contractHasPdf.has(ct.id) ||
          !ct.checklist_in_url ||
          !ct.tenants?.line_user_id
        if (incomplete) contractTenantMap[ct.room_id + '__docIncomplete'] = true
      }
    }

    // Active move-outs. A settled future move-out still needs to be shown.
    const todayStr = localDateString()
    const activeContractIds = currentContracts.filter(ct => ct.status === 'active').map(ct => ct.id)
    const { data: moveOuts } = activeContractIds.length > 0
      ? await supabase
        .from('move_outs')
        .select('id, move_out_date, status, room_id, contract_id')
        .in('contract_id', activeContractIds)
        .in('status', ['draft', 'pending_accounting', 'approved', 'settled'])
      : { data: [] }

    const moveOutByRoom = {}
    for (const mo of moveOuts ?? []) {
      if (mo.status === 'settled' && mo.move_out_date <= todayStr) continue
      if (mo.room_id && !moveOutByRoom[mo.room_id]) moveOutByRoom[mo.room_id] = mo
    }

    // Pending bookings
    const { data: bookings } = roomIds.length > 0
      ? await supabase.from('bookings').select('id, room_id, tenants(full_name)').eq('status', 'waiting')
      : { data: [] }

    const bookingByRoom = {}
    for (const b of bookings ?? []) {
      if (b.room_id && !bookingByRoom[b.room_id]) bookingByRoom[b.room_id] = b
    }

    // Unpaid invoices sum by room (via contracts.room_id)
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total_amount, contracts!inner(room_id)')
      .in('status', ['pending', 'overdue'])

    const overdueByRoom = {}
    for (const inv of invoices ?? []) {
      const rid = inv.contracts?.room_id
      if (rid) overdueByRoom[rid] = (overdueByRoom[rid] ?? 0) + Number(inv.total_amount)
    }

    const merged = roomList.map(r => {
      const booking = bookingByRoom[r.id] ?? null
      const currentContract = currentContractMap[r.id] ?? null
      // If there is no active booking/contract, do not let a stale reserved room stay stuck.
      const derivedStatus = currentContract?.status === 'active'
        ? 'occupied'
        : currentContract
          ? 'reserved'
          : booking
            ? (r.status === 'available' ? 'reserved' : r.status)
            : (r.status === 'reserved' ? 'available' : r.status)
      return {
        ...r,
        status:        derivedStatus,
        tenants:       contractTenantMap[r.id] ?? null,
        currentRent:   contractRentMap[r.id] ?? null,
        moveOut:       moveOutByRoom[r.id] ?? null,
        booking,
        overdueAmount: overdueByRoom[r.id] ?? 0,
        docIncomplete: contractTenantMap[r.id + '__docIncomplete'] ?? false,
      }
    })

    setRooms(merged)
    setBuildings(blds ?? [])
    setProjects(prjs ?? [])
    setRoomTypes(rts ?? [])
    setLoading(false)
  }

  const filteredBuildingOpts = useMemo(() => {
    const base = filterProject ? buildings.filter(b => b.project_id === filterProject) : buildings
    return [{ value: '', label: 'ทุกอาคาร' }, ...base.map(b => ({ value: b.id, label: b.name }))]
  }, [buildings, filterProject])

  const projectOpts  = [{ value: '', label: 'ทุกโครงการ' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const roomTypeOpts = [{ value: '', label: 'ทุกประเภท'  }, ...roomTypes.map(rt => ({ value: rt.id, label: rt.name }))]

  const filtered = useMemo(() => {
    let result = rooms
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.room_number.toLowerCase().includes(q) ||
        r.tenants?.full_name?.toLowerCase().includes(q) ||
        r.buildings?.name?.toLowerCase().includes(q) ||
        r.buildings?.projects?.name?.toLowerCase().includes(q)
      )
    }
    if (filterProject)   result = result.filter(r => r.buildings?.project_id === filterProject)
    if (filterBuilding)  result = result.filter(r => r.building_id === filterBuilding)
    if (filterStatus)    result = result.filter(r => r.status === filterStatus)
    if (filterOwnership) result = result.filter(r => r.ownership === filterOwnership)
    if (filterRoomType)  result = result.filter(r => r.room_type_id === filterRoomType)
    return result
  }, [rooms, search, filterProject, filterBuilding, filterStatus, filterOwnership, filterRoomType])

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const pa = a.buildings?.projects?.name ?? ''
      const pb = b.buildings?.projects?.name ?? ''
      if (pa !== pb) return pa.localeCompare(pb, 'th')
      const ba = a.buildings?.name ?? ''
      const bb = b.buildings?.name ?? ''
      if (ba !== bb) return ba.localeCompare(bb, 'th')
      return a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
    })
    const map = new Map()
    for (const room of sorted) {
      const key = room.building_id ?? '__none__'
      if (!map.has(key)) {
        map.set(key, {
          projectName:  room.buildings?.projects?.name ?? '—',
          buildingName: room.buildings?.name ?? '—',
          rooms: [],
        })
      }
      map.get(key).rooms.push(room)
    }
    return [...map.values()]
  }, [filtered])

  const hasFilters = search || filterProject || filterBuilding || filterStatus || filterOwnership || filterRoomType
  function clearFilters() {
    setSearch(''); setFilterProject(''); setFilterBuilding('')
    setFilterStatus(''); setFilterOwnership(''); setFilterRoomType('')
  }

  const counts = useMemo(() => {
    const c = {}
    STATUS_CHIP.forEach(s => { c[s.key] = rooms.filter(r => r.status === s.key).length })
    return c
  }, [rooms])

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">บริหารห้องเช่า</h1>
        <p className="mt-1 text-sm text-gray-500">
          {filtered.length} ห้อง{hasFilters ? ' (กรองแล้ว)' : ''} จากทั้งหมด {rooms.length}
        </p>
      </div>

      {/* Status chips */}
      {!loading && (
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_CHIP.map(s => (
            <button key={s.key}
              onClick={() => setFilterStatus(filterStatus === s.key ? '' : s.key)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all
                ${filterStatus === s.key
                  ? s.chip + ' ring-2 ring-offset-1 ring-current'
                  : s.chip + ' opacity-70 hover:opacity-100'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              {s.label} {counts[s.key]}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขห้อง ชื่อผู้เช่า อาคาร หรือโครงการ..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select options={projectOpts} value={filterProject}
            onChange={e => { setFilterProject(e.target.value); setFilterBuilding('') }} className="w-36" />
          <Select options={filteredBuildingOpts} value={filterBuilding}
            onChange={e => setFilterBuilding(e.target.value)} className="w-32" />
          <Select options={STATUS_OPTS} value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)} className="w-32" />
          <Select options={OWNERSHIP_OPTS} value={filterOwnership}
            onChange={e => setFilterOwnership(e.target.value)} className="w-32" />
          <Select options={roomTypeOpts} value={filterRoomType}
            onChange={e => setFilterRoomType(e.target.value)} className="w-28" />
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 transition-colors">
              <X className="h-3 w-3" /> ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={DoorOpen}
          title={hasFilters ? 'ไม่พบห้องที่ตรงกับเงื่อนไข' : 'ยังไม่มีห้อง'}
          description={hasFilters ? 'ลองเปลี่ยนเงื่อนไขการกรอง' : 'เพิ่มห้องได้ที่ ตั้งค่า → ห้อง'}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map((group, gi) => (
            <div key={gi} className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm">
              {/* Group header */}
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-semibold text-gray-500">{group.projectName}</span>
                <span className="text-gray-300">›</span>
                <span className="text-sm font-semibold text-gray-800">{group.buildingName}</span>
                <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-500">
                  {group.rooms.length} ห้อง
                </span>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 text-xs text-gray-400">
                    <th style={{width:'10%'}} className="px-4 py-2.5 text-left font-medium">เลขห้อง</th>
                    <th style={{width:'10%'}} className="px-4 py-2.5 text-left font-medium">ขนาดห้อง</th>
                    <th style={{width:'10%'}} className="px-4 py-2.5 text-right font-medium">ค่าเช่า/เดือน</th>
                    <th style={{width:'18%'}} className="px-4 py-2.5 text-center font-medium">ชื่อผู้เช่า</th>
                    <th style={{width:'12%'}} className="px-4 py-2.5 text-left font-medium">เบอร์โทร</th>
                    <th style={{width:'10%'}} className="px-4 py-2.5 text-left font-medium">แจ้งออก</th>
                    <th style={{width:'11%'}} className="px-4 py-2.5 text-left font-medium">จองล่วงหน้า</th>
                    <th style={{width:'10%'}} className="px-4 py-2.5 text-center font-medium">ค้างชำระ</th>
                    <th style={{width:'9%'}}  className="px-4 py-2.5 text-center font-medium">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {group.rooms.map(room => (
                    <tr key={room.id} className="hover:bg-gray-50 transition-colors">

                      {/* เลขห้อง + สถานะ */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-gray-900">{room.room_number}</span>
                          <Badge variant={room.status} />
                          {room.docIncomplete ? (
                            <span title="เอกสารยังไม่ครบ 4 รายการ">
                              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                            </span>
                          ) : room.tenants && (
                            <span title="เอกสารครบแล้ว">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* ขนาดห้อง */}
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{room.room_types?.name ?? '—'}</p>
                        {room.size_sqm && (
                          <p className="text-xs text-gray-400">{room.size_sqm} ม²</p>
                        )}
                      </td>

                      {/* ค่าเช่า */}
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        ฿{Number(room.currentRent ?? room.base_rent).toLocaleString('th-TH')}
                      </td>

                      {/* ชื่อผู้เช่า */}
                      <td className="px-4 py-3 text-center">
                        {room.tenants?.full_name && room.tenants?.id
                          ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/tenants/${room.tenants.id}`)}
                              className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              {room.tenants.full_name}
                            </button>
                          )
                          : room.tenants?.full_name
                            ? <span className="font-medium text-blue-600">{room.tenants.full_name}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>

                      {/* เบอร์โทร */}
                      <td className="px-4 py-3 text-gray-600">
                        {room.tenants?.phone
                          ? room.tenants.phone
                          : <span className="text-gray-300">—</span>
                        }
                      </td>

                      {/* แจ้งออก */}
                      <td className="px-4 py-3">
                        {room.moveOut ? (
                          <div>
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                              แจ้งออก
                            </span>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {formatThaiDate(room.moveOut.move_out_date)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* จองล่วงหน้า */}
                      <td className="px-4 py-3">
                        {room.booking ? (
                          <div>
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600">
                              จองแล้ว
                            </span>
                            {room.booking.tenants?.full_name && (
                              <p className="mt-0.5 text-xs text-gray-500 truncate">{room.booking.tenants.full_name}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* ค้างชำระ */}
                      <td className="px-4 py-3 text-center">
                        {room.overdueAmount > 0 ? (
                          <span className="font-semibold text-red-600">
                            ฿{room.overdueAmount.toLocaleString('th-TH')}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* จัดการ */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => navigate(`/rooms/${room.id}`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          จัดการ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
