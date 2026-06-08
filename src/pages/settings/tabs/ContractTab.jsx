import { useEffect, useState } from 'react'
import { useSettings } from '../../../hooks/useSettings'
import Card from '../../../components/ui/Card'
import Input from '../../../components/ui/Input'
import Button from '../../../components/ui/Button'

const DEFAULT = { default_deposit_months: 2, default_advance_months: 1, default_payment_day: 1 }

export default function ContractTab() {
  const { settings, updateSetting, loading } = useSettings()
  const [form, setForm] = useState(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings.contract) setForm({ ...DEFAULT, ...settings.contract })
  }, [settings.contract])

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: Number(value) }))
    setSaved(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await updateSetting('contract', form)
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />

  return (
    <Card className="max-w-md">
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <Input
          label="เงินประกันค่าเช่าเริ่มต้น (เดือน)"
          type="number"
          min={1}
          max={6}
          required
          value={form.default_deposit_months}
          onChange={(e) => set('default_deposit_months', e.target.value)}
          hint="จำนวนเดือนค่าเช่าท���่เก็บเป็นเงินประกัน (default)"
        />
        <Input
          label="ค่าเช่าล่วงหน้าเริ่มต้น (เดือน)"
          type="number"
          min={0}
          max={3}
          required
          value={form.default_advance_months}
          onChange={(e) => set('default_advance_months', e.target.value)}
          hint="จำนวนเดือนค่าเช่าล่วงหน้า (default)"
        />
        <Input
          label="วันครบกำหนดชำระ (วันที่)"
          type="number"
          min={1}
          max={28}
          required
          value={form.default_payment_day}
          onChange={(e) => set('default_payment_day', e.target.value)}
          hint="เช่น 1 = ชำระภายในวันที่ 1 ของทุกเดือน"
        />

        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="submit" loading={saving}>บันทึก</Button>
          {saved && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
        </div>
      </form>
    </Card>
  )
}
