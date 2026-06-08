import { useEffect, useState, useMemo } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import Button from '../../../components/ui/Button'
import Select from '../../../components/ui/Select'
import RoomCard from '../../../components/rooms/RoomCard'
import RoomFormModal from '../../../components/rooms/RoomFormModal'
import EmptyState from '../../../components/ui/EmptyState'
import { DoorOpen } from 'lucide-react'

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

export default function RoomsConfigTab() {
  const [rooms,     setRooms]     = useState([])
  const [buildings, setBuildings] = useState([])
  const [projects,  setProjects]  = useState([])
  const [roomTypes, setRoomTypes] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [roomModal,    setRoomModal]    = useState(false)
  const [editingRoom,  setEditingRoom]  = useState(null)
  const [prefillRoom,  setPrefillRoom]  = useState(null)

  const [search,          setSearch]          = useState('')
  const [filterProject,   setFilterProject]   = useState('')
  const [filterBuilding,  setFilterBuilding]  = useState('')
  const [filterStatus,    setFilterStatus]    = useState('')
  const [filterOwnership, setFilterOwnership] = useState('')
  const [filterRoomType,  setFilterRoomType]  = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: rms }, { data: blds }, { data: prjs }, { data: rts }] = await Promise.all([
      supabase.from('rooms').select('*, room_types(name), owners(full_name), buildings(name, project_id, card_color, projects(name))').order('room_number'),
      supabase.from('buildings').select('id, name, project_id').order('name'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('room_types').select('id, name').order('name'),
    ])
    setRooms(rms ?? [])
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
      result = result.filter(r => r.room_number.toLowerCase().includes(q) || r.internal_note?.toLowerCase().includes(q))
    }
    if (filterProject)   result = result.filter(r => r.buildings?.project_id === filterProject)
    if (filterBuilding)  result = result.filter(r => r.building_id === filterBuilding)
    if (filterStatus)    result = result.filter(r => r.status === filterStatus)
    if (filterOwnership) result = result.filter(r => r.ownership === filterOwnership)
    if (filterRoomType)  result = result.filter(r => r.room_type_id === filterRoomType)
    return [...result].sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
  }, [rooms, search, filterProject, filterBuilding, filterStatus, filterOwnership, filterRoomType])

  const hasFilters = search || filterProject || filterBuilding || filterStatus || filterOwnership || filterRoomType

  function clearFilters() {
    setSearch(''); setFilterProject(''); setFilterBuilding('')
    setFilterStatus(''); setFilterOwnership(''); setFilterRoomType('')
  }

  function openEdit(room)   { setEditingRoom(room); setPrefillRoom(null); setRoomModal(true) }
  function openCreate()     { setEditingRoom(null); setPrefillRoom(null); setRoomModal(true) }
  function openClone(room)  { setEditingRoom(null); setPrefillRoom(room); setRoomModal(true) }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {filtered.length} ห้อง{hasFilters ? ' (กรองแล้ว)' : ''} จากทั้งหมด {rooms.length}
        </p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>เพิ่มห้อง</Button>
      </div>

      <div className="mb-5 flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขห้อง หรือหมายเหตุ..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
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

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={DoorOpen}
          title={hasFilters ? 'ไม่พบห้องที่ตรงกับเงื่อนไข' : 'ยังไม่มีห้อง'}
          description={hasFilters ? 'ลองเปลี่ยนเงื่อนไขการกรอง' : 'เพิ่มห้องแรกเพื่อเริ่มต้น'}
          action={!hasFilters && <Button size="sm" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>เพิ่มห้อง</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(room => (
            <RoomCard key={room.id} room={room} onClick={() => openEdit(room)} onCopy={openClone} buildingColor={room.buildings?.card_color} />
          ))}
        </div>
      )}

      <RoomFormModal
        open={roomModal}
        onClose={() => setRoomModal(false)}
        onSaved={fetchAll}
        editingRoom={editingRoom}
        prefillRoom={prefillRoom}
      />
    </div>
  )
}
