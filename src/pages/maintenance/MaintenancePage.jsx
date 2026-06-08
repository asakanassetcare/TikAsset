import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'
import { Wrench } from 'lucide-react'

const STATUS_OPTS = [
  { value: '',            label: 'ทุกสถานะ' },
  { value: 'reported',    label: 'รับเรื่อง' },
  { value: 'in_progress', label: 'กำลังดำเนินการ' },
  { value: 'completed',   label: 'เสร็จแล้ว' },
  { value: 'cancelled',   label: 'ยกเลิก' },
]

const STATUS_COLOR = {
  reported:    'border-l-yellow-400',
  in_progress: 'border-l-blue-400',
  completed:   'border-l-green-400',
  cancelled:   'border-l-gray-200',
}

export default function MaintenancePage() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const { profile } = useAuth()
  const isPrefilling = useRef(!!location.state?.prefillBuildingId)

  const [items,        setItems]        = useState([])
  const [buildings,    setBuildings]    = useState([])
  const [rooms,        setRooms]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState(location.state?.filterStatus ?? '')
  const [filterBldg,   setFilterBldg]   = useState('')

  // Create modal
  const [createModal, setCreateModal] = useState(false)
  const [form, setForm] = useState({
    building_id:          '',
    room_id:              '',
    area_description:     '',
    title:                '',
    description:          '',
    contact_name:         '',
    contact_phone:        '',
    preferred_start_date: '',
    preferred_due_date:   '',
  })
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')

  useEffect(() => {
    fetchAll()
    const s = location.state
    if (s?.prefillBuildingId) {
      setForm(p => ({ ...p, building_id: s.prefillBuildingId }))
      setCreateModal(true)
    }
  }, [])

  useEffect(() => {
    if (form.building_id) fetchRooms(form.building_id)
    else setRooms([])
    if (!isPrefilling.current) {
      setForm(p => ({ ...p, room_id: '' }))
    }
    isPrefilling.current = false
  }, [form.building_id])

  async function fetchAll() {
    const [{ data: mData }, { data: bData }] = await Promise.all([
      supabase.from('maintenance_requests').select(`
        id, maintenance_number, title, status, reported_at, cost, building_id,
        contact_name, contact_phone,
        preferred_start_date, preferred_due_date,
        buildings(name),
        rooms(room_number)
      `).order('created_at', { ascending: false }),
      supabase.from('buildings').select('id, name').order('name'),
    ])
    setItems(mData ?? [])
    setBuildings(bData?.map(b => ({ value: b.id, label: b.name })) ?? [])
    setLoading(false)
  }

  async function fetchRooms(buildingId) {
    const { data } = await supabase.from('rooms').select('id, room_number')
      .eq('building_id', buildingId).order('room_number')
    setRooms(data?.map(r => ({ value: r.id, label: `ห้อง ${r.room_number}` })) ?? [])
    const prefillRoomId = location.state?.prefillRoomId
    if (prefillRoomId) {
      setForm(p => ({ ...p, room_id: prefillRoomId }))
    }
  }

  const bldgOpts = [{ value: '', label: 'ทุกอาคาร' }, ...buildings]

  function getScheduleDate(it) {
    const dates = [it.preferred_start_date, it.preferred_due_date].filter(Boolean)
    if (dates.length === 0) return null
    return dates.sort((a, b) => new Date(a) - new Date(b))[0]
  }

  const filtered = items.filter(it => {
    if (filterStatus && it.status !== filterStatus) return false
    if (!filterStatus && it.status === 'completed') return false
    if (filterBldg  && it.building_id !== filterBldg) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        it.maintenance_number?.toLowerCase().includes(q) ||
        it.title?.toLowerCase().includes(q) ||
        it.contact_name?.toLowerCase().includes(q) ||
        it.contact_phone?.toLowerCase().includes(q) ||
        it.buildings?.name?.toLowerCase().includes(q) ||
        it.rooms?.room_number?.toLowerCase().includes(q)
      )
    }
    return true
  }).sort((a, b) => {
    const aDate = getScheduleDate(a)
    const bDate = getScheduleDate(b)
    if (aDate && bDate) return new Date(aDate) - new Date(bDate)
    if (aDate) return -1
    if (bDate) return 1
    return new Date(b.reported_at) - new Date(a.reported_at)
  })

  function resetForm() {
    setForm({ building_id: '', room_id: '', area_description: '', title: '', description: '', contact_name: '', contact_phone: '', preferred_start_date: '', preferred_due_date: '' })
    setCreateErr('')
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.title.trim()) { setCreateErr('กรุณาระบุหัวข้อ'); return }
    setCreating(true)
    const { data, error } = await supabase.from('maintenance_requests').insert({
      building_id:          form.building_id || null,
      room_id:              form.room_id     || null,
      area_description:     form.area_description.trim() || null,
      title:                form.title.trim(),
      description:          form.description.trim() || null,
      contact_name:         form.contact_name.trim() || null,
      contact_phone:        form.contact_phone.trim() || null,
      preferred_start_date: form.preferred_start_date || null,
      preferred_due_date:   form.preferred_due_date   || null,
      reported_by:          profile.id,
    }).select('id').single()
    setCreating(false)
    if (error) { setCreateErr(error.message); return }
    setCreateModal(false)
    navigate(`/maintenance/${data.id}`)
  }

  if (loading) return <PageSpinner />

  const pendingCount = items.filter(it => it.status === 'reported').length

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">แจ้งซ่อม</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} รายการ
            {pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                {pendingCount} รับเรื่องใหม่
              </span>
            )}
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => { resetForm(); setCreateModal(true) }}>
          แจ้งซ่อมใหม่
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลข หัวข้อ หรืออาคาร..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <Select options={STATUS_OPTS} value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-44" />
        <Select options={bldgOpts}    value={filterBldg}   onChange={e => setFilterBldg(e.target.value)}   className="w-44" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Wrench} title="ไม่มีรายการแจ้งซ่อม" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(it => (
            <div
              key={it.id}
              onClick={() => navigate(`/maintenance/${it.id}`)}
              className={`cursor-pointer rounded-xl border border-gray-100 border-l-4 bg-white px-4 py-3.5 hover:shadow-md transition-all ${STATUS_COLOR[it.status] ?? 'border-l-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{it.maintenance_number} · {it.title}</p>
                  <p className="text-xs text-gray-500">
                    {it.buildings?.name ?? 'พื้นที่ส่วนกลาง'}
                    {it.rooms?.room_number ? ` · ห้อง ${it.rooms.room_number}` : ''}
                  </p>
                  <p className="text-xs text-gray-400">แจ้งเมื่อ {formatThaiDate(it.reported_at)}</p>
                  {(it.contact_name || it.contact_phone) && (
                    <p className="mt-1 text-xs text-gray-500">
                      ติดต่อ: {it.contact_name || '-'}{it.contact_phone ? ` · ${it.contact_phone}` : ''}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    {it.preferred_start_date && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                        เข้าดำเนินการ {formatThaiDate(it.preferred_start_date)}
                      </span>
                    )}
                    {it.preferred_due_date && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        ต้องการให้เสร็จ {formatThaiDate(it.preferred_due_date)}
                      </span>
                    )}
                    {!it.preferred_start_date && !it.preferred_due_date && (
                      <span className="text-gray-400">ยังไม่ระบุวันนัด</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {it.cost != null && (
                    <span className="text-xs text-gray-500">฿{Number(it.cost).toLocaleString('th-TH')}</span>
                  )}
                  <Badge variant={it.status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="แจ้งซ่อมใหม่"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModal(false)}>ปิด</Button>
            <Button form="mt-form" type="submit" loading={creating}>บันทึก</Button>
          </>
        }
      >
        <form id="mt-form" onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input label="หัวข้อ" required value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="อาคาร"
              options={[{ value: '', label: 'พื้นที่ส่วนกลาง / ไม่ระบุ' }, ...buildings]}
              value={form.building_id}
              onChange={e => setForm(p => ({ ...p, building_id: e.target.value }))}
            />
            {form.building_id ? (
              <Select
                label="ห้อง"
                options={[{ value: '', label: 'ไม่ระบุห้อง' }, ...rooms]}
                value={form.room_id}
                onChange={e => setForm(p => ({ ...p, room_id: e.target.value }))}
              />
            ) : (
              <Input label="บริเวณ" value={form.area_description}
                onChange={e => setForm(p => ({ ...p, area_description: e.target.value }))}
                placeholder="เช่น ลิฟท์ A ชั้น 3" />
            )}
          </div>
          <Textarea label="รายละเอียด" rows={3} value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="ชื่อผู้ติดต่อ" value={form.contact_name}
              onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))}
              placeholder="เช่น คนอยู่จริง / ผู้ประสานงาน" />
            <Input label="เบอร์ติดต่อ" phone value={form.contact_phone}
              onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))}
              placeholder="เบอร์ที่ให้ช่างโทรนัด" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                อยากให้เข้าดำเนินการวันที่ <span className="text-gray-400">(ถ้ามี)</span>
              </label>
              <input
                type="date"
                value={form.preferred_start_date}
                onChange={e => setForm(p => ({ ...p, preferred_start_date: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                อยากให้เสร็จไม่เกินวันที่ <span className="text-gray-400">(ถ้ามี)</span>
              </label>
              <input
                type="date"
                value={form.preferred_due_date}
                onChange={e => setForm(p => ({ ...p, preferred_due_date: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {createErr && <p className="text-sm text-red-600">{createErr}</p>}
        </form>
      </Modal>
    </div>
  )
}
