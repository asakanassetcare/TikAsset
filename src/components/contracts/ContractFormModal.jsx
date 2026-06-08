import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import TenantSelect from '../shared/TenantSelect'

const EMPTY = {
  room_id: '', tenant_id: '',
  contract_start_date: '', contract_end_date: '', move_in_date: '',
  monthly_rent: '', deposit_amount: '', advance_rent_amount: '',
  payment_day: '1',
  booking_deposit_applied: '0',
  electric_meter_start: '', water_meter_start: '',
  assigned_staff_id: '',
  management_fee_amount: '0',
  note: '',
}

function localDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export default function ContractFormModal({ open, onClose, onSaved, prefillRoom, prefillBooking }) {
  const { profile } = useAuth()
  const [form,         setForm]         = useState(EMPTY)
  const [rooms,        setRooms]        = useState([])
  const [staff,        setStaff]        = useState([])
  const [prefillTenant, setPrefillTenant] = useState(null)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [lastMeters, setLastMeters] = useState({ electric: null, water: null })

  useEffect(() => {
    if (!open) return
    fetchOptions()
    setError('')
    setLastMeters({ electric: null, water: null })
    const room = prefillBooking?.rooms ?? prefillRoom ?? null
    const tenant = prefillBooking?.tenants ?? null
    setSelectedRoom(room)
    setPrefillTenant(tenant)
    setForm({
      ...EMPTY,
      room_id:                  room?.id ?? '',
      tenant_id:                tenant?.id ?? '',
      monthly_rent:             String(room?.base_rent ?? ''),
      deposit_amount:           String(room?.base_deposit ?? ''),
      advance_rent_amount:      String(room?.base_advance ?? ''),
      booking_deposit_applied:  String(prefillBooking?.deposit_amount ?? '0'),
      assigned_staff_id:        profile?.id ?? '',
    })
    if (room?.id) fetchLastMeters(room.id)
  }, [open, prefillRoom, prefillBooking])

  async function fetchLastMeters(roomId) {
    const { data } = await supabase
      .from('contracts')
      .select('electric_meter_end, water_meter_end')
      .eq('room_id', roomId)
      .not('electric_meter_end', 'is', null)
      .order('contract_end_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      setLastMeters({
        electric: data.electric_meter_end != null ? Number(data.electric_meter_end) : null,
        water:    data.water_meter_end    != null ? Number(data.water_meter_end)    : null,
      })
    }
  }

  async function fetchOptions() {
    const roomId = prefillBooking?.room_id ?? prefillRoom?.id
    const [{ data: rms }, { data: stf }] = await Promise.all([
      supabase.from('rooms')
        .select('id, room_number, base_rent, base_deposit, base_advance, ownership, buildings(name)')
        .in('status', ['available', 'reserved'])
        .eq('is_rentable', true)
        .order('room_number'),
      supabase.from('profiles').select('id, full_name').in('role', ['super_admin', 'head_staff', 'staff']).order('full_name'),
    ])
    // If prefilled room isn't in the list (already reserved for this booking), include it separately
    let roomList = rms ?? []
    if (roomId && !roomList.find(r => r.id === roomId) && (prefillBooking?.rooms || prefillRoom)) {
      const src = prefillBooking?.rooms ?? prefillRoom
      roomList = [{ ...src, buildings: src.buildings ?? {} }, ...roomList]
    }
    setRooms(roomList.map(r => ({ value: r.id, label: `${r.buildings?.name ?? ''} — ${r.room_number}`, ...r })))
    setStaff(stf?.map(s => ({ value: s.id, label: s.full_name })) ?? [])
  }

  async function getContractBlockReason(roomId) {
    const todayStr = localDateString()
    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('id, contract_number, status')
      .eq('room_id', roomId)
      .in('status', ['pending_approve', 'approved', 'active'])
      .order('created_at', { ascending: false })
    if (error) return error.message
    if (!contracts?.length) return ''

    const activeContract = contracts.find(c => c.status === 'active')
    const blockingContract = contracts.find(c => c.status !== 'active')
    if (blockingContract) return `ห้องนี้มีสัญญา ${blockingContract.contract_number ?? ''} ที่ยังไม่เสร็จสิ้น`
    if (!activeContract) return ''

    const { data: moveOut } = await supabase
      .from('move_outs')
      .select('id, move_out_date, status')
      .eq('contract_id', activeContract.id)
      .in('status', ['approved', 'settled'])
      .lte('move_out_date', todayStr)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return moveOut ? '' : 'ห้องนี้ยังมีผู้เช่าเดิมอยู่ ต้องรอให้หัวหน้าอนุมัติแจ้งออกและถึงวันย้ายออกก่อนสร้างสัญญา'
  }

  function set(field, val) {
    setForm(p => {
      const next = { ...p, [field]: val }
      if (field === 'room_id') {
        const r = rooms.find(r => r.value === val)
        setSelectedRoom(r ?? null)
        setLastMeters({ electric: null, water: null })
        if (r) {
          next.monthly_rent        = String(r.base_rent ?? '')
          next.deposit_amount      = String(r.base_deposit ?? '')
          next.advance_rent_amount = String(r.base_advance ?? '')
          fetchLastMeters(val)
        }
      }
      if (field === 'contract_start_date' && val) {
        const [y, m, d] = val.split('-').map(Number)
        const end = new Date(y + 1, m - 1, d)
        next.contract_end_date = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`
      }
      return next
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (prefillBooking && prefillBooking.status !== 'waiting') {
      setError('การจองนี้ถูกยกเลิกหรือแปลงสัญญาไปแล้ว ไม่สามารถใช้สร้างสัญญาใหม่ได้')
      return
    }
    if (!form.room_id)               { setError('กรุณาเลือกห้อง'); return }
    if (!form.tenant_id)             { setError('กรุณาเลือกผู้เช่า'); return }
    if (!form.contract_start_date)   { setError('กรุณากรอกวันเริ่มสัญญา'); return }
    if (!form.contract_end_date)     { setError('กรุณากรอกวันสิ้นสุดสัญญา'); return }
    if (!form.move_in_date)          { setError('กรุณากรอกวันกำหนดเข้าพัก'); return }
    if (!form.monthly_rent)             { setError('กรุณากรอกค่าเช่า'); return }
    if (form.deposit_amount === '')     { setError('กรุณากรอกเงินประกัน'); return }
    if (form.advance_rent_amount === '') { setError('กรุณากรอกค่าเช่าล่วงหน้า'); return }
    if (form.electric_meter_start === '') { setError('กรุณากรอกเลขมิเตอร์ไฟเริ่มต้น'); return }
    if (form.water_meter_start === '')    { setError('กรุณากรอกเลขมิเตอร์น้ำเริ่มต้น'); return }
    const canOverrideMeter = ['super_admin', 'executive', 'head_staff'].includes(profile?.role)
    if (lastMeters.electric != null && Number(form.electric_meter_start) < lastMeters.electric) {
      if (!canOverrideMeter) {
        setError(`เลขมิเตอร์ไฟต้องไม่น้อยกว่าค่าเดิม (${lastMeters.electric}) — หากเปลี่ยนมิเตอร์ใหม่ต้องให้หัวหน้าเป็นผู้บันทึก`)
        return
      }
    }
    if (lastMeters.water != null && Number(form.water_meter_start) < lastMeters.water) {
      if (!canOverrideMeter) {
        setError(`เลขมิเตอร์น้ำต้องไม่น้อยกว่าค่าเดิม (${lastMeters.water}) — หากเปลี่ยนมิเตอร์ใหม่ต้องให้หัวหน้าเป็นผู้บันทึก`)
        return
      }
    }
    if (!form.assigned_staff_id)        { setError('กรุณาเลือก staff ที่รับผิดชอบ'); return }
    if (Number(form.payment_day) < 1 || Number(form.payment_day) > 28) {
      setError('วันชำระต้องอยู่ระหว่าง 1–28'); return
    }
    setError('')
    setSaving(true)

    if (prefillBooking?.id) {
      const { data: freshBooking, error: bookingStatusErr } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('id', prefillBooking.id)
        .maybeSingle()
      if (bookingStatusErr) { setSaving(false); setError(bookingStatusErr.message); return }
      if (freshBooking?.status !== 'waiting') {
        setSaving(false)
        setError('การจองนี้ถูกยกเลิกหรือแปลงสัญญาไปแล้ว ไม่สามารถใช้สร้างสัญญาใหม่ได้')
        return
      }
    }

    const blockReason = await getContractBlockReason(form.room_id)
    if (blockReason) { setSaving(false); setError(blockReason); return }

    const payload = {
      room_id:                  form.room_id,
      tenant_id:                form.tenant_id,
      booking_id:               prefillBooking?.id ?? null,
      contract_start_date:      form.contract_start_date,
      contract_end_date:        form.contract_end_date,
      move_in_date:             form.move_in_date,
      monthly_rent:             Number(form.monthly_rent),
      deposit_amount:           Number(form.deposit_amount) || 0,
      advance_rent_amount:      Number(form.advance_rent_amount) || 0,
      payment_day:              Number(form.payment_day) || 1,
      booking_deposit_applied:  Number(form.booking_deposit_applied) || 0,
      electric_meter_start:     form.electric_meter_start ? Number(form.electric_meter_start) : null,
      water_meter_start:        form.water_meter_start ? Number(form.water_meter_start) : null,
      assigned_staff_id:        form.assigned_staff_id,
      management_fee_amount:    selectedRoom?.ownership === 'managed' ? Number(form.management_fee_amount) || 0 : 0,
      note:                     form.note.trim() || null,
      created_by:               profile.id,
      status:                   'pending_approve',
    }

    let savedContractId = null
    if (prefillBooking?.id) {
      const { data, error } = await supabase.rpc('create_contract_from_booking', {
        p_booking_id: prefillBooking.id,
        p_contract_start_date: form.contract_start_date,
        p_contract_end_date: form.contract_end_date,
        p_move_in_date: form.move_in_date,
        p_monthly_rent: Number(form.monthly_rent),
        p_deposit_amount: Number(form.deposit_amount) || 0,
        p_advance_rent_amount: Number(form.advance_rent_amount) || 0,
        p_payment_day: Number(form.payment_day) || 1,
        p_booking_deposit_applied: Number(form.booking_deposit_applied) || 0,
        p_electric_meter_start: form.electric_meter_start ? Number(form.electric_meter_start) : null,
        p_water_meter_start: form.water_meter_start ? Number(form.water_meter_start) : null,
        p_assigned_staff_id: form.assigned_staff_id,
        p_management_fee_amount: selectedRoom?.ownership === 'managed' ? Number(form.management_fee_amount) || 0 : 0,
        p_note: form.note.trim() || null,
      })
      if (error) { setSaving(false); setError(error.message); return }
      savedContractId = data
    } else {
      const { data, error } = await supabase.from('contracts').insert(payload).select('id').single()
      if (error) { setSaving(false); setError(error.message); return }
      savedContractId = data.id
    }

    setSaving(false)
    onSaved?.(savedContractId)
  }

  const lockRoom = !!(prefillRoom?.id || prefillBooking?.room_id)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={prefillBooking ? `แปลงการจอง ${prefillBooking.booking_number} เป็นสัญญา` : 'สร้างสัญญา'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button form="contract-form" type="submit" loading={saving}>บันทึกสัญญา</Button>
        </>
      }
    >
      <form id="contract-form" onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Room + Tenant */}
        {lockRoom ? (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">ห้อง</label>
            <div className="flex h-9 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
              {(() => { const src = prefillBooking?.rooms ?? prefillRoom; return `${src?.buildings?.name ?? ''} — ${src?.room_number ?? ''}` })()}
            </div>
          </div>
        ) : (
          <Select label="ห้อง" required options={rooms} placeholder="เลือกห้อง"
            value={form.room_id} onChange={e => set('room_id', e.target.value)}
            wrapperClass="col-span-2" />
        )}
        <TenantSelect
          label="ผู้เช่า"
          required
          value={form.tenant_id}
          prefillTenant={prefillTenant}
          onChange={id => set('tenant_id', id)}
          wrapperClass={lockRoom ? 'col-span-1' : 'col-span-2'}
        />

        {/* Dates */}
        <Input label="วันเริ่มสัญญา" type="date" required value={form.contract_start_date} onChange={e => set('contract_start_date', e.target.value)} />
        <Input label="วันสิ้นสุดสัญญา" type="date" required value={form.contract_end_date} onChange={e => set('contract_end_date', e.target.value)} />
        <Input label="วันกำหนดเข้าพัก" type="date" required value={form.move_in_date} onChange={e => set('move_in_date', e.target.value)} />
        <Input label="ชำระทุกวันที่ (1–28)" type="number" min={1} max={28} required
          value={form.payment_day} onChange={e => set('payment_day', e.target.value)} />

        {/* Money */}
        <Input label="ค่าเช่ารายเดือน (฿)" type="number" min={0} required
          value={form.monthly_rent} onChange={e => set('monthly_rent', e.target.value)} />
        <Input label="เงินประกัน (฿)" type="number" min={0} required
          value={form.deposit_amount} onChange={e => set('deposit_amount', e.target.value)} />
        <Input label="ค่าเช่าล่วงหน้า (฿)" type="number" min={0} required
          value={form.advance_rent_amount} onChange={e => set('advance_rent_amount', e.target.value)} />
        <Input label="หักเงินจอง (฿)" type="number" min={0}
          value={form.booking_deposit_applied}
          onChange={prefillBooking ? undefined : e => set('booking_deposit_applied', e.target.value)}
          readOnly={!!prefillBooking}
          disabled={!!prefillBooking}
          hint={prefillBooking ? `เงินจองที่มี: ฿${Number(prefillBooking.deposit_amount).toLocaleString('th-TH')}` : undefined} />

        {/* Meters */}
        <Input label="เลขมิเตอร์ไฟเริ่มต้น" type="number" step="0.01" min={0} required
          value={form.electric_meter_start} onChange={e => set('electric_meter_start', e.target.value)}
          hint={lastMeters.electric != null ? `มิเตอร์ครั้งก่อน: ${lastMeters.electric}` : undefined} />
        <Input label="เลขมิเตอร์น้ำเริ่มต้น" type="number" step="0.01" min={0} required
          value={form.water_meter_start} onChange={e => set('water_meter_start', e.target.value)}
          hint={lastMeters.water != null ? `มิเตอร์ครั้งก่อน: ${lastMeters.water}` : undefined} />

        {/* Staff */}
        <Select label="Staff ที่รับผิดชอบ" required options={staff} placeholder="เลือก staff"
          value={form.assigned_staff_id} onChange={e => set('assigned_staff_id', e.target.value)}
          wrapperClass="col-span-2" />

        {/* Management fee (managed rooms only) */}
        {selectedRoom?.ownership === 'managed' && (
          <Input label="ค่าบริหาร (฿)" type="number" min={0}
            value={form.management_fee_amount} onChange={e => set('management_fee_amount', e.target.value)}
            hint="สำหรับห้องฝากบริหาร" />
        )}

        {/* Optional info */}
        <Textarea label="หมายเหตุ" rows={2} value={form.note} onChange={e => set('note', e.target.value)} wrapperClass="col-span-2" />

        {error && <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}
      </form>
    </Modal>
  )
}
