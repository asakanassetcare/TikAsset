import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ChevronRight, CheckCircle, XCircle, LogIn, Upload, UserCog, LogOut, Wallet, CreditCard } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import DocumentUpload from '../../components/shared/DocumentUpload'
import MoveOutFormModal from '../../components/move-outs/MoveOutFormModal'
import { PageSpinner } from '../../components/ui/Spinner'
import PdfDownloadButton from '../../components/pdf/PdfDownloadButton'
import AdvancePaymentReceiptPDF from '../../components/pdf/AdvancePaymentReceiptPDF'
import RentAdvancePDF from '../../components/pdf/RentAdvancePDF'
import ReceiptPDF from '../../components/pdf/ReceiptPDF'
import { formatThaiDate, formatThaiDateTime } from '../../lib/date'
import { useSettings } from '../../hooks/useSettings'
import { THAI_BANKS } from '../../lib/banks'
import { SLIP_REFERENCE_LABEL, SLIP_REFERENCE_PLACEHOLDER, normalizeSlipReference } from '../../lib/slipReference'

const TABS = [
  { id: 'info',      label: 'ข้อมูล' },
  { id: 'invoices',  label: 'ใบแจ้งหนี้' },
  { id: 'receipts',  label: 'ใบเสร็จ' },
  { id: 'documents', label: 'เอกสาร' },
]

function localDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export default function ContractDetailPage() {
  const { contractId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, role } = useAuth()

  const [contract,       setContract]       = useState(null)
  const [invoices,       setInvoices]       = useState([])
  const [receipts,       setReceipts]       = useState([])
  const [rcptTypeFilter, setRcptTypeFilter] = useState('all')
  const [rcptYearFilter, setRcptYearFilter] = useState('all')
  const [initialInvoice,  setInitialInvoice]  = useState(null)
  const [prorateInvoice,  setProrateInvoice]  = useState(null)
  const [staffList,      setStaffList]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState(() => {
    const t = searchParams.get('tab')
    return ['info','invoices','receipts','documents'].includes(t) ? t : 'info'
  })

  // Approve
  const [approving,  setApproving]  = useState(false)
  const [approveErr, setApproveErr] = useState('')

  // Reject modal
  const [rejectModal,  setRejectModal]  = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting,    setRejecting]    = useState(false)
  const [rejectErr,    setRejectErr]    = useState('')

  // Cancel approved contract that cannot move in
  const [cancelContractModal,  setCancelContractModal]  = useState(false)
  const [cancelContractReason, setCancelContractReason] = useState('')
  const [cancelContracting,    setCancelContracting]    = useState(false)
  const [cancelContractErr,    setCancelContractErr]    = useState('')

  // Regenerate move-in invoices
  const [regenModal,  setRegenModal]  = useState(false)
  const [regenForm,   setRegenForm]   = useState({
    contract_start_date: '',
    move_in_date: '',
    monthly_rent: '',
    deposit_amount: '',
    advance_rent_amount: '',
    booking_deposit_applied: '',
    note: '',
  })
  const [regenerating, setRegenerating] = useState(false)
  const [regenErr,     setRegenErr]     = useState('')

  // Move-in
  const [moveInModal,           setMoveInModal]           = useState(false)
  const [checklistInFile,       setChecklistInFile]       = useState(null)
  const [movingIn,              setMovingIn]              = useState(false)
  const [moveInErr,             setMoveInErr]             = useState('')
  const [checklistInReplaceFile, setChecklistInReplaceFile] = useState(null)
  const [checklistInReplacing,   setChecklistInReplacing]   = useState(false)

  // Reassign staff modal
  const [staffModal,      setStaffModal]      = useState(false)
  const [newStaffId,      setNewStaffId]      = useState('')
  const [reassigning,     setReassigning]     = useState(false)
  const [reassignErr,     setReassignErr]     = useState('')

  // Move-out modal
  const [moveOutModal, setMoveOutModal] = useState(false)
  const [existingMoveOut, setExistingMoveOut] = useState(null)

  // Document status
  const [docStatus, setDocStatus] = useState({ idCard: false, contract: false })

  // Advance payment (contract signing, before approval)
  const [advancePayments,  setAdvancePayments]  = useState([])
  const [moveInPendingPayments, setMoveInPendingPayments] = useState([])
  const [advanceModal,     setAdvanceModal]     = useState(false)
  const [advanceAmount,    setAdvanceAmount]    = useState('')
  const [advanceSlipFile,  setAdvanceSlipFile]  = useState(null)
  const [advanceNote,      setAdvanceNote]      = useState('')
  const [advanceSaving,    setAdvanceSaving]    = useState(false)
  const [advanceErr,       setAdvanceErr]       = useState('')

  // Rent advance (prepaid future months, for active contracts)
  const [rentAdvances,     setRentAdvances]     = useState([])
  const [raModal,          setRaModal]          = useState(false)
  const [raMonths,         setRaMonths]         = useState(1)
  const [raSlipFile,       setRaSlipFile]       = useState(null)
  const [raBankName,       setRaBankName]       = useState('')
  const [raBankRef,        setRaBankRef]        = useState('')
  const [raNote,           setRaNote]           = useState('')
  const [raSaving,         setRaSaving]         = useState(false)
  const [raErr,            setRaErr]            = useState('')
  const [raSaved,          setRaSaved]          = useState(null) // last saved advance for print
  const [managerApprovingRentAdvanceId, setManagerApprovingRentAdvanceId] = useState(null)

  useEffect(() => { fetchContract() }, [contractId])
  useEffect(() => { if (tab === 'invoices') fetchInvoices() }, [tab])
  useEffect(() => { if (tab === 'receipts') fetchReceipts() }, [tab])

  async function fetchContract() {
    const [{ data }, { data: initInvRows }, { data: prorateInvRows }] = await Promise.all([
      supabase.from('contracts').select(`
        *,
        rooms(id, room_number, title_deed_number, floor, ownership, base_rent, base_deposit, base_advance, buildings(id, name, project_id, projects(name))),
        tenants(id, full_name, phone, email, line_user_id),
        profiles!assigned_staff_id(id, full_name)
      `).eq('id', contractId).single(),
      supabase.from('invoices')
        .select('id, invoice_number, status, total_amount, due_date')
        .eq('contract_id', contractId)
        .eq('invoice_type', 'contract_initial')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('invoices')
        .select('id, invoice_number, status, total_amount, due_date, billing_period')
        .eq('contract_id', contractId)
        .eq('invoice_type', 'monthly_rent')
        .order('created_at', { ascending: false })
        .limit(5),
    ])
    if (!data) { navigate('/contracts'); return }
    const pickActiveInvoice = rows => (rows ?? []).find(inv => !['cancelled', 'rejected'].includes(inv.status)) ?? null
    const moveInInvoiceIds = [
      ...(initInvRows ?? []),
      ...(prorateInvRows ?? []),
    ].map(inv => inv.id).filter(Boolean)
    setContract(data)
    setInitialInvoice(pickActiveInvoice(initInvRows))
    setProrateInvoice(pickActiveInvoice(prorateInvRows))
    if (moveInInvoiceIds.length > 0) {
      const { data: pendingMoveInPmts } = await supabase
        .from('payments')
        .select('id, invoice_id, invoices(invoice_number)')
        .in('invoice_id', moveInInvoiceIds)
        .eq('status', 'pending_approve')
      setMoveInPendingPayments(pendingMoveInPmts ?? [])
    } else {
      setMoveInPendingPayments([])
    }

    const tenantId = data.tenants?.id
    const [{ data: tenantDocs }, { data: contractDocs }] = await Promise.all([
      tenantId
        ? supabase.from('documents').select('id').eq('ref_table', 'tenants').eq('ref_id', tenantId).in('doc_type', ['id_card_front', 'id_card_back']).limit(1)
        : Promise.resolve({ data: [] }),
      supabase.from('documents').select('id').eq('ref_table', 'contracts').eq('ref_id', contractId).eq('doc_type', 'contract_pdf').limit(1),
    ])
    setDocStatus({ idCard: (tenantDocs?.length ?? 0) > 0, contract: (contractDocs?.length ?? 0) > 0 })

    // Advance payments (before-approval)
    const { data: advData } = await supabase
      .from('contract_advance_payments')
      .select('id, amount, slip_url, note, created_at, created_by')
      .eq('contract_id', contractId)
      .order('created_at')
    setAdvancePayments(advData ?? [])

    // Rent advance payments (active contracts)
    const { data: raData } = await supabase
      .from('rent_advance_payments')
      .select('id, advance_number, months_count, monthly_rent_snapshot, paid_amount, remaining_amount, bank_name, bank_reference, slip_url, note, status, created_at, head_approved_at, head_rejected_at')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
    setRentAdvances(raData ?? [])

    const todayStr = localDateString()
    const { data: moveOuts } = await supabase
      .from('move_outs')
      .select('id, move_out_number, move_out_date, status')
      .eq('contract_id', contractId)
      .in('status', ['draft', 'pending_accounting', 'approved', 'settled'])
      .order('created_at', { ascending: false })
    const activeMoveOut = (moveOuts ?? []).find(mo => mo.status !== 'settled' || mo.move_out_date > todayStr)
    setExistingMoveOut(activeMoveOut ?? null)

    setLoading(false)
  }

  function calcProrate(startDate, monthlyRent) {
    if (!startDate || !monthlyRent) return 0
    const [year, month, day] = startDate.split('-').map(Number)
    if (day === 1) return 0
    const daysInMonth = new Date(year, month, 0).getDate()
    return Math.ceil((daysInMonth - day + 1) / 30 * Number(monthlyRent))
  }

  async function fetchInvoices() {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, billing_period, total_amount, status, due_date, issue_date')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
    setInvoices(data ?? [])
  }

  async function fetchReceipts() {
    const { data: invIds } = await supabase
      .from('invoices').select('id').eq('contract_id', contractId)
    const ids = invIds?.map(i => i.id) ?? []
    if (!ids.length) { setReceipts([]); return }
    const { data } = await supabase
      .from('payments')
      .select(`
        id, amount, paid_date, bank_name, bank_reference, note, approved_at,
        penalty_amount, penalty_days,
        invoices(
          id, invoice_number, invoice_type, billing_period, total_amount,
          rooms(room_number, title_deed_number, buildings(name)),
          tenants(full_name, phone)
        )
      `)
      .in('invoice_id', ids)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
    setReceipts(data ?? [])
  }

  async function fetchStaffList() {
    const { data } = await supabase.from('profiles').select('id, full_name')
      .in('role', ['super_admin', 'head_staff', 'staff']).order('full_name')
    setStaffList(data?.map(s => ({ value: s.id, label: s.full_name })) ?? [])
  }

  async function handleApprove() {
    setApproving(true); setApproveErr('')
    const { error } = await supabase.rpc('approve_contract', { p_contract_id: contractId })
    setApproving(false)
    if (error) { setApproveErr(error.message); return }
    fetchContract()
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setRejectErr('กรุณากรอกเหตุผล'); return }
    setRejecting(true)
    const { error } = await supabase.from('contracts').update({
      status: 'rejected', rejected_at: new Date().toISOString(),
      rejected_by: profile.id, rejection_reason: rejectReason.trim(),
    }).eq('id', contractId)
    setRejecting(false)
    if (error) { setRejectErr(error.message); return }
    setRejectModal(false)
    fetchContract()
  }

  async function handleCancelContract() {
    if (!cancelContractReason.trim()) {
      setCancelContractErr('กรุณากรอกเหตุผลการยกเลิก')
      return
    }
    setCancelContracting(true)
    const { error } = await supabase.rpc('cancel_contract', {
      p_contract_id: contractId,
      p_reason: cancelContractReason.trim(),
    })
    setCancelContracting(false)
    if (error) { setCancelContractErr(error.message); return }
    setCancelContractModal(false)
    setCancelContractReason('')
    fetchContract()
  }

  function openRegenerateModal() {
    if (moveInPendingPayments.length > 0) {
      setMoveInErr('ยังแก้ไขและส่งใหม่ไม่ได้ เพราะมีรายการชำระเงินรอบัญชีอนุมัติ ต้องให้บัญชีอนุมัติหรือปฏิเสธก่อน')
      return
    }
    setRegenForm({
      contract_start_date: c.contract_start_date ?? '',
      move_in_date: c.move_in_date ?? '',
      monthly_rent: String(c.monthly_rent ?? ''),
      deposit_amount: String(c.deposit_amount ?? ''),
      advance_rent_amount: String(c.advance_rent_amount ?? ''),
      booking_deposit_applied: String(c.booking_deposit_applied ?? 0),
      note: '',
    })
    setRegenErr('')
    setRegenModal(true)
  }

  async function handleRegenerateInvoices() {
    const monthlyRent = Number(regenForm.monthly_rent)
    const deposit = Number(regenForm.deposit_amount)
    const advance = Number(regenForm.advance_rent_amount)
    const bookingApplied = Number(regenForm.booking_deposit_applied || 0)
    if (!regenForm.contract_start_date) { setRegenErr('กรุณากรอกวันเริ่มสัญญา'); return }
    if (!regenForm.move_in_date) { setRegenErr('กรุณากรอกวันกำหนดเข้าพัก'); return }
    if (!monthlyRent || monthlyRent <= 0) { setRegenErr('กรุณากรอกค่าเช่า'); return }
    if (deposit < 0 || advance < 0 || bookingApplied < 0) { setRegenErr('ยอดเงินต้องไม่ติดลบ'); return }
    if (moveInPendingPayments.length > 0) {
      setRegenErr('ยังมีรายการชำระเงินรอบัญชีอนุมัติ ต้องให้บัญชีอนุมัติหรือปฏิเสธก่อน แล้วค่อยแก้ไขและส่งใหม่')
      return
    }

    setRegenerating(true)
    setRegenErr('')
    try {
      const { error } = await supabase.rpc('regenerate_move_in_invoices', {
        p_contract_id: contractId,
        p_contract_start_date: regenForm.contract_start_date,
        p_move_in_date: regenForm.move_in_date,
        p_monthly_rent: monthlyRent,
        p_deposit_amount: deposit,
        p_advance_rent_amount: advance,
        p_booking_deposit_applied: bookingApplied,
        p_note: regenForm.note.trim() || null,
      })
      if (error) throw error

      setRegenerating(false)
      setRegenModal(false)
      fetchContract()
      if (tab === 'invoices') fetchInvoices()
    } catch (err) {
      setRegenerating(false)
      setRegenErr(err.message ?? 'แก้ไขและส่งใหม่ไม่สำเร็จ')
    }
  }

  async function handleMoveIn() {
    if (blockMoveIn) {
      setMoveInErr('ยังไม่สามารถเข้าพักได้: ต้องชำระ invoice แรกเข้าให้ครบและบัญชีอนุมัติก่อน')
      return
    }

    setMovingIn(true); setMoveInErr('')

    let checklistUrl = null
    if (checklistInFile) {
      const ext  = checklistInFile.name.split('.').pop()
      const path = `checklists/in/${contractId}_${Date.now()}.${ext}`
      const { data: cd, error: ce } = await supabase.storage.from('payment-slips').upload(path, checklistInFile)
      if (ce) { setMovingIn(false); setMoveInErr('อัปโหลด checklist ไม่สำเร็จ'); return }
      checklistUrl = cd.path
    }

    const { error } = await supabase.from('contracts').update({
      actual_move_in_at: new Date().toISOString(),
      ...(checklistUrl ? { checklist_in_url: checklistUrl } : {}),
    }).eq('id', contractId)
    if (error) { setMovingIn(false); setMoveInErr(error.message); return }
    // safety net: prorate should already exist from approval; this is a no-op if so
    await supabase.rpc('generate_prorated_first_invoice', { p_contract_id: contractId })
    setMovingIn(false)
    setMoveInModal(false)
    fetchContract()
  }

  async function handleReplaceChecklistIn() {
    if (!checklistInReplaceFile) return
    setChecklistInReplacing(true)
    const ext  = checklistInReplaceFile.name.split('.').pop()
    const path = `checklists/in/${contractId}_${Date.now()}.${ext}`
    const { data: cd, error: ce } = await supabase.storage.from('payment-slips').upload(path, checklistInReplaceFile)
    if (ce) { setChecklistInReplacing(false); return }
    const { error } = await supabase.from('contracts').update({ checklist_in_url: cd.path }).eq('id', contractId)
    setChecklistInReplacing(false)
    if (!error) { setChecklistInReplaceFile(null); fetchContract() }
  }

  async function handleReassign() {
    if (!newStaffId) { setReassignErr('กรุณาเลือก staff'); return }
    setReassigning(true)
    const { error } = await supabase.from('contracts').update({ assigned_staff_id: newStaffId }).eq('id', contractId)
    setReassigning(false)
    if (error) { setReassignErr(error.message); return }
    setStaffModal(false)
    fetchContract()
  }

  async function handleSaveAdvance(e) {
    e.preventDefault()
    const amt = Number(advanceAmount)
    if (!amt || amt <= 0) { setAdvanceErr('กรุณากรอกจำนวนเงิน'); return }
    const maxAmt = calcMaxAdvance(c)
    if (amt > maxAmt) { setAdvanceErr(`ยอดเกินกว่าที่ต้องชำระ (สูงสุด ฿${maxAmt.toLocaleString('th-TH')})`); return }
    setAdvanceSaving(true); setAdvanceErr('')

    let slipUrl = null
    if (advanceSlipFile) {
      const ext  = advanceSlipFile.name.split('.').pop()
      const path = `advance/${contractId}_${Date.now()}.${ext}`
      const { data: sd, error: se } = await supabase.storage.from('payment-slips').upload(path, advanceSlipFile)
      if (se) { setAdvanceSaving(false); setAdvanceErr('อัปโหลดสลิปไม่สำเร็จ'); return }
      slipUrl = sd.path
    }

    const { error } = await supabase.from('contract_advance_payments').insert({
      contract_id: contractId,
      amount:      amt,
      slip_url:    slipUrl,
      note:        advanceNote.trim() || null,
      created_by:  profile.id,
    })
    setAdvanceSaving(false)
    if (error) { setAdvanceErr(error.message); return }
    setAdvanceModal(false)
    setAdvanceAmount(''); setAdvanceSlipFile(null); setAdvanceNote('')
    fetchContract()
  }

  async function handleSaveRentAdvance(e) {
    e.preventDefault()
    const months = parseInt(raMonths, 10)
    if (!months || months < 1) { setRaErr('กรุณาระบุจำนวนเดือน'); return }
    if (!raBankName) { setRaErr('กรุณาเลือกธนาคาร'); return }
    if (!raSlipFile) { setRaErr('กรุณาแนบสลิปการโอนเงิน'); return }
    setRaSaving(true); setRaErr('')

    const monthlyRent = Number(c.monthly_rent)
    const paidAmount  = monthlyRent * months

    const ext  = raSlipFile.name.split('.').pop()
    const path = `rent-advance/${contractId}_${Date.now()}.${ext}`
    const { data: sd, error: se } = await supabase.storage.from('payment-slips').upload(path, raSlipFile)
    if (se) { setRaSaving(false); setRaErr('อัปโหลดสลิปไม่สำเร็จ'); return }

    const { data: inserted, error } = await supabase.from('rent_advance_payments').insert({
      contract_id:           contractId,
      tenant_id:             c.tenants?.id,
      room_id:               c.rooms?.id,
      months_count:          months,
      monthly_rent_snapshot: monthlyRent,
      paid_amount:           paidAmount,
      slip_url:              sd.path,
      bank_name:             raBankName,
      bank_reference:        normalizeSlipReference(raBankRef) || null,
      note:                  raNote.trim()    || null,
      created_by:            profile.id,
    }).select('id, advance_number, months_count, monthly_rent_snapshot, paid_amount, remaining_amount, bank_name, bank_reference, slip_url, note, status, created_at, head_approved_at, head_rejected_at').single()

    setRaSaving(false)
    if (error) { setRaErr(error.message); return }
    setRaSaved(inserted)
    setRaModal(false)
    setRaMonths(1); setRaSlipFile(null); setRaBankName(''); setRaBankRef(''); setRaNote('')
    fetchContract()
  }

  async function handleManagerApproveRentAdvance(advance) {
    setManagerApprovingRentAdvanceId(advance.id)
    const { data: updated, error } = await supabase.from('rent_advance_payments').update({
      head_approved_by:       profile.id,
      head_approved_at:       new Date().toISOString(),
      head_rejected_by:       null,
      head_rejected_at:       null,
      head_rejection_reason:  null,
    })
      .eq('id', advance.id)
      .is('head_approved_at', null)
      .is('head_rejected_at', null)
      .select('id')
    setManagerApprovingRentAdvanceId(null)
    if (error) {
      alert(error.message)
      return
    }
    if (!updated || updated.length === 0) {
      alert('รายการนี้ถูกอนุมัติหรือปฏิเสธไปแล้ว กรุณารีเฟรช')
    }
    fetchContract()
  }

  function calcMaxAdvance(contract) {
    if (!contract) return 0
    const prorate = calcProrate(contract.contract_start_date, contract.monthly_rent)
    const base = Number(contract.deposit_amount)
                + Number(contract.advance_rent_amount)
                + prorate
                - Number(contract.booking_deposit_applied ?? 0)
    const alreadyPaid = advancePayments.reduce((s, p) => s + Number(p.amount), 0)
    return Math.max(0, base - alreadyPaid)
  }

  const { settings } = useSettings()

  if (loading) return <PageSpinner />

  const c = contract
  const isExecutive    = role === 'executive' || role === 'super_admin'
  const isHeadStaff    = role === 'head_staff' || role === 'super_admin'
  const isOperational  = ['super_admin', 'head_staff', 'staff'].includes(role)

  const initialExpectedAmount = Math.max(
    0,
    Number(c.deposit_amount ?? 0)
      + Number(c.advance_rent_amount ?? 0)
      - Number(c.booking_deposit_applied ?? 0)
  )
  const prorateExpectedAmount = calcProrate(c.contract_start_date, c.monthly_rent)
  const initialInvPaid    = initialExpectedAmount <= 0
    ? (!initialInvoice || initialInvoice.status === 'paid')
    : initialInvoice?.status === 'paid'
  const prorateInvPaid    = prorateExpectedAmount <= 0
    ? (!prorateInvoice || prorateInvoice.status === 'paid')
    : prorateInvoice?.status === 'paid'
  const blockMoveIn       = !initialInvPaid || !prorateInvPaid
  const hasPendingMoveInPayment = moveInPendingPayments.length > 0
  const canResolveMoveInBlock = c.status === 'approved' && isOperational && blockMoveIn
  const moveInBlockInvoices = [
    !initialInvPaid
      ? {
          ...(initialInvoice ?? {}),
          id: initialInvoice?.id ?? 'missing-initial',
          missing: !initialInvoice,
          invoice_number: initialInvoice?.invoice_number ?? 'ยังไม่มีใบแจ้งหนี้',
          total_amount: initialInvoice?.total_amount ?? initialExpectedAmount,
          label: 'ประกัน+ล่วงหน้า',
        }
      : null,
    !prorateInvPaid
      ? {
          ...(prorateInvoice ?? {}),
          id: prorateInvoice?.id ?? 'missing-prorate',
          missing: !prorateInvoice,
          invoice_number: prorateInvoice?.invoice_number ?? 'ยังไม่มีใบแจ้งหนี้',
          total_amount: prorateInvoice?.total_amount ?? prorateExpectedAmount,
          label: 'ค่าเช่า prorated',
        }
      : null,
  ].filter(Boolean)

  const INVOICE_TYPE_LABEL = {
    contract_initial: 'ประกัน+ล่วงหน้า',
    monthly_rent:     'ค่าเช่ารายเดือน',
    addon:            'ค่าบริการเสริม',
    final_settlement: 'เคลียร์ Move-out',
    booking_deposit:  'เงินจอง',
    other:            'อื่นๆ',
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/contracts" className="hover:text-blue-600">สัญญา</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{c.contract_number}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{c.contract_number}</h1>
            <Badge variant={c.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            สร้างเมื่อ {formatThaiDateTime(c.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Approve */}
          {c.status === 'pending_approve' && isExecutive && (
            <>
              <Button icon={<CheckCircle className="h-4 w-4" />} loading={approving} onClick={handleApprove}>อนุมัติ</Button>
              <Button variant="danger" icon={<XCircle className="h-4 w-4" />}
                onClick={() => { setRejectModal(true); setRejectErr('') }}>ปฏิเสธ</Button>
            </>
          )}
          {approveErr && <p className="text-sm text-red-600">{approveErr}</p>}

          {/* Move-in */}
          {c.status === 'approved' && isOperational && (
            <>
              <Button
                icon={<LogIn className="h-4 w-4" />}
                disabled={blockMoveIn}
                onClick={() => { setChecklistInFile(null); setMoveInErr(''); setMoveInModal(true) }}
              >
                บันทึกเข้าพัก
              </Button>
              {blockMoveIn && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-red-600">
                  <span>รอชำระ:</span>
                  {moveInBlockInvoices.map(inv => (
                    inv.missing ? (
                      <span key={inv.id} className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                        {inv.invoice_number} {inv.label} ฿{Number(inv.total_amount).toLocaleString('th-TH')}
                      </span>
                    ) : (
                      <Button
                        key={inv.id}
                        size="sm"
                        variant="secondary"
                        icon={<CreditCard className="h-3.5 w-3.5" />}
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                      >
                        {inv.invoice_number} {inv.label} ฿{Number(inv.total_amount).toLocaleString('th-TH')}
                      </Button>
                    )
                  ))}
                  {isHeadStaff && (
                    <>
                      {hasPendingMoveInPayment ? (
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          มีรายการชำระรอบัญชีอยู่
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<CheckCircle className="h-3.5 w-3.5" />}
                          onClick={openRegenerateModal}
                        >
                          แก้ไขและส่งใหม่
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={() => { setCancelContractReason(''); setCancelContractErr(''); setCancelContractModal(true) }}
                      >
                        ยกเลิกสัญญานี้
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {moveInErr && <p className="text-sm text-red-600">{moveInErr}</p>}

          {/* Advance payment — before approval only */}
          {c.status === 'pending_approve' && isOperational && (
            <Button
              variant="secondary"
              icon={<Wallet className="h-4 w-4" />}
              onClick={() => { setAdvanceAmount(''); setAdvanceSlipFile(null); setAdvanceNote(''); setAdvanceErr(''); setAdvanceModal(true) }}
            >
              รับชำระล่วงหน้า
              {advancePayments.length > 0 && (
                <span className="ml-1.5 rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold text-white leading-none">
                  {advancePayments.length}
                </span>
              )}
            </Button>
          )}

          {/* Quotation — available before approval */}
          {['pending_approve', 'approved', 'active'].includes(c.status) && (
            <Button
              variant="secondary"
              onClick={() => window.open(`/contracts/${contractId}/quotation`, '_blank')}
            >
              ใบเสนอราคา
            </Button>
          )}
          {/* PDF */}
          <Button
            variant="secondary"
            onClick={() => window.open(`/contracts/${contractId}/print`, '_blank')}
          >
            พิมพ์สัญญา
          </Button>

          {/* Rent advance (prepay future months) */}
          {c.status === 'active' && isOperational && (
            <Button
              variant="secondary"
              icon={<Wallet className="h-4 w-4" />}
              onClick={() => { setRaMonths(1); setRaSlipFile(null); setRaBankName(''); setRaBankRef(''); setRaNote(''); setRaErr(''); setRaModal(true) }}
            >
              ค่าเช่ารับล่วงหน้า
              {rentAdvances.some(r => r.status === 'active') && (
                <span className="ml-1.5 rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold text-white leading-none">
                  ฿{rentAdvances.filter(r => r.status === 'active').reduce((s, r) => s + Number(r.remaining_amount), 0).toLocaleString('th-TH')}
                </span>
              )}
            </Button>
          )}

          {/* Move-out */}
          {c.status === 'active' && isOperational && (
            existingMoveOut ? (
              <Button variant="secondary" icon={<LogOut className="h-4 w-4" />}
                onClick={() => navigate(`/move-outs/${existingMoveOut.id}`)}>
                ดูรายการย้ายออก {formatThaiDate(existingMoveOut.move_out_date)}
              </Button>
            ) : (
              <Button variant="danger" icon={<LogOut className="h-4 w-4" />}
                onClick={() => setMoveOutModal(true)}>
                ย้ายออก
              </Button>
            )
          )}

          {/* Reassign staff */}
          {c.status === 'active' && isHeadStaff && (
            <Button variant="ghost" size="sm" icon={<UserCog className="h-4 w-4" />}
              onClick={() => { fetchStaffList(); setNewStaffId(c.assigned_staff_id ?? ''); setStaffModal(true); setReassignErr('') }}>
              เปลี่ยน Staff
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'border-b-2 border-blue-600 text-blue-700 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {tab === 'info' && (
        <div className="grid gap-4 lg:grid-cols-2 max-w-4xl">
          {canResolveMoveInBlock && moveInBlockInvoices.length > 0 && (
            <Card className="lg:col-span-2 border-red-100 bg-red-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-red-800">ยังเข้าพักไม่ได้ เพราะ invoice แรกเข้ายังไม่ถูกอนุมัติชำระเงิน</p>
                  <p className="mt-1 text-xs text-red-600">ใบเดิมถูกบัญชีปฏิเสธ/ยกเลิกแล้ว ต้องแก้สัญญาหรือยกเลิก flow นี้ ไม่ควรบันทึกชำระซ้ำบนใบเดิม</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {moveInBlockInvoices.map(inv => (
                    inv.missing ? (
                      <span key={inv.id} className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700">
                        {inv.invoice_number} {inv.label}
                      </span>
                    ) : (
                      <Button
                        key={inv.id}
                        size="sm"
                        variant="secondary"
                        icon={<CreditCard className="h-3.5 w-3.5" />}
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                      >
                        เปิด {inv.invoice_number}
                      </Button>
                    )
                  ))}
                  {isHeadStaff && (
                    <>
                      {hasPendingMoveInPayment ? (
                        <span className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs text-amber-700">
                          มีรายการชำระรอบัญชีอยู่
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<CheckCircle className="h-3.5 w-3.5" />}
                          onClick={openRegenerateModal}
                        >
                          แก้ไขและส่งใหม่
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={() => { setCancelContractReason(''); setCancelContractErr(''); setCancelContractModal(true) }}
                      >
                        ยกเลิกสัญญานี้
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Room */}
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ห้อง</p>
            <p className="text-base font-semibold text-gray-900">
              {c.rooms?.buildings?.name} ห้อง {c.rooms?.room_number}
            </p>
            <p className="text-sm text-gray-500">{c.rooms?.buildings?.projects?.name}</p>
          </Card>

          {/* Tenant */}
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ผู้เช่า</p>
            <p className="text-base font-semibold text-gray-900">{c.tenants?.full_name}</p>
            {c.tenants?.phone && <p className="text-sm text-gray-500">{c.tenants.phone}</p>}
          </Card>

          {/* Dates */}
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">วันที่</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-400">เริ่มสัญญา</p><p className="font-medium">{formatThaiDate(c.contract_start_date)}</p></div>
              <div><p className="text-xs text-gray-400">สิ้นสุดสัญญา</p><p className="font-medium">{formatThaiDate(c.contract_end_date)}</p></div>
              <div><p className="text-xs text-gray-400">กำหนดเข้าพัก</p><p className="font-medium">{formatThaiDate(c.move_in_date)}</p></div>
              {c.actual_move_in_at && <div><p className="text-xs text-gray-400">เข้าพักจริง</p><p className="font-medium">{formatThaiDate(c.actual_move_in_at)}</p></div>}
              {c.checklist_in_url && (
                <div>
                  <p className="text-xs text-gray-400">Checklist เข้าพัก</p>
                  <button
                    onClick={async () => {
                      const { data } = await supabase.storage.from('payment-slips').createSignedUrl(c.checklist_in_url, 3600)
                      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                    }}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    ดูเอกสาร
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* Money */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">การเงิน</p>
              <p className="text-xs text-gray-400">จริง / มาตรฐาน</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MoneyRow label="ค่าเช่า/เดือน" actual={c.monthly_rent} base={c.rooms?.base_rent} bold />
              <MoneyRow label="เงินประกัน"    actual={c.deposit_amount} base={c.rooms?.base_deposit} />
              <MoneyRow label="ล่วงหน้า"      actual={c.advance_rent_amount} base={c.rooms?.base_advance} />
              {c.booking_deposit_applied > 0 && (
                <div><p className="text-xs text-gray-400">หักเงินจอง</p><p className="font-medium text-green-600">-฿{Number(c.booking_deposit_applied).toLocaleString('th-TH')}</p></div>
              )}
              <div><p className="text-xs text-gray-400">ชำระทุกวันที่</p><p className="font-medium">{c.payment_day}</p></div>
            </div>
          </Card>

          {/* Rejection reason */}
          {c.status === 'rejected' && c.rejection_reason && (
            <Card className="lg:col-span-2 border-red-100 bg-red-50">
              <p className="mb-1 text-xs font-semibold text-red-500">เหตุผลที่ปฏิเสธ</p>
              <p className="text-sm text-red-800">{c.rejection_reason}</p>
            </Card>
          )}

          {/* Staff */}
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Staff รับผิดชอบ</p>
            <p className="text-sm font-medium text-gray-900">{c.profiles?.full_name ?? '—'}</p>
          </Card>

          {/* Advance Payments */}
          {(c.status === 'pending_approve' || advancePayments.length > 0) && (
            <Card className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">ชำระล่วงหน้า (ก่อนอนุมัติ)</p>
                {c.status === 'pending_approve' && isOperational && (
                  <button
                    onClick={() => { setAdvanceAmount(''); setAdvanceSlipFile(null); setAdvanceNote(''); setAdvanceErr(''); setAdvanceModal(true) }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + บันทึกรายการ
                  </button>
                )}
              </div>
              {advancePayments.length === 0 ? (
                <p className="text-sm text-gray-400">ยังไม่มีรายการ</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {advancePayments.map((ap, i) => (
                    <div key={ap.id} className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-green-800">฿{Number(ap.amount).toLocaleString('th-TH')}</p>
                        {ap.note && <p className="text-xs text-gray-500">{ap.note}</p>}
                        <p className="text-xs text-gray-400">{formatThaiDateTime(ap.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {ap.slip_url && (
                          <button
                            onClick={async () => {
                              const { data } = await supabase.storage.from('payment-slips').createSignedUrl(ap.slip_url, 3600)
                              if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            ดูสลิป
                          </button>
                        )}
                        <PdfDownloadButton
                          document={<AdvancePaymentReceiptPDF advancePayment={ap} contract={c} company={settings?.company ?? {}} />}
                          filename={`advance_${c.contract_number}_${i + 1}.pdf`}
                          label="พิมพ์ใบรับเงิน"
                          size="sm"
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end border-t border-gray-100 pt-2">
                    <p className="text-sm font-semibold text-gray-700">
                      รวม ฿{advancePayments.reduce((s, p) => s + Number(p.amount), 0).toLocaleString('th-TH')}
                    </p>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Rent Advance Payments */}
          {(c.status === 'active' && (rentAdvances.length > 0 || isOperational)) && (
            <Card className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">ค่าเช่ารับล่วงหน้า</p>
                  {rentAdvances.some(r => r.status === 'active') && (
                    <p className="mt-0.5 text-sm font-semibold text-green-700">
                      คงเหลือ ฿{rentAdvances.filter(r => r.status === 'active').reduce((s, r) => s + Number(r.remaining_amount), 0).toLocaleString('th-TH')}
                    </p>
                  )}
                </div>
                {isOperational && (
                  <button
                    onClick={() => { setRaMonths(1); setRaSlipFile(null); setRaBankName(''); setRaBankRef(''); setRaNote(''); setRaErr(''); setRaModal(true) }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + บันทึกรายการ
                  </button>
                )}
              </div>
              {rentAdvances.length === 0 ? (
                <p className="text-sm text-gray-400">ยังไม่มีรายการค่าเช่ารับล่วงหน้า</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {rentAdvances.map((ra) => (
                    <div key={ra.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${ra.status === 'active' ? 'bg-green-50' : 'bg-gray-50'}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{ra.advance_number}</p>
                          {ra.status === 'fully_used' && (
                            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500">ใช้หมดแล้ว</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {ra.months_count} เดือน × ฿{Number(ra.monthly_rent_snapshot).toLocaleString('th-TH')}
                          {' = '}฿{Number(ra.paid_amount).toLocaleString('th-TH')}
                        </p>
                        {ra.status === 'active' && (
                          <p className="text-xs text-green-700 font-medium">คงเหลือ ฿{Number(ra.remaining_amount).toLocaleString('th-TH')}</p>
                        )}
                        <p className="text-xs text-gray-400">{formatThaiDate(ra.created_at)}{ra.bank_name ? ` · ${ra.bank_name}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {ra.slip_url && (
                          <button
                            onClick={async () => {
                              const { data } = await supabase.storage.from('payment-slips').createSignedUrl(ra.slip_url, 3600)
                              if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            ดูสลิป
                          </button>
                        )}
                        {isHeadStaff && !ra.head_approved_at && !ra.head_rejected_at && (
                          <Button
                            size="sm"
                            icon={<CheckCircle className="h-3.5 w-3.5" />}
                            loading={managerApprovingRentAdvanceId === ra.id}
                            onClick={() => handleManagerApproveRentAdvance(ra)}
                          >
                            Manager approve
                          </Button>
                        )}
                        <PdfDownloadButton
                          document={<RentAdvancePDF advance={ra} contract={c} company={settings?.company ?? {}} />}
                          filename={`${ra.advance_number}.pdf`}
                          label="พิมพ์ใบรับเงิน"
                          size="sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Last-saved rent advance: quick print */}
          {raSaved && (
            <Card className="lg:col-span-2 border-green-200 bg-green-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-green-800">บันทึกค่าเช่ารับล่วงหน้าสำเร็จ — {raSaved.advance_number}</p>
                  <p className="text-xs text-green-600">฿{Number(raSaved.paid_amount).toLocaleString('th-TH')} · {raSaved.months_count} เดือน</p>
                </div>
                <div className="flex gap-2">
                  <PdfDownloadButton
                    document={<RentAdvancePDF advance={raSaved} contract={c} company={settings?.company ?? {}} />}
                    filename={`${raSaved.advance_number}.pdf`}
                    label="พิมพ์ใบรับเงิน"
                  />
                  <button onClick={() => setRaSaved(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                </div>
              </div>
            </Card>
          )}

          {/* Document Status */}
          <Card className="lg:col-span-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">สถานะเอกสาร</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'บัตรประชาชน',       ok: docStatus.idCard },
                { label: 'สัญญาเช่า',         ok: docStatus.contract },
                { label: 'Checklist ตอนเข้า', ok: !!c.checklist_in_url },
                { label: 'LINE',              ok: !!c.tenants?.line_user_id },
              ].map(({ label, ok }) => (
                <div key={label} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-600'}`}>
                    {ok ? '✓' : '✗'}
                  </span>
                  <span className={`text-sm font-medium ${ok ? 'text-green-800' : 'text-red-700'}`}>{label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Invoices */}
      {tab === 'invoices' && (
        <div className="max-w-3xl">
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีใบแจ้งหนี้</p>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              {invoices.map((inv, i) => (
                <div key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{inv.invoice_number}</p>
                    <p className="text-xs text-gray-400">
                      {INVOICE_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}
                      {inv.billing_period ? ` · ${inv.billing_period}` : ''}
                      {' · ครบ '}{formatThaiDate(inv.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">฿{Number(inv.total_amount).toLocaleString('th-TH')}</span>
                    <Badge variant={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Receipts */}
      {tab === 'receipts' && (() => {
        const years = [...new Set(receipts.map(p => p.paid_date?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a)
        const types = [...new Set(receipts.map(p => p.invoices?.invoice_type).filter(Boolean))]
        const filtered = receipts.filter(p =>
          (rcptYearFilter === 'all' || p.paid_date?.startsWith(rcptYearFilter)) &&
          (rcptTypeFilter === 'all' || p.invoices?.invoice_type === rcptTypeFilter)
        )
        return (
          <div className="max-w-3xl space-y-3">
            {receipts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {years.length > 1 && (
                  <div className="flex gap-1">
                    {['all', ...years].map(y => (
                      <button key={y}
                        onClick={() => setRcptYearFilter(y)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${rcptYearFilter === y ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {y === 'all' ? 'ทุกปี' : `${Number(y) + 543}`}
                      </button>
                    ))}
                  </div>
                )}
                {types.length > 1 && (
                  <div className="flex gap-1">
                    {['all', ...types].map(t => (
                      <button key={t}
                        onClick={() => setRcptTypeFilter(t)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${rcptTypeFilter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {t === 'all' ? 'ทุกประเภท' : (INVOICE_TYPE_LABEL[t] ?? t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">ไม่มีใบเสร็จในเงื่อนไขที่เลือก</p>
            ) : (
              <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                {filtered.map((pmt, i) => (
                  <div key={pmt.id} className={`flex items-center justify-between px-4 py-3.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{pmt.invoices?.invoice_number ?? '—'}</p>
                      <p className="text-xs text-gray-400">
                        {INVOICE_TYPE_LABEL[pmt.invoices?.invoice_type] ?? pmt.invoices?.invoice_type ?? ''}
                        {pmt.invoices?.billing_period ? ` · ${pmt.invoices.billing_period}` : ''}
                        {pmt.bank_name ? ` · ${pmt.bank_name}` : ''}
                        {pmt.bank_reference ? ` · ${pmt.bank_reference}` : ''}
                      </p>
                      <p className="text-xs text-gray-400">ชำระ {formatThaiDate(pmt.paid_date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">฿{Number(pmt.amount).toLocaleString('th-TH')}</span>
                      <PdfDownloadButton
                        document={<ReceiptPDF payment={pmt} invoice={pmt.invoices} company={settings?.company ?? {}} />}
                        filename={`receipt_${pmt.invoices?.invoice_number ?? pmt.id}.pdf`}
                        label="ดาวน์โหลด"
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Tab: Documents */}
      {tab === 'documents' && (
        <div className="max-w-2xl space-y-4">
          {/* Checklist เข้าพัก */}
          <Card>
            <p className="mb-3 text-sm font-semibold text-gray-700">Checklist ตรวจห้อง (ตอนเข้า)</p>
            {c.checklist_in_url && (
              <div className="mb-3 flex items-center gap-3">
                <button
                  onClick={async () => {
                    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(c.checklist_in_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >ดูเอกสาร</button>
                <span className="text-xs text-gray-400">แนบแล้ว</span>
              </div>
            )}
            {!c.checklist_in_url && !isHeadStaff && (
              <p className="text-sm text-gray-400">ยังไม่มี checklist</p>
            )}
            {isHeadStaff && (
              <>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
                  <Upload className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-500 truncate">
                    {checklistInReplaceFile ? checklistInReplaceFile.name : c.checklist_in_url ? 'เปลี่ยนไฟล์ checklist' : 'แนบ checklist ที่ผู้เช่าเซ็นแล้ว (รูปหรือ PDF)'}
                  </span>
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => setChecklistInReplaceFile(e.target.files?.[0] ?? null)} />
                </label>
                {checklistInReplaceFile && (
                  <div className="mt-2 flex gap-2">
                    <Button loading={checklistInReplacing} onClick={handleReplaceChecklistIn}>บันทึก</Button>
                    <Button variant="secondary" onClick={() => setChecklistInReplaceFile(null)}>ยกเลิก</Button>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* เอกสารอื่นๆ */}
          <Card>
            <DocumentUpload
              refTable="contracts"
              refId={contractId}
              bucket="contract-pdfs"
              allowedTypes={['contract_pdf', 'other']}
            />
          </Card>
        </div>
      )}

      {/* Reject Modal */}
      <Modal
        open={rejectModal}
        onClose={() => setRejectModal(false)}
        title="ปฏิเสธสัญญา"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectModal(false)}>ปิด</Button>
            <Button variant="danger" loading={rejecting} onClick={handleReject}>ยืนยันปฏิเสธ</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea label="เหตุผล" required rows={3} value={rejectReason}
            onChange={e => { setRejectReason(e.target.value); setRejectErr('') }} />
          {rejectErr && <p className="text-sm text-red-600">{rejectErr}</p>}
        </div>
      </Modal>

      {/* Reassign Staff Modal */}
      <Modal
        open={staffModal}
        onClose={() => setStaffModal(false)}
        title="เปลี่ยน Staff รับผิดชอบ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStaffModal(false)}>ปิด</Button>
            <Button loading={reassigning} onClick={handleReassign}>บันทึก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Select label="Staff" options={staffList} placeholder="เลือก staff"
            value={newStaffId} onChange={e => { setNewStaffId(e.target.value); setReassignErr('') }} />
          {reassignErr && <p className="text-sm text-red-600">{reassignErr}</p>}
        </div>
      </Modal>

      {/* Regenerate Move-in Invoices Modal */}
      <Modal
        open={regenModal}
        onClose={() => setRegenModal(false)}
        title="แก้ไขและส่งใหม่"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRegenModal(false)}>ปิด</Button>
            <Button loading={regenerating} onClick={handleRegenerateInvoices}>ยืนยันส่งใหม่</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ระบบจะแก้ข้อมูลสัญญา ยกเลิก/แทนที่ invoice แรกเข้าที่ยังไม่ผ่านอนุมัติ แล้วส่งกลับเป็นรอชำระใหม่
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="วันเริ่มสัญญา"
              type="date"
              required
              value={regenForm.contract_start_date}
              onChange={e => setRegenForm(p => ({ ...p, contract_start_date: e.target.value }))}
            />
            <Input
              label="กำหนดเข้าพัก"
              type="date"
              required
              value={regenForm.move_in_date}
              onChange={e => setRegenForm(p => ({ ...p, move_in_date: e.target.value }))}
            />
            <Input
              label="ค่าเช่า/เดือน"
              type="number"
              min={0}
              required
              value={regenForm.monthly_rent}
              onChange={e => setRegenForm(p => ({ ...p, monthly_rent: e.target.value }))}
            />
            <Input
              label="เงินประกัน"
              type="number"
              min={0}
              required
              value={regenForm.deposit_amount}
              onChange={e => setRegenForm(p => ({ ...p, deposit_amount: e.target.value }))}
            />
            <Input
              label="ค่าเช่าล่วงหน้า"
              type="number"
              min={0}
              required
              value={regenForm.advance_rent_amount}
              onChange={e => setRegenForm(p => ({ ...p, advance_rent_amount: e.target.value }))}
            />
            <Input
              label="หักเงินจอง"
              type="number"
              min={0}
              value={regenForm.booking_deposit_applied}
              onChange={e => setRegenForm(p => ({ ...p, booking_deposit_applied: e.target.value }))}
            />
          </div>
          <Textarea
            label="หมายเหตุการแก้ไข"
            rows={2}
            value={regenForm.note}
            onChange={e => setRegenForm(p => ({ ...p, note: e.target.value }))}
            placeholder="เช่น แก้ยอดหักเงินจอง / แก้วันเริ่มสัญญา"
          />
          {advancePayments.length > 0 && (
            <p className="text-xs text-gray-500">
              ระบบจะหักค่าทำสัญญาล่วงหน้าที่บันทึกไว้แล้ว ฿{advancePayments.reduce((s, p) => s + Number(p.amount), 0).toLocaleString('th-TH')} ตามลำดับเดิม
            </p>
          )}
          {regenErr && <p className="text-sm text-red-600">{regenErr}</p>}
        </div>
      </Modal>

      {/* Cancel Contract Modal */}
      <Modal
        open={cancelContractModal}
        onClose={() => setCancelContractModal(false)}
        title="ยกเลิกสัญญานี้"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelContractModal(false)}>ปิด</Button>
            <Button variant="danger" loading={cancelContracting} onClick={handleCancelContract}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">
            ใช้เมื่อ invoice แรกเข้าถูกปฏิเสธ/ยกเลิกแล้ว flow ไปต่อไม่ได้ ระบบจะยกเลิกสัญญาและคืนห้องเป็นสถานะว่าง
          </p>
          <Textarea label="เหตุผล" required rows={3} value={cancelContractReason}
            onChange={e => { setCancelContractReason(e.target.value); setCancelContractErr('') }} />
          {cancelContractErr && <p className="text-sm text-red-600">{cancelContractErr}</p>}
        </div>
      </Modal>

      {/* Move-in Checklist Modal */}
      <Modal
        open={moveInModal}
        onClose={() => setMoveInModal(false)}
        title="บันทึกเข้าพัก"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveInModal(false)}>ปิด</Button>
            <Button icon={<LogIn className="h-4 w-4" />} loading={movingIn} onClick={handleMoveIn}>ยืนยันเข้าพัก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Checklist ตรวจห้อง (ตอนเข้า)</p>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
              <Upload className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500 truncate">
                {checklistInFile ? checklistInFile.name : 'แนบ checklist ที่ผู้เช่าเซ็นแล้ว (รูปหรือ PDF)'}
              </span>
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => setChecklistInFile(e.target.files?.[0] ?? null)} />
            </label>
            <p className="mt-2 text-xs text-gray-400">ไม่บังคับ — สามารถแนบทีหลังได้ที่แท็บ เอกสาร</p>
          </div>
          {moveInErr && <p className="text-sm text-red-600">{moveInErr}</p>}
        </div>
      </Modal>

      {/* Advance Payment Modal */}
      <Modal
        open={advanceModal}
        onClose={() => setAdvanceModal(false)}
        title="รับชำระล่วงหน้า"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdvanceModal(false)}>ยกเลิก</Button>
            <Button loading={advanceSaving} onClick={handleSaveAdvance}>บันทึก</Button>
          </>
        }
      >
        {(() => {
          const prorate   = calcProrate(c.contract_start_date, c.monthly_rent)
          const deposit   = Number(c.deposit_amount)
          const advance   = Number(c.advance_rent_amount)
          const booking   = Number(c.booking_deposit_applied ?? 0)
          const totalExp  = deposit + advance + prorate - booking
          const paidSoFar = advancePayments.reduce((s, p) => s + Number(p.amount), 0)
          const remaining = Math.max(0, totalExp - paidSoFar)
          return (
            <div className="flex flex-col gap-4">
              {/* Breakdown */}
              <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
                <p className="mb-2 font-medium text-gray-700">ยอดที่ต้องชำระ (โดยประมาณ)</p>
                <div className="flex flex-col gap-1 text-gray-600">
                  <div className="flex justify-between"><span>เงินประกัน</span><span>฿{deposit.toLocaleString('th-TH')}</span></div>
                  <div className="flex justify-between"><span>ค่าเช่าล่วงหน้า</span><span>฿{advance.toLocaleString('th-TH')}</span></div>
                  {prorate > 0 && <div className="flex justify-between"><span>ค่าเช่า prorate</span><span>฿{prorate.toLocaleString('th-TH')}</span></div>}
                  {booking > 0 && <div className="flex justify-between text-green-600"><span>หักเงินจอง</span><span>-฿{booking.toLocaleString('th-TH')}</span></div>}
                  {paidSoFar > 0 && <div className="flex justify-between text-blue-600"><span>รับมาแล้ว</span><span>-฿{paidSoFar.toLocaleString('th-TH')}</span></div>}
                  <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-800">
                    <span>คงเหลือสูงสุด</span><span>฿{remaining.toLocaleString('th-TH')}</span>
                  </div>
                </div>
              </div>

              {/* Amount input */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  จำนวนเงินที่รับ <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={remaining}
                  value={advanceAmount}
                  onChange={e => setAdvanceAmount(e.target.value)}
                  placeholder={`สูงสุด ฿${remaining.toLocaleString('th-TH')}`}
                  className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Slip upload */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">แนบสลิป</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => setAdvanceSlipFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              {/* Note */}
              <Textarea
                label="หมายเหตุ"
                rows={2}
                value={advanceNote}
                onChange={e => setAdvanceNote(e.target.value)}
                placeholder="เช่น โอนผ่านพร้อมเพย์"
              />

              {advanceErr && <p className="text-sm text-red-600">{advanceErr}</p>}
            </div>
          )
        })()}
      </Modal>

      {/* Rent Advance Modal */}
      <Modal
        open={raModal}
        onClose={() => setRaModal(false)}
        title="บันทึกค่าเช่ารับล่วงหน้า"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRaModal(false)}>ยกเลิก</Button>
            <Button form="ra-form" type="submit" loading={raSaving}>บันทึก</Button>
          </>
        }
      >
        <form id="ra-form" onSubmit={handleSaveRentAdvance} className="flex flex-col gap-4">
          {/* Breakdown */}
          {(() => {
            const months    = parseInt(raMonths, 10) || 0
            const total     = Number(c.monthly_rent) * months
            return (
              <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-500">ยอดที่จะรับ</p>
                <div className="flex flex-col gap-1 text-blue-800">
                  <div className="flex justify-between">
                    <span>ค่าเช่า/เดือน</span>
                    <span>฿{Number(c.monthly_rent).toLocaleString('th-TH')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>จำนวนเดือน</span>
                    <span>{months} เดือน</span>
                  </div>
                  <div className="flex justify-between border-t border-blue-200 pt-1 font-semibold">
                    <span>รวมรับ</span>
                    <span>฿{total.toLocaleString('th-TH')}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Months */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">จำนวนเดือนที่จ่ายล่วงหน้า <span className="text-red-500">*</span></label>
            <input
              type="number"
              min={1}
              max={24}
              value={raMonths}
              onChange={e => setRaMonths(e.target.value)}
              className="h-9 w-28 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Bank */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">ธนาคาร <span className="text-red-500">*</span></label>
            <select
              value={raBankName}
              onChange={e => setRaBankName(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- เลือกธนาคาร --</option>
              {THAI_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{SLIP_REFERENCE_LABEL}</label>
            <input
              type="text"
              value={raBankRef}
              onChange={e => setRaBankRef(normalizeSlipReference(e.target.value))}
              inputMode="numeric"
              maxLength={4}
              placeholder={SLIP_REFERENCE_PLACEHOLDER}
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Slip */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">สลิปการโอน <span className="text-red-500">*</span></label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
              <Upload className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500 truncate">
                {raSlipFile ? raSlipFile.name : 'เลือกไฟล์ (รูปหรือ PDF)'}
              </span>
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => setRaSlipFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">หมายเหตุ</label>
            <input
              type="text"
              value={raNote}
              onChange={e => setRaNote(e.target.value)}
              placeholder="เช่น โอนผ่านพร้อมเพย์"
              className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-700">
            ระบบจะหักยอดนี้ออกจากใบแจ้งหนี้ค่าเช่ารายเดือนโดยอัตโนมัติ หากยอดใบแจ้งหนี้สูงกว่าค่าเช่ารับล่วงหน้าที่เหลือ ผู้เช่าจะต้องชำระส่วนต่าง
          </div>

          {raErr && <p className="text-sm text-red-600">{raErr}</p>}
        </form>
      </Modal>

      {/* Move-out Modal */}
      <MoveOutFormModal
        open={moveOutModal}
        onClose={() => setMoveOutModal(false)}
        contract={c}
        onSaved={(moveOutId) => {
          setMoveOutModal(false)
          navigate(`/move-outs/${moveOutId}`)
        }}
      />
    </div>
  )
}

function MoneyRow({ label, actual, base, bold = false }) {
  const actualNum = Number(actual)
  const baseNum   = Number(base)
  const isDiscounted = base != null && actualNum < baseNum
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={bold ? 'font-semibold' : 'font-medium'}>
        <span className={isDiscounted ? 'text-orange-600' : 'text-gray-900'}>
          ฿{actualNum.toLocaleString('th-TH')}
        </span>
        {base != null && (
          <span className="text-gray-400"> / ฿{baseNum.toLocaleString('th-TH')}</span>
        )}
      </p>
    </div>
  )
}
