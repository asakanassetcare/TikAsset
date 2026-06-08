import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, X, CheckCircle, XCircle, BookCheck, ArrowRight, ImageIcon, Link2 } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'
import { isAtLeast } from '../../lib/permissions'
import ReceiptPDF from '../../components/pdf/ReceiptPDF'
import Badge from '../../components/ui/Badge'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Textarea from '../../components/ui/Textarea'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate, formatThaiDateTime } from '../../lib/date'
import { CreditCard, LogOut } from 'lucide-react'
import { SLIP_REFERENCE_LABEL, SLIP_REFERENCE_PLACEHOLDER, normalizeSlipReference } from '../../lib/slipReference'

function SlipThumb({ path }) {
  const [url, setUrl] = useState(null)
  const fetched = useRef(false)
  useEffect(() => {
    if (!path || fetched.current) return
    fetched.current = true
    supabase.storage.from('payment-slips').createSignedUrl(path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl) })
  }, [path])
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); if (url) window.open(url, '_blank') }}
      className="shrink-0 h-14 w-14 rounded-lg border border-gray-200 bg-gray-100 overflow-hidden hover:opacity-80 transition-opacity"
    >
      {url
        ? <img src={url} alt="slip" className="h-full w-full object-cover" />
        : <ImageIcon className="h-5 w-5 text-gray-300 m-auto mt-4" />
      }
    </button>
  )
}

function isRecorded(item) {
  if (item._type === 'payment' || item._type === 'booking' || item._type === 'rent_advance') return !!item.accounting_recorded_at
  return item.status === 'recorded'
}

function itemDate(item) {
  if (item._type === 'payment') return item.created_at
  if (item._type === 'booking') return item.payment_recorded_at ?? item.paid_date
  if (item._type === 'rent_advance') return item.created_at
  return item.issued_at
}

function itemBuildingId(item) {
  if (item._type === 'payment') return item.invoices?.rooms?.building_id
  if (item._type === 'booking') return item.rooms?.building_id
  if (item._type === 'rent_advance') return item.rooms?.building_id
  return item.building_id
}

