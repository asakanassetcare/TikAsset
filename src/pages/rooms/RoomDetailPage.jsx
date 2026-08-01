import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, DoorOpen, Users, FileText,
  Receipt, LogOut, Wrench, BookOpen, AlertCircle, CheckCircle2,
  Fingerprint, Plus, Trash2, Tag, RefreshCw, X, CalendarDays,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { isAtLeast } from '../../lib/permissions'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'
import Modal from '../../components/ui/Modal'
import BookingFormModal from '../../components/bookings/BookingFormModal'
import ContractFormModal from '../../components/contracts/ContractFormModal'
import MoveOutFormModal from '../../components/move-outs/MoveOutFormModal'

const THAI_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function localDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export default function RoomDetailPage() {
  const { roomId } = useParams()
  const navigate   = useNavigate()
  const { role }   = useAuth()
  const canDeleteAddon = isAtLeast(role, 'head_staff')

  const [room,        setRoom]        = useState(null)
  const [contract,    setContract]    = useState(null)
  const [tenant,      setTenant]      = useState(null)
  const [vehicles,    setVehicles]    = useState([])
  const [invoices,    setInvoices]    = useState([])
  const [moveOut,     setMoveOut]     = useState(null)
  const [booking,     setBooking]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [fingerprints,  setFingerprints]  = useState([])
  const [fpCode,        setFpCode]        = useState('')
  const [fpLabel,       setFpLabel]       = useState('')
  const [fpAdding,      setFpAdding]      = useState(false)
  const [fpShowForm,    setFpShowForm]     = useState(false)
  const [docStatus,     setDocStatus]     = useState(null)
  const [oldDebt,       setOldDebt]       = useState([])
  const [addons,        setAddons]        = useState([])
  const [addonForm,     setAddonForm]     = useState({ name: '', amount: '', billing_cycle: 'monthly' })
  const [addonAdding,   setAddonAdding]   = useState(false)
  const [addonShowForm, setAddonShowForm] = useState(false)
  const [bookingOpen,      setBookingOpen]      = useState(false)
  const [contractOpen,     setContractOpen]     = useState(false)
  const [moveOutOpen,      setMoveOutOpen]      = useState(false)
  const [scheduleOpen,     setScheduleOpen]     = useState(false)
  const [scheduleInvoices, setScheduleInvoices] = useState([])
  const [scheduleLoading,  setScheduleLoading]  = useState(false)

  useEffect(() => { fetchAll() }, [roomId])
  useEffect(() => { if (roomId) fetchFingerprints() }, [roomId])

  async function fetchAll() {
    setLoading(true)

    // Room info
    const { data: rm } = await supabase
      .from('rooms')
      .select('*, room_types(name), owners(id, full_name, phone), buildings(id, name, total_floors, projects(id, name))')
      .eq('id', roomId)
      .single()
    setRoom(rm)

    if (!rm) { setLoading(false); return }

    // Current contract. Approved contracts reserve the room until staff records move-in.
    const { data: ct } = await supabase
      .from('contracts')
      .select('*, tenants(id, full_name, phone, email, line_user_id), rooms(room_number, buildings(name))')
      .eq('room_id', roomId)
      .in('status', ['pending_approve', 'approved', 'active'])
      .is('actual_move_out_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setContract(ct ?? null)

    setTenant(ct?.tenants ?? null)

    // Vehicles for current tenant
    const tenantId = ct?.tenant_id
    if (tenantId) {
      const { data: vhs } = await supabase
        .from('tenant_vehicles')
        .select('id, plate_number, note')
        .eq('tenant_id', tenantId)
        .order('created_at')
      setVehicles(vhs ?? [])
    } else {
      setVehicles([])
    }

    // Document status for current contract
    if (ct?.id) {
      const tenantId = ct.tenant_id
      const [{ data: tenantDocs }, { data: contractDocs }] = await Promise.all([
        tenantId
          ? supabase.from('documents').select('id').eq('ref_table', 'tenants').eq('ref_id', tenantId).in('doc_type', ['id_card_front', 'id_card_back']).limit(1)
          : Promise.resolve({ data: [] }),
        supabase.from('documents').select('id').eq('ref_table', 'contracts').eq('ref_id', ct.id).eq('doc_type', 'contract_pdf').limit(1),
      ])
      setDocStatus({
        idCard:    (tenantDocs?.length ?? 0) > 0,
        contract:  (contractDocs?.length ?? 0) > 0,
        checklist: !!ct.checklist_in_url,
        line:      !!ct.tenants?.line_user_id,
      })
    } else {
      setDocStatus(null)
    }

    // Unpaid invoices for current contract
    if (ct?.id) {
      const { data: invs } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, due_date, status')
        .eq('contract_id', ct.id)
        .in('status', ['pending', 'overdue'])
        .order('due_date')
      setInvoices(invs ?? [])

      // Move-out for the current contract. Settled future move-outs still count.
      const todayStr = localDateString()
      const { data: mos } = await supabase
        .from('move_outs')
        .select('id, move_out_number, move_out_date, status')
        .eq('contract_id', ct.id)
        .in('status', ['draft', 'pending_accounting', 'approved', 'settled'])
        .order('created_at', { ascending: false })
      const activeMoveOut = (mos ?? []).find(mo => mo.status !== 'settled' || mo.move_out_date > todayStr)
      setMoveOut(activeMoveOut ?? null)
    } else {
      setInvoices([])
      setMoveOut(null)
    }

    // Pending booking for this room
    const { data: bk } = await supabase
      .from('bookings')
      .select('id, booking_number, tenants(full_name)')
      .eq('room_id', roomId)
      .eq('status', 'waiting')
      .maybeSingle()
    setBooking(bk ?? null)

    // Derive display/action status from the current contract/booking so stale
    // rooms.status cannot show an occupied room as available.
    const derivedStatus = ct?.status === 'active'
      ? 'occupied'
      : ct
        ? 'reserved'
        : bk
          ? (rm.status === 'available' ? 'reserved' : rm.status)
          : (rm.status === 'reserved' ? 'available' : rm.status)
    setRoom(prev => prev ? { ...prev, status: derivedStatus } : prev)

    // Addons for current contract
    if (ct?.id) {
      const { data: ads } = await supabase
        .from('contract_addons')
        .select('id, name, amount, billing_cycle, is_active')
        .eq('contract_id', ct.id)
        .eq('is_active', true)
        .order('created_at')
      setAddons(ads ?? [])
    } else {
      setAddons([])
    }

    // Overdue invoices from old (terminated) contracts of this room
    const { data: oldContracts } = await supabase
      .from('contracts')
      .select('id, contract_number, tenants(full_name)')
      .eq('room_id', roomId)
      .in('status', ['terminated', 'cancelled'])
    if (oldContracts?.length) {
      const oldIds = oldContracts.map(c => c.id)
      const { data: oldInvs } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, due_date, contract_id')
        .in('contract_id', oldIds)
        .eq('status', 'overdue')
        .order('due_date')
      const contractMap = Object.fromEntries(oldContracts.map(c => [c.id, c]))
      setOldDebt((oldInvs ?? []).map(inv => ({ ...inv, contract: contractMap[inv.contract_id] })))
    } else {
      setOldDebt([])
    }

    setLoading(false)
  }

  async function fetchFingerprints() {
    const { data } = await supabase
      .from('room_fingerprints')
      .select('id, code, label, created_at')
      .eq('room_id', roomId)
      .order('created_at')
    setFingerprints(data ?? [])
  }

  async function handleAddFingerprint(e) {
    e.preventDefault()
    if (!fpCode.trim()) return
    setFpAdding(true)
    const { error } = await supabase.from('room_fingerprints').insert({
      room_id: roomId,
      code:    fpCode.trim(),
      label:   fpLabel.trim() || null,
    })
    setFpAdding(false)
    if (error) { alert(error.message); return }
    setFpCode('')
    setFpLabel('')
    setFpShowForm(false)
    fetchFingerprints()
  }

  async function handleDeleteFingerprint(id) {
    if (!confirm('ลบรหัสนี้?')) return
    await supabase.from('room_fingerprints').delete().eq('id', id)
    fetchFingerprints()
  }

  async function handleAddAddon(e) {
    e.preventDefault()
    if (!addonForm.name.trim() || !addonForm.amount) return
    setAddonAdding(true)
    const { error } = await supabase.from('contract_addons').insert({
      contract_id:   contract.id,
      name:          addonForm.name.trim(),
      amount:        Number(addonForm.amount),
      billing_cycle: addonForm.billing_cycle,
    })
    setAddonAdding(false)
    if (error) { alert(error.message); return }
    setAddonForm({ name: '', amount: '', billing_cycle: 'monthly' })
    setAddonShowForm(false)
    fetchAll()
  }

  async function handleRemoveAddon(id, billing_cycle) {
    const msg = billing_cycle === 'monthly' ? 'ยกเลิกบริการเสริมนี้?' : 'ลบรายการค่าใช้จ่ายนี้?'
    if (!confirm(msg)) return
    if (billing_cycle === 'monthly') {
      await supabase.from('contract_addons').update({ is_active: false }).eq('id', id)
    } else {
      await supabase.from('contract_addons').delete().eq('id', id)
    }
    fetchAll()
  }

  async function openSchedule() {
    if (!contract?.id) return
    setScheduleOpen(true)
    setScheduleLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, billing_period, total_amount, due_date, status')
      .eq('contract_id', contract.id)
      .order('due_date')
    setScheduleInvoices(data ?? [])
    setScheduleLoading(false)
  }

  if (loading) return <PageSpinner />
  if (!room)   return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">ไม่พบข้อมูลห้อง</div>

  const overdueTotal = invoices.reduce((s, inv) => s + Number(inv.total_amount), 0)
  const hasIssue = overdueTotal > 0 || moveOut || booking

  return (
    <>
    <div className="mx-auto max-w-4xl">
      {/* Back + Header */}
      <div className="mb-6 flex items-start gap-4">
        <button onClick={() => navigate('/rooms')}
          className="mt-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">ห้อง {room.room_number}</h1>
            <Badge variant={room.status} />
            {room.ownership === 'managed' && (
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">ฝากบริหาร</span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {room.buildings?.projects?.name} › {room.buildings?.name}
            {room.floor ? ` · ชั้น ${room.floor}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left column */}
        <div className="flex flex-col gap-5 lg:col-span-2">

          {/* Alert bar */}
          {hasIssue && (
            <div className="flex flex-col gap-2">
              {overdueTotal > 0 && (
                <div className="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">
                    มียอดค้างชำระ <strong>฿{overdueTotal.toLocaleString('th-TH')}</strong>
                    {' '}({invoices.length} ใบ)
                  </p>
                  <Link to={`/invoices?contract=${contract?.id}`} className="ml-auto text-xs text-red-600 underline hover:no-underline">
                    ดูใบแจ้งหนี้
                  </Link>
                </div>
              )}
              {moveOut && (
                <div className="flex items-center gap-3 rounded-xl bg-orange-50 px-4 py-3">
                  <LogOut className="h-4 w-4 shrink-0 text-orange-500" />
                  <p className="text-sm text-orange-700">
                    แจ้งย้ายออกวันที่ <strong>{formatThaiDate(moveOut.move_out_date)}</strong>
                    {' '}· สถานะ: {{ draft: 'ร่าง', pending_accounting: 'รออนุมัติ', approved: 'รอบัญชี', settled: 'เคลียร์เงินแล้ว รอถึงวันย้ายออก' }[moveOut.status] ?? moveOut.status}
                  </p>
                  <Link to={`/move-outs/${moveOut.id}`} className="ml-auto text-xs text-orange-600 underline hover:no-underline">
                    ดูรายละเอียด
                  </Link>
                </div>
              )}
              {booking && (
                <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3">
                  <BookOpen className="h-4 w-4 shrink-0 text-blue-500" />
                  <p className="text-sm text-blue-700">
                    มีการจองล่วงหน้า
                    {booking.tenants?.full_name ? ` โดย ${booking.tenants.full_name}` : ''}
                  </p>
                  <Link to={`/bookings/${booking.id}`} className="ml-auto text-xs text-blue-600 underline hover:no-underline">
                    ดูการจอง
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ข้อมูลห้อง */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <DoorOpen className="h-4 w-4 text-gray-400" /> ข้อมูลห้อง
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <InfoRow label="ประเภทห้อง"  value={room.room_types?.name ?? '—'} />
              <InfoRow label="ขนาด"        value={room.size_sqm ? `${room.size_sqm} ม²` : '—'} />
              <InfoRow label="ชั้น"         value={room.floor ?? '—'} />
              <InfoRow label="ค่าเช่า/เดือน" value={`฿${Number(contract?.monthly_rent ?? room.base_rent).toLocaleString('th-TH')}`} />
              {room.water_rate && (
                <InfoRow label="ค่าน้ำ/หน่วย" value={`฿${Number(room.water_rate).toLocaleString('th-TH')}`} />
              )}
              {room.electric_rate && (
                <InfoRow label="ค่าไฟ/หน่วย" value={`฿${Number(room.electric_rate).toLocaleString('th-TH')}`} />
              )}
              {room.deposit_amount && (
                <InfoRow label="เงินประกัน" value={`฿${Number(room.deposit_amount).toLocaleString('th-TH')}`} />
              )}
              <InfoRow label="อาคาร"    value={room.buildings?.name ?? '—'} />
              <InfoRow label="โครงการ"  value={room.buildings?.projects?.name ?? '—'} />
            </div>
          </div>

          {/* ผู้เช่าปัจจุบัน */}
          {(tenant || contract) && (() => {
            const t = tenant ?? contract?.tenants
            return (
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Users className="h-4 w-4 text-gray-400" /> ผู้เช่าปัจจุบัน
                </h2>

                {/* Tenant info */}
                {t && (
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{t.full_name}</p>
                      {t.phone && <p className="mt-0.5 text-sm text-gray-500">{t.phone}</p>}
                      {t.email && <p className="text-xs text-gray-400">{t.email}</p>}
                      {vehicles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {vehicles.map(v => (
                            <span key={v.id}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-xs font-medium text-gray-700"
                              title={v.note || undefined}>
                              🚗 {v.plate_number}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Link to={`/tenants/${t.id}`}
                      className="shrink-0 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors">
                      ดูข้อมูลผู้เช่า →
                    </Link>
                  </div>
                )}

                {/* Contract info */}
                {contract && (
                  <div className={t ? 'border-t border-gray-50 pt-4' : ''}>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                      <InfoRow label="เลขสัญญา"   value={contract.contract_number} />
                      <InfoRow label="สถานะสัญญา" value={<Badge variant={contract.status} />} />
                      <InfoRow label="วันเริ่ม"   value={formatThaiDate(contract.contract_start_date)} />
                      <InfoRow label="วันสิ้นสุด" value={formatThaiDate(contract.contract_end_date)} />
                    </div>
                    <div className="mt-3">
                      <Link to={`/contracts/${contract.id}`}
                        className="text-xs text-blue-600 underline hover:no-underline">ดูสัญญาเต็ม →</Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ใบแจ้งหนี้ค้างชำระ */}
          {invoices.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-red-600">
                <Receipt className="h-4 w-4" /> ใบแจ้งหนี้ค้างชำระ ({invoices.length} ใบ)
              </h2>
              <div className="flex flex-col gap-2">
                {invoices.map(inv => (
                  <Link key={inv.id} to={`/invoices/${inv.id}`}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{inv.invoice_number}</p>
                      <p className="text-xs text-gray-400">ครบกำหนด {formatThaiDate(inv.due_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">฿{Number(inv.total_amount).toLocaleString('th-TH')}</p>
                      <Badge variant={inv.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* รหัสลายนิ้วมือ */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Fingerprint className="h-4 w-4 text-gray-400" /> รหัสลายนิ้วมือ ({fingerprints.length})
              </h2>
              <button
                type="button"
                onClick={() => { setFpShowForm(v => !v); setFpCode(''); setFpLabel('') }}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5" /> เพิ่มรหัส
              </button>
            </div>

            {fpShowForm && (
              <form onSubmit={handleAddFingerprint} className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fpCode}
                    onChange={e => setFpCode(e.target.value)}
                    placeholder="รหัส *"
                    required
                    className="h-8 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={fpLabel}
                    onChange={e => setFpLabel(e.target.value)}
                    placeholder="ชื่อ/หมายเหตุ"
                    className="h-8 w-32 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={fpAdding}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {fpAdding ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                  <button type="button" onClick={() => setFpShowForm(false)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                    ยกเลิก
                  </button>
                </div>
              </form>
            )}

            {fingerprints.length === 0 ? (
              <p className="text-sm text-gray-400">ยังไม่มีรหัสลายนิ้วมือ</p>
            ) : (
              <div className="flex flex-col gap-2">
                {fingerprints.map(fp => (
                  <div key={fp.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                    <div>
                      <p className="font-mono text-sm font-medium text-gray-800">{fp.code}</p>
                      {fp.label && <p className="text-xs text-gray-400">{fp.label}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteFingerprint(fp.id)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* บริการเสริม & ค่าใช้จ่าย */}
          {contract && (
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Tag className="h-4 w-4 text-gray-400" /> บริการเสริม & ค่าใช้จ่าย
                </h2>
                <button
                  type="button"
                  onClick={() => { setAddonShowForm(v => !v); setAddonForm({ name: '', amount: '', billing_cycle: 'monthly' }) }}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <Plus className="h-3.5 w-3.5" /> เพิ่มรายการ
                </button>
              </div>

              {addonShowForm && (
                <form onSubmit={handleAddAddon} className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={addonForm.name}
                      onChange={e => setAddonForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="ชื่อรายการ *"
                      required
                      className="h-8 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={addonForm.amount}
                      onChange={e => setAddonForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="จำนวนเงิน *"
                      required
                      className="h-8 w-28 rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <select
                      value={addonForm.billing_cycle}
                      onChange={e => setAddonForm(f => ({ ...f, billing_cycle: e.target.value }))}
                      className="h-8 flex-1 rounded-lg border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="monthly">รายเดือน (ทุกบิล)</option>
                      <option value="one_time">ครั้งเดียว (บิลถัดไป)</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={addonAdding}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {addonAdding ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                    <button type="button" onClick={() => setAddonShowForm(false)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                      ยกเลิก
                    </button>
                  </div>
                </form>
              )}

              {addons.length === 0 ? (
                <p className="text-sm text-gray-400">ยังไม่มีบริการเสริมหรือค่าใช้จ่าย</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {addons.map(addon => (
                    <div key={addon.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {addon.billing_cycle === 'monthly'
                          ? <RefreshCw className="h-3.5 w-3.5 shrink-0 text-blue-400" title="รายเดือน" />
                          : <Tag       className="h-3.5 w-3.5 shrink-0 text-orange-400" title="ครั้งเดียว" />
                        }
                        <div>
                          <p className="text-sm font-medium text-gray-800">{addon.name}</p>
                          <p className="text-xs text-gray-400">
                            {addon.billing_cycle === 'monthly' ? 'รายเดือน' : 'ค้างชำระในบิลถัดไป'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold text-gray-700">
                          ฿{Number(addon.amount).toLocaleString('th-TH')}
                        </p>
                        {canDeleteAddon && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAddon(addon.id, addon.billing_cycle)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right column — Quick Actions */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">การดำเนินการ</h2>
            <div className="flex flex-col gap-2">

              {/* Actions depend on room status */}
              {room.status === 'available' && room.is_rentable !== false && !booking && (
                <>
                  <ActionBtn icon={<BookOpen className="h-4 w-4" />} label="สร้างการจอง"
                    onClick={() => setBookingOpen(true)} color="blue" />
                  <ActionBtn icon={<FileText className="h-4 w-4" />} label="สร้างสัญญาตรง"
                    onClick={() => setContractOpen(true)} color="blue" />
                </>
              )}

              {room.status === 'occupied' && room.is_rentable !== false && moveOut && !booking && (
                <ActionBtn icon={<BookOpen className="h-4 w-4" />} label="สร้างการจองล่วงหน้า"
                  onClick={() => setBookingOpen(true)} color="blue" />
              )}

              {room.status === 'reserved' && booking && (
                <ActionBtn icon={<BookOpen className="h-4 w-4" />} label="จัดการการจอง"
                  onClick={() => navigate(`/bookings/${booking.id}`)} color="orange" />
              )}

              {room.status === 'occupied' && booking && (
                <ActionBtn icon={<BookOpen className="h-4 w-4" />} label="จัดการการจองล่วงหน้า"
                  onClick={() => navigate(`/bookings/${booking.id}`)} color="orange" />
              )}

              {contract && (
                <>
                  <ActionBtn icon={<FileText className="h-4 w-4" />} label={contract.status === 'approved' ? 'บันทึกเข้าพัก' : 'ดูสัญญา'}
                    onClick={() => navigate(`/contracts/${contract?.id}`)} color="blue" />
                  <ActionBtn icon={<CalendarDays className="h-4 w-4" />} label="ดูตารางชำระเงิน"
                    onClick={openSchedule} color="gray" />
                  {contract.status === 'active' && (
                    <>
                      {!moveOut && (
                        <ActionBtn icon={<LogOut className="h-4 w-4" />} label="บันทึกแจ้งออก"
                          onClick={() => setMoveOutOpen(true)} color="red" />
                      )}
                    </>
                  )}
                </>
              )}

              <div className="my-1 border-t border-gray-100" />

              <ActionBtn icon={<Wrench className="h-4 w-4" />} label="แจ้งซ่อม"
                onClick={() => navigate('/maintenance', { state: { prefillRoomId: room.id, prefillBuildingId: room.buildings?.id } })} color="gray" />

              {room.ownership === 'managed' && room.owners && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <div className="rounded-lg bg-purple-50 p-3">
                    <p className="text-xs font-medium text-purple-700">เจ้าของห้อง</p>
                    <p className="mt-1 text-sm font-semibold text-gray-800">{room.owners.full_name}</p>
                    {room.owners.phone && <p className="text-xs text-gray-500">{room.owners.phone}</p>}
                    <Link to={`/owners/${room.owners.id}`}
                      className="mt-1 inline-block text-xs text-purple-600 underline hover:no-underline">
                      ดูโปรไฟล์เจ้าของ
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Room health summary */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">สถานะห้อง</h2>
            <div className="flex flex-col gap-2">
              <StatusCheck
                ok={room.status === 'available'}
                label="พร้อมปล่อยเช่า"
                failLabel={
                  room.status === 'occupied'    ? 'มีผู้เช่าอยู่' :
                  room.status === 'reserved'    ? 'จองแล้ว' :
                  room.status === 'maintenance' ? 'อยู่ระหว่างซ่อมบำรุง' :
                  'ปิดใช้งาน'
                }
              />
              <StatusCheck ok={overdueTotal === 0}         label="ไม่มีค้างชำระ"       failLabel="มีค้างชำระ" />
              <StatusCheck ok={!moveOut}                   label="ไม่มีแจ้งออกค้างอยู่" failLabel="มีการแจ้งออกค้างอยู่" />
              <StatusCheck ok={contract?.status === 'active' || room.status !== 'occupied'} label="สัญญาถูกต้อง" failLabel="สัญญาไม่ถูกต้อง" />
            </div>
          </div>

          {/* Document status (from active contract) */}
          {docStatus && (
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">สถานะเอกสาร</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'บัตรประชาชน',       ok: docStatus.idCard,    href: contract?.tenant_id ? `/tenants/${contract.tenant_id}?tab=docs` : null },
                  { label: 'สัญญาเช่า',         ok: docStatus.contract,  href: `/contracts/${contract?.id}?tab=documents` },
                  { label: 'Checklist ตอนเข้า', ok: docStatus.checklist, href: null },
                  { label: 'LINE',              ok: docStatus.line,      href: null },
                ].map(({ label, ok, href }) => {
                  const inner = (
                    <>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${ok ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-600'}`}>
                        {ok ? '✓' : '✗'}
                      </span>
                      <span className={`text-xs font-medium ${ok ? 'text-green-800' : 'text-red-700'}`}>{label}</span>
                    </>
                  )
                  const cls = `flex items-center gap-2 rounded-lg px-3 py-2 ${ok ? 'bg-green-50' : 'bg-red-50'} ${href ? 'cursor-pointer hover:opacity-80' : ''}`
                  return href
                    ? <Link key={label} to={href} className={cls}>{inner}</Link>
                    : <div key={label} className={cls}>{inner}</div>
                })}
              </div>
            </div>
          )}

          {/* ยอดค้างชำระของผู้เช่าเดิม */}
          {oldDebt.length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-orange-700">
                <AlertCircle className="h-4 w-4" />
                ยอดค้างชำระจากผู้เช่าเดิม
              </h2>
              <div className="flex flex-col gap-2">
                {oldDebt.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between text-sm cursor-pointer hover:opacity-80"
                    onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <div>
                      <p className="font-medium text-gray-800">{inv.invoice_number}</p>
                      <p className="text-xs text-gray-500">{inv.contract?.tenants?.full_name} · ครบ {formatThaiDate(inv.due_date)}</p>
                    </div>
                    <span className="font-semibold text-orange-700">฿{Number(inv.total_amount).toLocaleString('th-TH')}</span>
                  </div>
                ))}
                <div className="mt-1 border-t border-orange-200 pt-2 flex justify-between text-sm font-semibold text-orange-800">
                  <span>รวม</span>
                  <span>฿{oldDebt.reduce((s, i) => s + Number(i.total_amount), 0).toLocaleString('th-TH')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    <BookingFormModal
      open={bookingOpen}
      onClose={() => setBookingOpen(false)}
      prefillRoomId={room.id}
      onSaved={() => { setBookingOpen(false); fetchAll() }}
    />
    <ContractFormModal
      open={contractOpen}
      onClose={() => setContractOpen(false)}
      prefillRoom={room}
      onSaved={(id) => { setContractOpen(false); navigate(`/contracts/${id}`) }}
    />
    <MoveOutFormModal
      open={moveOutOpen}
      onClose={() => setMoveOutOpen(false)}
      contract={contract}
      onSaved={(moveOutId) => { setMoveOutOpen(false); navigate(`/move-outs/${moveOutId}`) }}
    />

    {/* Payment Schedule Modal */}
    <Modal
      open={scheduleOpen}
      onClose={() => setScheduleOpen(false)}
      title={`ตารางชำระเงิน — ห้อง ${room?.room_number}`}
      footer={<button onClick={() => setScheduleOpen(false)}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ปิด</button>}
    >
      {scheduleLoading ? (
        <div className="py-8 text-center text-sm text-gray-400">กำลังโหลด...</div>
      ) : (() => {
        const startDate = contract?.contract_start_date
        const endDate   = contract?.contract_end_date
        if (!startDate) return <p className="py-4 text-center text-sm text-gray-500">ไม่พบข้อมูลวันเริ่มสัญญา</p>

        const startD = new Date(startDate + 'T00:00:00')
        const endD   = endDate
          ? new Date(endDate + 'T00:00:00')
          : new Date(startD.getFullYear() + 1, startD.getMonth() - 1, 28)

        const pad = n => String(n).padStart(2, '0')
        const contractStartKey = `${startD.getFullYear()}-${pad(startD.getMonth() + 1)}`
        const contractEndKey   = `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}`

        const invMap = Object.fromEntries(
          scheduleInvoices.map(inv => {
            const key = inv.billing_period ?? inv.due_date?.slice(0, 7)
            return key ? [key, inv] : []
          }).filter(e => e.length)
        )

        const years = []
        for (let y = startD.getFullYear(); y <= endD.getFullYear(); y++) {
          const months = []
          for (let m = 1; m <= 12; m++) {
            const key = `${y}-${pad(m)}`
            months.push({ key, month: m, outside: key < contractStartKey || key > contractEndKey, invoice: invMap[key] ?? null })
          }
          years.push({ year: y, months })
        }

        return (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
              {[
                { cls: 'bg-gray-100 border-gray-200',     label: 'นอกสัญญา' },
                { cls: 'bg-white border-gray-300',         label: 'ยังไม่ถึงรอบ' },
                { cls: 'bg-yellow-50 border-yellow-300',   label: 'รอชำระ' },
                { cls: 'bg-red-50 border-red-300',         label: 'เลยกำหนด' },
                { cls: 'bg-green-50 border-green-300',     label: 'ชำระแล้ว' },
              ].map(({ cls, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`inline-block h-3 w-3 rounded border ${cls}`} />
                  {label}
                </span>
              ))}
            </div>

            {years.map(({ year, months }) => (
              <div key={year}>
                <p className="mb-2 text-xs font-semibold text-gray-400">พ.ศ. {year + 543}</p>
                <div className="grid grid-cols-4 gap-2">
                  {months.map(({ key, month, outside, invoice }) => {
                    let cls = 'rounded-lg border px-1 py-2.5 text-center text-xs font-medium transition-colors select-none'
                    let canClick = false
                    if (outside) {
                      cls += ' bg-gray-50 border-gray-100 text-gray-300'
                    } else if (!invoice) {
                      cls += ' bg-white border-gray-200 text-gray-400'
                    } else if (invoice.status === 'paid' || invoice.status === 'receipt_voided') {
                      cls += ' bg-green-50 border-green-300 text-green-700 cursor-pointer hover:bg-green-100'
                      canClick = true
                    } else if (invoice.status === 'overdue') {
                      cls += ' bg-red-50 border-red-300 text-red-700 cursor-pointer hover:bg-red-100'
                      canClick = true
                    } else if (invoice.status === 'pending') {
                      cls += ' bg-yellow-50 border-yellow-300 text-yellow-700 cursor-pointer hover:bg-yellow-100'
                      canClick = true
                    } else {
                      cls += ' bg-white border-gray-200 text-gray-400'
                    }
                    return (
                      <button key={key} disabled={!canClick}
                        onClick={() => { if (canClick) { setScheduleOpen(false); navigate(`/invoices/${invoice.id}`) } }}
                        className={cls}
                      >
                        <span className="block">{THAI_MONTH_SHORT[month - 1]}</span>
                        {invoice && (
                          <span className="block mt-0.5 text-[10px] leading-none opacity-75">
                            ฿{Number(invoice.total_amount).toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })()}
    </Modal>
    </>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-800">{value ?? '—'}</p>
    </div>
  )
}

function ActionBtn({ icon, label, onClick, color = 'gray' }) {
  const colors = {
    blue:   'text-blue-700 border-blue-200 hover:bg-blue-50',
    orange: 'text-orange-700 border-orange-200 hover:bg-orange-50',
    red:    'text-red-700 border-red-200 hover:bg-red-50',
    gray:   'text-gray-700 border-gray-200 hover:bg-gray-50',
  }
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${colors[color]}`}>
      {icon}
      {label}
    </button>
  )
}

function StatusCheck({ ok, label, failLabel }) {
  const text = !ok && failLabel ? failLabel : label
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok
        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        : <AlertCircle  className="h-4 w-4 shrink-0 text-red-400" />
      }
      <span className={ok ? 'text-gray-600' : 'text-red-500'}>{text}</span>
    </div>
  )
}
