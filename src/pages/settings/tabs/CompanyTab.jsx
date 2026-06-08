import { useEffect, useState } from 'react'
import { useSettings } from '../../../hooks/useSettings'
import Card from '../../../components/ui/Card'
import Input from '../../../components/ui/Input'
import Textarea from '../../../components/ui/Textarea'
import Button from '../../../components/ui/Button'

export default function CompanyTab() {
  const { settings, updateSetting, loading } = useSettings()
  const [form, setForm] = useState({ name: '', tax_id: '', address: '', phone: '', logo_url: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings.company) {
      setForm({ name: '', tax_id: '', address: '', phone: '', logo_url: '', ...settings.company })
    }
  }, [settings.company])

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await updateSetting('company', form)
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />

  return (
    <Card className="max-w-2xl">
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <Input
          label="ชื่อบริษัท"
          required
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="บริษัท คอนโด เรนทัล จำกัด"
        />
        <Input
          label="เลขที่ผู้เสียภาษี"
          value={form.tax_id}
          onChange={(e) => set('tax_id', e.target.value)}
          placeholder="0-0000-00000-00-0"
        />
        <Textarea
          label="ที่อยู่"
          rows={3}
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="ที่อยู่สำนักงาน"
        />
        <Input
          label="เบอร์โทรศัพท์"
          phone
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="020000000"
        />
        <div className="flex flex-col gap-1">
          <Input
            label="URL โลโก้"
            value={form.logo_url}
            onChange={(e) => set('logo_url', e.target.value)}
            placeholder="https://..."
            hint="วาง URL รูปโลโก้ (แนะนำ PNG ขนาด 200×80 px)"
          />
          {form.logo_url && (
            <div className="mt-2 flex items-center gap-3">
              <img
                src={form.logo_url}
                alt="logo preview"
                className="h-10 rounded border border-gray-200 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
              <span className="text-xs text-gray-400">ตัวอย่างโลโก้</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="submit" loading={saving}>บันทึก</Button>
          {saved && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
        </div>
      </form>
    </Card>
  )
}
