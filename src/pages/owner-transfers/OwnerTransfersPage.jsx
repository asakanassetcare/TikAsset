import { useEffect, useState } from 'react'
import { Plus, Search, X, CheckCircle, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate } from '../../lib/date'
import { ArrowLeftRight } from 'lucide-react'
import { SLIP_REFERENCE_LABEL, SLIP_REFERENCE_PLACEHOLDER, normalizeSlipReference } from '../../lib/slipReference'

const STATUS_OPTS = [
  { value: '',                    label: 'ทุกสถานะ' },
  { value: 'pending_staff',       label: 'รอ Staff โอน' },
  { value: 'transferred_by_staff',label: 'โอนแล้ว รอยืนยัน' },
  { value: 'confirmed',           label: 'ยืนยันแล้ว' },
  { value: 'rejected',            label: 'ถูกปฏิเสธ' },
]

export default function OwnerTransfersPage() {
  const { profile, role } = useAuth()
  const [transfers,    setTransfers]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Create modal (accounting only)
  const [createModal,  setCreateModal]  = useState(false)
  const [paidInvoices, setPaidInvoices] = useState([])
  const [createForm,   setCreateForm]   = useState({ invoice_id: '', transfer_amount: '', note: '' })
  const [creating,     setCreating]     = useState(false)
  const [createErr,    setCreateErr]    = useState('')

  // Transfer modal (staff)
  const [transferModal,  setTransferModal]  = useState(false)
  const [transferTarget, setTransferTarget] = useState(null)
  const [transferForm,   setTransferForm]   = useState({ bank_reference: '', note: '' })
  const [slipFile,       setSlipFile]       = useState(null)
  const [transferring,   setTransferring]   = useState(false)
  const [transferErr,    setTransferErr]    = useState('')

  // Confirm/reject (accounting)
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => { fetchTransfers() }, [])

  async function fetchTransfers() {
    const { data } = await supabase
      .from('owner_transfers')
      .select(`
        id, transfer_number, period, rent_collected, transfer_amount, status, transferred_at, confirmed_at, slip_url,
        owners(full_name, bank_name, bank_account_number, bank_account_name),
        rooms(room_number, buildings(name)),
        invoices(invoice_number, total_amount)
      `)
      .order('created_at', { ascending: false })
    setTransfers(data ?? [])
    setLoading(false)
  }

  async function fetchPaidInvoices() {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, billing_period, total_amount, rooms(id, room_number, owner_id, buildings(name)), tenants(full_name)')
      .eq('invoice_type', 'monthly_rent')
      .eq('status', 'paid')
      .order('billing_period', { ascending: false })
      .limit(100)
    // Filter to managed rooms that don't have an OT yet
    const existing = new Set(transfers.map(t => t.invoice_id ?? ''))
    const managed = (data ?? []).filter(inv => {
      const owner = inv.rooms?.owner_id
      return owner && !existing.has(inv.id)
    })
    setPaidInvoices(managed.map(inv => ({
      value: inv.id,
      label: `${inv.invoice_number} · ${inv.rooms?.buildings?.name} ${inv.rooms?.room_number} · ${inv.billing_period} · ฿${Number(inv.total_amount).toLocaleString('th-TH')}`,
      total: inv.total_amount,
    })))
  }

  const filtered = transfers.filter(t => {
    if (filterStatus && t.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        t.transfer_number?.toLowerCase().includes(q) ||
        t.owners?.full_name?.toLowerCase().includes(q) ||
        t.rooms?.room_number?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const isAccounting  = ['super_admin', 'accounting'].includes(role)
  const isStaff       = ['super_admin', 'head_staff', 'staff'].includes(role)

  async function handleCreate(e) {
    e.preventDefault()
    if (!createForm.invoice_id) { setCreateErr('กรุณาเลือกใบแจ้งหนี้'); return }
    setCreating(true)
    const invOpt = paidInvoices.find(i => i.value === createForm.invoice_id)

    // Fetch full invoice to get owner info
    const { data: inv } = await supabase.from('invoices').select('*, rooms(owner_id, id)').eq('id', createForm.invoice_id).single()
    if (!inv?.rooms?.owner_id) { setCreating(false); setCreateErr('ห้องนี้ไม่มีเจ้าของ'); return }

    const { error } = await supabase.from('owner_transfers').insert({
      owner_id:        inv.rooms.owner_id,
      room_id:         inv.rooms.id,
      contract_id:     inv.contract_id,
      invoice_id:      createForm.invoice_id,
      period:          inv.billing_period,
      rent_collected:  inv.total_amount,
      transfer_amount: Number(createForm.transfer_amount) || inv.total_amount,
      note:            createForm.note.trim() || null,
      created_by:      profile.id,
    })
    setCreating(false)
    if (error) { setCreateErr(error.message); return }
    setCreateModal(false)
    fetchTransfers()
  }

  async function handleTransfer(e) {
    e.preventDefault()
    setTransferring(true)
    let slipUrl = null
    if (slipFile) {
      const ext = slipFile.name.split('.').pop()
      const path = `${transferTarget.id}/slip_${Date.now()}.${ext}`
      const { data: sd, error: se } = await supabase.storage.from('payment-slips').upload(path, slipFile)
      if (se) { setTransferring(false); setTransferErr('อัปโหลดสลิปไม่สำเร็จ'); return }
      slipUrl = sd.path
    }
    const { error } = await supabase.from('owner_transfers').update({
      status:           'transferred_by_staff',
      transferred_by:   profile.id,
      transferred_at:   new Date().toISOString(),
      bank_reference:   normalizeSlipReference(transferForm.bank_reference) || null,
      slip_url:         slipUrl,
      note:             transferForm.note.trim() || null,
    }).eq('id', transferTarget.id)
    setTransferring(false)
    if (error) { setTransferErr(error.message); return }
    setTransferModal(false)
    fetchTransfers()
  }

  async function handleConfirm(t) {
    setActionLoading(t.id)
    const { error } = await supabase.from('owner_transfers').update({
      status: 'confirmed', confirmed_by: profile.id, confirmed_at: new Date().toISOString(),
    }).eq('id', t.id)
    setActionLoading(null)
    if (error) alert(error.message)
    else fetchTransfers()
  }

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">โอนเงินเจ้าของห้อง</h1>
          <p className="mt-1 text-sm text-gray-500">{filtered.length} รายการ</p>
        </div>
        {isAccounting && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => { fetchPaidInvoices(); setCreateForm({ invoice_id: '', transfer_amount: '', note: '' }); setCreateErr(''); setCreateModal(true) }}>
            สร้างรายการโอน
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขโอน เจ้าของ หรือห้อง..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <Select options={STATUS_OPTS} value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-44" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="ไม่มีรายการโอน" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(t => (
            <div key={t.id} className="rounded-xl border border-gray-100 bg-white px-4 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.transfer_number}</p>
                  <p className="text-xs text-gray-500">
                    {t.owners?.full_name} · {t.rooms?.buildings?.name} {t.rooms?.room_number} · {t.period}
                  </p>
                  {t.owners?.bank_name && (
                    <p className="text-xs text-gray-400">{t.owners.bank_name} {t.owners.bank_account_number} ({t.owners.bank_account_name})</p>
                  )}
                  {t.transferred_at && <p className="text-xs text-gray-400">โอนเมื่อ {formatThaiDate(t.transferred_at)}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">฿{Number(t.transfer_amount).toLocaleString('th-TH')}</p>
                    <p className="text-xs text-gray-400">จาก ฿{Number(t.rent_collected).toLocaleString('th-TH')}</p>
                  </div>
                  <Badge variant={t.status} />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {t.slip_url && (
                  <button onClick={async () => {
                    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(t.slip_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }} className="text-xs text-blue-600 hover:underline">ดูสลิป</button>
                )}
                {isStaff && t.status === 'pending_staff' && (
                  <Button size="sm" icon={<Upload className="h-3.5 w-3.5" />}
                    onClick={() => { setTransferTarget(t); setTransferForm({ bank_reference: '', note: '' }); setSlipFile(null); setTransferErr(''); setTransferModal(true) }}>
                    บันทึกโอนแล้ว
                  </Button>
                )}
                {isAccounting && t.status === 'transferred_by_staff' && (
                  <Button size="sm" icon={<CheckCircle className="h-3.5 w-3.5" />}
                    loading={actionLoading === t.id} onClick={() => handleConfirm(t)}>
                    ยืนยัน
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="สร้างรายการโอนเงินเจ้าของ"
        footer={<><Button variant="secondary" onClick={() => setCreateModal(false)}>ปิด</Button><Button form="ot-form" type="submit" loading={creating}>บันทึก</Button></>}>
        <form id="ot-form" onSubmit={handleCreate} className="flex flex-col gap-4">
          <Select label="ใบแจ้งหนี้ที่ชำระแล้ว (ห้องฝากบริหาร)" required options={paidInvoices}
            placeholder="เลือกใบแจ้งหนี้" value={createForm.invoice_id}
            onChange={e => {
              const opt = paidInvoices.find(i => i.value === e.target.value)
              setCreateForm(p => ({ ...p, invoice_id: e.target.value, transfer_amount: opt ? String(opt.total) : '' }))
            }} />
          <Input label="ยอดโอน (฿)" type="number" min={0} required value={createForm.transfer_amount}
            onChange={e => setCreateForm(p => ({ ...p, transfer_amount: e.target.value }))} />
          <Textarea label="หมายเหตุ" rows={2} value={createForm.note}
            onChange={e => setCreateForm(p => ({ ...p, note: e.target.value }))} />
          {createErr && <p className="text-sm text-red-600">{createErr}</p>}
        </form>
      </Modal>

      {/* Transfer Modal */}
      <Modal open={transferModal} onClose={() => setTransferModal(false)} title="บันทึกการโอนเงิน"
        footer={<><Button variant="secondary" onClick={() => setTransferModal(false)}>ปิด</Button><Button form="tf-form" type="submit" loading={transferring}>บันทึก</Button></>}>
        <form id="tf-form" onSubmit={handleTransfer} className="flex flex-col gap-4">
          {transferTarget && (
            <div className="rounded-lg bg-blue-50 px-4 py-3">
              <p className="text-xs text-blue-600">ยอดโอน</p>
              <p className="text-xl font-bold text-blue-700">฿{Number(transferTarget.transfer_amount).toLocaleString('th-TH')}</p>
              {transferTarget.owners?.bank_name && (
                <p className="mt-1 text-xs text-blue-500">{transferTarget.owners.bank_name} · {transferTarget.owners.bank_account_number}</p>
              )}
            </div>
          )}
          <Input
            label={SLIP_REFERENCE_LABEL}
            value={transferForm.bank_reference}
            onChange={e => setTransferForm(p => ({ ...p, bank_reference: normalizeSlipReference(e.target.value) }))}
            inputMode="numeric"
            maxLength={4}
            placeholder={SLIP_REFERENCE_PLACEHOLDER}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">แนบสลิป</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-blue-400 transition-colors">
              <Upload className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">{slipFile ? slipFile.name : 'เลือกไฟล์'}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => setSlipFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Textarea label="หมายเหตุ" rows={2} value={transferForm.note}
            onChange={e => setTransferForm(p => ({ ...p, note: e.target.value }))} />
          {transferErr && <p className="text-sm text-red-600">{transferErr}</p>}
        </form>
      </Modal>
    </div>
  )
}
