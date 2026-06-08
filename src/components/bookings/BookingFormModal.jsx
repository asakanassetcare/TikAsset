import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import TenantSelect from '../shared/TenantSelect'
import { THAI_BANKS } from '../../lib/banks'
import { SLIP_REFERENCE_LABEL, SLIP_REFERENCE_PLACEHOLDER, normalizeSlipReference } from '../../lib/slipReference'

function localDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export default function BookingFormModal({ open, onClose, onSaved, prefillRoomId }) {
  const { profile } = useAuth()
  const [rooms,    setRooms]    = useState([])
  const [form,     setForm]     = useState({
    room_id: '', tenant_id: '', deposit_amount: '', note: '',
    paid_date: new Date().toISOString().slice(0, 10),
    bank_name: '', bank_reference: '',
  })
  const [slipFile, setSlipFile] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!open) return
    fetchRooms()
    setForm({
      room_id: prefillRoomId ?? '', tenant_id: '', deposit_amount: '', note: '',
      paid_date: new Date().toISOString().slice(0, 10),
      bank_name: '', bank_reference: '',
    })
    setSlipFile(null)
    setError('')
  }, [open, prefillRoomId])

  async function fetchRooms() {
    const todayStr = localDateString()
    const [{ data: availableRooms }, { data: activeContracts }, { data: waitingBookings }] = await Promise.all([
      supabase.from('rooms')
        .select('id, room_number, status, buildings(name)')
        .eq('status', 'available')
        .eq('is_rentable', true)
        .order('room_number'),
      supabase.from('contracts')
        .select('id, room_id, rooms(id, room_number, status, is_rentable, buildings(name))')
        .eq('status', 'active'),
      supabase.from('bookings')
        .select('room_id')
        .eq('status', 'waiting'),
    ])

    const bookedRoomIds = new Set((waitingBookings ?? []).map(b => b.room_id).filter(Boolean))
    const activeIds = (activeContracts ?? []).map(c => c.id)
    const { data: moveOuts } = activeIds.length > 0
      ? await supabase.from('move_outs')
        .select('id, contract_id, move_out_date, status')
        .in('contract_id', activeIds)
        .in('status', ['draft', 'pending_accounting', 'approved', 'settled'])
      : { data: [] }

    const activeById = Object.fromEntries((activeContracts ?? []).map(c => [c.id, c]))
    const listById = new Map()
    for (const r of availableRooms ?? []) {
      if (!bookedRoomIds.has(r.id)) listById.set(r.id, { ...r, _bookingMode: 'available' })
    }
    for (const mo of moveOuts ?? []) {
      if (mo.status === 'settled' && mo.move_out_date <= todayStr) continue
      const contract = activeById[mo.contract_id]
      const room = contract?.rooms
      if (!room?.id || room.is_rentable === false || bookedRoomIds.has(room.id)) continue
      listById.set(room.id, { ...room, _bookingMode: 'scheduled', _moveOutDate: mo.move_out_date })
    }

    const list = [...listById.values()].sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), 'th'))
    if (prefillRoomId && !list.find(r => r.id === prefillRoomId)) {
      setForm(p => ({ ...p, room_id: '' }))
      setError('ห้องนี้ไม่พร้อมให้จอง')
    }
    setRooms(list.map(r => ({
      value: r.id,
      label: `${r.buildings?.name ?? ''} — ${r.room_number}${r._bookingMode === 'scheduled' ? ` (จองหลังแจ้งออก ${r._moveOutDate})` : ''}`,
      ...r,
    })))
  }

  function set(field, val) { setForm(p => ({ ...p, [field]: val })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.room_id)      { setError('กรุณาเลือกห้อง'); return }
    if (!rooms.some(r => r.value === form.room_id)) { setError('ห้องนี้ไม่พร้อมให้จอง'); return }
    if (!form.tenant_id)    { setError('กรุณาเลือกผู้เช่า'); return }
    if (!form.paid_date)    { setError('กรุณากรอกวันที่ชำระเงินจอง'); return }
    if (!slipFile)          { setError('กรุณาแนบสลิปการโอน'); return }

    setSaving(true)
    setError('')

    // Upload slip first using room_id + timestamp as path
    const ext  = slipFile.name.split('.').pop()
    const path = `bookings/${form.room_id}_${Date.now()}.${ext}`
    const { data: sd, error: se } = await supabase.storage
      .from('payment-slips').upload(path, slipFile, { upsert: false })
    if (se) { setSaving(false); setError('อัปโหลดสลิปไม่สำเร็จ: ' + se.message); return }

    // Insert booking with all fields at once
    const { error: insertErr } = await supabase.from('bookings').insert({
      room_id:             form.room_id,
      tenant_id:           form.tenant_id,
      deposit_amount:      Number(form.deposit_amount) || 0,
      note:                form.note.trim() || null,
      created_by:          profile.id,
      slip_url:            sd.path,
      paid_date:           form.paid_date,
      bank_name:           form.bank_name || null,
      bank_reference:      normalizeSlipReference(form.bank_reference) || null,
      payment_recorded_by: profile.id,
      payment_recorded_at: new Date().toISOString(),
    })

    if (insertErr) { setSaving(false); setError(insertErr.message); return }

    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="สร้างการจอง"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button form="booking-form" type="submit" loading={saving}>บันทึก</Button>
        </>
      }
    >
      <form id="booking-form" onSubmit={handleSave} className="flex flex-col gap-4">

        {/* ── ข้อมูลการจอง ── */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">ข้อมูลการจอง</p>
          <Select
            label="ห้อง (เฉพาะห้องว่าง)"
            required
            options={rooms}
            placeholder="เลือกห้อง"
            value={form.room_id}
            onChange={e => set('room_id', e.target.value)}
            disabled={!!prefillRoomId && rooms.some(r => r.value === prefillRoomId)}
          />
          <TenantSelect
            label="ผู้เช่า"
            required
            value={form.tenant_id}
            onChange={id => set('tenant_id', id)}
          />
          <Input
            label="เงินจอง (฿)"
            type="number"
            min={0}
            value={form.deposit_amount}
            onChange={e => set('deposit_amount', e.target.value)}
            placeholder="5000"
          />
          <Textarea
            label="หมายเหตุ"
            rows={2}
            value={form.note}
            onChange={e => set('note', e.target.value)}
          />
        </div>

        <div className="border-t border-gray-100" />

        {/* ── บันทึกการชำระเงินจอง ── */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">การชำระเงินจอง</p>
          <Input
            label="วันที่ชำระ"
            type="date"
            required
            value={form.paid_date}
            onChange={e => set('paid_date', e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="ธนาคาร"
              options={THAI_BANKS}
              placeholder="— เลือกธนาคาร —"
              value={form.bank_name}
              onChange={e => set('bank_name', e.target.value)}
            />
            <Input
              label={SLIP_REFERENCE_LABEL}
              value={form.bank_reference}
              onChange={e => set('bank_reference', normalizeSlipReference(e.target.value))}
              inputMode="numeric"
              maxLength={4}
              placeholder={SLIP_REFERENCE_PLACEHOLDER}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              แนบสลิป <span className="text-red-500">*</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
              <Upload className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500 truncate">
                {slipFile ? slipFile.name : 'เลือกไฟล์ภาพ / PDF'}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={e => setSlipFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}
      </form>
    </Modal>
  )
}
