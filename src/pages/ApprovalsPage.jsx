import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, FileText, CreditCard, LogOut, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Textarea from '../components/ui/Textarea'
import EmptyState from '../components/ui/EmptyState'
import { PageSpinner } from '../components/ui/Spinner'
import { formatThaiDate, formatThaiDateTime } from '../lib/date'

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function money(n) {
  return `฿${Number(n ?? 0).toLocaleString('th-TH')}`
}

function itemDate(item) {
  if (item._kind === 'payment') return item.created_at
  if (item._kind === 'booking') return item.payment_recorded_at ?? item.paid_date
  if (item._kind === 'rent_advance') return item.created_at
  if (item._kind === 'receipt') return item.issued_at
  return item.created_at
}

export default function ApprovalsPage() {
  const navigate = useNavigate()
  const { profile, role } = useAuth()

  const canApproveContracts = ['super_admin', 'executive'].includes(role)
  const canApproveStaffItems = ['super_admin', 'head_staff'].includes(role)
  const defaultSection = canApproveContracts ? 'contracts' : 'payments'

  const [section, setSection] = useState(defaultSection)
  const [contracts, setContracts] = useState([])
  const [payments, setPayments] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionId, setActionId] = useState(null)

  const [rejectModal, setRejectModal] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectErr, setRejectErr] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [
      { data: contractData },
      { data: paymentData },
      { data: bookingData },
      { data: rentAdvanceData },
      { data: receiptData },
      { data: moveOutData },
      { data: settlementData },
    ] = await Promise.all([
      supabase
        .from('contracts')
        .select(`
          id, contract_number, created_at,
          contract_start_date, contract_end_date,
          monthly_rent, deposit_amount, advance_rent_amount,
          rooms(room_number, buildings(name)),
          tenants(full_name, phone),
          profiles!assigned_staff_id(full_name)
        `)
        .eq('status', 'pending_approve')
        .order('created_at', { ascending: true }),
      supabase
        .from('payments')
        .select(`
          *,
          invoices(id, invoice_number, invoice_type, total_amount, due_date, status,
            rooms(room_number, buildings(name)),
            tenants(full_name)),
          recorder:profiles!recorded_by(full_name)
        `)
        .eq('status', 'pending_approve')
        .is('head_approved_at', null)
        .is('head_rejected_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('bookings')
        .select(`
          *,
          rooms(room_number, buildings(name)),
          tenants(full_name),
          payment_recorder:profiles!payment_recorded_by(full_name)
        `)
        .eq('status', 'waiting')
        .not('slip_url', 'is', null)
        .is('head_approved_at', null)
        .is('head_rejected_at', null)
        .order('payment_recorded_at', { ascending: true }),
      supabase
        .from('rent_advance_payments')
        .select(`
          *,
          rooms(room_number, buildings(name)),
          tenants(full_name)
        `)
        .is('head_approved_at', null)
        .is('head_rejected_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('receipts')
        .select('*')
        .eq('status', 'pending')
        .is('head_approved_at', null)
        .is('head_rejected_at', null)
        .order('issued_at', { ascending: true }),
      supabase
        .from('move_outs')
        .select(`
          *,
          rooms(room_number, buildings(name)),
          tenants(full_name),
          contracts(contract_number)
        `)
        .eq('status', 'pending_accounting')
        .order('created_at', { ascending: true }),
      supabase
        .from('settlements')
        .select(`
          *,
          move_outs(
            id, move_out_number, move_out_date,
            rooms(room_number, buildings(name)),
            tenants(full_name)
          )
        `)
        .eq('status', 'paid_by_staff')
        .is('head_approved_at', null)
        .is('head_rejected_at', null)
        .order('paid_at', { ascending: true }),
    ])

    const paymentItems = [
      ...(paymentData ?? []).map(p => ({ ...p, _kind: 'payment' })),
      ...(bookingData ?? []).map(b => ({ ...b, _kind: 'booking' })),
      ...(rentAdvanceData ?? []).map(r => ({ ...r, _kind: 'rent_advance' })),
      ...(receiptData ?? []).map(r => ({ ...r, _kind: 'receipt' })),
    ].sort((a, b) => new Date(itemDate(a) ?? 0) - new Date(itemDate(b) ?? 0))

    setContracts(contractData ?? [])
    setPayments(paymentItems)
    setSettlements([
      ...(moveOutData ?? []).map(mo => ({ ...mo, _kind: 'move_out' })),
      ...(settlementData ?? []).map(s => ({ ...s, _kind: 'settlement' })),
    ])
    setLoading(false)
  }

  async function approveContract(c) {
    setActionId(`contract-${c.id}`)
    const { error } = await supabase.rpc('approve_contract', { p_contract_id: c.id })
    setActionId(null)
    if (error) alert(error.message)
    else fetchAll()
  }

  function openReject(target) {
    setRejectTarget(target)
    setRejectReason('')
    setRejectErr('')
    setRejectModal(true)
  }

  async function approvePaymentItem(item) {
    setActionId(`${item._kind}-${item.id}`)

    const patch = {
      head_approved_by: profile.id,
      head_approved_at: new Date().toISOString(),
      head_rejected_by: null,
      head_rejected_at: null,
      head_rejection_reason: null,
    }

    const table = {
      payment: 'payments',
      booking: 'bookings',
      rent_advance: 'rent_advance_payments',
      receipt: 'receipts',
    }[item._kind]

    const { data: updated, error } = await supabase.from(table).update(patch)
      .eq('id', item.id)
      .is('head_approved_at', null)
      .is('head_rejected_at', null)
      .select('id')
    setActionId(null)
    if (error) { alert(error.message); return }
    if (!updated || updated.length === 0) {
      alert('รายการนี้ถูกอนุมัติหรือปฏิเสธไปแล้ว กรุณารีเฟรช')
    }
    fetchAll()
  }

  async function approveSettlement(item) {
    setActionId(`${item._kind}-${item.id}`)
    if (item._kind === 'move_out') {
      const { error } = await supabase.rpc('approve_move_out', { p_move_out_id: item.id })
      setActionId(null)
      if (error) alert(error.message)
      else fetchAll()
      return
    }
    const { error } = await supabase.from('settlements').update({
      head_approved_by: profile.id,
      head_approved_at: new Date().toISOString(),
      head_rejected_by: null,
      head_rejected_at: null,
      head_rejection_reason: null,
    }).eq('id', item.id)
    setActionId(null)
    if (error) alert(error.message)
    else fetchAll()
  }

  async function rejectContract(c, reason) {
    return supabase.from('contracts').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: profile.id,
      rejection_reason: reason,
    }).eq('id', c.id)
  }

  async function rejectPaymentItem(item, reason) {
    if (item._kind === 'payment') {
      const { data: updated, error } = await supabase.from('payments').update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        head_rejected_by: profile.id,
        head_rejected_at: new Date().toISOString(),
        head_rejection_reason: reason,
      })
        .eq('id', item.id)
        .eq('status', 'pending_approve')
        .is('head_approved_at', null)
        .is('head_rejected_at', null)
        .select('id')
      if (error) return { error }
      if (!updated || updated.length === 0) {
        return { error: { message: 'รายการนี้ถูกอนุมัติหรือปฏิเสธไปแล้ว กรุณารีเฟรช' } }
      }

      const invoice = item.invoices
      if (invoice?.id) {
        const today = new Date().toISOString().slice(0, 10)
        const restoredStatus = invoice.due_date && addDays(invoice.due_date, 4) < today ? 'overdue' : 'pending'
        return supabase.from('invoices').update({ status: restoredStatus }).eq('id', invoice.id)
      }
      return { error: null }
    }

    const table = {
      booking: 'bookings',
      rent_advance: 'rent_advance_payments',
      receipt: 'receipts',
    }[item._kind]
    return supabase.from(table).update({
      head_rejected_by: profile.id,
      head_rejected_at: new Date().toISOString(),
      head_rejection_reason: reason,
    }).eq('id', item.id)
  }

  async function rejectSettlement(item, reason) {
    if (item._kind === 'move_out') {
      return supabase.from('move_outs').update({
        status: 'draft',
        rejection_note: reason,
      }).eq('id', item.id)
    }
    return supabase.from('settlements').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
      head_rejected_by: profile.id,
      head_rejected_at: new Date().toISOString(),
      head_rejection_reason: reason,
    }).eq('id', item.id)
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setRejectErr('กรุณากรอกเหตุผล'); return }
    setRejecting(true)
    const reason = rejectReason.trim()
    let result
    if (rejectTarget?._section === 'contracts') result = await rejectContract(rejectTarget, reason)
    if (rejectTarget?._section === 'payments') result = await rejectPaymentItem(rejectTarget, reason)
    if (rejectTarget?._section === 'settlements') result = await rejectSettlement(rejectTarget, reason)
    setRejecting(false)
    if (result?.error) { setRejectErr(result.error.message); return }
    setRejectModal(false)
    fetchAll()
  }

  const q = search.trim().toLowerCase()
  const filteredContracts = useMemo(() => {
    if (!q) return contracts
    return contracts.filter(c =>
      c.contract_number?.toLowerCase().includes(q) ||
      c.rooms?.room_number?.toLowerCase().includes(q) ||
      c.tenants?.full_name?.toLowerCase().includes(q)
    )
  }, [contracts, q])

  const filteredPayments = useMemo(() => {
    if (!q) return payments
    return payments.filter(item =>
      item.invoices?.invoice_number?.toLowerCase().includes(q) ||
      item.booking_number?.toLowerCase().includes(q) ||
      item.advance_number?.toLowerCase().includes(q) ||
      item.receipt_number?.toLowerCase().includes(q) ||
      item.invoices?.tenants?.full_name?.toLowerCase().includes(q) ||
      item.tenants?.full_name?.toLowerCase().includes(q) ||
      item.rooms?.room_number?.toLowerCase().includes(q)
    )
  }, [payments, q])

  const filteredSettlements = useMemo(() => {
    if (!q) return settlements
    return settlements.filter(s =>
      s.move_out_number?.toLowerCase().includes(q) ||
      s.move_outs?.move_out_number?.toLowerCase().includes(q) ||
      s.tenants?.full_name?.toLowerCase().includes(q) ||
      s.move_outs?.tenants?.full_name?.toLowerCase().includes(q) ||
      s.rooms?.room_number?.toLowerCase().includes(q) ||
      s.move_outs?.rooms?.room_number?.toLowerCase().includes(q)
    )
  }, [settlements, q])

  const sectionTabs = [
    ...(canApproveContracts ? [{ key: 'contracts', label: 'สัญญา', count: contracts.length }] : []),
    ...(canApproveStaffItems ? [
      { key: 'payments', label: 'การชำระเงิน', count: payments.length },
      { key: 'settlements', label: 'การย้ายออก', count: settlements.length },
    ] : []),
  ]

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">รออนุมัติ</h1>
      </div>

      <div className="mb-5 flex border-b border-gray-200">
        {sectionTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSection(t.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
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

      <div className="mb-5 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {section === 'contracts' && (
        filteredContracts.length === 0 ? (
          <EmptyState icon={FileText} title="ไม่มีสัญญารออนุมัติ" />
        ) : (
          <div className="flex max-w-4xl flex-col gap-3">
            {filteredContracts.map(c => (
              <div key={c.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900 hover:text-blue-600">{c.contract_number}</p>
                      <Badge variant="pending_approve" />
                    </div>
                    <p className="text-sm font-medium text-gray-800">
                      {c.rooms?.buildings?.name} ห้อง {c.rooms?.room_number}
                    </p>
                    <p className="text-sm text-gray-600">{c.tenants?.full_name}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                      <span>{formatThaiDate(c.contract_start_date)} - {formatThaiDate(c.contract_end_date)}</span>
                      <span>ค่าเช่า {money(c.monthly_rent)}/เดือน</span>
                      <span>ประกัน {money(c.deposit_amount)}</span>
                      <span>ค่าเช่าล่วงหน้า {money(c.advance_rent_amount)}</span>
                      {c.profiles?.full_name && <span>Staff: {c.profiles.full_name}</span>}
                    </div>
                  </div>
                  {canApproveContracts && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" icon={<CheckCircle className="h-3.5 w-3.5" />}
                        loading={actionId === `contract-${c.id}`} onClick={() => approveContract(c)}>
                        อนุมัติ
                      </Button>
                      <Button size="sm" variant="danger" icon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={() => openReject({ ...c, _section: 'contracts' })}>
                        ปฏิเสธ
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {section === 'payments' && (
        filteredPayments.length === 0 ? (
          <EmptyState icon={CreditCard} title="ไม่มีรายการชำระเงินรออนุมัติ" />
        ) : (
          <div className="flex flex-col gap-2">
            {filteredPayments.map(item => (
              <PaymentApprovalRow
                key={`${item._kind}-${item.id}`}
                item={item}
                actionId={actionId}
                onApprove={approvePaymentItem}
                onReject={target => openReject({ ...target, _section: 'payments' })}
                navigate={navigate}
              />
            ))}
          </div>
        )
      )}

      {section === 'settlements' && (
        filteredSettlements.length === 0 ? (
          <EmptyState icon={LogOut} title="ไม่มีรายการย้ายออกรออนุมัติ" />
        ) : (
          <div className="flex flex-col gap-2">
            {filteredSettlements.map(item => {
              const isMoveOut = item._kind === 'move_out'
              const moveOutId = isMoveOut ? item.id : item.move_outs?.id
              const number = isMoveOut ? item.move_out_number : item.move_outs?.move_out_number
              const room = isMoveOut ? item.rooms : item.move_outs?.rooms
              const tenant = isMoveOut ? item.tenants : item.move_outs?.tenants
              const amount = isMoveOut ? (Number(item.additional_charge) > 0 ? item.additional_charge : item.refund_amount) : item.amount
              return (
              <div key={`${item._kind}-${item.id}`} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/move-outs/${moveOutId}`)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{number}</p>
                    <span className={`font-bold ${isMoveOut ? 'text-blue-700' : 'text-red-700'}`}>{money(amount)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isMoveOut ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                      {isMoveOut ? 'รายการย้ายออก' : 'รับชำระย้ายออก'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {room?.buildings?.name} ห้อง {room?.room_number} · {tenant?.full_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {isMoveOut ? `ส่งอนุมัติ ${formatThaiDateTime(item.updated_at ?? item.created_at)}` : `Staff บันทึก ${formatThaiDateTime(item.paid_at ?? item.created_at)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" icon={<CheckCircle className="h-3.5 w-3.5" />}
                    loading={actionId === `${item._kind}-${item.id}`} onClick={() => approveSettlement(item)}>
                    อนุมัติ
                  </Button>
                  <Button size="sm" variant="danger" icon={<XCircle className="h-3.5 w-3.5" />}
                    onClick={() => openReject({ ...item, _section: 'settlements' })}>
                    ปฏิเสธ
                  </Button>
                </div>
              </div>
            )})}
          </div>
        )
      )}

      <Modal
        open={rejectModal}
        onClose={() => setRejectModal(false)}
        title="ปฏิเสธรายการ"
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
    </div>
  )
}

function PaymentApprovalRow({ item, actionId, onApprove, onReject, navigate }) {
  const buildingName =
    item.invoices?.rooms?.buildings?.name ??
    item.rooms?.buildings?.name ??
    null
  const roomNumber = item.invoices?.rooms?.room_number ?? item.rooms?.room_number
  const tenantName = item.invoices?.tenants?.full_name ?? item.tenants?.full_name ?? item.payer_name

  const meta = {
    payment: {
      number: item.invoices?.invoice_number,
      amount: item.amount,
      badge: item.invoices?.invoice_type === 'contract_initial' ? 'ใบแรกเข้าสัญญา' : 'ค่าเช่า/ใบแจ้งหนี้',
      badgeCls: 'bg-blue-100 text-blue-700',
      date: item.paid_date,
      by: item.recorder?.full_name,
      path: item.invoices?.id ? `/invoices/${item.invoices.id}` : null,
    },
    booking: {
      number: item.booking_number,
      amount: item.deposit_amount,
      badge: 'เงินจอง',
      badgeCls: 'bg-purple-100 text-purple-700',
      date: item.paid_date,
      by: item.payment_recorder?.full_name,
      path: `/bookings/${item.id}`,
    },
    rent_advance: {
      number: item.advance_number,
      amount: item.paid_amount,
      badge: 'ค่าเช่ารับล่วงหน้า',
      badgeCls: 'bg-green-100 text-green-700',
      date: item.created_at,
      by: null,
      path: `/contracts/${item.contract_id}`,
    },
    receipt: {
      number: item.receipt_number,
      amount: item.amount,
      badge: 'ใบเสร็จอื่น',
      badgeCls: 'bg-orange-100 text-orange-700',
      date: item.issued_at,
      by: null,
      path: null,
    },
  }[item._kind]

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3.5">
      <div className={`min-w-0 flex-1 ${meta.path ? 'cursor-pointer' : ''}`} onClick={() => meta.path && navigate(meta.path)}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">
            {meta.number}
            <span className="ml-2 font-bold">{money(meta.amount)}</span>
          </p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badgeCls}`}>{meta.badge}</span>
          {buildingName && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
              {buildingName}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {roomNumber ? `ห้อง ${roomNumber}` : ''}{roomNumber && tenantName ? ' · ' : ''}{tenantName ?? ''}
        </p>
        <p className="text-xs text-gray-400">
          ชำระ {formatThaiDate(meta.date)}
          {item.bank_name ? ` · ${item.bank_name}` : ''}
          {item.bank_reference ? ` · ${item.bank_reference}` : ''}
          {meta.by ? ` · โดย ${meta.by}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" icon={<CheckCircle className="h-3.5 w-3.5" />}
          loading={actionId === `${item._kind}-${item.id}`} onClick={() => onApprove(item)}>
          อนุมัติ
        </Button>
        <Button size="sm" variant="danger" icon={<XCircle className="h-3.5 w-3.5" />}
          onClick={() => onReject(item)}>
          ปฏิเสธ
        </Button>
      </div>
    </div>
  )
}
