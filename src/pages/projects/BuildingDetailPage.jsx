import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus, ChevronRight, Copy, Pencil, Trash2, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import RoomCard from '../../components/rooms/RoomCard'
import RoomFormModal from '../../components/rooms/RoomFormModal'
import { DoorOpen } from 'lucide-react'

const TABS = [
  { id: 'rooms', label: 'ห้อง' },
  { id: 'types', label: 'แบบห้อง' },
]

export default function BuildingDetailPage() {
  const { projectId, buildingId } = useParams()
  const navigate = useNavigate()
  const [project,  setProject]  = useState(null)
  const [building, setBuilding] = useState(null)
  const [rooms,    setRooms]    = useState([])
  const [roomTypes, setRoomTypes] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('rooms')

  // room modal
  const [roomModal,    setRoomModal]    = useState(false)
  const [editingRoom,  setEditingRoom]  = useState(null)
  const [prefillRoom,  setPrefillRoom]  = useState(null)

  // room-type inline edit
  const [rtEditing, setRtEditing] = useState(null)  // { id, name, description, default_size_sqm } | 'new'
  const [rtSaving,  setRtSaving]  = useState(false)
  const [rtError,   setRtError]   = useState('')

  useEffect(() => { fetchAll() }, [buildingId])

  async function fetchAll() {
    const [{ data: proj }, { data: bld }, { data: rms }, { data: rts }] = await Promise.all([
      supabase.from('projects').select('id, name').eq('id', projectId).single(),
      supabase.from('buildings').select('*').eq('id', buildingId).single(),
      supabase.from('rooms')
        .select('*, room_types(name), owners(full_name)')
        .eq('building_id', buildingId)
        .order('floor', { ascending: false })
        .order('room_number'),
      supabase.from('room_types')
        .select('id, name, description, default_size_sqm')
        .eq('building_id', buildingId)
        .order('name'),
    ])
    if (!bld) { navigate(`/projects/${projectId}`); return }
    setProject(proj)
    setBuilding(bld)
    setRooms(rms ?? [])
    setRoomTypes(rts ?? [])
    setLoading(false)
  }

  // Group rooms by floor
  const floors = rooms.reduce((acc, room) => {
    const f = room.floor
    if (!acc[f]) acc[f] = []
    acc[f].push(room)
    return acc
  }, {})
  const sortedFloors = Object.keys(floors).sort((a, b) => Number(b) - Number(a))

  function openCreate()      { setEditingRoom(null); setPrefillRoom(null); setRoomModal(true) }
  function openEdit(room)    { setEditingRoom(room);  setPrefillRoom(null); setRoomModal(true) }
  function openClone(room)   { setEditingRoom(null);  setPrefillRoom(room); setRoomModal(true) }

  // ── Room Type CRUD ──────────────────────────────────────────────────
  function startNewType() {
    setRtEditing({ id: null, name: '', description: '', default_size_sqm: '' })
    setRtError('')
  }

  function startEditType(rt) {
    setRtEditing({ ...rt, default_size_sqm: rt.default_size_sqm ?? '' })
    setRtError('')
  }

  async function saveRoomType() {
    if (!rtEditing.name.trim()) { setRtError('กรุณากรอกชื่อแบบห้อง'); return }
    setRtSaving(true)
    const payload = {
      name: rtEditing.name.trim(),
      description: rtEditing.description?.trim() || null,
      default_size_sqm: rtEditing.default_size_sqm ? Number(rtEditing.default_size_sqm) : null,
      building_id: buildingId,
    }
    const { error } = rtEditing.id
      ? await supabase.from('room_types').update(payload).eq('id', rtEditing.id)
      : await supabase.from('room_types').insert(payload)
    setRtSaving(false)
    if (error) { setRtError(error.message); return }
    setRtEditing(null)
    fetchAll()
  }

  async function deleteRoomType(rt) {
    if (!confirm(`ลบแบบห้อง "${rt.name}" ?`)) return
    const { error } = await supabase.from('room_types').delete().eq('id', rt.id)
    if (error) { alert(error.message); return }
    fetchAll()
  }

  if (loading) return <PageSpinner />

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/projects" className="hover:text-blue-600">โครงการ</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to={`/projects/${projectId}`} className="hover:text-blue-600">{project?.name}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{building.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{building.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{building.total_floors} ชั้น · {rooms.length} ห้อง</p>
        </div>
        {tab === 'rooms' && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>เพิ่มห้อง</Button>
        )}
        {tab === 'types' && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={startNewType} disabled={!!rtEditing}>เพิ่มแบบห้อง</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'border-b-2 border-blue-600 text-blue-700 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.id === 'rooms' && rooms.length > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">{rooms.length}</span>
            )}
            {t.id === 'types' && roomTypes.length > 0 && (
              <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">{roomTypes.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Rooms */}
      {tab === 'rooms' && (
        rooms.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="ยังไม่มีห้อง"
            description="เพิ่มห้องในอาคารนี้"
            action={<Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>เพิ่มห้อง</Button>}
          />
        ) : (
          <div className="flex flex-col gap-8">
            {sortedFloors.map((floor) => (
              <div key={floor}>
                <h2 className="mb-3 text-sm font-semibold text-gray-500">ชั้น {floor}</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {floors[floor].map((room) => (
                    <div key={room.id} className="relative group">
                      <RoomCard room={room} onClick={() => openEdit(room)} buildingColor={building.card_color} />
                      <button
                        onClick={(e) => { e.stopPropagation(); openClone(room) }}
                        title="คัดลอกห้อง"
                        className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1 rounded-lg bg-white border border-gray-200 px-2 py-1 text-xs text-gray-500 shadow hover:text-blue-600 hover:border-blue-300 transition-all"
                      >
                        <Copy className="h-3 w-3" /> คัดลอก
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab: Room Types */}
      {tab === 'types' && (
        <div className="max-w-2xl">
          {roomTypes.length === 0 && !rtEditing ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
              <p className="text-sm text-gray-400">ยังไม่มีแบบห้อง</p>
              <p className="mt-1 text-xs text-gray-300">แบบห้องใช้สำหรับระบุประเภทห้องในอาคารนี้</p>
              <Button className="mt-4" size="sm" onClick={startNewType} icon={<Plus className="h-3.5 w-3.5" />}>เพิ่มแบบห้อง</Button>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {roomTypes.map((rt, i) => (
                rtEditing?.id === rt.id ? (
                  <RoomTypeEditRow
                    key={rt.id}
                    value={rtEditing}
                    onChange={setRtEditing}
                    onSave={saveRoomType}
                    onCancel={() => { setRtEditing(null); setRtError('') }}
                    saving={rtSaving}
                    error={rtError}
                    bordered={i > 0}
                  />
                ) : (
                  <div key={rt.id} className={`flex items-center justify-between px-4 py-3.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{rt.name}</p>
                      <p className="text-xs text-gray-400">
                        {rt.description ?? ''}
                        {rt.default_size_sqm ? ` · ${rt.default_size_sqm} ม²` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEditType(rt)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteRoomType(rt)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              ))}

              {/* New row form */}
              {rtEditing && !rtEditing.id && (
                <RoomTypeEditRow
                  value={rtEditing}
                  onChange={setRtEditing}
                  onSave={saveRoomType}
                  onCancel={() => { setRtEditing(null); setRtError('') }}
                  saving={rtSaving}
                  error={rtError}
                  bordered={roomTypes.length > 0}
                  autoFocus
                />
              )}
            </div>
          )}
        </div>
      )}

      <RoomFormModal
        open={roomModal}
        onClose={() => { setRoomModal(false); setEditingRoom(null); setPrefillRoom(null) }}
        onSaved={fetchAll}
        initialBuilding={building}
        editingRoom={editingRoom}
        prefillRoom={prefillRoom}
      />
    </div>
  )
}

function RoomTypeEditRow({ value, onChange, onSave, onCancel, saving, error, bordered, autoFocus }) {
  return (
    <div className={`px-4 py-3 ${bordered ? 'border-t border-gray-50' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          autoFocus={autoFocus}
          value={value.name}
          onChange={e => onChange(v => ({ ...v, name: e.target.value }))}
          placeholder="ชื่อแบบห้อง เช่น Studio, 1BR"
          className="h-8 flex-1 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={value.description ?? ''}
          onChange={e => onChange(v => ({ ...v, description: e.target.value }))}
          placeholder="รายละเอียด (ไม่บังคับ)"
          className="h-8 flex-1 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          value={value.default_size_sqm ?? ''}
          onChange={e => onChange(v => ({ ...v, default_size_sqm: e.target.value }))}
          placeholder="ขนาด ม²"
          className="h-8 w-24 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center gap-1">
          <button onClick={onSave} disabled={saving}
            className="flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button onClick={onCancel}
            className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
