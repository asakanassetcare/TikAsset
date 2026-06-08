import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import Input from '../../../components/ui/Input'
import Textarea from '../../../components/ui/Textarea'
import EmptyState from '../../../components/ui/EmptyState'

const EMPTY = { name: '', description: '', default_size_sqm: '' }

export default function RoomTypesTab() {
  const [roomTypes, setRoomTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { fetchTypes() }, [])

  async function fetchTypes() {
    const { data } = await supabase.from('room_types').select('*').order('name')
    if (data) setRoomTypes(data)
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setError('')
    setModalOpen(true)
  }

  function openEdit(rt) {
    setEditing(rt)
    setForm({ name: rt.name, description: rt.description ?? '', default_size_sqm: String(rt.default_size_sqm ?? '') })
    setError('')
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      default_size_sqm: form.default_size_sqm ? Number(form.default_size_sqm) : null,
    }
    const { error } = editing
      ? await supabase.from('room_types').update(payload).eq('id', editing.id)
      : await supabase.from('room_types').insert(payload)
    setSaving(false)
    if (error) { setError(error.message); return }
    setModalOpen(false)
    fetchTypes()
  }

  async function handleDelete(id) {
    setDeleting(id)
    const { error } = await supabase.from('room_types').delete().eq('id', id)
    setDeleting(null)
    if (error) { alert('ลบไม่ได้: ประเภทนี้มีห้องใช้งานอยู่'); return }
    fetchTypes()
  }

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">ประเภทห้องที่ใช้ในระบบ</p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>เพิ่มประเภท</Button>
      </div>

      {roomTypes.length === 0 ? (
        <EmptyState title="ยังไม่มีประเภทห้อง" action={<Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>เพิ่มประเภท</Button>} />
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          {roomTypes.map((rt, i) => (
            <div key={rt.id} className={`flex items-center justify-between px-4 py-3 ${i < roomTypes.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div>
                <p className="text-sm font-medium text-gray-900">{rt.name}</p>
                <p className="text-xs text-gray-400">
                  {rt.description ?? ''}
                  {rt.default_size_sqm ? ` · ${rt.default_size_sqm} ม²` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(rt)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(rt.id)}
                  disabled={deleting === rt.id}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไขประเภทห้อง' : 'เพิ่มประเภทห้อง'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>ยกเลิก</Button>
            <Button form="room-type-form" type="submit" loading={saving}>บันทึก</Button>
          </>
        }
      >
        <form id="room-type-form" onSubmit={handleSave} className="flex flex-col gap-4">
          <Input label="ชื่อประเภท" required value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Studio, 1BR, 2BR..." />
          <Input label="ขนาดเริ่มต้น (ม²)" type="number" step="0.01" value={form.default_size_sqm} onChange={(e) => setForm(p => ({ ...p, default_size_sqm: e.target.value }))} placeholder="28" />
          <Textarea label="คำอธิบาย" rows={2} value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
          {error && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}
        </form>
      </Modal>
    </div>
  )
}