const DIRECTION_LABEL = {
  refund_to_tenant:   'คืนเงินให้ผู้เช่า',
  charge_from_tenant: 'เรียกเก็บเพิ่มจากผู้เช่า',
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function PaymentsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, role } = useAuth()
  const { settings } = useSettings()
  const canApprove = ['super_admin', 'accounting'].includes(role)
  const canRecord  = isAtLeast(role, 'accounting')

  // Section tab: payments | move_outs
  const [section, setSection] = useState(location.state?.section ?? 'payments')

  const [payments,      setPayments]      = useState([])
  const [receipts,      setReceipts]      = useState([])
  const [bookingPmts,   setBookingPmts]   = useState([])
  const [rentAdvances,  setRentAdvances]  = useState([])
  const [settlements,   setSettlements]   = useState([])
  const [projects,      setProjects]      = useState([])
  const [bldgMap,       setBldgMap]       = useState({})
  const [filterProject, setFilterProject] = useState('')
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState(location.state?.tab ?? 'pending')
  const [search,        setSearch]        = useState('')
  const [actionLoading,      setActionLoading]      = useState(null)
  const [recording,          setRecording]          = useState(null)
  const [confirmingStl,      setConfirmingStl]      = useState(null)
  const [confirmStlModal,    setConfirmStlModal]    = useState(null)
  const [confirmSlipFile,    setConfirmSlipFile]    = useState(null)
  const [confirmBankRef,     setConfirmBankRef]     = useState('')
  const [confirmNote,        setConfirmNote]        = useState('')
  const [confirmStlLoading,  setConfirmStlLoading]  = useState(false)
  const [confirmStlErr,      setConfirmStlErr]      = useState('')

  const [rejectModal,  setRejectModal]  = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting,    setRejecting]    = useState(false)
  const [rejectErr,    setRejectErr]    = useState('')

  const [lineSlips,         setLineSlips]         = useState([])
  const [linkModal,         setLinkModal]          = useState(null)
  const [linkInvoiceId,     setLinkInvoiceId]      = useState('')
  const [linkInvoices,      setLinkInvoices]       = useState([])
  const [linkLoading,       setLinkLoading]        = useState(false)
  const [linkErr,           setLinkErr]            = useState('')
  const [rejectLineModal,   setRejectLineModal]    = useState(null)
  const [rejectLineReason,  setRejectLineReason]   = useState('')
  const [rejectLineLoading, setRejectLineLoading]  = useState(false)
  const [rejectLineErr,     setRejectLineErr]      = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: pData }, { data: rData }, { data: bkData }, { data: raData }, { data: sData }, { data: projData }, { data: bData }, { data: lsData }] = await Promise.all([
      supabase.from('payments').select(`
        *, 
        invoices(id, invoice_number, invoice_type, total_amount, due_date, status,
          rooms(room_number, building_id, buildings(id, name)),
          tenants(full_name, line_user_id)),
        recorder:profiles!recorded_by(full_name),
        accounting_recorder:profiles!accounting_recorded_by(full_name)
      `).order('created_at', { ascending: false }).limit(200),
      supabase.from('receipts').select(`
        *,
        issuer:profiles!issued_by(full_name),
        recorder:profiles!recorded_by(full_name)
      `).order('issued_at', { ascending: false }),
      supabase.from('bookings').select(`
        *,
        rooms(room_number, building_id, buildings(id, name)),
        tenants(full_name, line_user_id),
        payment_recorder:profiles!payment_recorded_by(full_name),
        accounting_recorder:profiles!accounting_recorded_by(full_name)
      `).not('slip_url', 'is', null).order('payment_recorded_at', { ascending: false }).limit(200),
      supabase.from('rent_advance_payments').select(`
        *,
        rooms(room_number, building_id, buildings(id, name)),
        tenants(full_name),
        accounting_recorder:profiles!rent_advance_payments_accounting_recorded_by_fkey(full_name)
      `).order('created_at', { ascending: false }).limit(200),
      supabase.from('settlements').select(`
        *,
        move_outs(
          id, move_out_number, move_out_date, settlement_deadline,
          tenants(full_name),
          rooms(room_number, building_id, buildings(name))
        )
      `).not('status', 'eq', 'completed').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('buildings').select('id, name, project_id'),
      supabase.from('line_payment_submissions').select(`
        id, line_user_id, slip_url, note, status, reject_reason, created_at,
        tenants(id, full_name),
        invoices(id, invoice_number),
        reviewer:profiles!reviewed_by(full_name)
      `).order('created_at', { ascending: false }).limit(100),
    ])

    const map = {}
    ;(bData ?? []).forEach(b => { map[b.id] = { name: b.name, project_id: b.project_id } })

    setProjects(projData ?? [])
    setBldgMap(map)
    setPayments((pData ?? []).map(p => ({ ...p, _type: 'payment' })))
    setReceipts((rData ?? []).map(r => ({ ...r, _type: 'receipt' })))
    setBookingPmts((bkData ?? []).map(b => ({ ...b, _type: 'booking' })))
    setRentAdvances((raData ?? []).map(r => ({ ...r, _type: 'rent_advance' })))
    setSettlements(sData ?? [])
    setLineSlips(lsData ?? [])
    if (projData?.length && !filterProject) setFilterProject(projData[0].id)
    setLoading(false)
  }

  function itemProjectId(item) {
    const bId = itemBuildingId(item)
    return bId ? bldgMap[bId]?.project_id : null
  }

  function itemBuildingName(item) {
    if (item._type === 'payment') return item.invoices?.rooms?.buildings?.name
    if (item._type === 'booking') return item.rooms?.buildings?.name
    if (item._type === 'rent_advance') return item.rooms?.buildings?.name
    const bId = itemBuildingId(item)
    return bId ? bldgMap[bId]?.name : null
  }

  function settlementProjectId(s) {
    const bId = s.move_outs?.rooms?.building_id
    return bId ? bldgMap[bId]?.project_id : null
  }

  async function handleApprove(pmt) {
    if (!canReviewPayment(pmt)) {
      alert('อนุมัติไม่ได้ เพราะใบแจ้งหนี้ไม่ได้อยู่สถานะรอยืนยันชำระ')
      fetchAll()
      return
    }
    setActionLoading(pmt.id)
    const { error } = await supabase.from('payments').update({
      status: 'approved',
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    }).eq('id', pmt.id)
    if (error) { setActionLoading(null); alert(error.message); return }

    // Generate PDF ใบเสร็จ → upload → ส่ง LINE
    let receiptUrl = null
    try {
      const blob = await pdf(
        <ReceiptPDF payment={pmt} invoice={pmt.invoices} company={settings} />
      ).toBlob()
      const storagePath = `receipts/${pmt.id}.pdf`
      await supabase.storage.from('payment-slips').upload(storagePath, blob, {
        contentType: 'application/pdf', upsert: true,
      })
      const { data: urlData } = await supabase.storage
        .from('payment-slips')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 30) // 30 วัน
      receiptUrl = urlData?.signedUrl ?? null
    } catch (e) {
      console.error('PDF generation error', e)
    }
    // ส่ง LINE เสมอ ไม่ว่า PDF จะสำเร็จหรือไม่
    supabase.functions.invoke('line-notify', {
      body: { type: 'receipt', payment_id: pmt.id, receipt_url: receiptUrl },
    })

    setActionLoading(null)
    fetchAll()
  }

  function openReject(pmt) {
    setRejectTarget(pmt)
    setRejectReason('')
    setRejectErr('')
    setRejectModal(true)
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setRejectErr('กรุณากรอกเหตุผล'); return }
    setRejecting(true)
    const { error } = await supabase.from('payments').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason: rejectReason.trim(),
    }).eq('id', rejectTarget.id)
    if (!error && rejectTarget.invoices?.id) {
      const today = new Date().toISOString().slice(0, 10)
      const restoredStatus = rejectTarget.invoices.due_date && addDays(rejectTarget.invoices.due_date, 4) < today ? 'overdue' : 'pending'
      const { error: invErr } = await supabase.from('invoices').update({ status: restoredStatus }).eq('id', rejectTarget.invoices.id)
      if (invErr) {
        setRejecting(false)
        setRejectErr(invErr.message)
        return
      }
    }
    setRejecting(false)
    if (error) { setRejectErr(error.message); return }
    setRejectModal(false)
    fetchAll()
  }

  async function handleRecord(item) {
    setRecording(item.id)
    if (item._type === 'payment') {
      await supabase.from('payments').update({
        accounting_recorded_at: new Date().toISOString(),
        accounting_recorded_by: profile.id,
      }).eq('id', item.id)
    } else if (item._type === 'booking') {
      await supabase.from('bookings').update({
        accounting_recorded_at: new Date().toISOString(),
        accounting_recorded_by: profile.id,
      }).eq('id', item.id)
    } else if (item._type === 'rent_advance') {
      await supabase.from('rent_advance_payments').update({
        accounting_recorded_at: new Date().toISOString(),
        accounting_recorded_by: profile.id,
      }).eq('id', item.id)
    } else {
      await supabase.from('receipts').update({
        status:      'recorded',
        recorded_by: profile.id,
        recorded_at: new Date().toISOString(),
      }).eq('id', item.id)
    }
    setRecording(null)
    fetchAll()
  }

  async function openLinkModal(slip) {
    setLinkModal(slip)
    setLinkInvoiceId('')
    setLinkErr('')
    const { data } = await supabase.from('invoices')
      .select('id, invoice_number, total_amount, billing_period')
      .eq('tenant_id', slip.tenants?.id)
      .not('status', 'eq', 'paid')
      .order('created_at', { ascending: false })
      .limit(20)
    setLinkInvoices(data ?? [])
  }

  async function handleLinkSlip() {
    if (!linkInvoiceId) { setLinkErr('กรุณาเลือกใบแจ้งหนี้'); return }
    setLinkLoading(true)
    const { error } = await supabase.from('line_payment_submissions').update({
      invoice_id:  linkInvoiceId,
      status:      'linked',
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', linkModal.id)
    setLinkLoading(false)
    if (error) { setLinkErr(error.message); return }
    setLinkModal(null)
    fetchAll()
    navigate(`/invoices/${linkInvoiceId}`)
  }

  function openRejectLine(slip) {
    setRejectLineModal(slip)
    setRejectLineReason('')
    setRejectLineErr('')
  }

  async function handleRejectLine() {
    if (!rejectLineReason.trim()) { setRejectLineErr('กรุณากรอกเหตุผล'); return }
    setRejectLineLoading(true)
    const { error } = await supabase.from('line_payment_submissions').update({
      status:        'rejected',
      reject_reason: rejectLineReason.trim(),
      reviewed_by:   profile.id,
      reviewed_at:   new Date().toISOString(),
    }).eq('id', rejectLineModal.id)
    setRejectLineLoading(false)
    if (error) { setRejectLineErr(error.message); return }
    setRejectLineModal(null)
    fetchAll()
  }

  function openConfirmStl(s) {
    setConfirmStlModal(s)
    setConfirmSlipFile(null)
    setConfirmBankRef('')
    setConfirmNote('')
    setConfirmStlErr('')
  }

  function closeConfirmStl() { setConfirmStlModal(null) }

  async function handleConfirmZero(stlId) {
    setConfirmingStl(stlId)
    const { error } = await supabase.rpc('confirm_settlement_completed', { p_settlement_id: stlId })
    setConfirmingStl(null)
    if (error) alert(error.message)
    else fetchAll()
  }

  async function handleConfirmWithSlip(e) {
    e.preventDefault()
    const needsSlip = confirmStlModal.direction === 'refund_to_tenant' && Number(confirmStlModal.amount) > 0
    if (needsSlip && !confirmSlipFile) { setConfirmStlErr('กรุณาแนบสลิปการโอนเงิน'); return }
    setConfirmStlLoading(true)
    setConfirmStlErr('')
    let slipUrl = null
    if (confirmSlipFile) {
      const ext = confirmSlipFile.name.split('.').pop()
      const path = `settlements/${confirmStlModal.id}/acct_slip_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('payment-slips').upload(path, confirmSlipFile)
      if (upErr) { setConfirmStlErr(upErr.message); setConfirmStlLoading(false); return }
      slipUrl = path
    }
    const { error } = await supabase.rpc('confirm_settlement_completed', {
      p_settlement_id: confirmStlModal.id,
      p_slip_url:      slipUrl,
      p_bank_ref:      normalizeSlipReference(confirmBankRef) || null,
      p_note:          confirmNote.trim() || null,
    })
    setConfirmStlLoading(false)
    if (error) { setConfirmStlErr(error.message); return }
    closeConfirmStl()
    fetchAll()
  }

  const projectOpts = [
    { value: '', label: 'เลือกโครงการ' },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ]

  const allItems = useMemo(() =>
    [...payments, ...receipts, ...bookingPmts, ...rentAdvances].sort((a, b) => new Date(itemDate(b)) - new Date(itemDate(a)))
  , [payments, receipts, bookingPmts, rentAdvances])

  const byProject = useMemo(() =>
    filterProject
      ? allItems.filter(it => {
          const pid = itemProjectId(it)
          return pid === filterProject || (it._type === 'receipt' && !pid)
        })
      : []
  , [allItems, filterProject, bldgMap])

  const byTab = useMemo(() =>
    byProject
      .filter(isVisibleToAccounting)
      .filter(it => tab === 'recorded' ? isRecorded(it) : !isRecorded(it))
  , [byProject, tab])

  const filtered = useMemo(() => {
    if (!search) return byTab
    const q = search.toLowerCase()
    return byTab.filter(it => {
      if (it._type === 'payment') {
        return (
          it.invoices?.invoice_number?.toLowerCase().includes(q) ||
          it.invoices?.tenants?.full_name?.toLowerCase().includes(q) ||
          it.invoices?.rooms?.room_number?.toLowerCase().includes(q) ||
          it.bank_reference?.toLowerCase().includes(q)
        )
      }
      if (it._type === 'booking') {
        return (
          it.booking_number?.toLowerCase().includes(q) ||
          it.tenants?.full_name?.toLowerCase().includes(q) ||
          it.rooms?.room_number?.toLowerCase().includes(q) ||
          it.bank_reference?.toLowerCase().includes(q)
        )
      }
      if (it._type === 'rent_advance') {
        return (
          it.advance_number?.toLowerCase().includes(q) ||
          it.tenants?.full_name?.toLowerCase().includes(q) ||
          it.rooms?.room_number?.toLowerCase().includes(q) ||
          it.bank_reference?.toLowerCase().includes(q)
        )
      }
      return (
        it.receipt_number?.toLowerCase().includes(q) ||
        it.description?.toLowerCase().includes(q) ||
        it.payer_name?.toLowerCase().includes(q)
      )
    })
  }, [byTab, search])

  const filteredSettlements = useMemo(() =>
    filterProject
      ? settlements.filter(s => settlementProjectId(s) === filterProject)
      : settlements
  , [settlements, filterProject, bldgMap])

  const visibleSettlements = filteredSettlements.filter(s =>
    s.status === 'processing' ||
    (s.status === 'pending' && s.direction === 'refund_to_tenant') ||
    (s.status === 'paid_by_staff' && s.head_approved_at)
  )

  const pendingLineSlips = lineSlips.filter(s => s.status === 'pending')
  function isHeadApproved(item) {
    return !!item.head_approved_at
  }

  function isVisibleToAccounting(item) {
    if (item._type === 'payment') {
      return item.status === 'approved' || isHeadApproved(item)
    }
    return isHeadApproved(item)
  }

  const accountingItems = byProject.filter(isVisibleToAccounting)
  const pendingApproveCount = accountingItems.filter(it => it._type === 'payment' && it.status === 'pending_approve').length
  function canReviewPayment(pmt) {
    if (!pmt.head_approved_at) return false
    const invoice = pmt.invoices
    if (!invoice) return false
    if (invoice.status === 'paid_pending_approve') return true
    return ['pending', 'overdue'].includes(invoice.status) && Number(invoice.total_amount ?? 0) <= 0
  }
  const pendingList  = accountingItems.filter(it => !isRecorded(it))
  const recordedList = accountingItems.filter(it => isRecorded(it))

  // Count settlements needing accounting action
  const actionableSettlements = visibleSettlements.filter(s =>
    (s.status === 'paid_by_staff' && s.head_approved_at) ||
    s.status === 'processing' ||
    (s.status === 'pending' && s.direction === 'refund_to_tenant')
  )

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">บัญชี</h1>
        </div>
        <Select options={projectOpts} value={filterProject}
          onChange={e => setFilterProject(e.target.value)} className="w-48" />
      </div>

      {/* Section tabs */}
      <div className="mb-5 flex border-b border-gray-200">
        {[
          { key: 'payments',   label: 'การชำระเงิน',  count: pendingList.length },
          { key: 'move_outs',  label: 'การย้ายออก',   count: actionableSettlements.length },
          { key: 'line_slips', label: 'สลิป LINE',    count: pendingLineSlips.length },
        ].map(t => (
          <button key={t.key} onClick={() => setSection(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              section === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                section === t.key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ====== SECTION: การชำระเงิน ====== */}
      {section === 'payments' && (
        <>
          <p className="mb-4 text-sm text-gray-500">
            {filtered.length} รายการ
            {pendingApproveCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                {pendingApproveCount} รออนุมัติ
              </span>
            )}
          </p>

          {/* Accounting sub-tabs */}
          <div className="mb-5 flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
            {[
              { key: 'pending',  label: 'ยังไม่บันทึก', count: pendingList.length },
              { key: 'recorded', label: 'บันทึกแล้ว',   count: recordedList.length },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                    tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="mb-5 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา..."
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {!filterProject ? (
            <EmptyState icon={CreditCard} title="กรุณาเลือกโครงการ" />
          ) : filtered.length === 0 ? (
            <EmptyState icon={CreditCard} title={tab === 'pending' ? 'ไม่มีรายการรอบันทึก' : 'ยังไม่มีรายการที่บันทึกแล้ว'} />
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(item => {
                const bldgName = itemBuildingName(item)
                return (
                  <div key={`${item._type}-${item.id}`}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5">

                    {item._type === 'payment' ? (
                      <div className="cursor-pointer flex-1 min-w-0"
                        onClick={() => navigate(`/invoices/${item.invoices?.id}`)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">
                            {item.invoices?.invoice_number}
                            <span className="ml-2 font-bold">฿{Number(item.amount).toLocaleString('th-TH')}</span>
                          </p>
                          {bldgName && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                              {bldgName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          ห้อง {item.invoices?.rooms?.room_number} · {item.invoices?.tenants?.full_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          ชำระ {formatThaiDate(item.paid_date)}
                          {item.bank_reference ? ` · ${item.bank_reference}` : ''}
                          {item.recorder?.full_name ? ` · โดย ${item.recorder.full_name}` : ''}
                        </p>
                        {tab === 'recorded' && item.accounting_recorder?.full_name && (
                          <p className="text-xs text-gray-400">
                            บันทึกโดย {item.accounting_recorder.full_name} · {formatThaiDateTime(item.accounting_recorded_at)}
                          </p>
                        )}
                      </div>
                    ) : item._type === 'booking' ? (
                      <div className="cursor-pointer flex-1 min-w-0"
                        onClick={() => navigate(`/bookings/${item.id}`)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">
                            {item.booking_number}
                            <span className="ml-2 font-bold">฿{Number(item.deposit_amount).toLocaleString('th-TH')}</span>
                          </p>
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                            เงินจอง
                          </span>
                          {bldgName && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                              {bldgName}
                            </span>
                          )}
                          {item.status === 'converted' && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-600">แปลงสัญญาแล้ว</span>
                          )}
                          {item.status === 'cancelled' && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">ยกเลิก</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          ห้อง {item.rooms?.room_number} · {item.tenants?.full_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          ชำระ {formatThaiDate(item.paid_date)}
                          {item.bank_reference ? ` · ${item.bank_reference}` : ''}
                          {item.payment_recorder?.full_name ? ` · โดย ${item.payment_recorder.full_name}` : ''}
                        </p>
                        {tab === 'recorded' && item.accounting_recorder?.full_name && (
                          <p className="text-xs text-gray-400">
                            บันทึกโดย {item.accounting_recorder.full_name} · {formatThaiDateTime(item.accounting_recorded_at)}
                          </p>
                        )}
                      </div>
                    ) : item._type === 'rent_advance' ? (
                      <div className="cursor-pointer flex-1 min-w-0"
                        onClick={() => navigate(`/contracts/${item.contract_id}`)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">
                            {item.advance_number}
                            <span className="ml-2 font-bold">฿{Number(item.paid_amount).toLocaleString('th-TH')}</span>
                          </p>
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                            ค่าเช่ารับล่วงหน้า
                          </span>
                          {bldgName && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                              {bldgName}
                            </span>
                          )}
                          {item.status === 'fully_used' && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                              ใช้หมดแล้ว
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          ห้อง {item.rooms?.room_number} · {item.tenants?.full_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          ชำระ {formatThaiDateTime(item.created_at)}
                          {item.bank_name ? ` · ${item.bank_name}` : ''}
                          {item.bank_reference ? ` · ${item.bank_reference}` : ''}
                        </p>
                        {tab === 'recorded' && item.accounting_recorder?.full_name && (
                          <p className="text-xs text-gray-400">
                            บันทึกโดย {item.accounting_recorder.full_name} · {formatThaiDateTime(item.accounting_recorded_at)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">
                            {item.receipt_number}
                            <span className="ml-2 font-bold text-green-700">
                              ฿{Number(item.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </span>
                          </p>
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                            ค่าซ่อม
                          </span>
                          {bldgName && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                              {bldgName}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700">{item.description || '—'}</p>
                        {item.payer_name && <p className="text-xs text-gray-500">ผู้ชำระ: {item.payer_name}</p>}
                        <p className="text-xs text-gray-400">
                          ออกเมื่อ {formatThaiDateTime(item.issued_at)}
                          {item.issuer?.full_name ? ` · โดย ${item.issuer.full_name}` : ''}
                        </p>
                        {tab === 'recorded' && item.recorder?.full_name && (
                          <p className="text-xs text-gray-400">
                            บันทึกโดย {item.recorder.full_name} · {formatThaiDateTime(item.recorded_at)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {(item._type === 'payment' || item._type === 'booking' || item._type === 'rent_advance') && item.slip_url && (
                        <SlipThumb path={item.slip_url} />
                      )}
                      {item._type === 'payment' && <Badge variant={item.status} />}
                      {canApprove && item._type === 'payment' && item.status === 'pending_approve' && (
                        <>
                          {canReviewPayment(item) && (
                            <Button size="sm" icon={<CheckCircle className="h-3.5 w-3.5" />}
                              loading={actionLoading === item.id}
                              onClick={e => { e.stopPropagation(); handleApprove(item) }}>
                              อนุมัติ
                            </Button>
                          )}
                          <Button size="sm" variant="danger" icon={<XCircle className="h-3.5 w-3.5" />}
                            onClick={e => { e.stopPropagation(); openReject(item) }}>
                            ปฏิเสธ
                          </Button>
                        </>
                      )}
                      {canRecord && tab === 'pending' && (
                        (item._type === 'payment' && item.status === 'approved') ||
                        item._type === 'receipt' ||
                        item._type === 'booking' ||
                        item._type === 'rent_advance'
                      ) && (
                        <Button size="sm" icon={<BookCheck className="h-3.5 w-3.5" />}
                          loading={recording === item.id}
                          onClick={e => { e.stopPropagation(); handleRecord(item) }}>
                          บันทึก
                        </Button>
                      )}
                      {tab === 'recorded' && (
                        <span className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
                          <BookCheck className="h-3.5 w-3.5" />
                          บันทึกแล้ว
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ====== SECTION: การย้ายออก ====== */}
      {section === 'move_outs' && (
        <>
          <p className="mb-4 text-sm text-gray-500">
            {visibleSettlements.length} รายการ
            {actionableSettlements.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                {actionableSettlements.length} รอดำเนินการ
              </span>
            )}
          </p>

          {visibleSettlements.length === 0 ? (
            <EmptyState icon={LogOut} title="ไม่มีรายการย้ายออกที่รอดำเนินการ" />
          ) : (
            <div className="flex flex-col gap-2">
              {visibleSettlements.map(s => {
                const mo = s.move_outs
                const isActionable = canApprove && (
                  (s.status === 'paid_by_staff' && s.head_approved_at) ||
                  s.status === 'processing' ||
                  (s.status === 'pending' && s.direction === 'refund_to_tenant')
                )
                return (
                  <div key={s.id}
                    onClick={() => navigate(`/move-outs/${mo?.id}`)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5 gap-4 hover:shadow-md transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{mo?.move_out_number}</p>
                        {/* Status pill */}
                        {s.status === 'pending' && s.direction === 'refund_to_tenant' && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            {Number(s.amount) === 0 ? 'รอยืนยัน' : 'รอทำจ่าย'}
                          </span>
                        )}
                        {s.status === 'processing' && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">กำลังดำเนินการโอน</span>
                        )}
                        {s.status === 'pending' && s.direction === 'charge_from_tenant' && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">ติดตามหนี้</span>
                        )}
                        {s.status === 'paid_by_staff' && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">รอยืนยัน</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {mo?.rooms?.buildings?.name} ห้อง {mo?.rooms?.room_number} · {mo?.tenants?.full_name}
                      </p>
                      <p className="text-xs text-gray-400">ย้ายออก {formatThaiDate(mo?.move_out_date)}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Amount */}
                      {Number(s.amount) > 0 ? (
                        <p className={`text-sm font-bold ${s.direction === 'refund_to_tenant' ? 'text-green-600' : 'text-red-600'}`}>
                          {s.direction === 'refund_to_tenant' ? 'คืน' : 'หัก'} ฿{Number(s.amount).toLocaleString('th-TH')}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400">฿0</p>
                      )}

                      {/* Waiting for staff */}
                      {s.status === 'pending' && s.direction === 'charge_from_tenant' && (
                        <span className="text-xs text-gray-400">รอ staff รับชำระ</span>
                      )}

                      {/* Accounting action — stop propagation so card click doesn't interfere */}
                      {isActionable && (
                        s.status === 'pending' && s.direction === 'refund_to_tenant' && Number(s.amount) === 0 ? (
                          <Button size="sm" loading={confirmingStl === s.id}
                            onClick={e => { e.stopPropagation(); handleConfirmZero(s.id) }}>
                            ยืนยันตรวจสอบแล้ว
                          </Button>
                        ) : (
                          <Button size="sm" icon={<CheckCircle className="h-3.5 w-3.5" />}
                            onClick={e => { e.stopPropagation(); openConfirmStl(s) }}>
                            {s.status === 'paid_by_staff' ? 'ยืนยันรับแล้ว'
                              : s.status === 'processing' ? 'บันทึกการโอนแล้ว'
                              : 'ยืนยันโอนแล้ว'}
                          </Button>
                        )
                      )}

                      <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ====== SECTION: สลิป LINE ====== */}
      {section === 'line_slips' && (
        <>
          <p className="mb-4 text-sm text-gray-500">
            {lineSlips.length} รายการ
            {pendingLineSlips.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                {pendingLineSlips.length} รอตรวจสอบ
              </span>
            )}
          </p>
          {lineSlips.length === 0 ? (
            <EmptyState icon={ImageIcon} title="ยังไม่มีสลิปจาก LINE" />
          ) : (
            <div className="flex flex-col gap-2">
              {lineSlips.map(slip => (
                <div key={slip.id}
                  className="flex items-start justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5 gap-4">
                  {/* Slip thumbnail */}
                  <button
                    onClick={async () => {
                      const { data } = await supabase.storage.from('payment-slips').createSignedUrl(slip.slip_url, 3600)
                      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                    }}
                    className="shrink-0 h-16 w-16 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center hover:opacity-80 transition-opacity"
                  >
                    <ImageIcon className="h-6 w-6 text-gray-400" />
                  </button>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">
                        {slip.tenants?.full_name ?? slip.line_user_id}
                      </p>
                      {slip.status === 'pending' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">รอตรวจสอบ</span>
                      )}
                      {slip.status === 'linked' && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">เชื่อมแล้ว</span>
                      )}
                      {slip.status === 'rejected' && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">ปฏิเสธ</span>
                      )}
                    </div>
                    {slip.invoices && (
                      <p className="text-xs text-blue-600 mt-0.5">
                        ใบแจ้งหนี้: {slip.invoices.invoice_number}
                      </p>
                    )}
                    {slip.reject_reason && (
                      <p className="text-xs text-red-500 mt-0.5">เหตุผล: {slip.reject_reason}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{formatThaiDateTime(slip.created_at)}</p>
                  </div>
                  {/* Actions */}
                  {slip.status === 'pending' && canApprove && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" icon={<Link2 className="h-3.5 w-3.5" />}
                        onClick={() => openLinkModal(slip)}>
                        เชื่อมใบแจ้งหนี้
                      </Button>
                      <Button size="sm" variant="danger" icon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={() => openRejectLine(slip)}>
                        ปฏิเสธ
                      </Button>
                    </div>
                  )}
                  {slip.status === 'linked' && (
                    <button
                      onClick={() => navigate(`/invoices/${slip.invoices?.id}`)}
                      className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      ดูใบแจ้งหนี้ <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Link LINE slip to invoice Modal */}
      <Modal
        open={!!linkModal}
        onClose={() => setLinkModal(null)}
        title="เชื่อมสลิปกับใบแจ้งหนี้"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLinkModal(null)}>ยกเลิก</Button>
            <Button loading={linkLoading} onClick={handleLinkSlip}>เชื่อมและไปที่ใบแจ้งหนี้</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-700">
            ผู้เช่า: <span className="font-semibold">{linkModal?.tenants?.full_name}</span>
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              เลือกใบแจ้งหนี้ <span className="text-red-500">*</span>
            </label>
            {linkInvoices.length === 0 ? (
              <p className="text-sm text-gray-400">ไม่มีใบแจ้งหนี้ที่ค้างชำระ</p>
            ) : (
              <select
                value={linkInvoiceId}
                onChange={e => setLinkInvoiceId(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- เลือกใบแจ้งหนี้ --</option>
                {linkInvoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} — ฿{Number(inv.total_amount).toLocaleString('th-TH')}
                    {inv.billing_period ? ` (${inv.billing_period})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          {linkErr && <p className="text-sm text-red-600">{linkErr}</p>}
        </div>
      </Modal>

      {/* Reject LINE slip Modal */}
      <Modal open={!!rejectLineModal} onClose={() => setRejectLineModal(null)} title="ปฏิเสธสลิป LINE"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectLineModal(null)}>ยกเลิก</Button>
            <Button variant="danger" loading={rejectLineLoading} onClick={handleRejectLine}>ยืนยัน</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea label="เหตุผล" required rows={3} value={rejectLineReason}
            onChange={e => { setRejectLineReason(e.target.value); setRejectLineErr('') }} />
          {rejectLineErr && <p className="text-sm text-red-600">{rejectLineErr}</p>}
        </div>
      </Modal>

      {/* Confirm Settlement Modal */}
      <Modal
        open={!!confirmStlModal}
        onClose={closeConfirmStl}
        title={confirmStlModal?.direction === 'refund_to_tenant' ? 'ยืนยันการโอนเงินคืนผู้เช่า' : 'ยืนยันรับชำระจากผู้เช่า'}
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirmStl}>ยกเลิก</Button>
            <Button loading={confirmStlLoading} onClick={handleConfirmWithSlip}>ยืนยัน</Button>
          </>
        }
      >
        <form onSubmit={handleConfirmWithSlip} className="flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {confirmStlModal?.direction === 'refund_to_tenant' ? 'สลิปการโอนเงิน' : 'หลักฐานการรับชำระ'}
              {confirmStlModal?.direction === 'refund_to_tenant' && Number(confirmStlModal?.amount) > 0 && (
                <span className="ml-1 text-red-500">*</span>
              )}
            </label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={e => setConfirmSlipFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{SLIP_REFERENCE_LABEL}</label>
            <input
              value={confirmBankRef}
              onChange={e => setConfirmBankRef(normalizeSlipReference(e.target.value))}
              inputMode="numeric"
              maxLength={4}
              placeholder={SLIP_REFERENCE_PLACEHOLDER}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Textarea label="หมายเหตุ" rows={2} value={confirmNote}
            onChange={e => setConfirmNote(e.target.value)} placeholder="ถ้ามี" />
          {confirmStlErr && <p className="text-sm text-red-600">{confirmStlErr}</p>}
        </form>
      </Modal>

      {/* Reject Modal */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="ปฏิเสธการชำระ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectModal(false)}>ปิด</Button>
            <Button variant="danger" loading={rejecting} onClick={handleReject}>ยืนยัน</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea label="เหตุผล" required rows={3} value={rejectReason}
            onChange={e => { setRejectReason(e.target.value); setRejectErr('') }} />
          {rejectErr && <p className="text-sm text-red-600">{rejectErr}</p>}
        </div>
      </Modal>
    </div>
  )
}
