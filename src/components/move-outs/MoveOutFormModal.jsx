import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'

export default function MoveOutFormModal({ open, onClose, contract, onSaved }) {
  const { profile } = useAuth()
  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    move_out_date:        today,
    is_early_termination: false,
    reason:               '',
  })
  const [saving,       setSaving]       = useState(false)
  const [err,          setErr]          = useState('')
  const [outstandingInvoices, setOutstandingInvoices] = useState([])

  useEffect(() => {
    if (open && contract) {
      // Slice to YYYY-MM-DD in case the DB returns a full timestamp string
      const endDate = contract.contract_end_date?.slice(0, 10) ?? null
      setForm({ move_out_date: endDate ?? today, is_early_termination: false, reason: '' })
      setErr('')
      setOutstandingInvoices([])
      if (contract.id) {
        supabase.from('invoices')
          .select('id, invoice_number, total_amount, due_date, status')
          .eq('contract_id', contract.id)
          .in('status', ['pending', 'overdue', 'paid_pending_approve'])
          .order('due_date')
          .then(({ data }) => setOutstandingInvoices(data ?? []))
      }
    }
  }, [open, contract])

  function f(key) {
    return e => setForm(p => ({ ...p, [key]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.move_out_date) { setErr('กรุณาระบุวันย้ายออก'); return }

    // Slice to YYYY-MM-DD so string comparison is always safe
    const contractEnd = contract.contract_end_date?.slice(0, 10) ?? null

    if (contractEnd && !form.is_early_termination && form.move_out_date < contractEnd) {
      setErr('วันย้ายออกก่อนครบสัญญา หากต้องการออกก่อนกำหนดกรุณาติ๊ก "ยกเลิกก่อนกำหนด"')
      return
    }

    setSaving(true); setErr('')
    const { data, error } = await supabase.from('move_outs').insert({
      contract_id:          contract.id,
      room_id:              contract.room_id,
      tenant_id:            contract.tenant_id,
      move_out_date:        form.move_out_date,
      is_early_termination: form.is_early_termination,
      reason:               form.reason.trim() || null,
      deposit_amount:       Number(contract.deposit_amount ?? 0),
      status:               'draft',
      created_by:           profile.id,
    }).select('id').single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved(data.id)
  }

  if (!contract) return null

  const contractEndDate = contract.contract_end_date
  const roomName  = contract.rooms?.buildings?.name ?? ''
  const roomNum   = contract.rooms?.room_number ?? ''
  const tenantName = contract.tenants?.full_name ?? ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="สร้างรายการย้ายออก"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          <Button form="mo-form" type="submit" loading={saving}>บันทึก</Button>
        </>
      }
    >
      <form id="mo-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Summary */}
        <div className="rounded-lg bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-400">สัญญา / ห้อง / ผู้เช่า</p>
          <p className="text-sm font-semibold text-gray-900">
            {contract.contract_number} · {roomName} ห้อง {roomNum}
          </p>
          <p className="text-sm text-gray-600">{tenantName}</p>
          {contractEndDate && (
            <p className="mt-1 text-xs text-gray-400">
              ครบสัญญา: {new Date(contractEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        {(() => {
          const contractEnd = contract.contract_end_date?.slice(0, 10) ?? null
          const isBeforeEnd = contractEnd && form.move_out_date && form.move_out_date < contractEnd
          return (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <Input label="วันที่ย้ายออก" type="date" required value={form.move_out_date} onChange={f('move_out_date')} />
                <label className={`flex items-center gap-2 cursor-pointer pb-1 ${isBeforeEnd ? 'text-red-600' : ''}`}>
                  <input type="checkbox" checked={form.is_early_termination}
                    onChange={e => setForm(p => ({ ...p, is_early_termination: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                  <span className="text-sm font-medium">ยกเลิกก่อนกำหนด</span>
                </label>
              </div>
              {isBeforeEnd && !form.is_early_termination && (
                <p className="text-xs text-red-600 -mt-2">
                  ⚠ วันที่เลือกก่อนครบสัญญา ({contractEnd}) — กรุณาติ๊ก "ยกเลิกก่อนกำหนด"
                </p>
              )}
            </>
          )
        })()}

        <Textarea label="หมายเหตุ / เหตุผลย้ายออก" rows={2} value={form.reason} onChange={f('reason')} />

        {outstandingInvoices.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-800">
              มียอดค้างชำระ {outstandingInvoices.length} ใบ — ต้องนำมาคิดในการคืนประกัน
            </p>
            <div className="mt-2 space-y-1">
              {outstandingInvoices.map(inv => (
                <div key={inv.id} className="flex justify-between text-xs text-red-700">
                  <span>{inv.invoice_number}</span>
                  <span>฿{Number(inv.total_amount).toLocaleString('th-TH')}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-red-200 pt-1.5 text-xs font-semibold text-red-800">
              <span>รวมค้างชำระ</span>
              <span>฿{outstandingInvoices.reduce((s, i) => s + Number(i.total_amount), 0).toLocaleString('th-TH')}</span>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-700">
          หลังบันทึกแล้ว รายการจะปรากฏใน tab ย้ายออก สามารถกรอกมิเตอร์และค่าใช้จ่ายได้ภายหลัง
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
      </form>
    </Modal>
  )
}
