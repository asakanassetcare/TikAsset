import { useEffect, useState } from 'react'
import { useSettings } from '../../../hooks/useSettings'
import Card from '../../../components/ui/Card'
import Input from '../../../components/ui/Input'
import Button from '../../../components/ui/Button'

const DEFAULT = { contract_expiring_days: 30, overdue_alert_days: 3 }

export default function NotificationTab() {
  const { settings, updateSetting, loading } = useSettings()
  const [form, setForm] = useState(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings.notification) setForm({ ...DEFAULT, ...settings.notification })
  }, [settings.notification])

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: Number(value) }))
    setSaved(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await updateSetting('notification', form)
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />

  return (
    <Card className="max-w-md">
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <Input
          label="แจ้งเตือนสัญญาใกล้หมด (วัน)"
          type="number"
          min={7}
          max={90}
          required
          value={form.contract_expiring_days}
          onChange={(e) => set('contract_expiring_days', e.target.value)}
          hint="แจ้งเตือนล่วงหน้ากี่วันก่อนสัญญาหมด"
        />
        <Input
          label="แจ้งเตือนค้างชำระ (วัน)"
          type="number"
          min={1}
          max={30}
          required
          value={form.overdue_alert_days}
          onChange={(e) => set('overdue_alert_days', e.target.value)}
          hint="แจ้งเตือนหลังจาก due date เกินกี่วัน"
        />

        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="submit" loading={saving}>บันทึก</Button>
          {saved && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
        </div>
      </form>
    </Card>
  )
}
