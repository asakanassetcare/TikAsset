import { useState } from 'react'
import { Eye, EyeOff, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function IdCardField({
  tenantId, hasEncrypted, last4,
  isForeigner = false, onForeignerChange,
  onChange, required = false,
}) {
  const [mode, setMode] = useState('display') // 'display' | 'edit' | 'revealed'
  const [revealed, setRevealed] = useState('')
  const [loading, setLoading] = useState(false)
  const [newValue, setNewValue] = useState('')

  const label       = isForeigner ? 'เลขหนังสือเดินทาง (Passport)' : 'เลขบัตรประชาชน'
  const placeholder = isForeigner ? 'A12345678' : '1234567890123'
  const hint        = isForeigner
    ? 'ตัวอักษรและตัวเลข 2-20 ตัว — เข้ารหัสก่อนบันทึก'
    : '13 หลัก — เข้ารหัสก่อนบันทึก' + (required ? ' · ใช้เป็นตัวระบุหลัก ห้ามซ้ำ' : '')
  const maxLen = isForeigner ? 20 : 13

  function cleanValue(raw) {
    return isForeigner
      ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
      : raw.replace(/\D/g, '').slice(0, 13)
  }

  function handleValueChange(e) {
    const v = cleanValue(e.target.value)
    setNewValue(v)
    onChange?.(v)
  }

  function handleForeignerToggle(checked) {
    setNewValue('')
    onChange?.('')
    onForeignerChange?.(checked)
  }

  async function handleReveal() {
    if (revealed) { setMode('revealed'); return }
    setLoading(true)
    const { data, error } = await supabase.rpc('decrypt_tenant_id_card', { p_tenant_id: tenantId })
    setLoading(false)
    if (error) { alert('ไม่สามารถถอดรหัสได้: ' + error.message); return }
    if (!data) { alert('ไม่พบข้อมูล'); return }
    setRevealed(data)
    setMode('revealed')
  }

  const inputCls = 'h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const foreignerToggle = onForeignerChange && (
    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={isForeigner}
        onChange={e => handleForeignerToggle(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
      />
      ผู้เช่าต่างชาติ (ใช้ Passport)
    </label>
  )

  // New tenant — simple input
  if (!tenantId || !hasEncrypted) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            {label}
            {required && <span className="ml-1 text-red-500">*</span>}
          </label>
          {foreignerToggle}
        </div>
        <input
          type="text"
          inputMode={isForeigner ? 'text' : 'numeric'}
          maxLength={maxLen}
          value={newValue}
          onChange={handleValueChange}
          placeholder={placeholder}
          className={inputCls}
        />
        <p className="text-xs text-gray-400">{hint}</p>
      </div>
    )
  }

  // Existing tenant — edit mode
  if (mode === 'edit') {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">{label} (ใหม่)</label>
          {foreignerToggle}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode={isForeigner ? 'text' : 'numeric'}
            maxLength={maxLen}
            value={newValue}
            onChange={handleValueChange}
            placeholder={placeholder}
            autoFocus
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={() => { setMode('display'); setNewValue(''); onChange?.('') }}
            className="rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
        </div>
        <p className="text-xs text-gray-400">{hint}</p>
      </div>
    )
  }

  // Existing tenant — display / revealed
  const mask = isForeigner ? `●●●●●●●●-${last4 ?? '????'}` : `****-****-****-${last4 ?? '????'}`
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex h-9 flex-1 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-mono text-gray-700">
          {mode === 'revealed' ? revealed : mask}
        </div>
        <button
          type="button"
          onClick={mode === 'revealed' ? () => setMode('display') : handleReveal}
          disabled={loading}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <span className="text-xs">กำลังโหลด...</span>
            : mode === 'revealed' ? <><EyeOff className="h-3.5 w-3.5" /> ซ่อน</>
            : <><Eye className="h-3.5 w-3.5" /> แสดง</>}
        </button>
        <button
          type="button"
          onClick={() => { setMode('edit'); setNewValue(''); onChange?.('') }}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
        >
          <Pencil className="h-3.5 w-3.5" /> เปลี่ยน
        </button>
      </div>
    </div>
  )
}
