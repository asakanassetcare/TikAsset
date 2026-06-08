import { useEffect, useState } from 'react'
import { useSettings } from '../../../hooks/useSettings'
import Card from '../../../components/ui/Card'
import Input from '../../../components/ui/Input'
import Textarea from '../../../components/ui/Textarea'
import Button from '../../../components/ui/Button'

const DEFAULT = {
  prefix: 'INV',
  footer_note: 'ขอบคุณที่ใช้บริการ',
  penalty_rate_per_day: 100,
  bank_account: { bank_name: '', branch: '', account_number: '', account_name: '' },
}

export default function InvoiceTab() {
  const { settings, updateSetting, loading } = useSettings()
  const [form, setForm] = useState(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings.invoice) setForm({ ...DEFAULT, ...settings.invoice, bank_account: { ...DEFAULT.bank_account, ...settings.invoice.bank_account } })
  }, [settings.invoice])

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  function setBank(field, value) {
    setForm((prev) => ({ ...prev, bank_account: { ...prev.bank_account, [field]: value } }))
    setSaved(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await updateSetting('invoice', form)
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />

  return (
    <Card className="max-w-2xl">
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <Input
          label="Prefix เลขใบแจ้งหนี้"
          required
          value={form.prefix}
          onChange={(e) => set('prefix', e.target.value)}
          hint="เช่น INV → INV-2569-00001"
          className="max-w-xs"
        />
        <Textarea
          label="ข้อความท้ายใบแจ้งหนี้"
          rows={2}
          value={form.footer_note}
          onChange={(e) => set('footer_note', e.target.value)}
          placeholder="ขอบคุณที่ใช้บริการ"
        />

        <Input
          label="ค่าปรับล่าช้า (บาท/วัน)"
          type="number"
          min={0}
          value={form.penalty_rate_per_day}
          onChange={(e) => set('penalty_rate_per_day', Number(e.target.value))}
          hint="เริ่มคิดตั้งแต่วันที่ 6 หลังวันครบกำหนด (หลังผ่านช่วงผ่อนผัน 5 วัน)"
          className="max-w-xs"
        />

        <div>
          <p className="mb-3 text-sm font-medium text-gray-700">บัญชีธนาคารรับโอน</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="ธนาคาร"
              value={form.bank_account.bank_name}
              onChange={(e) => setBank('bank_name', e.target.value)}
              placeholder="กสิกรไทย"
            />
            <Input
              label="สาขา"
              value={form.bank_account.branch}
              onChange={(e) => setBank('branch', e.target.value)}
              placeholder="สาขาสยามพารากอน"
            />
            <Input
              label="เลขบัญชี"
              value={form.bank_account.account_number}
              onChange={(e) => setBank('account_number', e.target.value)}
              placeholder="000-0-00000-0"
            />
            <Input
              label="ชื่อบัญชี"
              value={form.bank_account.account_name}
              onChange={(e) => setBank('account_name', e.target.value)}
              placeholder="บริษัท ..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="submit" loading={saving}>บันทึก</Button>
          {saved && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
        </div>
      </form>
    </Card>
  )
}
