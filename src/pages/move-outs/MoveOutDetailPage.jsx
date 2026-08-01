import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, CheckCircle, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { THAI_BANKS } from '../../lib/banks'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import PdfDownloadButton from '../../components/pdf/PdfDownloadButton'
import MoveOutPDF from '../../components/pdf/MoveOutPDF'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate, formatThaiDateTime } from '../../lib/date'
import { useSettings } from '../../hooks/useSettings'
import { SLIP_REFERENCE_LABEL, SLIP_REFERENCE_PLACEHOLDER, normalizeSlipReference } from '../../lib/slipReference'

export default function MoveOutDetailPage() {
  const { moveOutId } = useParams()
  const navigate = useNavigate()
  const { profile, role } = useAuth()

  const [mo,                  setMo]                  = useState(null)
  const [settlement,          setSettlement]          = useState(null)
  const [outstandingInvoices, setOutstandingInvoices] = useState([])
  const [pendingAddons,       setPendingAddons]       = useState([])
  const [loading,             setLoading]             = useState(true)

  // Draft: fill-in modal
  const [editModal,    setEditModal]    = useState(false)
  const [editForm,     setEditForm]     = useState({ electric_meter_end: '', water_meter_end: '', repair_cost: '0', penalty_cost: '0', other_deduction: '0', rent_to_move_out: '0', bank_name: '', bank_account_number: '', bank_account_name: '' })
  const [bookbankFile,       setBookbankFile]       = useState(null)
  const [checklistOutFile,   setChecklistOutFile]   = useState(null)
  const [terminationDocFile, setTerminationDocFile] = useState(null)
  const [editSaving,         setEditSaving]         = useState(false)
  const [editErr,      setEditErr]      = useState('')

  // Cancel draft
  const [cancelModal,  setCancelModal]  = useState(false)
  const [cancelling,   setCancelling]   = useState(false)
  const [cancelErr,    setCancelErr]    = useState('')

  // Submit for accounting
  const [submitting,  setSubmitting]  = useState(false)
  const [submitErr,   setSubmitErr]   = useState('')

  // Approve / Reject (head_staff)
  const [approving,          setApproving]          = useState(false)
  const [approveErr,         setApproveErr]         = useState('')
  const [approveConfirmModal, setApproveConfirmModal] = useState(false)
  const [rejectModal,        setRejectModal]        = useState(false)
  const [rejectNote,         setRejectNote]         = useState('')
  const [rejecting,          setRejecting]          = useState(false)
  const [rejectErr,          setRejectErr]          = useState('')

  // Staff: mark paid (upload slip)
  const [payModal,    setPayModal]    = useState(false)
  const [slipFile,    setSlipFile]    = useState(null)
  const [payBankName, setPayBankName] = useState('')
  const [bankRef,     setBankRef]     = useState('')
  const [payNote,     setPayNote]     = useState('')
  const [paying,      setPaying]      = useState(false)
  const [payErr,      setPayErr]      = useState('')

  // Accounting: confirm with slip modal
  const [confirmSlipModal,   setConfirmSlipModal]   = useState(false)
  const [confirmSlipFile,    setConfirmSlipFile]    = useState(null)
  const [confirmBankRef,     setConfirmBankRef]     = useState('')
  const [confirmNote,        setConfirmNote]        = useState('')
  const [confirmSlipLoading, setConfirmSlipLoading] = useState(false)
  const [confirmSlipErr,     setConfirmSlipErr]     = useState('')

  // Accounting: simple confirm (zero amount)
  const [confirming,  setConfirming]  = useState(false)
  const [confirmErr,  setConfirmErr]  = useState('')
  const [managerApprovingSettlement, setManagerApprovingSettlement] = useState(false)

  const { settings } = useSettings()

  useEffect(() => { fetchAll() }, [moveOutId])

  async function fetchAll() {
    const [{ data: moData, error: moErr }, { data: stlData }] = await Promise.all([
      supabase.from('move_outs').select(`
        *,
        tenants(full_name, phone, bank_name, bank_account_number, bank_account_name),
        rooms(room_number, buildings(name)),
        contracts(contract_number, electric_meter_start, water_meter_start, contract_end_date)
      `).eq('id', moveOutId).single(),
      supabase.from('settlements').select('*').eq('move_out_id', moveOutId).maybeSingle(),
    ])
    if (!moData) {
      navigate('/move-outs')
      return
    }

    let invData = []
    let addonData = []
    if (moData.contract_id) {
      const [{ data: inv }, { data: addons }] = await Promise.all([
        supabase.from('invoices')
          .select('id, invoice_number, total_amount, due_date, status')
          .eq('contract_id', moData.contract_id)
          .in('status', ['pending', 'overdue', 'paid_pending_approve'])
          .order('due_date'),
        supabase.from('contract_addons')
          .select('id, name, amount')
          .eq('contract_id', moData.contract_id)
          .eq('billing_cycle', 'one_time')
          .eq('is_active', true),
      ])
      invData   = inv    ?? []
      addonData = addons ?? []
    }

    setMo(moData)
    setSettlement(stlData)
    setOutstandingInvoices(invData)
    setPendingAddons(addonData)
    setLoading(false)
  }

  function openEditModal() {
    setEditForm({
      electric_meter_end:  mo.electric_meter_end != null ? String(mo.electric_meter_end) : '',
      water_meter_end:     mo.water_meter_end    != null ? String(mo.water_meter_end)    : '',
      repair_cost:         String(mo.repair_cost      ?? 0),
      penalty_cost:        String(mo.penalty_cost     ?? 0),
      other_deduction:     String(mo.other_deduction  ?? 0),
      rent_to_move_out:    String(mo.rent_to_move_out ?? 0),
      bank_name:           mo.tenants?.bank_name           ?? '',
      bank_account_number: mo.tenants?.bank_account_number ?? '',
      bank_account_name:   mo.tenants?.bank_account_name   ?? '',
    })
    setBookbankFile(null)
    setChecklistOutFile(null)
    setTerminationDocFile(null)
    setEditErr('')
    setEditModal(true)
  }

  async function handleEditSave(e) {
    e.preventDefault()
    setEditSaving(true); setEditErr('')

    if (editForm.electric_meter_end === '') { setEditSaving(false); setEditErr('กรุณากรอกเลขมิเตอร์ไฟ (ปลาย)'); return }
    if (editForm.water_meter_end    === '') { setEditSaving(false); setEditErr('กรุณากรอกเลขมิเตอร์น้ำ (ปลาย)'); return }
    if (!mo.checklist_out_url && !checklistOutFile) { setEditSaving(false); setEditErr('กรุณาแนบ Checklist ตรวจห้อง (ตอนออก)'); return }
    if (!mo.bookbank_url      && !bookbankFile)     { setEditSaving(false); setEditErr('กรุณาแนบสมุดบัญชีของผู้เช่า'); return }
    if (mo.is_early_termination && !mo.termination_doc_url && !terminationDocFile) { setEditSaving(false); setEditErr('กรุณาแนบเอกสารยกเลิกสัญญาก่อนกำหนด'); return }
    if (!editForm.bank_name.trim())           { setEditSaving(false); setEditErr('กรุณากรอกชื่อธนาคาร'); return }
    if (!editForm.bank_account_number.trim()) { setEditSaving(false); setEditErr('กรุณากรอกเลขบัญชี'); return }
    if (!editForm.bank_account_name.trim())   { setEditSaving(false); setEditErr('กรุณากรอกชื่อบัญชี'); return }

    // Re-fetch outstanding at submit time to avoid stale-state race condition
    const [{ data: freshInv }, { data: freshAddons }] = await Promise.all([
      supabase.from('invoices')
        .select('total_amount')
        .eq('contract_id', mo.contract_id)
        .in('status', ['pending', 'overdue', 'paid_pending_approve']),
      supabase.from('contract_addons')
        .select('amount')
        .eq('contract_id', mo.contract_id)
        .eq('billing_cycle', 'one_time')
        .eq('is_active', true),
    ])
    const deposit       = Number(mo.deposit_amount) || 0
    const outstanding   = (freshInv   ?? []).reduce((s, i) => s + Number(i.total_amount), 0)
                        + (freshAddons ?? []).reduce((s, a) => s + Number(a.amount),       0)
    const repair        = Number(editForm.repair_cost)       || 0
    const penalty       = Number(editForm.penalty_cost)      || 0
    const other         = Number(editForm.other_deduction)   || 0
    const rentToMoveOut = Number(editForm.rent_to_move_out)  || 0
    const net           = deposit - outstanding - repair - penalty - other - rentToMoveOut
    const refundAmt     = net > 0 ? net  : 0
    const chargeAmt     = net < 0 ? -net : 0

    // Upload checklist if new file selected
    let checklistOutUrl = mo.checklist_out_url ?? null
    if (checklistOutFile) {
      const ext  = checklistOutFile.name.split('.').pop()
      const path = `checklists/out/${moveOutId}_${Date.now()}.${ext}`
      const { data: cd, error: ce } = await supabase.storage.from('payment-slips').upload(path, checklistOutFile)
      if (ce) { setEditSaving(false); setEditErr('อัปโหลด checklist ไม่สำเร็จ'); return }
      checklistOutUrl = cd.path
    }

    // Upload bookbank if new file selected
    let bookbankUrl = mo.bookbank_url ?? null
    if (bookbankFile) {
      const ext  = bookbankFile.name.split('.').pop()
      const path = `bookbanks/${moveOutId}_${Date.now()}.${ext}`
      const { data: bd, error: be } = await supabase.storage.from('payment-slips').upload(path, bookbankFile)
      if (be) { setEditSaving(false); setEditErr('อัปโหลดสมุดบัญชีไม่สำเร็จ'); return }
      bookbankUrl = bd.path
    }

    // Upload termination doc if early termination and new file selected
    let terminationDocUrl = mo.termination_doc_url ?? null
    if (terminationDocFile) {
      const ext  = terminationDocFile.name.split('.').pop()
      const path = `termination-docs/${moveOutId}_${Date.now()}.${ext}`
      const { data: td, error: te } = await supabase.storage.from('payment-slips').upload(path, terminationDocFile)
      if (te) { setEditSaving(false); setEditErr('อัปโหลดเอกสารยกเลิกสัญญาไม่สำเร็จ'); return }
      terminationDocUrl = td.path
    }

    const updates = [
      supabase.from('move_outs').update({
        electric_meter_end:        editForm.electric_meter_end !== '' ? Number(editForm.electric_meter_end) : null,
        water_meter_end:           editForm.water_meter_end    !== '' ? Number(editForm.water_meter_end)    : null,
        outstanding_invoice_total: outstanding,
        repair_cost:               repair,
        penalty_cost:              penalty,
        other_deduction:           other,
        rent_to_move_out:          rentToMoveOut,
        refund_amount:             refundAmt,
        additional_charge:         chargeAmt,
        checklist_out_url:         checklistOutUrl,
        bookbank_url:              bookbankUrl,
        termination_doc_url:       terminationDocUrl,
        settlement_deadline: (() => {
          const [y, m, day] = (mo.move_out_date ?? '').slice(0, 10).split('-').map(Number)
          const d = new Date(y, m - 1, day + 15)
          return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
        })(),
      }).eq('id', moveOutId),
      supabase.from('tenants').update({
        bank_name:           editForm.bank_name           || null,
        bank_account_number: editForm.bank_account_number || null,
        bank_account_name:   editForm.bank_account_name   || null,
      }).eq('id', mo.tenant_id),
    ]

    const results = await Promise.all(updates)
    setEditSaving(false)
    const firstErr = results.find(r => r.error)?.error
    if (firstErr) { setEditErr(firstErr.message); return }
    setEditModal(false)
    fetchAll()
  }

  async function handleSubmitForAccounting() {
    if (mo.electric_meter_end == null || mo.water_meter_end == null) { setSubmitErr('กรุณากรอกมิเตอร์ไฟและมิเตอร์น้ำก่อน'); return }
    if (!mo.settlement_deadline) { setSubmitErr('กรุณากด "กรอกข้อมูล" และบันทึกข้อมูลก่อน'); return }
    setSubmitting(true); setSubmitErr('')
    const { error } = await supabase.from('move_outs').update({
      status: 'pending_accounting',
      rejection_note: null,
    }).eq('id', moveOutId)
    setSubmitting(false)
    if (error) { setSubmitErr(error.message); return }
    fetchAll()
  }

  async function handleCancel() {
    setCancelling(true); setCancelErr('')
    const { error, count } = await supabase.from('move_outs').delete({ count: 'exact' }).eq('id', moveOutId)
    setCancelling(false)
    if (error) { setCancelErr(error.message); return }
    if (count === 0) { setCancelErr('ไม่สามารถยกเลิกได้ (ไม่มีสิทธิ์หรือสถานะไม่อนุญาต)'); return }
    navigate('/move-outs')
  }

  async function handleReject(e) {
    e.preventDefault()
    setRejecting(true); setRejectErr('')
    const { error } = await supabase.from('move_outs').update({
      status: 'draft',
      rejection_note: rejectNote.trim() || null,
    }).eq('id', moveOutId)
    setRejecting(false)
    if (error) { setRejectErr(error.message); return }
    setRejectModal(false)
    fetchAll()
  }

  async function handleApprove() {
    setApproving(true); setApproveErr('')
    const { error } = await supabase.rpc('approve_move_out', { p_move_out_id: moveOutId })
    setApproving(false)
    if (error) { setApproveErr(error.message); return }
    fetchAll()
  }

  async function handlePay(e) {
    e.preventDefault()
    if (!slipFile) { setPayErr('กรุณาแนบสลิป'); return }
    setPaying(true); setPayErr('')

    const ext  = slipFile.name.split('.').pop()
    const path = `settlements/${settlement.id}/slip_${Date.now()}.${ext}`
    const { data: sd, error: se } = await supabase.storage.from('payment-slips').upload(path, slipFile)
    if (se) { setPaying(false); setPayErr('อัปโหลดสลิปไม่สำเร็จ'); return }

    const { error } = await supabase.rpc('confirm_settlement_paid', {
      p_settlement_id: settlement.id,
      p_slip_url:      sd.path,
      p_bank_name:     payBankName || null,
      p_bank_ref:      normalizeSlipReference(bankRef) || null,
      p_note:          payNote.trim() || null,
    })
    setPaying(false)
    if (error) { setPayErr(error.message); return }
    setPayModal(false)
    fetchAll()
  }

  async function handleConfirmWithSlip(e) {
    e.preventDefault()
    if (settlement.status === 'paid_by_staff' && !settlement.head_approved_at) {
      setConfirmSlipErr('ต้องให้ Head Staff อนุมัติรายการรับชำระนี้ก่อนส่งต่อบัญชี')
      return
    }
    const needSlip = settlement.direction === 'refund_to_tenant' && Number(settlement.amount) > 0
    if (needSlip && !confirmSlipFile) { setConfirmSlipErr('กรุณาแนบสลิปการโอนเงิน'); return }
    setConfirmSlipLoading(true); setConfirmSlipErr('')

    let slipUrl = null
    if (confirmSlipFile) {
      const ext  = confirmSlipFile.name.split('.').pop()
      const path = `settlements/${settlement.id}/acct_slip_${Date.now()}.${ext}`
      const { data: sd, error: se } = await supabase.storage.from('payment-slips').upload(path, confirmSlipFile)
      if (se) { setConfirmSlipLoading(false); setConfirmSlipErr('อัปโหลดไฟล์ไม่สำเร็จ'); return }
      slipUrl = sd.path
    }

    const { error } = await supabase.rpc('confirm_settlement_completed', {
      p_settlement_id: settlement.id,
      p_slip_url:      slipUrl,
      p_bank_ref:      normalizeSlipReference(confirmBankRef) || null,
      p_note:          confirmNote.trim() || null,
    })
    setConfirmSlipLoading(false)
    if (error) { setConfirmSlipErr(error.message); return }
    setConfirmSlipModal(false)
    fetchAll()
  }

  async function handleConfirm() {
    setConfirming(true); setConfirmErr('')
    const { error } = await supabase.rpc('confirm_settlement_completed', {
      p_settlement_id: settlement.id,
    })
    setConfirming(false)
    if (error) { setConfirmErr(error.message); return }
    fetchAll()
  }

  async function handleManagerApproveSettlement() {
    setManagerApprovingSettlement(true)
    const { data: updated, error } = await supabase.from('settlements').update({
      head_approved_by:       profile.id,
      head_approved_at:       new Date().toISOString(),
      head_rejected_by:       null,
      head_rejected_at:       null,
      head_rejection_reason:  null,
    })
      .eq('id', settlement.id)
      .is('head_approved_at', null)
      .is('head_rejected_at', null)
      .select('id')
    setManagerApprovingSettlement(false)
    if (error) {
      alert(error.message)
      return
    }
    if (!updated || updated.length === 0) {
      alert('รายการนี้ถูกอนุมัติหรือปฏิเสธไปแล้ว กรุณารีเฟรช')
    }
    fetchAll()
  }

  if (loading) return <PageSpinner />

  const isAccounting = ['super_admin', 'accounting'].includes(role)
  const isHeadStaff  = ['super_admin', 'head_staff'].includes(role)
  const isStaff      = ['super_admin', 'head_staff', 'staff'].includes(role)

  const DIRECTION_LABEL = {
    refund_to_tenant:    'คืนเงินให้ผู้เช่า',
    charge_from_tenant:  'เรียกเก็บเพิ่มจากผู้เช่า',
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/move-outs" className="hover:text-blue-600">ย้ายออก</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{mo.move_out_number}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{mo.move_out_number}</h1>
            {mo.status !== 'approved' ? (
              <Badge variant={mo.status} />
            ) : (() => {
              const s = settlement
              const pill = (label, cls) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
              )
              if (!s) return pill('รอบัญชี', 'bg-blue-100 text-blue-700')
              if (s.status === 'pending' && s.direction === 'refund_to_tenant')
                return pill(Number(s.amount) === 0 ? 'รอบัญชียืนยัน' : 'รอทำจ่าย', 'bg-blue-100 text-blue-700')
              if (s.status === 'processing')
                return pill('บัญชีกำลังโอนเงิน', 'bg-indigo-100 text-indigo-700')
              if (s.status === 'pending' && s.direction === 'charge_from_tenant')
                return pill('ติดตามหนี้', 'bg-red-100 text-red-700')
              if (s.status === 'paid_by_staff')
                return pill('รอบัญชียืนยัน', 'bg-amber-100 text-amber-700')
              return pill('รอบัญชี', 'bg-blue-100 text-blue-700')
            })()}
            {mo.is_early_termination && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">ก่อนกำหนด</span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {mo.contracts?.contract_number} · ย้ายออก {formatThaiDate(mo.move_out_date)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PdfDownloadButton
            document={<MoveOutPDF moveOut={mo} company={settings} />}
            filename={`${mo.move_out_number}.pdf`}
            label="PDF ย้ายออก"
          />
          {mo.status === 'draft' && isStaff && (
            <>
              <Button variant="danger" onClick={() => { setCancelErr(''); setCancelModal(true) }}>ยกเลิกรายการ</Button>
              <Button variant="secondary" onClick={openEditModal}>กรอกข้อมูล</Button>
              <Button icon={<CheckCircle className="h-4 w-4" />} loading={submitting} onClick={handleSubmitForAccounting}>
                ส่งให้หัวหน้าอนุมัติ
              </Button>
              {submitErr && <p className="text-sm text-red-600">{submitErr}</p>}
            </>
          )}
          {isHeadStaff && mo.status === 'pending_accounting' && (
            <>
              <Button variant="danger" onClick={() => { setCancelErr(''); setCancelModal(true) }}>ยกเลิกรายการ</Button>
              <Button variant="secondary" onClick={() => { setRejectNote(''); setRejectErr(''); setRejectModal(true) }}>
                ไม่อนุมัติ
              </Button>
              <Button icon={<CheckCircle className="h-4 w-4" />} loading={approving}
                onClick={() => mo.is_early_termination ? setApproveConfirmModal(true) : handleApprove()}>
                อนุมัติ
              </Button>
            </>
          )}
          {approveErr && <p className="text-sm text-red-600">{approveErr}</p>}
        </div>
      </div>

      {/* Early termination warning — shown to head_staff when pending approval */}
      {mo.is_early_termination && mo.status === 'pending_accounting' && isHeadStaff && (
        <div className="mb-4 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-bold text-base mb-1">⚠️ ผู้เช่าออกก่อนกำหนด</p>
          <p>โดยทั่วไปผู้เช่าที่ออกก่อนกำหนดสัญญา <strong>จะไม่ได้รับเงินประกันคืน</strong> กรุณาตรวจสอบยอดเงินและเงื่อนไขให้ถูกต้องก่อนอนุมัติ</p>
        </div>
      )}

      {/* Draft banner */}
      {mo.status === 'draft' && (
        <>
          {mo.rejection_note && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span className="font-semibold">หัวหน้าไม่อนุมัติ:</span> {mo.rejection_note}
            </div>
          )}
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            รายการนี้ยังรอกรอกข้อมูลมิเตอร์และค่าใช้จ่าย กด <strong>กรอกข้อมูล</strong> แล้วส่งให้หัวหน้าอนุมัติ
          </div>
        </>
      )}

      {/* Pending addons warning */}
      {pendingAddons.length > 0 && mo.status === 'draft' && (
        <div className="mb-4 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <p className="font-semibold mb-1">มีค่าบริการเพิ่มเติมที่ยังไม่ได้รวมในการ settlement ({pendingAddons.length} รายการ)</p>
          <div className="space-y-0.5 mb-2">
            {pendingAddons.map(a => (
              <div key={a.id} className="flex justify-between text-xs">
                <span>{a.name}</span>
                <span>฿{Number(a.amount).toLocaleString('th-TH')}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-orange-600">กด <strong>กรอกข้อมูล</strong> เพื่อรับทราบและรวมยอดเหล่านี้ในการคำนวณ ก่อนส่งให้หัวหน้าอนุมัติ</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3 max-w-4xl">
        {/* Room */}
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">ห้อง</p>
          <p className="text-sm font-semibold text-gray-900">{mo.rooms?.buildings?.name} ห้อง {mo.rooms?.room_number}</p>
          <p className="text-sm text-gray-600">{mo.tenants?.full_name}</p>
          {mo.tenants?.phone && <p className="text-xs text-gray-400">{mo.tenants.phone}</p>}
        </Card>

        {/* Dates */}
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">วันที่</p>
          <div className="space-y-1.5 text-sm">
            <div><p className="text-xs text-gray-400">วันย้ายออก</p><p className="font-medium">{formatThaiDate(mo.move_out_date)}</p></div>
            {mo.settlement_deadline && (
              <div><p className="text-xs text-gray-400">ครบกำหนดเคลียร์</p><p className="font-medium">{formatThaiDate(mo.settlement_deadline)}</p></div>
            )}
            {mo.approved_at && (
              <div><p className="text-xs text-gray-400">อนุมัติเมื่อ</p><p className="font-medium">{formatThaiDate(mo.approved_at)}</p></div>
            )}
          </div>
        </Card>

        {/* Meter */}
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">มิเตอร์ปลายสัญญา</p>
          <div className="space-y-1.5 text-sm">
            <div><p className="text-xs text-gray-400">ไฟ</p><p className="font-medium">{mo.electric_meter_end ?? '—'}</p></div>
            <div><p className="text-xs text-gray-400">น้ำ</p><p className="font-medium">{mo.water_meter_end ?? '—'}</p></div>
            {mo.checklist_out_url && (
              <div>
                <p className="text-xs text-gray-400">Checklist ย้ายออก</p>
                <button
                  onClick={async () => {
                    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(mo.checklist_out_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  ดูเอกสาร
                </button>
              </div>
            )}
            {mo.is_early_termination && mo.termination_doc_url && (
              <div>
                <p className="text-xs text-red-400">เอกสารยกเลิกก่อนกำหนด</p>
                <button
                  onClick={async () => {
                    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(mo.termination_doc_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  ดูเอกสาร
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* Financial breakdown */}
        <Card className="lg:col-span-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">รายการหักเงินประกัน</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">เงินประกัน</span>
              <span className="font-medium">฿{Number(mo.deposit_amount).toLocaleString('th-TH')}</span>
            </div>
            {mo.repair_cost > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ค่าซ่อมแซม</span>
                <span>-฿{Number(mo.repair_cost).toLocaleString('th-TH')}</span>
              </div>
            )}
            {mo.penalty_cost > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ค่าปรับ</span>
                <span>-฿{Number(mo.penalty_cost).toLocaleString('th-TH')}</span>
              </div>
            )}
            {mo.other_deduction > 0 && (
              <div className="flex justify-between text-red-600">
                <span>หักอื่นๆ</span>
                <span>-฿{Number(mo.other_deduction).toLocaleString('th-TH')}</span>
              </div>
            )}
            {mo.outstanding_invoice_total > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ยอดค้างชำระ (ค่าเช่า + บริการ)</span>
                <span>-฿{Number(mo.outstanding_invoice_total).toLocaleString('th-TH')}</span>
              </div>
            )}
            {mo.rent_to_move_out > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ค่าเช่าจนถึงวันย้ายออก</span>
                <span>-฿{Number(mo.rent_to_move_out).toLocaleString('th-TH')}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold">
              {mo.refund_amount > 0 && (
                <><span className="text-green-700">คืนผู้เช่า</span><span className="text-green-700">฿{Number(mo.refund_amount).toLocaleString('th-TH')}</span></>
              )}
              {mo.additional_charge > 0 && (
                <><span className="text-red-700">ผู้เช่าจ่ายเพิ่ม</span><span className="text-red-700">฿{Number(mo.additional_charge).toLocaleString('th-TH')}</span></>
              )}
              {!mo.refund_amount && !mo.additional_charge && (
                <><span className="text-gray-500">ยอดสุทธิ</span><span className="text-gray-500">฿0</span></>
              )}
            </div>
          </div>
        </Card>

        {/* Note */}
        {mo.reason && (
          <Card>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">เหตุผล</p>
            <p className="text-sm text-gray-700">{mo.reason}</p>
          </Card>
        )}

        {/* Settlement section */}
        {settlement && (
          <Card className="lg:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">การเคลียร์เงิน</p>
              {settlement.status === 'pending' && settlement.direction === 'refund_to_tenant' && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {Number(settlement.amount) === 0 ? 'รอบัญชียืนยัน' : 'รอทำจ่าย'}
                </span>
              )}
              {settlement.status === 'processing' && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">กำลังดำเนินการโอน</span>
              )}
              {settlement.status === 'pending' && settlement.direction === 'charge_from_tenant' && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">ติดตามหนี้</span>
              )}
              {settlement.status === 'paid_by_staff' && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">รอบัญชียืนยัน</span>
              )}
              {settlement.status === 'completed' && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">เคลียร์แล้ว</span>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="text-xs text-gray-400">ประเภท</p>
                  <p className="font-medium">
                    {Number(settlement.amount) === 0 ? 'ยอดสุทธิเป็น 0' : DIRECTION_LABEL[settlement.direction]}
                  </p>
                </div>
                {Number(settlement.amount) > 0 && (
                  <div>
                    <p className="text-xs text-gray-400">จำนวนเงิน</p>
                    <p className="font-bold text-lg">฿{Number(settlement.amount).toLocaleString('th-TH')}</p>
                  </div>
                )}
              </div>

              {/* Refund: accounting confirms directly with slip (pending or processing) */}
              {settlement.direction === 'refund_to_tenant' && ['pending', 'processing'].includes(settlement.status) && Number(settlement.amount) > 0 && (
                <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  {isAccounting ? 'โอนเงินคืนผู้เช่าเรียบร้อยแล้ว กด "ยืนยันโอนเงินแล้ว" พร้อมแนบสลิป' : 'รอฝ่ายบัญชีโอนเงินคืนให้ผู้เช่า'}
                </p>
              )}
              {isAccounting && settlement.direction === 'refund_to_tenant' && ['pending', 'processing'].includes(settlement.status) && Number(settlement.amount) > 0 && (
                <Button size="sm" icon={<Upload className="h-3.5 w-3.5" />}
                  onClick={() => { setConfirmSlipFile(null); setConfirmBankRef(''); setConfirmNote(''); setConfirmSlipErr(''); setConfirmSlipModal(true) }}>
                  ยืนยันโอนเงินแล้ว
                </Button>
              )}

              {/* Record receipt from tenant (charge only) — shown to all staff+accounting */}
              {settlement.status === 'pending' && settlement.direction === 'charge_from_tenant' && (isStaff || isAccounting) && (
                <Button size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => {
                  setSlipFile(null); setPayBankName(''); setBankRef(''); setPayNote(''); setPayErr(''); setPayModal(true)
                }}>
                  บันทึกรับชำระจากผู้เช่า
                </Button>
              )}

              {/* Staff's evidence */}
              {settlement.slip_url && (
                <div className="flex items-center gap-2">
                  <button onClick={async () => {
                    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(settlement.slip_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }} className="text-xs text-blue-600 hover:underline">ดูหลักฐาน staff</button>
                  {settlement.bank_reference && <span className="text-xs text-gray-400">({settlement.bank_reference})</span>}
                </div>
              )}
              {settlement.paid_at && (
                <p className="text-xs text-gray-400">staff บันทึกเมื่อ {formatThaiDateTime(settlement.paid_at)}</p>
              )}

              {isHeadStaff && settlement.status === 'paid_by_staff' && !settlement.head_approved_at && !settlement.head_rejected_at && (
                <Button
                  size="sm"
                  icon={<CheckCircle className="h-3.5 w-3.5" />}
                  loading={managerApprovingSettlement}
                  onClick={handleManagerApproveSettlement}
                >
                  Manager approve
                </Button>
              )}

              {/* Accounting: confirm charge (paid_by_staff) or zero */}
              {isAccounting && settlement.status === 'paid_by_staff' && settlement.head_approved_at && (
                <Button size="sm" icon={<Upload className="h-3.5 w-3.5" />}
                  onClick={() => { setConfirmSlipFile(null); setConfirmBankRef(''); setConfirmNote(''); setConfirmSlipErr(''); setConfirmSlipModal(true) }}>
                  ยืนยันรับชำระแล้ว
                </Button>
              )}

              {/* Accounting: zero amount — simple confirm */}
              {isAccounting && settlement.status === 'pending' && settlement.direction === 'refund_to_tenant' && Number(settlement.amount) === 0 && (
                <div className="flex items-center gap-3">
                  <Button size="sm" icon={<CheckCircle className="h-3.5 w-3.5" />}
                    loading={confirming} onClick={handleConfirm}>ยืนยันตรวจสอบแล้ว</Button>
                  {confirmErr && <p className="text-sm text-red-600">{confirmErr}</p>}
                </div>
              )}

              {/* Accounting's evidence after completion */}
              {settlement.accounting_slip_url && (
                <div className="flex items-center gap-2">
                  <button onClick={async () => {
                    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(settlement.accounting_slip_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }} className="text-xs text-blue-600 hover:underline">ดูสลิปบัญชี</button>
                  {settlement.accounting_bank_ref && <span className="text-xs text-gray-400">({settlement.accounting_bank_ref})</span>}
                </div>
              )}

              {settlement.status === 'completed' && settlement.confirmed_at && (
                <p className="text-xs text-green-600">ยืนยันแล้วเมื่อ {formatThaiDateTime(settlement.confirmed_at)}</p>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Draft: fill-in Modal */}
      <Modal
        open={editModal}
        onClose={() => setEditModal(false)}
        title="กรอกข้อมูลมิเตอร์และค่าใช้จ่าย"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditModal(false)}>ปิด</Button>
            <Button form="edit-mo-form" type="submit" loading={editSaving}>บันทึก</Button>
          </>
        }
      >
        {(() => {
          const deposit       = Number(mo.deposit_amount)         || 0
          const invoiceTotal  = outstandingInvoices.reduce((s, i) => s + Number(i.total_amount), 0)
          const addonTotal    = pendingAddons.reduce((s, a) => s + Number(a.amount), 0)
          const outstanding   = invoiceTotal + addonTotal
          const repair        = Number(editForm.repair_cost)       || 0
          const penalty       = Number(editForm.penalty_cost)      || 0
          const other         = Number(editForm.other_deduction)   || 0
          const rentToMoveOut = Number(editForm.rent_to_move_out)  || 0
          const net           = deposit - outstanding - repair - penalty - other - rentToMoveOut
          const refundAmt     = net > 0 ? net  : 0
          const chargeAmt     = net < 0 ? -net : 0
          function ef(key) { return e => setEditForm(p => ({ ...p, [key]: e.target.value })) }
          return (
            <form id="edit-mo-form" onSubmit={handleEditSave} className="flex flex-col gap-4">
              {/* Early termination doc upload */}
              {mo.is_early_termination && (
                <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-600">เอกสารยกเลิกสัญญาก่อนกำหนด <span className="text-red-500">*</span></p>
                  <p className="mb-3 text-xs text-red-500">เช่น หนังสือแจ้งยกเลิก / บันทึกข้อตกลง</p>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-red-300 bg-white px-4 py-3 hover:border-red-400 transition-colors">
                    <Upload className="h-4 w-4 text-red-400 shrink-0" />
                    <span className="text-sm text-gray-500 truncate">
                      {terminationDocFile ? terminationDocFile.name : mo.termination_doc_url ? 'มีไฟล์แล้ว (คลิกเพื่อเปลี่ยน)' : 'แนบเอกสาร (รูปหรือ PDF)'}
                    </span>
                    <input type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={e => setTerminationDocFile(e.target.files?.[0] ?? null)} />
                  </label>
                  {mo.termination_doc_url && !terminationDocFile && (
                    <button type="button" onClick={async () => {
                      const { data } = await supabase.storage.from('payment-slips').createSignedUrl(mo.termination_doc_url, 3600)
                      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                    }} className="mt-1 text-xs text-blue-600 hover:underline text-left">ดูเอกสารที่แนบไว้</button>
                  )}
                </div>
              )}

              {/* Checklist upload */}
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Checklist ตรวจห้อง (ตอนออก)</p>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
                  <Upload className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-500 truncate">
                    {checklistOutFile ? checklistOutFile.name : mo.checklist_out_url ? 'มีไฟล์แล้ว (คลิกเพื่อเปลี่ยน)' : 'แนบ checklist ที่ผู้เช่าเซ็นแล้ว (รูปหรือ PDF)'}
                  </span>
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => setChecklistOutFile(e.target.files?.[0] ?? null)} />
                </label>
                {mo.checklist_out_url && !checklistOutFile && (
                  <button type="button" onClick={async () => {
                    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(mo.checklist_out_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }} className="mt-1 text-xs text-blue-600 hover:underline text-left">ดู checklist ที่แนบไว้</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="มิเตอร์ไฟ (ปลาย)"
                  type="number" min={0} step="0.01"
                  value={editForm.electric_meter_end}
                  onChange={ef('electric_meter_end')}
                  placeholder={mo.contracts?.electric_meter_start ? `เริ่ม: ${mo.contracts.electric_meter_start}` : ''}
                />
                <Input
                  label="มิเตอร์น้ำ (ปลาย)"
                  type="number" min={0} step="0.01"
                  value={editForm.water_meter_end}
                  onChange={ef('water_meter_end')}
                  placeholder={mo.contracts?.water_meter_start ? `เริ่ม: ${mo.contracts.water_meter_start}` : ''}
                />
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">คำนวณเงินคืน / หัก</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Read-only: deposit */}
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-gray-700">เงินประกัน (฿)</p>
                    <div className="h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 flex items-center text-sm font-semibold text-gray-800">
                      ฿{deposit.toLocaleString('th-TH')}
                    </div>
                  </div>
                  {/* Read-only: outstanding invoices */}
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-gray-700">ค่าเช่าค้างชำระ (฿)</p>
                    <div className={`h-10 rounded-lg border px-3 flex items-center text-sm font-semibold ${
                      invoiceTotal > 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50 text-gray-800'
                    }`}>
                      {invoiceTotal > 0 ? `-฿${invoiceTotal.toLocaleString('th-TH')}` : '฿0'}
                    </div>
                    {outstandingInvoices.length > 0 && (
                      <p className="text-xs text-red-500">{outstandingInvoices.length} ใบ</p>
                    )}
                  </div>
                  {/* Read-only: pending one-time addons */}
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-gray-700">ค่าบริการเพิ่มเติมค้างชำระ (฿)</p>
                    <div className={`h-10 rounded-lg border px-3 flex items-center text-sm font-semibold ${
                      addonTotal > 0 ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-gray-200 bg-gray-50 text-gray-800'
                    }`}>
                      {addonTotal > 0 ? `-฿${addonTotal.toLocaleString('th-TH')}` : '฿0'}
                    </div>
                    {pendingAddons.length > 0 && (
                      <div className="text-xs text-orange-600 space-y-0.5">
                        {pendingAddons.map(a => (
                          <p key={a.id}>{a.name} — ฿{Number(a.amount).toLocaleString('th-TH')}</p>
                        ))}
                        <p className="text-gray-400">* จะถูกรวมในยอดหักและยกเลิกรายการ</p>
                      </div>
                    )}
                  </div>
                  <Input label="ค่าซ่อมแซม (฿)"  type="number" min={0} value={editForm.repair_cost}     onChange={ef('repair_cost')} />
                  <Input label="ค่าปรับ (฿)"      type="number" min={0} value={editForm.penalty_cost}    onChange={ef('penalty_cost')} />
                  <Input label="หักอื่นๆ (฿)"     type="number" min={0} value={editForm.other_deduction} onChange={ef('other_deduction')} />
                  <Input
                    label="ค่าเช่าจนถึงวันย้ายออก (฿)"
                    type="number" min={0} step="0.01"
                    value={editForm.rent_to_move_out}
                    onChange={ef('rent_to_move_out')}
                    hint="ค่าเช่าส่วนที่ยังค้างจากรอบล่าสุดถึงวันออก"
                  />
                </div>
                <div className="mt-3 border-t border-gray-100 pt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500">รวมหัก: ฿{(outstanding+repair+penalty+other+rentToMoveOut).toLocaleString('th-TH')}</span>
                  {refundAmt > 0 && <span className="font-bold text-green-600">คืนผู้เช่า ฿{refundAmt.toLocaleString('th-TH')}</span>}
                  {chargeAmt > 0 && <span className="font-bold text-red-600">ผู้เช่าต้องจ่ายเพิ่ม ฿{chargeAmt.toLocaleString('th-TH')}</span>}
                  {refundAmt === 0 && chargeAmt === 0 && <span className="text-gray-500">ยอดสุทธิ ฿0</span>}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">บัญชีรับเงินคืนของผู้เช่า</p>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">ธนาคาร</label>
                    <select
                      value={editForm.bank_name}
                      onChange={ef('bank_name')}
                      className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- เลือกธนาคาร --</option>
                      {THAI_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <Input label="เลขบัญชี" value={editForm.bank_account_number} onChange={ef('bank_account_number')} placeholder="xxx-x-xxxxx-x" />
                  <Input label="ชื่อบัญชี" value={editForm.bank_account_name} onChange={ef('bank_account_name')} />
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">สมุดบัญชี (หน้าแรก)</label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
                      <Upload className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-500 truncate">
                        {bookbankFile ? bookbankFile.name : mo.bookbank_url ? 'มีไฟล์แล้ว (คลิกเพื่อเปลี่ยน)' : 'แนบรูปสมุดบัญชี'}
                      </span>
                      <input type="file" accept="image/*,application/pdf" className="hidden"
                        onChange={e => setBookbankFile(e.target.files?.[0] ?? null)} />
                    </label>
                    {mo.bookbank_url && !bookbankFile && (
                      <button type="button" onClick={async () => {
                        const { data } = await supabase.storage.from('payment-slips').createSignedUrl(mo.bookbank_url, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }} className="text-xs text-blue-600 hover:underline text-left">ดูสมุดบัญชีที่แนบไว้</button>
                    )}
                  </div>
                </div>
              </div>
              {editErr && <p className="text-sm text-red-600">{editErr}</p>}
            </form>
          )
        })()}
      </Modal>

      {/* Accounting Confirm Modal */}
      <Modal
        open={confirmSlipModal}
        onClose={() => setConfirmSlipModal(false)}
        title={settlement?.status === 'paid_by_staff' ? 'ยืนยันรับชำระจากผู้เช่า' : 'บันทึกการโอนเงินคืน'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSlipModal(false)}>ปิด</Button>
            <Button form="confirm-slip-form" type="submit" loading={confirmSlipLoading}>ยืนยัน</Button>
          </>
        }
      >
        <form id="confirm-slip-form" onSubmit={handleConfirmWithSlip} className="flex flex-col gap-4">
          {/* Simple confirmation for paid_by_staff (staff already collected) */}
          {settlement?.status === 'paid_by_staff' ? (
            <>
              <div className="rounded-lg bg-green-50 px-4 py-3">
                <p className="text-xs text-green-600">ยอดรับชำระ</p>
                <p className="text-xl font-bold text-green-700">฿{Number(settlement.amount).toLocaleString('th-TH')}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <p className="font-medium text-gray-800 mb-1">Staff บันทึกรับชำระแล้ว</p>
                {settlement.bank_name && <p>ธนาคาร: {settlement.bank_name}</p>}
                {settlement.bank_reference && <p>เลขอ้างอิง: {settlement.bank_reference}</p>}
                {settlement.note && <p className="text-xs text-gray-400 mt-1">{settlement.note}</p>}
                {settlement.slip_url && (
                  <button type="button" onClick={async () => {
                    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(settlement.slip_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }} className="mt-2 text-xs text-blue-600 hover:underline">ดูสลิปของ staff</button>
                )}
              </div>
              <p className="text-sm text-gray-500">กดยืนยันเพื่อปิดรายการและบันทึกว่าตรวจสอบยอดเงินเรียบร้อยแล้ว</p>
              <Textarea label="หมายเหตุ (ไม่บังคับ)" rows={2} value={confirmNote} onChange={e => setConfirmNote(e.target.value)} />
            </>
          ) : (
            /* Full form for refund_to_tenant: accounting transfers money */
            <>
              {settlement && Number(settlement.amount) > 0 && (
                <div className="rounded-lg bg-blue-50 px-4 py-3">
                  <p className="text-xs text-blue-600">ยอดโอนคืน</p>
                  <p className="text-xl font-bold text-blue-700">฿{Number(settlement.amount).toLocaleString('th-TH')}</p>
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                <p className="mb-1.5 text-xs font-semibold text-gray-500">บัญชีที่โอนให้ผู้เช่า</p>
                {mo.tenants?.bank_name || mo.tenants?.bank_account_number ? (
                  <div className="space-y-0.5">
                    {mo.tenants.bank_name && <p className="font-medium text-gray-800">{mo.tenants.bank_name}</p>}
                    {mo.tenants.bank_account_number && <p className="text-gray-700">{mo.tenants.bank_account_number}</p>}
                    {mo.tenants.bank_account_name && <p className="text-xs text-gray-500">{mo.tenants.bank_account_name}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">ไม่มีข้อมูลบัญชีธนาคารของผู้เช่า — staff ต้องกรอกในหน้ากรอกข้อมูล</p>
                )}
                {mo.bookbank_url && (
                  <button type="button" onClick={async () => {
                    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(mo.bookbank_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }} className="mt-2 text-xs text-blue-600 hover:underline">ดูสมุดบัญชีผู้เช่า</button>
                )}
              </div>
              <Input
                label={SLIP_REFERENCE_LABEL}
                value={confirmBankRef}
                onChange={e => setConfirmBankRef(normalizeSlipReference(e.target.value))}
                inputMode="numeric"
                maxLength={4}
                placeholder={SLIP_REFERENCE_PLACEHOLDER}
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">
                  แนบสลิปการโอน{Number(settlement?.amount) > 0 && <span className="text-red-500"> *</span>}
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
                  <Upload className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">{confirmSlipFile ? confirmSlipFile.name : 'เลือกไฟล์'}</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => setConfirmSlipFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <Textarea label="หมายเหตุ" rows={2} value={confirmNote} onChange={e => setConfirmNote(e.target.value)} />
            </>
          )}
          {confirmSlipErr && <p className="text-sm text-red-600">{confirmSlipErr}</p>}
        </form>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="ยกเลิกรายการย้ายออก"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelModal(false)}>ปิด</Button>
            <Button variant="danger" loading={cancelling} onClick={handleCancel}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          ต้องการยกเลิกรายการ <strong>{mo?.move_out_number}</strong> ใช่หรือไม่?
        </p>
        <p className="text-sm text-gray-500 mt-1">
          รายการจะถูกลบถาวร และสถานะห้องจะกลับเป็น <strong>มีผู้เช่า</strong> เหมือนเดิม
        </p>
        {cancelErr && <p className="mt-3 text-sm text-red-600">{cancelErr}</p>}
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={rejectModal}
        onClose={() => setRejectModal(false)}
        title="ไม่อนุมัติรายการย้ายออก"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectModal(false)}>ยกเลิก</Button>
            <Button variant="danger" form="reject-form" type="submit" loading={rejecting}>ยืนยันไม่อนุมัติ</Button>
          </>
        }
      >
        <form id="reject-form" onSubmit={handleReject} className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">รายการจะถูกส่งกลับให้ staff แก้ไขและส่งใหม่</p>
          <Textarea label="เหตุผลที่ไม่อนุมัติ" rows={3} value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
          {rejectErr && <p className="text-sm text-red-600">{rejectErr}</p>}
        </form>
      </Modal>

      {/* Early-termination approve confirmation Modal */}
      <Modal
        open={approveConfirmModal}
        onClose={() => setApproveConfirmModal(false)}
        title="ยืนยันการอนุมัติ — ออกก่อนกำหนด"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveConfirmModal(false)}>ยกเลิก</Button>
            <Button variant="danger" loading={approving} onClick={() => { setApproveConfirmModal(false); handleApprove() }}>
              รับทราบและอนุมัติ
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-red-800">
            <p className="font-bold mb-1">ผู้เช่าออกก่อนกำหนดสัญญา</p>
            <p>โดยทั่วไปผู้เช่าที่ออกก่อนกำหนด <strong>จะไม่ได้รับเงินประกันคืน</strong></p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">เงินประกัน</span>
              <span className="font-semibold">฿{Number(mo.deposit_amount).toLocaleString('th-TH')}</span>
            </div>
            {Number(mo.outstanding_invoice_total) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ค่าเช่าค้างชำระ</span>
                <span>-฿{Number(mo.outstanding_invoice_total).toLocaleString('th-TH')}</span>
              </div>
            )}
            {Number(mo.repair_cost) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ค่าซ่อมแซม</span>
                <span>-฿{Number(mo.repair_cost).toLocaleString('th-TH')}</span>
              </div>
            )}
            {Number(mo.penalty_cost) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ค่าปรับ</span>
                <span>-฿{Number(mo.penalty_cost).toLocaleString('th-TH')}</span>
              </div>
            )}
            {Number(mo.other_deduction) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>หักอื่นๆ</span>
                <span>-฿{Number(mo.other_deduction).toLocaleString('th-TH')}</span>
              </div>
            )}
            {Number(mo.rent_to_move_out) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ค่าเช่าจนถึงวันย้ายออก</span>
                <span>-฿{Number(mo.rent_to_move_out).toLocaleString('th-TH')}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold">
              {mo.refund_amount > 0 && (
                <><span className="text-green-700">คืนผู้เช่า</span><span className="text-green-700">฿{Number(mo.refund_amount).toLocaleString('th-TH')}</span></>
              )}
              {mo.additional_charge > 0 && (
                <><span className="text-red-700">ผู้เช่าต้องจ่ายเพิ่ม</span><span className="text-red-700">฿{Number(mo.additional_charge).toLocaleString('th-TH')}</span></>
              )}
              {!mo.refund_amount && !mo.additional_charge && (
                <><span className="text-gray-500">ยอดสุทธิ</span><span className="text-gray-500">฿0</span></>
              )}
            </div>
          </div>
          <p className="text-gray-500">กรุณาตรวจสอบให้แน่ใจว่ายอดเงินถูกต้องแล้วก่อนกด <strong>รับทราบและอนุมัติ</strong></p>
          {approveErr && <p className="text-red-600">{approveErr}</p>}
        </div>
      </Modal>

      {/* Pay slip Modal */}
      <Modal
        open={payModal}
        onClose={() => setPayModal(false)}
        title="บันทึกรับชำระจากผู้เช่า"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModal(false)}>ปิด</Button>
            <Button form="pay-slip-form" type="submit" loading={paying}>บันทึก</Button>
          </>
        }
      >
        <form id="pay-slip-form" onSubmit={handlePay} className="flex flex-col gap-4">
          {settlement && (
            <div className="rounded-lg bg-blue-50 px-4 py-3">
              <p className="text-xs text-blue-600">ยอดรับชำระจากผู้เช่า</p>
              <p className="text-xl font-bold text-blue-700">฿{Number(settlement.amount).toLocaleString('th-TH')}</p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">ธนาคาร</label>
            <select
              value={payBankName}
              onChange={e => setPayBankName(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- เลือกธนาคาร --</option>
              {THAI_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <Input
            label={SLIP_REFERENCE_LABEL}
            value={bankRef}
            onChange={e => setBankRef(normalizeSlipReference(e.target.value))}
            inputMode="numeric"
            maxLength={4}
            placeholder={SLIP_REFERENCE_PLACEHOLDER}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              แนบสลิป <span className="text-red-500">*</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
              <Upload className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">{slipFile ? slipFile.name : 'เลือกไฟล์'}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => setSlipFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Textarea label="หมายเหตุ" rows={2} value={payNote}
            onChange={e => setPayNote(e.target.value)} />
          {payErr && <p className="text-sm text-red-600">{payErr}</p>}
        </form>
      </Modal>
    </div>
  )
}
