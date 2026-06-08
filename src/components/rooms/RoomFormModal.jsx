import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'

const STATUS_OPTIONS = [
  { value: 'available',   label: 'ว่าง' },
  { value: 'maintenance', label: 'ซ่อมบำรุง' },
  { value: 'blocked',     label: 'ปิดใช้งาน' },
  { value: 'occupied',    label: 'มีผู้เช่า (system)' },
  { value: 'reserved',    label: 'จองแล้ว (system)' },
]

const OWNERSHIP_OPTIONS = [
  { value: 'owned',   label: 'ของบริษัท (Owned)' },
  { value: 'managed', label: 'ฝากบริหาร (Managed)' },
]

const EMPTY = {
  building_id: '', room_number: '', floor: '', room_type_id: '',
  size_sqm: '', base_rent: '', base_deposit: '', base_advance: '',
  electric_meter_number: '', water_meter_number: '',
  title_deed_number: '',
  ownership: 'owned', owner_id: '',
  status: 'available', is_rentable: true,
  status_color: '', internal_note: '',
}

export default function RoomFormModal({ open, onClose, onSaved, initialBuilding, editingRoom, prefillRoom }) {
  const [form, setForm] = useState(EMPTY)
  const [buildings, setBuildings] = useState([])  // [{value, label, total_floors}]
  const [owners, setOwners]       = useState([])
  const [roomTypes, setRoomTypes] = useState([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const isClone = !!prefillRoom && !editingRoom
  const title = editingRoom
    ? `แก้ไขห้อง ${editingRoom.room_number}`
    : isClone ? `คัดลอกจากห้อง ${prefillRoom.room_number}` : 'เพิ่มห้อง'

  useEffect(() => {
    if (!open) return
    fetchOptions()
    const source = editingRoom ?? prefillRoom
    if (source) {
      setForm({
        building_id:           source.building_id ?? '',
        room_number:           isClone ? '' : (source.room_number ?? ''),
        floor:                 String(source.floor ?? ''),
        room_type_id:          source.room_type_id ?? '',
        size_sqm:              String(source.size_sqm ?? ''),
        base_rent:             String(source.base_rent ?? ''),
        base_deposit:          String(source.base_deposit ?? ''),
        base_advance:          String(source.base_advance ?? ''),
        electric_meter_number: isClone ? '' : (source.electric_meter_number ?? ''),
        water_meter_number:    isClone ? '' : (source.water_meter_number ?? ''),
        title_deed_number:     source.title_deed_number ?? '',
        ownership:             source.ownership ?? 'owned',
        owner_id:              source.owner_id ?? '',
        status:                'available',  // always start available for new/clone
        is_rentable:           source.is_rentable ?? true,
        status_color:          isClone ? '' : (source.status_color ?? ''),
        internal_note:         source.internal_note ?? '',
      })
    } else {
      setForm({ ...EMPTY, building_id: initialBuilding?.id ?? '' })
    }
    setError('')
  }, [open, editingRoom, prefillRoom, initialBuilding])

  async function fetchOptions() {
    const buildingId = editingRoom?.building_id ?? prefillRoom?.building_id ?? initialBuilding?.id
    const [{ data: blds }, { data: ownrs }, { data: rts }] = await Promise.all([
      supabase.from('buildings').select('id, name, total_floors, projects(name)').order('name'),
      supabase.from('owners').select('id, full_name').order('full_name'),
      buildingId
        ? supabase.from('room_types').select('id, name').or(`building_id.is.null,building_id.eq.${buildingId}`).order('name')
        : supabase.from('room_types').select('id, name').is('building_id', null).order('name'),
    ])
    setBuildings(blds?.map(b => ({
      value: b.id,
      label: `${b.projects?.name ?? ''} — ${b.name}`,
      total_floors: b.total_floors,
    })) ?? [])
    setOwners(ownrs?.map(o => ({ value: o.id, label: o.full_name })) ?? [])
    setRoomTypes(rts?.map(rt => ({ value: rt.id, label: rt.name })) ?? [])
  }

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'ownership' && value === 'owned') next.owner_id = ''
      // refetch room types when building changes
      return next
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')

    if (!form.room_number.trim()) { setError('กรุณากรอกเลขห้อง'); return }
    if (!form.floor)              { setError('กรุณากรอกชั้น'); return }

    const selectedBuilding = buildings.find(b => b.value === form.building_id)
    if (selectedBuilding && Number(form.floor) > selectedBuilding.total_floors) {
      setError(`ชั้นต้องไม่เกิน ${selectedBuilding.total_floors} (จำนวนชั้นของอาคาร)`)
      return
    }
    if (Number(form.floor) < 1) { setError('ชั้นต้องมากกว่า 0'); return }

    if (form.ownership === 'managed' && !form.owner_id) {
      setError('กรุณาเลือกเจ้าของห้องสำหรับห้องฝากบริหาร')
      return
    }

    setSaving(true)
    const payload = {
      building_id:           form.building_id,
      room_number:           form.room_number.trim(),
      floor:                 Number(form.floor),
      room_type_id:          form.room_type_id || null,
      size_sqm:              form.size_sqm ? Number(form.size_sqm) : null,
      base_rent:             Math.max(0, Number(form.base_rent) || 0),
      base_deposit:          Math.max(0, Number(form.base_deposit) || 0),
      base_advance:          Math.max(0, Number(form.base_advance) || 0),
      electric_meter_number: form.electric_meter_number.trim() || null,
      water_meter_number:    form.water_meter_number.trim() || null,
      title_deed_number:     form.title_deed_number.trim() || null,
      ownership:             form.ownership,
      owner_id:              form.ownership === 'managed' ? form.owner_id : null,
      status:                form.status,
      is_rentable:           form.is_rentable,
      status_color:          form.status_color.trim() || null,
      internal_note:         form.internal_note.trim() || null,
    }

    const { error } = editingRoom
      ? await supabase.from('rooms').update(payload).eq('id', editingRoom.id)
      : await supabase.from('rooms').insert(payload)

    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved?.()
    onClose()
  }

  const PRESET_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b']

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button form="room-form" type="submit" loading={saving}>บันทึก</Button>
        </>
      }
    >
      <form id="room-form" onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Building & Room Number */}
        <Select
          label="อาคาร"
          required
          options={buildings}
          placeholder="เลือกอาคาร"
          value={form.building_id}
          onChange={(e) => set('building_id', e.target.value)}
          wrapperClass="col-span-2"
        />
        <Input
          label="เลขห้อง"
          required
          value={form.room_number}
          onChange={(e) => set('room_number', e.target.value)}
          placeholder="101"
        />
        <Input
          label="ชั้น"
          type="number"
          required
          min={1}
          max={buildings.find(b => b.value === form.building_id)?.total_floors}
          value={form.floor}
          onChange={(e) => set('floor', e.target.value)}
          placeholder="1"
          hint={buildings.find(b => b.value === form.building_id) ? `สูงสุด ${buildings.find(b => b.value === form.building_id).total_floors} ชั้น` : undefined}
        />

        {/* Type & Size */}
        <Select
          label="ประเภทห้อง"
          options={roomTypes}
          placeholder="เลือกประเภท"
          value={form.room_type_id}
          onChange={(e) => set('room_type_id', e.target.value)}
        />
        <Input
          label="ขนาด (ม²)"
          type="number"
          step="0.01"
          min={0}
          value={form.size_sqm}
          onChange={(e) => set('size_sqm', e.target.value)}
          placeholder="28"
        />

        {/* Pricing */}
        <Input
          label="ค่าเช่าพื้นฐาน (฿/เดือน)"
          type="number"
          required
          min={0}
          value={form.base_rent}
          onChange={(e) => set('base_rent', e.target.value)}
          placeholder="8000"
        />
        <Input
          label="เงินประกัน (฿)"
          type="number"
          min={0}
          value={form.base_deposit}
          onChange={(e) => set('base_deposit', e.target.value)}
          placeholder="16000"
        />
        <Input
          label="ค่าเช่าล่วงหน้า (฿)"
          type="number"
          min={0}
          value={form.base_advance}
          onChange={(e) => set('base_advance', e.target.value)}
          placeholder="8000"
        />

        {/* Status Color */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">สีแสดงผล (override)</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={form.status_color}
              onChange={(e) => set('status_color', e.target.value)}
              placeholder="#hex หรือเว้นว่าง"
              className="h-9 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {form.status_color && (
              <div className="h-6 w-6 rounded-full border border-gray-200 shrink-0" style={{ backgroundColor: form.status_color }} />
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button key={c} type="button" onClick={() => set('status_color', c)}
                className="h-5 w-5 rounded-full border-2 hover:scale-110 transition-transform"
                style={{ backgroundColor: c, borderColor: form.status_color === c ? '#1d4ed8' : 'transparent' }}
              />
            ))}
            {form.status_color && (
              <button type="button" onClick={() => set('status_color', '')}
                className="text-[10px] text-gray-400 hover:text-gray-600 px-1">ล้าง</button>
            )}
          </div>
        </div>

        {/* Meters */}
        <Input
          label="หมายเลขมิเตอร์ไฟ"
          value={form.electric_meter_number}
          onChange={(e) => set('electric_meter_number', e.target.value)}
          placeholder="E-0001"
        />
        <Input
          label="หมายเลขมิเตอร์น้ำ"
          value={form.water_meter_number}
          onChange={(e) => set('water_meter_number', e.target.value)}
          placeholder="W-0001"
        />

        <Input
          label="เลขบ้านเลขที่"
          value={form.title_deed_number}
          onChange={(e) => set('title_deed_number', e.target.value)}
          placeholder="368/1"
          wrapperClass="col-span-2"
        />

        {/* Ownership */}
        <Select
          label="ประเภทการถือครอง"
          options={OWNERSHIP_OPTIONS}
          value={form.ownership}
          onChange={(e) => set('ownership', e.target.value)}
          wrapperClass={form.ownership === 'managed' ? '' : 'col-span-2'}
        />
        {form.ownership === 'managed' && (
          <Select
            label="เจ้าของห้อง"
            required
            options={owners}
            placeholder="เลือกเจ้าของ"
            value={form.owner_id}
            onChange={(e) => set('owner_id', e.target.value)}
          />
        )}

        {/* Status & Rentable */}
        <Select
          label="สถานะ"
          options={STATUS_OPTIONS}
          value={form.status}
          onChange={(e) => set('status', e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">เปิดรับเช่า</label>
          <button
            type="button"
            onClick={() => set('is_rentable', !form.is_rentable)}
            className={`relative inline-flex h-9 w-14 items-center rounded-lg border transition-colors ${
              form.is_rentable ? 'bg-blue-600 border-blue-600' : 'bg-gray-200 border-gray-200'
            }`}
          >
            <span className={`absolute left-1 h-7 w-7 rounded-md bg-white shadow transition-transform ${form.is_rentable ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <p className="text-xs text-gray-400">{form.is_rentable ? 'เปิดรับเช่า' : 'ปิดรับเช่า'}</p>
        </div>

        {/* Note */}
        <Textarea
          label="หมายเหตุภายใน"
          rows={2}
          value={form.internal_note}
          onChange={(e) => set('internal_note', e.target.value)}
          wrapperClass="col-span-2"
          placeholder="หมายเหตุสำหรับ staff เท่านั้น"
        />

        {error && <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}
      </form>
    </Modal>
  )
}
