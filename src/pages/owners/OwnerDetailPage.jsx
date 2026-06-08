import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import RoomCard from '../../components/rooms/RoomCard'
import DocumentUpload from '../../components/shared/DocumentUpload'
import { PageSpinner } from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { DoorOpen } from 'lucide-react'

const TABS = [
  { id: 'info',  label: 'ข้อมูล' },
  { id: 'rooms', label: 'ห้อง' },
  { id: 'docs',  label: 'เอกสาร' },
]

const EMPTY_FORM = { full_name: '', phone: '', line_id: '', email: '', bank_name: '', bank_account_number: '', bank_account_name: '', note: '' }

export default function OwnerDetailPage() {
  const { ownerId } = useParams()
  const navigate = useNavigate()
  const isNew = ownerId === 'new'

  const [owner, setOwner] = useState(null)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [tab, setTab] = useState('info')
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [savedId, setSavedId] = useState(null)

  useEffect(() => {
    if (!isNew) fetchOwner()
  }, [ownerId])

  async function fetchOwner() {
    const [{ data: o }, { data: rms }] = await Promise.all([
      supabase.from('owners').select('*').eq('id', ownerId).single(),
      supabase.from('rooms').select('*, room_types(name), owners(full_name)').eq('owner_id', ownerId),
    ])
    if (!o) { navigate('/owners'); return }
    setOwner(o)
    setRooms(rms ?? [])
    setForm({
      full_name: o.full_name, phone: o.phone ?? '', line_id: o.line_id ?? '',
      email: o.email ?? '', bank_name: o.bank_name ?? '',
      bank_account_number: o.bank_account_number ?? '',
      bank_account_name: o.bank_account_name ?? '', note: o.note ?? '',
    })
    setLoading(false)
  }

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); setSaved(false) }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      line_id: form.line_id.trim() || null,
      email: form.email.trim() || null,
      bank_name: form.bank_name.trim() || null,
      bank_account_number: form.bank_account_number.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
      note: form.note.trim() || null,
    }
    if (isNew) {
      const { data, error } = await supabase.from('owners').insert(payload).select().single()
      setSaving(false)
      if (error) { setError(error.message); return }
      navigate(`/owners/${data.id}`, { replace: true })
    } else {
      const { error } = await supabase.from('owners').update(payload).eq('id', ownerId)
      setSaving(false)
      if (error) { setError(error.message); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      fetchOwner()
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/owners" className="hover:text-blue-600">เจ้าของห้อง</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{isNew ? 'เพิ่มเจ้าของใหม่' : owner?.full_name}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{isNew ? 'เพิ่มเจ้าของห้อง' : owner?.full_name}</h1>
      </div>

      {/* Tabs (hide for new) */}
      {!isNew && (
        <div className="mb-6 flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'border-b-2 border-blue-600 text-blue-700 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
              {t.id === 'rooms' && rooms.length > 0 && (
                <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">{rooms.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab: Info */}
      {(tab === 'info' || isNew) && (
        <Card className="max-w-2xl">
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            <Input label="ชื่อ-นามสกุล" required value={form.full_name} onChange={e => set('full_name', e.target.value)} wrapperClass="col-span-2" />
            <Input label="เบอร์โทร" phone value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0810000000" />
            <Input label="Line ID" value={form.line_id} onChange={e => set('line_id', e.target.value)} placeholder="@lineid" />
            <Input label="อีเมล" type="email" value={form.email} onChange={e => set('email', e.target.value)} wrapperClass="col-span-2" />

            <div className="col-span-2">
              <p className="mb-3 text-sm font-medium text-gray-700">ข้อมูลธนาคาร</p>
              <div className="grid grid-cols-3 gap-3">
                <Input label="ธนาคาร" value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="กสิกรไทย" />
                <Input label="เลขบัญชี" value={form.bank_account_number} onChange={e => set('bank_account_number', e.target.value)} placeholder="000-0-00000-0" />
                <Input label="ชื่อบัญชี" value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} />
              </div>
            </div>

            <Textarea label="หมายเหตุ" rows={2} value={form.note} onChange={e => set('note', e.target.value)} wrapperClass="col-span-2" />

            {error && <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}

            <div className="col-span-2 flex items-center gap-3 border-t border-gray-100 pt-4">
              <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>บันทึก</Button>
              {saved && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
            </div>
          </form>
        </Card>
      )}

      {/* Tab: Rooms */}
      {tab === 'rooms' && (
        <div>
          {rooms.length === 0 ? (
            <EmptyState icon={DoorOpen} title="ยังไม่มีห้องที่เชื่อมกับเจ้าของนี้" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rooms.map(r => <RoomCard key={r.id} room={r} onClick={() => {}} />)}
            </div>
          )}
        </div>
      )}

      {/* Tab: Docs */}
      {tab === 'docs' && (
        <Card className="max-w-2xl">
          <DocumentUpload
            refTable="owners"
            refId={isNew ? 'new' : ownerId}
            bucket="owner-docs"
            allowedTypes={['owner_document', 'other']}
          />
        </Card>
      )}
    </div>
  )
}
