import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, FileText, X, Upload, CreditCard, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate, formatThaiDateTime } from '../../lib/date'
import { isAtLeast } from '../../lib/permissions'
import ContractFormModal from '../../components/contracts/ContractFormModal'
import PdfDownloadButton from '../../components/pdf/PdfDownloadButton'
import BookingReceiptPDF from '../../components/pdf/BookingReceiptPDF'
import { THAI_BANKS } from '../../lib/banks'
import { SLIP_REFERENCE_LABEL, SLIP_REFERENCE_PLACEHOLDER, normalizeSlipReference } from '../../lib/slipReference'

const DEPOSIT_ACTION_OPTS = [
  { value: 'refunded', label: 'คืนเงินจองให้ผู้เช่า' },
  { value: 'kept',     label: 'ยึดเงินจอง' },
]

function localDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export default function BookingDetailPage() {
  const { bookingId } = useParams()
  const navigate      = useNavigate()
  const { profile, role } = useAuth()
  const { settings }  = useSettings()

  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)

  // Cancel
  const [cancelModal,   setCancelModal]   = useState(false)
  const [cancelReason,  setCancelReason]  = useState('')
  const [depositAction, setDepositAction] = useState('refunded')
  const [cancelling,    setCancelling]    = useState(false)
  const [cancelError,   setCancelError]   = useState('')

  // Contract
  const [contractModal, setContractModal] = useState(false)
  const [contractBlockReason, setContractBlockReason] = useState('')

  // Payment recording
  const [payModal,      setPayModal]      = useState(false)
  const [payForm,       setPayForm]       = useState({ paid_date: '', bank_name: '', bank_reference: '' })
  const [slipFiles,           setSlipFiles]           = useState([])
  const [slipSignedUrl,       setSlipSignedUrl]       = useState(null)
  const [extraSlipSignedUrls, setExtraSlipSignedUrls] = useState([])
  const [paying,        setPaying]        = useState(false)
  const [payError,      setPayError]      = useState('')
  const [managerApproving, setManagerApproving] = useState(false)

  useEffect(() => { fetchBooking() }, [bookingId])

  async function fetchBooking() {
    const { data } = await supabase
      .from('bookings')
      .select(`
        *,
        rooms(id, room_number, title_deed_number, floor, base_rent, base_deposit, base_advance, ownership, status_color, status,
              buildings(id, name, project_id, projects(name))),
        tenants(id, full_name, phone, email),
        profiles!created_by(full_name),
        payment_recorder:profiles!payment_recorded_by(full_name)
      `)
      .eq('id', bookingId)
      .single()
    if (!data) { navigate('/bookings'); return }
    setBooking(data)
    setContractBlockReason(await getContractBlockReason(data.room_id))

    if (data.slip_url) {
      const { data: urlData } = await supabase.storage
        .from('payment-slips')
        .createSignedUrl(data.slip_url, 3600)
      setSlipSignedUrl(urlData?.signedUrl ?? null)
    }
    if (data.extra_slips?.length) {
      const urls = await Promise.all(
        data.extra_slips.map(path =>
          supabase.storage.from('payment-slips').createSignedUrl(path, 3600).then(r => r.data?.signedUrl ?? null)
        )
      )
      setExtraSlipSignedUrls(urls.filter(Boolean))
    } else {
      setExtraSlipSignedUrls([])
    }

    setLoading(false)
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

  function openPayModal() {
    setPayForm({
      paid_date:      new Date().toISOString().slice(0, 10),
      bank_name:      booking.bank_name      ?? '',
      bank_reference: normalizeSlipReference(booking.bank_reference),
    })
    setSlipFiles([])
    setPayError('')
    setPayModal(true)
  }

  async function handleSavePayment(e) {
    e.preventDefault()
    if (!payForm.paid_date)          { setPayError('กรุณากรอกวันที่ชำระ'); return }
    if (!slipFiles.length && !booking.slip_url) { setPayError('กรุณาแนบสลิป'); return }
    setPaying(true)

    const uploadedPaths = []
    for (const file of slipFiles) {
      const ext  = file.name.split('.').pop()
      const path = `bookings/${bookingId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { data: sd, error: se } = await supabase.storage
        .from('payment-slips').upload(path, file, { upsert: false })
      if (se) { setPaying(false); setPayError('อัปโหลดสลิปไม่สำเร็จ'); return }
      uploadedPaths.push(sd.path)
    }
    let slipUrl = booking.slip_url ?? null
    let newExtraSlips = [...(booking.extra_slips ?? [])]
    if (!slipUrl && uploadedPaths.length > 0) {
      slipUrl = uploadedPaths[0]
      newExtraSlips = [...newExtraSlips, ...uploadedPaths.slice(1)]
    } else {
      newExtraSlips = [...newExtraSlips, ...uploadedPaths]
    }

    const { error } = await supabase.from('bookings').update({
      slip_url:             slipUrl,
      extra_slips:          newExtraSlips.length > 0 ? newExtraSlips : null,
      paid_date:            payForm.paid_date,
      bank_name:            payForm.bank_name || null,
      bank_reference:       normalizeSlipReference(payForm.bank_reference) || null,
      payment_recorded_by:  profile.id,
      payment_recorded_at:  new Date().toISOString(),
    }).eq('id', bookingId)

    setPaying(false)
    if (error) { setPayError(error.message); return }
    setPayModal(false)
    fetchBooking()
  }

  async function handleManagerApprovePayment() {
    setManagerApproving(true)
    const { data: updated, error } = await supabase.from('bookings').update({
      head_approved_by:       profile.id,
      head_approved_at:       new Date().toISOString(),
      head_rejected_by:       null,
      head_rejected_at:       null,
      head_rejection_reason:  null,
    })
      .eq('id', bookingId)
      .eq('status', 'waiting')
      .is('head_approved_at', null)
      .is('head_rejected_at', null)
      .select('id')
    setManagerApproving(false)
    if (error) {
      alert(error.message)
      return
    }
    if (!updated || updated.length === 0) {
      alert('รายการนี้ถูกอนุมัติหรือปฏิเสธไปแล้ว กรุณารีเฟรช')
    }
    fetchBooking()
  }

  async function handleCancel() {
    if (!cancelReason.trim()) { setCancelError('กรุณากรอกเหตุผลการยกเลิก'); return }
    setCancelling(true)
    const { error } = await supabase.from('bookings').update({
      status:         'cancelled',
      cancelled_at:   new Date().toISOString(),
      cancelled_by:   profile.id,
      deposit_action: depositAction,
      cancel_reason:  cancelReason.trim(),
    }).eq('id', bookingId)
    let roomError = null
    if (!error) {
      const [{ data: activeContract }, { data: waitingBooking }] = await Promise.all([
        supabase.from('contracts')
          .select('id, status')
          .eq('room_id', booking.room_id)
          .in('status', ['pending_approve', 'approved', 'active'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('bookings')
          .select('id')
          .eq('room_id', booking.room_id)
          .eq('status', 'waiting')
          .neq('id', bookingId)
          .limit(1)
          .maybeSingle(),
      ])
      if (waitingBooking) {
        const { error: updateErr } = await supabase
          .from('rooms')
          .update({ status: 'reserved' })
          .eq('id', booking.room_id)
          .eq('status', 'available')
        roomError = updateErr
      } else {
        const nextRoomStatus = activeContract?.status === 'active'
          ? 'occupied'
          : activeContract
            ? 'reserved'
            : 'available'
        const { error: updateErr } = await supabase.from('rooms').update({ status: nextRoomStatus }).eq('id', booking.room_id)
        roomError = updateErr
      }
    }
    setCancelling(false)
    if (error) { setCancelError(error.message); return }
    if (roomError) { setCancelError(roomError.message); return }
    setCancelModal(false)
    fetchBooking()
  }

  if (loading) return <PageSpinner />

  const canAct    = booking.status === 'waiting' && isAtLeast(role, 'staff')
  const hasPaid   = !!booking.slip_url
  const canManagerApprovePayment =
    ['super_admin', 'head_staff'].includes(role) &&
    booking.status === 'waiting' &&
    hasPaid &&
    !booking.head_approved_at &&
    !booking.head_rejected_at
  const company   = settings?.company ?? {}

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/bookings" className="hover:text-blue-600">การจอง</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{booking.booking_number}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{booking.booking_number}</h1>
            <Badge variant={booking.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">สร้างเมื่อ {formatThaiDateTime(booking.created_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {hasPaid && (
            <PdfDownloadButton
              document={<BookingReceiptPDF booking={booking} company={company} />}
              filename={`booking_receipt_${booking.booking_number}.pdf`}
              label="พิมพ์ใบรับเงินจอง"
              storageBucket="payment-slips"
              storagePath={`booking-receipts/${booking.id}.pdf`}
            />
          )}
          {canManagerApprovePayment && (
            <Button
              icon={<CheckCircle className="h-4 w-4" />}
              loading={managerApproving}
              onClick={handleManagerApprovePayment}
            >
              Manager approve
            </Button>
          )}
          {canAct && (
            <>
              <Button
                variant={hasPaid ? 'secondary' : 'default'}
                icon={<CreditCard className="h-4 w-4" />}
                onClick={openPayModal}
              >
                {hasPaid ? 'แก้ไขการชำระ' : 'บันทึกการชำระเงินจอง'}
              </Button>
              <Button
                icon={<FileText className="h-4 w-4" />}
                onClick={() => setContractModal(true)}
                disabled={!!contractBlockReason}
              >
                แปลงเป็นสัญญา
              </Button>
              <Button
                variant="danger"
                icon={<X className="h-4 w-4" />}
                onClick={() => { setCancelModal(true); setCancelError('') }}
              >
                ยกเลิกการจอง
              </Button>
            </>
          )}
        </div>
      </div>

      {canAct && contractBlockReason && (
        <div className="mb-4 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {contractBlockReason}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 max-w-3xl">
        {/* Room */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ห้อง</p>
          <p className="text-base font-semibold text-gray-900">
            {booking.rooms?.buildings?.name} ห้อง {booking.rooms?.room_number}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">{booking.rooms?.buildings?.projects?.name}</p>
          <div className="mt-3 flex gap-4 text-sm text-gray-600">
            <span>ค่าเช่า {Number(booking.rooms?.base_rent) > 0 ? `฿${Number(booking.rooms.base_rent).toLocaleString('th-TH')}` : 'สอบถาม'}</span>
            <span>ประกัน {Number(booking.rooms?.base_deposit) > 0 ? `฿${Number(booking.rooms.base_deposit).toLocaleString('th-TH')}` : 'สอบถาม'}</span>
          </div>
        </Card>

        {/* Tenant */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ผู้เช่า</p>
          <p className="text-base font-semibold text-gray-900">{booking.tenants?.full_name}</p>
          {booking.tenants?.phone && <p className="mt-0.5 text-sm text-gray-500">{booking.tenants.phone}</p>}
          {booking.tenants?.email && <p className="text-sm text-gray-500">{booking.tenants.email}</p>}
        </Card>

        {/* Booking Info */}
        <Card className="lg:col-span-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ข้อมูลการจอง</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">เงินจอง</p>
              <p className="font-semibold text-gray-900">฿{Number(booking.deposit_amount).toLocaleString('th-TH')}</p>
            </div>
            {booking.cancel_reason && (
              <div className="col-span-full">
                <p className="text-xs text-gray-400">เหตุผลยกเลิก</p>
                <p className="text-gray-900">{booking.cancel_reason}</p>
              </div>
            )}
            {booking.deposit_action && (
              <div>
                <p className="text-xs text-gray-400">เงินจอง</p>
                <p className="text-gray-900">{booking.deposit_action === 'refunded' ? 'คืนแล้ว' : 'ยึด'}</p>
              </div>
            )}
            {booking.converted_at && (
              <div>
                <p className="text-xs text-gray-400">แปลงสัญญาเมื่อ</p>
                <p className="text-gray-900">{formatThaiDate(booking.converted_at)}</p>
              </div>
            )}
            {booking.note && (
              <div className="col-span-full">
                <p className="text-xs text-gray-400">หมายเหตุ</p>
                <p className="text-gray-900">{booking.note}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Payment record */}
        {hasPaid && (
          <Card className="lg:col-span-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">การชำระเงินจอง</p>
            <div className="flex items-start gap-4">
              {slipSignedUrl && (
                <button
                  onClick={() => window.open(slipSignedUrl, '_blank')}
                  className="shrink-0 h-20 w-20 rounded-lg border border-gray-200 overflow-hidden hover:opacity-80 transition-opacity"
                >
                  <img src={slipSignedUrl} alt="slip" className="h-full w-full object-cover" />
                </button>
              )}
              {extraSlipSignedUrls.map((url, i) => (
                <button key={i}
                  onClick={() => window.open(url, '_blank')}
                  className="shrink-0 h-20 w-20 rounded-lg border border-gray-200 overflow-hidden hover:opacity-80 transition-opacity"
                >
                  <img src={url} alt={`slip ${i + 2}`} className="h-full w-full object-cover" />
                </button>
              ))}
              <div className="grid grid-cols-2 gap-3 text-sm flex-1 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-400">วันที่ชำระ</p>
                  <p className="font-medium">{formatThaiDate(booking.paid_date)}</p>
                </div>
                {booking.bank_name && (
                  <div>
                    <p className="text-xs text-gray-400">ธนาคาร</p>
                    <p className="font-medium">{booking.bank_name}</p>
                  </div>
                )}
                {booking.bank_reference && (
                  <div>
                    <p className="text-xs text-gray-400">เลขที่อ้างอิง</p>
                    <p className="font-medium">{booking.bank_reference}</p>
                  </div>
                )}
                {booking.payment_recorder?.full_name && (
                  <div>
                    <p className="text-xs text-gray-400">บันทึกโดย</p>
                    <p className="font-medium">{booking.payment_recorder.full_name}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Payment Modal */}
      <Modal
        open={payModal}
        onClose={() => setPayModal(false)}
        title="บันทึกการชำระเงินจอง"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModal(false)}>ปิด</Button>
            <Button form="pay-form" type="submit" loading={paying}>บันทึก</Button>
          </>
        }
      >
        <form id="pay-form" onSubmit={handleSavePayment} className="flex flex-col gap-4">
          <div className="rounded-lg bg-blue-50 px-4 py-3">
            <p className="text-xs text-blue-600">ยอดเงินจอง</p>
            <p className="text-xl font-bold text-blue-700">฿{Number(booking.deposit_amount).toLocaleString('th-TH')}</p>
          </div>
          <Input
            label="วันที่ชำระ"
            type="date"
            required
            value={payForm.paid_date}
            onChange={e => setPayForm(p => ({ ...p, paid_date: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="ธนาคาร"
              options={THAI_BANKS}
              placeholder="— เลือกธนาคาร —"
              value={payForm.bank_name}
              onChange={e => setPayForm(p => ({ ...p, bank_name: e.target.value }))}
            />
            <Input
              label={SLIP_REFERENCE_LABEL}
              value={payForm.bank_reference}
              onChange={e => setPayForm(p => ({ ...p, bank_reference: normalizeSlipReference(e.target.value) }))}
              inputMode="numeric"
              maxLength={4}
              placeholder={SLIP_REFERENCE_PLACEHOLDER}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              แนบสลิป {!booking.slip_url && <span className="text-red-500">*</span>}
            </label>
            {(slipSignedUrl || extraSlipSignedUrls.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {slipSignedUrl && (
                  <button type="button" onClick={() => window.open(slipSignedUrl, '_blank')}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded border border-gray-200 hover:opacity-80">
                    <img src={slipSignedUrl} alt="slip" className="h-full w-full object-cover" />
                  </button>
                )}
                {extraSlipSignedUrls.map((url, i) => (
                  <button key={i} type="button" onClick={() => window.open(url, '_blank')}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded border border-gray-200 hover:opacity-80">
                    <img src={url} alt={`slip ${i + 2}`} className="h-full w-full object-cover" />
                  </button>
                ))}
                <p className="text-xs text-gray-500">สลิปที่แนบไว้แล้ว<br />คลิกเพื่อดู</p>
              </div>
            )}
            {slipFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {slipFiles.map((file, i) => (
                  <div key={i} className="relative h-16 w-16 shrink-0">
                    {file.type.startsWith('image/') ? (
                      <img src={URL.createObjectURL(file)} alt="" className="h-full w-full rounded border border-gray-200 object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded border border-gray-200 bg-gray-50 text-[10px] text-gray-500">PDF</div>
                    )}
                    <button type="button" onClick={() => setSlipFiles(fs => fs.filter((_, j) => j !== i))}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
              <Upload className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">
                {booking.slip_url ? 'เพิ่มสลิป (ไม่บังคับ)' : 'เลือกไฟล์ภาพ / PDF'}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={e => setSlipFiles(fs => [...fs, ...Array.from(e.target.files ?? [])])}
              />
            </label>
          </div>
          {payError && <p className="text-sm text-red-600">{payError}</p>}
        </form>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="ยกเลิกการจอง"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelModal(false)}>ปิด</Button>
            <Button variant="danger" loading={cancelling} onClick={handleCancel}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="เงินจอง"
            options={DEPOSIT_ACTION_OPTS}
            value={depositAction}
            onChange={e => setDepositAction(e.target.value)}
          />
          <Textarea
            label="เหตุผลการยกเลิก"
            required
            rows={3}
            value={cancelReason}
            onChange={e => { setCancelReason(e.target.value); setCancelError('') }}
          />
          {cancelError && <p className="text-sm text-red-600">{cancelError}</p>}
        </div>
      </Modal>

      {/* Contract Form Modal */}
      <ContractFormModal
        open={contractModal}
        onClose={() => setContractModal(false)}
        onSaved={(contractId) => {
          setContractModal(false)
          if (contractId) navigate(`/contracts/${contractId}`)
          else fetchBooking()
        }}
        prefillBooking={booking}
      />
    </div>
  )
}
