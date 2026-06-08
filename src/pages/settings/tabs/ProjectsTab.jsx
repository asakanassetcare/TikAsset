import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, ChevronRight, Pencil, PowerOff, Power, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import Input from '../../../components/ui/Input'
import Textarea from '../../../components/ui/Textarea'
import EmptyState from '../../../components/ui/EmptyState'

const EMPTY_FORM = { name: '', address: '', note: '', is_active: true }

export default function ProjectsTab() {
  const navigate = useNavigate()
  const [projects,     setProjects]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [actionError,  setActionError]  = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchProjects() }, [])

  async function fetchProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*, buildings(id, name, total_rentable_rooms, rooms(id, status))')
      .order('name')
    if (data) setProjects(data)
    setLoading(false)
  }

  function hasOccupied(project) {
    return (project.buildings ?? []).some(b =>
      (b.rooms ?? []).some(r => r.status === 'occupied' || r.status === 'reserved')
    )
  }

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true)
  }

  function openEdit(e, project) {
    e.stopPropagation()
    setEditing(project)
    setForm({ name: project.name, address: project.address ?? '', note: project.note ?? '', is_active: project.is_active ?? true })
    setError(''); setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault(); setError('')
    if (editing && !form.is_active && hasOccupied(editing)) {
      setError('ไม่สามารถปิดโครงการได้ เนื่องจากยังมีผู้เช่าอยู่ในโครงการนี้')
      return
    }
    setSaving(true)
    const payload = {
      name:      form.name.trim(),
      address:   form.address.trim() || null,
      note:      form.note.trim()    || null,
      is_active: form.is_active,
    }
    const { error } = editing
      ? await supabase.from('projects').update(payload).eq('id', editing.id)
      : await supabase.from('projects').insert(payload)
    setSaving(false)
    if (error) { setError(error.message); return }
    setModalOpen(false); fetchProjects()
  }

  async function handleToggle(e, project) {
    e.stopPropagation()
    setActionError('')
    if (project.is_active && hasOccupied(project)) {
      setActionError(`ไม่สามารถปิดโครงการ "${project.name}" เนื่องจากยังมีผู้เช่าอยู่`)
      return
    }
    await supabase.from('projects').update({ is_active: !project.is_active }).eq('id', project.id)
    fetchProjects()
  }

  async function handleDelete(e, project) {
    e.stopPropagation()
    setActionError('')
    if ((project.buildings ?? []).length > 0) {
      setActionError(`ไม่สามารถลบโครงการ "${project.name}" เนื่องจากยังมีอาคารอยู่ — ลบอาคารทั้งหมดก่อน`)
      return
    }
    setConfirmDelete(project)
  }

  async function confirmDoDelete() {
    const { error } = await supabase.from('projects').delete().eq('id', confirmDelete.id)
    setConfirmDelete(null)
    if (error) { setActionError(error.message); return }
    fetchProjects()
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-gray-500">จัดการโครงการทั้งหมด</p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>เพิ่มโครงการ</Button>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
          <button onClick={() => setActionError('')} className="ml-3 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Building2} title="ยังไม่มีโครงการ" description="เพิ่มโครงการแรกเพื่อเริ่มต้น"
          action={<Button size="sm" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>เพิ่มโครงการ</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => {
            const buildingCount = p.buildings?.length ?? 0
            const roomCount = p.buildings?.reduce((s, b) => s + (b.total_rentable_rooms ?? 0), 0) ?? 0
            const inactive = !p.is_active
            return (
              <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className={`group cursor-pointer rounded-xl border bg-white p-5 shadow-sm transition-all ${
                  inactive ? 'border-gray-200 opacity-60 hover:opacity-80' : 'border-gray-100 hover:border-blue-200 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${inactive ? 'bg-gray-100' : 'bg-blue-50'}`}>
                      <Building2 className={`h-5 w-5 ${inactive ? 'text-gray-400' : 'text-blue-600'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold transition-colors ${inactive ? 'text-gray-400' : 'text-gray-900 group-hover:text-blue-700'}`}>{p.name}</p>
                        {inactive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400">ปิดใช้งาน</span>}
                      </div>
                      {p.address && <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{p.address}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={e => openEdit(e, p)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title="แก้ไข">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={e => handleToggle(e, p)}
                      className={`rounded-lg p-1.5 hover:bg-gray-100 ${inactive ? 'text-green-500 hover:text-green-600' : 'text-gray-400 hover:text-amber-500'}`}
                      title={inactive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}>
                      {inactive ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={e => handleDelete(e, p)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      title="ลบโครงการ">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-400 transition-colors" />
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-sm text-gray-500">
                  <span>{buildingCount} อาคาร</span>
                  <span>{roomCount} ห้อง</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit / Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? 'แก้ไขโครงการ' : 'เพิ่มโครงการ'} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>ยกเลิก</Button>
            <Button form="project-form" type="submit" loading={saving}>บันทึก</Button>
          </>
        }
      >
        <form id="project-form" onSubmit={handleSave} className="flex flex-col gap-4">
          <Input label="ชื่อโครงการ" required value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="คอนโด..." />
          <Input label="ที่อยู่" value={form.address}
            onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="123 ถ.สุขุมวิท..." />
          <Textarea label="หมายเหตุ" rows={2} value={form.note}
            onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
          {editing && (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-700">สถานะโครงการ</p>
                <p className="text-xs text-gray-400">{form.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</p>
              </div>
              <button type="button"
                onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>}
        </form>
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        title="ยืนยันลบโครงการ" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>ยกเลิก</Button>
            <Button variant="danger" onClick={confirmDoDelete}>ลบโครงการ</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          ต้องการลบโครงการ <span className="font-semibold text-gray-900">"{confirmDelete?.name}"</span> ใช่หรือไม่?
        </p>
        <p className="mt-1.5 text-xs text-gray-400">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
      </Modal>
    </div>
  )
}
