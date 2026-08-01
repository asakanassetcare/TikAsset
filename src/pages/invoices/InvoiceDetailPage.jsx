import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, CreditCard, XCircle, Upload, Loader2, CheckCircle, X } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import PdfDownloadButton from '../../components/pdf/PdfDownloadButton'
import InvoicePDF from '../../components/pdf/InvoicePDF'
import ReceiptPDF from '../../components/pdf/ReceiptPDF'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate, formatThaiDateTime } from '../../lib/date'
import { useSettings } from '../../hooks/useSettings'
import { THAI_BANKS } from '../../lib/banks'
import { SLIP_REFERENCE_LABEL, SLIP_REFERENCE_PLACEHOLDER, normalizeSlipReference } from '../../lib/slipReference'

const TYPE_LABEL = {
  contract_initial: 'เงินประกัน + ค่าล่วงหน้า',
  monthly_rent:     'ค่าเช่ารายเดือน',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินจอง',
  other:            'อื่นๆ',
}

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const { profile, role } = useAuth()
  const { settings } = useSettings()

  const [invoice,         setInvoice]         = useState(null)
  const [items,           setItems]           = useState([])
  const [payments,        setPayments]        = useState([])
  const [bookingDeposit,  setBookingDeposit]  = useState(null)
  const [advancePayments, setAdvancePayments] = useState([])
  const [relationGroup,   setRelationGroup]   = useState(null)
  const [relatedInvoices, setRelatedInvoices] = useState([])
  const [relationCandidates, setRelationCandidates] = useState([])
  const [loading,         setLoading]         = useState(true)

  // Payment recording modal
  const [payModal,          setPayModal]          = useState(false)
  const [payForm,           setPayForm]           = useState({ paid_date: '', bank_name: '', bank_reference: '', note: '' })
  const [slipFiles,              setSlipFiles]              = useState([])
  const [existingSlipPath,       setExistingSlipPath]       = useState(null)
  const [existingSlipUrl,        setExistingSlipUrl]        = useState(null)
  const [existingExtraSlipPaths, setExistingExtraSlipPaths] = useState([])
  const [existingExtraSlipUrls,  setExistingExtraSlipUrls]  = useState([])
  const [relationEnabled,   setRelationEnabled]   = useState(false)
  const [selectedRelationInvoiceIds, setSelectedRelationInvoiceIds] = useState([])
  const [paying,            setPaying]            = useState(false)
  const [payError,          setPayError]          = useState('')

  // Approve/reject payment
  const [approvingId,  setApprovingId]  = useState(null)
  const [managerApprovingId, setManagerApprovingId] = useState(null)
  const [rejectModal,  setRejectModal]  = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting,    setRejecting]    = useState(false)
  const [rejectErr,    setRejectErr]    = useState('')

  // Cancel modal
  const [cancelModal,  setCancelModal]  = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling,   setCancelling]   = useState(false)
  const [cancelError,  setCancelError]  = useState('')

  // Penalty discount modal
  const [discountModal, setDiscountModal] = useState(false)
  const [discountForm,  setDiscountForm]  = useState({ amount: '', note: '' })
  const [discounting,   setDiscounting]   = useState(false)
  const [discountError, setDiscountError] = useState('')

  useEffect(() => { fetchAll() }, [invoiceId])

  async function fetchAll() {
    const [{ data: inv }, { data: itms }, { data: pmts }] = await Promise.all([
      supabase.from('invoices').select('*, rooms(room_number, title_deed_number, buildings(name)), tenants(full_name, phone), contracts(contract_number, booking_id)').eq('id', invoiceId).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('display_order'),
      supabase.from('payments').select('*, profiles!recorded_by(full_name)').eq('invoice_id', invoiceId).order('created_at', { ascending: false }),
    ])
    if (!inv) { navigate('/invoices'); return }
    setInvoice(inv)
    setItems(itms ?? [])
    setPayments(pmts ?? [])
    await fetchInvoiceRelations(inv)
    await fetchRelationCandidates(inv)

    if (inv.contract_id) {
      const bookingId = inv.invoice_type === 'contract_initial' ? (inv.contracts?.booking_id ?? null) : null
      const [bkResult, advResult] = await Promise.all([
        bookingId
          ? supabase.from('bookings').select('id, slip_url, paid_date, bank_name, bank_reference').eq('id', bookingId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('contract_advance_payments').select('id, amount, slip_url, created_at').eq('contract_id', inv.contract_id).order('created_at'),
      ])
      setBookingDeposit(bkResult.data ?? null)
      setAdvancePayments(advResult.data ?? [])
    } else {
      setBookingDeposit(null)
      setAdvancePayments([])
    }

    setLoading(false)
  }

  async function fetchInvoiceRelations(inv) {
    setRelationGroup(null)
    setRelatedInvoices([])
    const { data: item } = await supabase
      .from('invoice_relation_items')
      .select('group_id')
      .eq('invoice_id', inv.id)
      .maybeSingle()
    if (!item?.group_id) return

    setRelationGroup({ id: item.group_id })
    const { data } = await supabase
      .from('invoice_relation_items')
      .select(`
        invoice_id,
        invoices(id, invoice_number, invoice_type, billing_period, total_amount, status, due_date, rooms(room_number, buildings(name)))
      `)
      .eq('group_id', item.group_id)
      .neq('invoice_id', inv.id)

    setRelatedInvoices((data ?? []).map(row => row.invoices).filter(Boolean))
  }

  async function fetchRelationCandidates(inv) {
    setRelationCandidates([])
    if (!inv.contract_id) return

    const { data: candidates } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, billing_period, total_amount, status, due_date, rooms(room_number, buildings(name))')
      .eq('contract_id', inv.contract_id)
      .neq('id', inv.id)
      .not('status', 'in', '(cancelled,rejected)')
      .order('issue_date', { ascending: false })

    const ids = (candidates ?? []).map(row => row.id)
    if (!ids.length) return

    const { data: used } = await supabase
      .from('invoice_relation_items')
      .select('invoice_id')
      .in('invoice_id', ids)

    const usedIds = new Set((used ?? []).map(row => row.invoice_id))
    setRelationCandidates((candidates ?? []).filter(row => !usedIds.has(row.id)))
  }

  async function openPayModal() {
    const pre = payments.find(p => p.status === 'pending_approve')
    setPayForm({
      paid_date:      pre?.paid_date      ?? new Date().toISOString().slice(0, 10),
      bank_name:      pre?.bank_name      ?? '',
      bank_reference: normalizeSlipReference(pre?.bank_reference),
      note:           pre?.note           ?? '',
    })
    setSlipFiles([])
    setPayError('')
    setExistingSlipPath(pre?.slip_url ?? null)
    setExistingSlipUrl(null)
    setExistingExtraSlipPaths(pre?.extra_slips ?? [])
    setExistingExtraSlipUrls([])
    setRelationEnabled(false)
    setSelectedRelationInvoiceIds([])
    if (pre?.slip_url) {
      const { data } = await supabase.storage.from('payment-slips').createSignedUrl(pre.slip_url, 3600)
      setExistingSlipUrl(data?.signedUrl ?? null)
    }
    if (pre?.extra_slips?.length) {
      const urls = await Promise.all(
        pre.extra_slips.map(path =>
          supabase.storage.from('payment-slips').createSignedUrl(path, 3600).then(r => r.data?.signedUrl ?? null)
        )
      )
      setExistingExtraSlipUrls(urls.filter(Boolean))
    }
    setPayModal(true)
  }

  function toggleRelationInvoice(id) {
    setSelectedRelationInvoiceIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function createInvoiceRelationGroupIfNeeded() {
    if (!relationEnabled || relationGroup || selectedRelationInvoiceIds.length === 0) return null

    const { data: group, error: groupError } = await supabase
      .from('invoice_relation_groups')
      .insert({
        contract_id: invoice.contract_id,
        created_from_invoice_id: invoiceId,
        created_by: profile.id,
      })
      .select('id')
      .single()
    if (groupError) return groupError

    const rows = [invoiceId, ...selectedRelationInvoiceIds].map(id => ({
      group_id: group.id,
      invoice_id: id,
    }))
    const { error: itemError } = await supabase
      .from('invoice_relation_items')
      .insert(rows)
    return itemError ?? null
  }

  async function handlePayment(e) {
    e.preventDefault()
    if (!payForm.paid_date) { setPayError('กรุณากรอกวันชำระ'); return }
    if (!slipFiles.length && !existingSlipPath) { setPayError('กรุณาแนบสลิป'); return }
    setPaying(true)

    const uploadedPaths = []
    for (const file of slipFiles) {
      const ext = file.name.split('.').pop()
      const path = `${invoiceId}/slip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { data: storageData, error: storageErr } = await supabase.storage.from('payment-slips').upload(path, file, { upsert: false })
      if (storageErr) { setPaying(false); setPayError('อัปโหลดสลิปไม่สำเร็จ: ' + storageErr.message); return }
      uploadedPaths.push(storageData.path)
    }
    let slipUrl = existingSlipPath
    let newExtraSlips = [...existingExtraSlipPaths]
    if (!slipUrl && uploadedPaths.length > 0) {
      slipUrl = uploadedPaths[0]
      newExtraSlips = [...newExtraSlips, ...uploadedPaths.slice(1)]
    } else {
      newExtraSlips = [...newExtraSlips, ...uploadedPaths]
    }

    const existingReviewable = payments.find(p => p.status === 'pending_approve')
    let error
    if (existingReviewable) {
      // Update the existing review row — recalculate penalty for the new paid_date.
      ;({ error } = await supabase.from('payments').update({
        paid_date:      payForm.paid_date,
        bank_name:      payForm.bank_name || null,
        bank_reference: normalizeSlipReference(payForm.bank_reference) || null,
        slip_url:       slipUrl,
        extra_slips:    newExtraSlips.length > 0 ? newExtraSlips : null,
        note:           payForm.note.trim() || null,
        recorded_by:    profile.id,
        amount:         grandTotal,
        penalty_amount: netPenalty,
        penalty_days:   penalty?.days ?? 0,
      }).eq('id', existingReviewable.id))
    } else {
      ;({ error } = await supabase.from('payments').insert({
        invoice_id:     invoiceId,
        amount:         grandTotal,
        paid_date:      payForm.paid_date,
        bank_name:      payForm.bank_name || null,
        bank_reference: normalizeSlipReference(payForm.bank_reference) || null,
        slip_url:       slipUrl,
        extra_slips:    newExtraSlips.length > 0 ? newExtraSlips : null,
        note:           payForm.note.trim() || null,
        status:         'pending_approve',
        recorded_by:    profile.id,
        penalty_amount: netPenalty,
        penalty_days:   penalty?.days ?? 0,
      }))
    }

    if (!error) {
      const { error: invErr } = await supabase.from('invoices').update({ status: 'paid_pending_approve' }).eq('id', invoiceId)
      if (invErr) { setPaying(false); setPayError('บันทึกสำเร็จแต่อัปเดตสถานะไม่ได้: ' + invErr.message); return }
      const relationError = await createInvoiceRelationGroupIfNeeded()
      if (relationError) { setPaying(false); setPayError('บันทึกสำเร็จแต่สร้างกลุ่มใบแจ้งหนี้ที่เกี่ยวข้องไม่ได้: ' + relationError.message); fetchAll(); return }
    }

    setPaying(false)
    if (error) { setPayError(error.message); return }
    setPayModal(false)
    fetchAll()
  }

  async function handleApprovePayment(pmt) {
    if (!pmt.head_approved_at) {
      alert('ต้องให้ Head Staff อนุมัติรายการชำระนี้ก่อนส่งต่อบัญชี')
      return
    }
    if (!canReviewInvoicePayment) {
      alert('อนุมัติไม่ได้ เพราะใบแจ้งหนี้ไม่ได้อยู่สถานะรอยืนยันชำระ')
      return
    }
    setApprovingId(pmt.id)
    const { data: updated, error } = await supabase.from('payments').update({
      status:      'approved',
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
      .eq('id', pmt.id)
      .eq('status', 'pending_approve')
      .not('head_approved_at', 'is', null)
      .select('id')
    if (!error && (!updated || updated.length === 0)) {
      setApprovingId(null)
      alert('รายการนี้ถูกอนุมัติหรือปฏิเสธไปแล้ว กรุณารีเฟรช')
      fetchAll()
      return
    }
    if (!error) {
      try {
        const blob = await pdf(
          <ReceiptPDF payment={pmt} invoice={invoice} company={settings?.company ?? {}} />
        ).toBlob()
        const storagePath = `receipts/${pmt.id}.pdf`
        await supabase.storage.from('payment-slips').upload(storagePath, blob, {
          contentType: 'application/pdf', upsert: true,
        })
        const { data: urlData } = await supabase.storage
          .from('payment-slips').createSignedUrl(storagePath, 60 * 60 * 24 * 30)
        supabase.functions.invoke('line-notify', {
          body: { type: 'receipt', payment_id: pmt.id, receipt_url: urlData?.signedUrl ?? null },
        })
      } catch (e) { console.error('PDF error', e) }
    }
    setApprovingId(null)
    if (error) { alert(error.message); return }
    fetchAll()
  }

  async function handleManagerApprovePayment(pmt) {
    setManagerApprovingId(pmt.id)
    const { data: updated, error } = await supabase.from('payments').update({
      head_approved_by:       profile.id,
      head_approved_at:       new Date().toISOString(),
      head_rejected_by:       null,
      head_rejected_at:       null,
      head_rejection_reason:  null,
    })
      .eq('id', pmt.id)
      .eq('status', 'pending_approve')
      .is('head_approved_at', null)
      .is('head_rejected_at', null)
      .select('id')
    setManagerApprovingId(null)
    if (error) {
      alert(error.message)
      return
    }
    if (!updated || updated.length === 0) {
      alert('รายการนี้ถูกอนุมัติหรือปฏิเสธไปแล้ว กรุณารีเฟรช')
      fetchAll()
      return
    }
    fetchAll()
  }

  async function handleRejectPayment() {
    if (!rejectReason.trim()) { setRejectErr('กรุณากรอกเหตุผล'); return }
    setRejecting(true)
    const { data: updated, error } = await supabase.from('payments').update({
      status:           'rejected',
      rejected_at:      new Date().toISOString(),
      rejection_reason: rejectReason.trim(),
    })
      .eq('id', rejectTarget.id)
      .eq('status', 'pending_approve')
      .select('id')
    if (!error && (!updated || updated.length === 0)) {
      setRejecting(false)
      setRejectErr('รายการนี้ถูกอนุมัติหรือปฏิเสธไปแล้ว กรุณารีเฟรช')
      fetchAll()
      return
    }
    if (!error) {
      const today = new Date().toISOString().slice(0, 10)
      const restoredStatus = invoice.due_date && addDays(invoice.due_date, 4) < today ? 'overdue' : 'pending'
      await supabase.from('invoices').update({ status: restoredStatus }).eq('id', invoiceId)
    }
    setRejecting(false)
    if (error) { setRejectErr(error.message); return }
    setRejectModal(false)
    fetchAll()
  }

  async function handleCancel() {
    if (!cancelReason.trim()) { setCancelError('กรุณากรอกเหตุผล'); return }
    setCancelling(true)
    const pendingPaymentIds = payments.filter(p => p.status === 'pending_approve').map(p => p.id)
    if (pendingPaymentIds.length > 0) {
      const { error: paymentErr } = await supabase.from('payments').update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: cancelReason.trim(),
      }).in('id', pendingPaymentIds)
      if (paymentErr) {
        setCancelling(false)
        setCancelError(paymentErr.message)
        return
      }
    }
    const { error } = await supabase.from('invoices').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      cancellation_reason: cancelReason.trim(),
    }).eq('id', invoiceId)
    setCancelling(false)
    if (error) { setCancelError(error.message); return }
    setCancelModal(false)
    fetchAll()
  }

  async function handleDiscount(e) {
    e.preventDefault()
    const amt = Number(discountForm.amount)
    if (!amt || amt <= 0) { setDiscountError('กรุณากรอกจำนวนเงิน'); return }
    if (amt > (penalty?.amount ?? 0)) { setDiscountError(`ส่วนลดต้องไม่เกินค่าปรับ ฿${penalty?.amount?.toLocaleString('th-TH')}`); return }
    setDiscounting(true)
    const { error } = await supabase.from('invoices').update({
      penalty_discount:      amt,
      penalty_discount_note: discountForm.note.trim() || null,
    }).eq('id', invoiceId)
    setDiscounting(false)
    if (error) { setDiscountError(error.message); return }
    setDiscountModal(false)
    fetchAll()
  }

  if (loading) return <PageSpinner />

  const hasPendingPayment = payments.some(p => p.status === 'pending_approve')
  const canPay     = ['pending', 'overdue'].includes(invoice.status) && !hasPendingPayment && ['super_admin', 'head_staff', 'staff'].includes(role)
  const canCancel  = ['pending', 'overdue', 'paid_pending_approve'].includes(invoice.status) && ['super_admin', 'accounting'].includes(role)
  const canApprove = ['super_admin', 'accounting'].includes(role)
  const canManagerApprove = ['super_admin', 'head_staff'].includes(role)
  const approvedPayment = payments
    .filter(p => p.status === 'approved')
    .sort((a, b) => new Date(b.approved_at ?? b.created_at ?? 0) - new Date(a.approved_at ?? a.created_at ?? 0))[0]

  function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }

  // Penalty starts after the 5-day grace window.
  // asOfDate defaults to today but callers pass payForm.paid_date so the
  // amount shown matches what will be snapshotted when the slip is submitted.
  function calcPenalty(asOfDate) {
    if (invoice.invoice_type !== 'monthly_rent') return null
    if (!invoice.due_date) return null
    if (!['pending', 'overdue'].includes(invoice.status)) return null
    const ratePerDay = Number(settings?.invoice?.penalty_rate_per_day ?? 100)
    const d = new Date()
    const fallback = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const endStr = asOfDate ?? fallback
    const graceEndStr = addDays(invoice.due_date, 4)
    if (endStr <= graceEndStr) return null
    const startStr = addDays(graceEndStr, 1)
    const startD = new Date(startStr + 'T00:00:00Z')
    const endD = new Date(endStr + 'T00:00:00Z')
    const days = Math.floor((endD - startD) / 86400000) + 1
    return { days, startStr, endStr, graceEndStr, amount: days * ratePerDay, ratePerDay }
  }

  const penalty     = calcPenalty(payModal ? payForm.paid_date : undefined)
  const discount    = Math.min(Number(invoice.penalty_discount ?? 0), penalty?.amount ?? 0)
  const netPenalty  = (penalty?.amount ?? 0) - discount
  const grandTotal  = Number(invoice.total_amount) + netPenalty
  const grossTotal  = items.filter(it => Number(it.amount) > 0).reduce((s, it) => s + Number(it.amount), 0)
  const canDiscount = penalty && ['super_admin', 'head_staff'].includes(role) && ['pending', 'overdue'].includes(invoice.status)
  const canReviewInvoicePayment = canApprove && hasPendingPayment && (
    invoice.status === 'paid_pending_approve' ||
    (['pending', 'overdue'].includes(invoice.status) && grandTotal <= 0)
  )

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/invoices" className="hover:text-blue-600">ใบแจ้งหนี้</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{invoice.invoice_number}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{invoice.invoice_number}</h1>
            <Badge variant={invoice.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {TYPE_LABEL[invoice.invoice_type] ?? invoice.invoice_type}
            {invoice.billing_period ? ` · ${invoice.billing_period}` : ''}
            {' · ออก '}{formatThaiDate(invoice.issue_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* PDF buttons */}
          <PdfDownloadButton
            document={<InvoicePDF invoice={invoice} items={items} company={settings} />}
            filename={`${invoice.invoice_number}.pdf`}
            label="PDF ใบแจ้งหนี้"
          />
          {invoice.status === 'paid' && approvedPayment && (
            <PdfDownloadButton
              document={<ReceiptPDF payment={approvedPayment} invoice={invoice} company={settings?.company ?? {}} />}
              filename={`receipt_${invoice.invoice_number}.pdf`}
              label="PDF ใบเสร็จ"
            />
          )}
          {canPay && (
            <Button icon={<CreditCard className="h-4 w-4" />} onClick={openPayModal}>บันทึกการชำระ</Button>
          )}
          {canCancel && (
            <Button variant="danger" icon={<XCircle className="h-4 w-4" />}
              onClick={() => { setCancelModal(true); setCancelError('') }}>ยกเลิก</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 max-w-4xl">
        {/* Invoice info */}
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ห้อง / ผู้เช่า</p>
          <p className="text-sm font-semibold text-gray-900">{invoice.rooms?.buildings?.name} ห้อง {invoice.rooms?.room_number}</p>
          <p className="mt-1 text-sm text-gray-600">{invoice.tenants?.full_name}</p>
          {invoice.contracts?.contract_number && (
            <Link to={`/contracts/${invoice.contract_id}`} className="mt-2 block text-xs text-blue-600 hover:underline">
              {invoice.contracts.contract_number}
            </Link>
          )}
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">วันที่</p>
          <div className="space-y-2 text-sm">
            <div><p className="text-xs text-gray-400">วันออก</p><p className="font-medium">{formatThaiDate(invoice.issue_date)}</p></div>
            <div><p className="text-xs text-gray-400">ครบกำหนด</p><p className={`font-medium ${invoice.status === 'overdue' ? 'text-red-600' : ''}`}>{formatThaiDate(invoice.due_date)}</p></div>
          </div>
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ยอดรวม</p>
          {penalty ? (
            <>
              <p className="text-sm text-gray-500">ค่าเช่า ฿{grossTotal.toLocaleString('th-TH')}</p>
              <p className="text-sm font-medium text-red-600">ค่าปรับ ฿{penalty.amount.toLocaleString('th-TH')}</p>
              {discount > 0 && <p className="text-sm font-medium text-green-600">ส่วนลดค่าปรับ −฿{discount.toLocaleString('th-TH')}</p>}
              <p className="mt-1 text-2xl font-bold text-gray-900">฿{grandTotal.toLocaleString('th-TH')}</p>
              {canDiscount && (
                <button onClick={() => { setDiscountForm({ amount: discount || '', note: invoice.penalty_discount_note || '' }); setDiscountError(''); setDiscountModal(true) }}
                  className="mt-3 text-xs text-blue-600 hover:underline">
                  {discount > 0 ? 'แก้ไขส่วนลดค่าปรับ' : '+ ให้ส่วนลดค่าปรับ'}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">฿{grossTotal.toLocaleString('th-TH')}</p>
              {grossTotal !== grandTotal && (
                <p className="mt-1 text-sm text-green-600">ยอดชำระจริง ฿{grandTotal.toLocaleString('th-TH')}</p>
              )}
            </>
          )}
          {invoice.cancellation_reason && (
            <p className="mt-2 text-xs text-red-600">{invoice.cancellation_reason}</p>
          )}
        </Card>

        {/* Items */}
        <Card className="lg:col-span-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">รายการ</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="pb-2 text-left font-medium">รายการ</th>
                  <th className="pb-2 text-right font-medium">จำนวน</th>
                  <th className="pb-2 text-right font-medium">ราคา/หน่วย</th>
                  <th className="pb-2 text-right font-medium">รวม</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-800">{item.description}</td>
                    <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-2 text-right text-gray-600">฿{Number(item.unit_price).toLocaleString('th-TH')}</td>
                    <td className={`py-2 text-right font-medium ${item.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                      {item.amount < 0 ? '-' : ''}฿{Math.abs(Number(item.amount)).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
              {penalty && (
                <tbody>
                  <tr className="bg-red-50">
                    <td className="py-2 text-red-700 font-medium">
                      ค่าปรับล่าช้า
                      <span className="ml-2 text-xs font-normal text-red-500">
                        ({new Date(penalty.startStr + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} – {new Date(penalty.endStr + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}, {penalty.days} วัน)
                      </span>
                    </td>
                    <td className="py-2 text-right text-red-600">{penalty.days}</td>
                    <td className="py-2 text-right text-red-600">฿{penalty.ratePerDay.toLocaleString('th-TH')}</td>
                    <td className="py-2 text-right font-medium text-red-600">฿{penalty.amount.toLocaleString('th-TH')}</td>
                  </tr>
                  {discount > 0 && (
                    <tr className="bg-green-50">
                      <td className="py-2 text-green-700 font-medium">
                        ส่วนลดค่าปรับ
                        {invoice.penalty_discount_note && <span className="ml-2 text-xs font-normal text-green-600">({invoice.penalty_discount_note})</span>}
                      </td>
                      <td className="py-2 text-right text-green-600">—</td>
                      <td className="py-2 text-right text-green-600">—</td>
                      <td className="py-2 text-right font-medium text-green-600">−฿{discount.toLocaleString('th-TH')}</td>
                    </tr>
                  )}
                </tbody>
              )}
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-right text-sm font-semibold text-gray-700">ยอดชำระจริง</td>
                  <td className="pt-3 text-right text-base font-bold text-gray-900">฿{grandTotal.toLocaleString('th-TH')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {relatedInvoices.length > 0 && (
          <Card className="lg:col-span-3">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">ใบแจ้งหนี้ที่เกี่ยวข้องกัน</p>
              <p className="mt-1 text-xs text-gray-400">ใช้สำหรับอ้างอิงการตรวจสลิปเท่านั้น ไม่ได้ตัดยอดอัตโนมัติ</p>
            </div>
            <div className="flex flex-col gap-2">
              {relatedInvoices.map(rel => (
                <Link
                  key={rel.id}
                  to={`/invoices/${rel.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{rel.invoice_number}</p>
                    <p className="text-xs text-gray-400">
                      {TYPE_LABEL[rel.invoice_type] ?? rel.invoice_type}
                      {rel.billing_period ? ` · ${rel.billing_period}` : ''}
                      {rel.rooms?.room_number ? ` · ห้อง ${rel.rooms.room_number}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">฿{Number(rel.total_amount).toLocaleString('th-TH')}</span>
                    <Badge variant={rel.status} />
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* Payments */}
        {(payments.length > 0 || items.some(it => Number(it.amount) < 0)) && (
          <Card className="lg:col-span-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ประวัติการชำระ</p>
            <div className="flex flex-col gap-2">
              {/* Credit rows — negative invoice items (e.g. หักเงินจอง, หักค่าทำสัญญาล่วงหน้า) */}
              {items.filter(it => Number(it.amount) < 0).map(it => {
                let slipPath = null
                let subLabel = 'หักออกจากยอดชำระ'

                if (it.description === 'หักเงินจอง' && bookingDeposit) {
                  slipPath = bookingDeposit.slip_url ?? null
                  if (bookingDeposit.paid_date) {
                    subLabel = [
                      formatThaiDate(bookingDeposit.paid_date),
                      bookingDeposit.bank_name,
                      bookingDeposit.bank_reference,
                    ].filter(Boolean).join(' · ')
                  }
                } else if (it.description === 'หักค่าทำสัญญาล่วงหน้า' && advancePayments.length > 0) {
                  const latest = advancePayments[advancePayments.length - 1]
                  slipPath = latest.slip_url ?? null
                  subLabel = formatThaiDate(latest.created_at.slice(0, 10))
                }

                return (
                  <div key={`credit-${it.id}`} className="flex items-center justify-between rounded-lg border border-green-100 bg-green-50 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-green-800">{it.description}</p>
                      <p className="text-xs text-green-600">{subLabel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {slipPath && (
                        <button
                          onClick={async () => {
                            const { data } = await supabase.storage.from('payment-slips').createSignedUrl(slipPath, 3600)
                            if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                          }}
                          className="text-xs text-green-600 hover:underline"
                        >
                          ดูสลิป
                        </button>
                      )}
                      <p className="text-sm font-semibold text-green-700">
                        −฿{Math.abs(Number(it.amount)).toLocaleString('th-TH')}
                      </p>
                      <span className="rounded-full bg-green-100 border border-green-200 px-2 py-0.5 text-[10px] font-medium text-green-700">
                        หักยอดแล้ว
                      </span>
                    </div>
                  </div>
                )
              })}
              {payments.map(pmt => (
                <div key={pmt.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">฿{Number(pmt.amount).toLocaleString('th-TH')}</p>
                    <p className="text-xs text-gray-400">
                      {formatThaiDate(pmt.paid_date)}
                      {pmt.bank_name ? ` · ${pmt.bank_name}` : ''}
                      {pmt.bank_reference ? ` · ${pmt.bank_reference}` : ''}
                      {pmt.profiles?.full_name ? ` · โดย ${pmt.profiles.full_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pmt.slip_url && (
                      <button onClick={async () => {
                        const { data } = await supabase.storage.from('payment-slips').createSignedUrl(pmt.slip_url, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }} className="text-xs text-blue-600 hover:underline">ดูสลิป</button>
                    )}
                    {(pmt.extra_slips ?? []).map((path, i) => (
                      <button key={i} onClick={async () => {
                        const { data } = await supabase.storage.from('payment-slips').createSignedUrl(path, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }} className="text-xs text-blue-600 hover:underline">สลิป {i + 2}</button>
                    ))}
                    <Badge variant={pmt.status} />
                    {canManagerApprove && pmt.status === 'pending_approve' && !pmt.head_approved_at && !pmt.head_rejected_at && (
                      <Button size="sm" icon={<CheckCircle className="h-3.5 w-3.5" />}
                        loading={managerApprovingId === pmt.id}
                        onClick={() => handleManagerApprovePayment(pmt)}>
                        Manager approve
                      </Button>
                    )}
                    {canApprove && pmt.status === 'pending_approve' && pmt.head_approved_at && (
                      <>
                        {canReviewInvoicePayment && (
                          <Button size="sm" icon={<CheckCircle className="h-3.5 w-3.5" />}
                            loading={approvingId === pmt.id}
                            onClick={() => handleApprovePayment(pmt)}>
                            อนุมัติ
                          </Button>
                        )}
                        <Button size="sm" variant="danger" icon={<XCircle className="h-3.5 w-3.5" />}
                          onClick={() => { setRejectTarget(pmt); setRejectReason(''); setRejectErr(''); setRejectModal(true) }}>
                          ปฏิเสธ
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Payment Modal */}
      <Modal
        open={payModal}
        onClose={() => setPayModal(false)}
        title="บันทึกการชำระเงิน"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModal(false)}>ปิด</Button>
            <Button form="pay-form" type="submit" loading={paying}>บันทึก</Button>
          </>
        }
      >
        <form id="pay-form" onSubmit={handlePayment} className="flex flex-col gap-4">
          <div className="rounded-lg bg-blue-50 px-4 py-3">
            <p className="text-xs text-blue-600">ยอดที่ต้องชำระ</p>
            <p className="text-xl font-bold text-blue-700">฿{grandTotal.toLocaleString('th-TH')}</p>
            {penalty && <p className="mt-1 text-xs text-blue-500">รวมค่าปรับ ฿{netPenalty.toLocaleString('th-TH')}</p>}
          </div>
          <Input label="วันที่ชำระ" type="date" required value={payForm.paid_date}
            onChange={e => setPayForm(p => ({ ...p, paid_date: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="ธนาคาร" options={THAI_BANKS} placeholder="— เลือกธนาคาร —"
              value={payForm.bank_name}
              onChange={e => setPayForm(p => ({ ...p, bank_name: e.target.value }))} />
            <Input label={SLIP_REFERENCE_LABEL} value={payForm.bank_reference}
              onChange={e => setPayForm(p => ({ ...p, bank_reference: normalizeSlipReference(e.target.value) }))}
              inputMode="numeric"
              maxLength={4}
              placeholder={SLIP_REFERENCE_PLACEHOLDER} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">
              แนบสลิป {!existingSlipPath && <span className="text-red-500">*</span>}
            </label>
            {(existingSlipUrl || existingExtraSlipUrls.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {existingSlipUrl && (
                  <button type="button" onClick={() => window.open(existingSlipUrl, '_blank')}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded border border-gray-200 hover:opacity-80">
                    <img src={existingSlipUrl} alt="slip" className="h-full w-full object-cover" />
                  </button>
                )}
                {existingExtraSlipUrls.map((url, i) => (
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
                {existingSlipPath ? 'เพิ่มสลิป (ไม่บังคับ)' : 'เลือกไฟล์ภาพ / PDF'}
              </span>
              <input type="file" accept="image/*,application/pdf" multiple className="hidden"
                onChange={e => setSlipFiles(fs => [...fs, ...Array.from(e.target.files ?? [])])} />
            </label>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
            {relationGroup ? (
              <p className="text-sm text-gray-500">ใบแจ้งหนี้นี้อยู่ในกลุ่มใบแจ้งหนี้ที่เกี่ยวข้องกันแล้ว</p>
            ) : (
              <>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={relationEnabled}
                    onChange={e => {
                      setRelationEnabled(e.target.checked)
                      if (!e.target.checked) setSelectedRelationInvoiceIds([])
                    }}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-700">เกี่ยวข้องกับใบแจ้งหนี้อื่น</span>
                    <span className="block text-xs text-gray-400">ใช้เพื่ออ้างอิงการตรวจสลิปเท่านั้น ไม่ได้ตัดยอดอัตโนมัติ</span>
                  </span>
                </label>
                {relationEnabled && (
                  <div className="mt-3 flex flex-col gap-2">
                    {relationCandidates.length === 0 ? (
                      <p className="text-xs text-gray-400">ไม่มีใบแจ้งหนี้อื่นของสัญญานี้ที่เลือกได้</p>
                    ) : relationCandidates.map(rel => (
                      <label key={rel.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedRelationInvoiceIds.includes(rel.id)}
                            onChange={() => toggleRelationInvoice(rel.id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>
                            <span className="block text-sm font-medium text-gray-800">{rel.invoice_number}</span>
                            <span className="block text-xs text-gray-400">
                              {TYPE_LABEL[rel.invoice_type] ?? rel.invoice_type}
                              {rel.billing_period ? ` · ${rel.billing_period}` : ''}
                            </span>
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-gray-900">฿{Number(rel.total_amount).toLocaleString('th-TH')}</span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <Textarea label="หมายเหตุ" rows={2} value={payForm.note}
            onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))} />
          {payError && <p className="text-sm text-red-600">{payError}</p>}
        </form>
      </Modal>

      {/* Penalty Discount Modal */}
      <Modal
        open={discountModal}
        onClose={() => setDiscountModal(false)}
        title="ให้ส่วนลดค่าปรับ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDiscountModal(false)}>ปิด</Button>
            <Button form="discount-form" type="submit" loading={discounting}>บันทึก</Button>
          </>
        }
      >
        <form id="discount-form" onSubmit={handleDiscount} className="flex flex-col gap-4">
          <div className="rounded-lg bg-red-50 px-4 py-3">
            <p className="text-xs text-red-600">ค่าปรับทั้งหมด</p>
            <p className="text-lg font-bold text-red-700">฿{penalty?.amount?.toLocaleString('th-TH')}</p>
          </div>
          <Input
            label="จำนวนส่วนลด (บาท)"
            type="number"
            min={1}
            max={penalty?.amount}
            required
            value={discountForm.amount}
            onChange={e => setDiscountForm(p => ({ ...p, amount: e.target.value }))}
            placeholder={`สูงสุด ฿${penalty?.amount?.toLocaleString('th-TH')}`}
          />
          <Input
            label="หมายเหตุ"
            value={discountForm.note}
            onChange={e => setDiscountForm(p => ({ ...p, note: e.target.value }))}
            placeholder="เช่น ผู้เช่าแจ้งล่วงหน้า / กรณีพิเศษ"
          />
          {discountError && <p className="text-sm text-red-600">{discountError}</p>}
        </form>
      </Modal>

      {/* Reject Payment Modal */}
      <Modal
        open={rejectModal}
        onClose={() => setRejectModal(false)}
        title="ปฏิเสธการชำระเงิน"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectModal(false)}>ปิด</Button>
            <Button variant="danger" loading={rejecting} onClick={handleRejectPayment}>ยืนยันปฏิเสธ</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">
            ปฏิเสธการชำระ ฿{Number(rejectTarget?.amount ?? 0).toLocaleString('th-TH')} — ใบแจ้งหนี้จะกลับสู่สถานะรอชำระ
          </p>
          <Textarea label="เหตุผล" required rows={3} value={rejectReason}
            onChange={e => { setRejectReason(e.target.value); setRejectErr('') }} />
          {rejectErr && <p className="text-sm text-red-600">{rejectErr}</p>}
        </div>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="ยกเลิกใบแจ้งหนี้"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelModal(false)}>ปิด</Button>
            <Button variant="danger" loading={cancelling} onClick={handleCancel}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea label="เหตุผลการยกเลิก" required rows={3} value={cancelReason}
            onChange={e => { setCancelReason(e.target.value); setCancelError('') }} />
          {cancelError && <p className="text-sm text-red-600">{cancelError}</p>}
        </div>
      </Modal>
    </div>
  )
}
