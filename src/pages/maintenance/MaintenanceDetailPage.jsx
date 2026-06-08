import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { CalendarDays, ChevronRight, Upload, CheckCircle, PlayCircle, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDate, formatThaiDateTime } from '../../lib/date'

export default function MaintenanceDetailPage() {
  const { maintenanceId } = useParams()
  const navigate = useNavigate()
  const { profile, role } = useAuth()

  const [item, setItem] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  const [actionLoading, setActionLoading] = useState(null)
  const [actionErr, setActionErr] = useState('')

  const [completeModal, setCompleteModal] = useState(false)
  const [completeForm, setCompleteForm] = useState({
    cost: '',
    vendor_name: '',
    note: '',
    cost_owner: 'company',
    payment_method: 'paid_already',
  })
  const [completing, setCompleting] = useState(false)
  const [completeErr, setCompleteErr] = useState('')

  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelErr, setCancelErr] = useState('')

  const [scheduleModal, setScheduleModal] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ preferred_start_date: '', preferred_due_date: '' })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleErr, setScheduleErr] = useState('')

  const [contactModal, setContactModal] = useState(false)
  const [contactForm, setContactForm] = useState({ contact_name: '', contact_phone: '', service_note: '' })
  const [contactSaving, setContactSaving] = useState(false)
  const [contactErr, setContactErr] = useState('')

  const [photoFile, setPhotoFile] = useState(null)
  const [photoPhase, setPhotoPhase] = useState('maintenance_before')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoErr, setPhotoErr] = useState('')

  useEffect(() => {
    fetchAll()
  }, [maintenanceId])

  async function fetchAll() {
    setLoadErr('')
    const [{ data: mData, error: mError }, { data: docData, error: docError }] = await Promise.all([
      supabase.from('maintenance_requests').select(`
        *,
        buildings(name),
        rooms(room_number),
        reporter:profiles!maintenance_requests_reported_by_fkey(full_name),
        completer:profiles!maintenance_requests_completed_by_fkey(full_name)
      `).eq('id', maintenanceId).single(),
      supabase.from('documents').select('*')
        .eq('ref_table', 'maintenance_requests')
        .eq('ref_id', maintenanceId)
        .order('created_at'),
    ])

    if (mError) {
      setLoadErr(mError.message)
      setLoading(false)
      return
    }
    if (!mData) {
      navigate('/maintenance')
      return
    }

    const docsWithUrls = await Promise.all((docData ?? []).map(async doc => {
      if (!doc.file_url) return doc
      const { data } = await supabase.storage.from('maintenance-photos').createSignedUrl(doc.file_url, 3600)
      return { ...doc, signedUrl: data?.signedUrl ?? null }
    }))

    setItem(mData)
    setPhotos(docsWithUrls)
    if (docError) setLoadErr(docError.message)
    setLoading(false)
  }

  async function handleStart() {
    setActionLoading('start')
    setActionErr('')
    const { error } = await supabase.from('maintenance_requests').update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
    }).eq('id', maintenanceId)
    setActionLoading(null)
    if (error) {
      setActionErr(error.message)
      return
    }
    fetchAll()
  }

  async function handleComplete(e) {
    e.preventDefault()
    setCompleting(true)
    setCompleteErr('')

    const { error } = await supabase.from('maintenance_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: profile.id,
      cost: completeForm.cost !== '' ? Number(completeForm.cost) : null,
      vendor_name: completeForm.vendor_name.trim() || null,
      service_note: completeForm.note.trim() || item.service_note || null,
    }).eq('id', maintenanceId)
    if (error) {
      setCompleteErr(error.message)
      setCompleting(false)
      return
    }

    if (completeForm.cost_owner === 'customer' && completeForm.cost !== '' && Number(completeForm.cost) > 0) {
      if (completeForm.payment_method === 'pay_with_rent') {
        if (!item.room_id) {
          setCompleteErr('ไม่พบข้อมูลห้อง ไม่สามารถเพิ่มในบิลได้')
          setCompleting(false)
          return
        }
        const { data: contract } = await supabase.from('contracts')
          .select('id')
          .eq('room_id', item.room_id)
          .eq('status', 'active')
          .maybeSingle()
        if (!contract) {
          setCompleteErr('ไม่พบสัญญาที่ active สำหรับห้องนี้ ไม่สามารถเพิ่มในบิลได้')
          setCompleting(false)
          return
        }
        const { error: addonErr } = await supabase.from('contract_addons').insert({
          contract_id: contract.id,
          name: item.maintenance_number,
          amount: Number(completeForm.cost),
          billing_cycle: 'one_time',
          is_active: true,
        })
        if (addonErr) {
          setCompleteErr(addonErr.message)
          setCompleting(false)
          return
        }
      } else {
        const { error: receiptErr } = await supabase.from('receipts').insert({
          amount: Number(completeForm.cost),
          description: `ค่าซ่อม: ${item.title}`,
          payer_name: item.contact_name || null,
          ref_table: 'maintenance_requests',
          ref_id: maintenanceId,
          building_id: item.building_id || null,
          issued_by: profile.id,
        })
        if (receiptErr) {
          setCompleteErr(receiptErr.message)
          setCompleting(false)
          return
        }
      }
    }

    setCompleting(false)
    setCompleteModal(false)
    fetchAll()
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      setCancelErr('กรุณากรอกเหตุผล')
      return
    }
    setCancelling(true)
    const { error } = await supabase.from('maintenance_requests').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: cancelReason.trim(),
    }).eq('id', maintenanceId)
    setCancelling(false)
    if (error) {
      setCancelErr(error.message)
      return
    }
    setCancelModal(false)
    fetchAll()
  }

  function openScheduleModal() {
    setScheduleForm({
      preferred_start_date: item.preferred_start_date ?? '',
      preferred_due_date: item.preferred_due_date ?? '',
    })
    setScheduleErr('')
    setScheduleModal(true)
  }

  async function handleScheduleUpdate(e) {
    e.preventDefault()
    setScheduleSaving(true)
    const { error } = await supabase.from('maintenance_requests').update({
      preferred_start_date: scheduleForm.preferred_start_date || null,
      preferred_due_date: scheduleForm.preferred_due_date || null,
    }).eq('id', maintenanceId)
    setScheduleSaving(false)
    if (error) {
      setScheduleErr(error.message)
      return
    }
    setScheduleModal(false)
    fetchAll()
  }

  function openContactModal() {
    setContactForm({
      contact_name: item.contact_name ?? '',
      contact_phone: item.contact_phone ?? '',
      service_note: item.service_note ?? '',
    })
    setContactErr('')
    setContactModal(true)
  }

  async function handleContactUpdate(e) {
    e.preventDefault()
    setContactSaving(true)
    const { error } = await supabase.from('maintenance_requests').update({
      contact_name: contactForm.contact_name.trim() || null,
      contact_phone: contactForm.contact_phone.trim() || null,
      service_note: contactForm.service_note.trim() || null,
    }).eq('id', maintenanceId)
    setContactSaving(false)
    if (error) {
      setContactErr(error.message)
      return
    }
    setContactModal(false)
    fetchAll()
  }

  async function handlePhotoUpload() {
    if (!photoFile) return
    setUploadingPhoto(true)
    setPhotoErr('')
    const ext = photoFile.name.split('.').pop()
    const path = `maintenance/${maintenanceId}/${photoPhase}_${Date.now()}.${ext}`
    const { data: sd, error: se } = await supabase.storage.from('maintenance-photos').upload(path, photoFile)
    if (se) {
      setUploadingPhoto(false)
      setPhotoErr('อัปโหลดไม่สำเร็จ')
      return
    }
    const { error } = await supabase.from('documents').insert({
      ref_table: 'maintenance_requests',
      ref_id: maintenanceId,
      doc_type: photoPhase === 'maintenance_before' ? 'maintenance_before' : 'maintenance_after',
      file_url: sd.path,
      file_name: photoFile.name,
      file_size_bytes: photoFile.size,
      mime_type: photoFile.type,
      uploaded_by: profile.id,
    })
    setUploadingPhoto(false)
    if (error) {
      setPhotoErr(error.message)
      return
    }
    setPhotoFile(null)
    fetchAll()
  }

  if (loading) return <PageSpinner />
  if (loadErr && !item) {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
        ไม่สามารถโหลดรายละเอียดแจ้งซ่อมได้: {loadErr}
      </div>
    )
  }

  const canManageMaintenance = ['super_admin', 'head_staff', 'staff', 'service'].includes(role)
  const canStart = canManageMaintenance && item.status === 'reported'
  const canComplete = canManageMaintenance && item.status === 'in_progress'
  const canCancel = canManageMaintenance && ['reported', 'in_progress'].includes(item.status)
  const canAddPhoto = canManageMaintenance && ['reported', 'in_progress', 'completed'].includes(item.status)

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/maintenance" className="hover:text-blue-600">แจ้งซ่อม</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{item.maintenance_number}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{item.maintenance_number}</h1>
            <Badge variant={item.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">{item.title}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canStart && (
            <Button icon={<PlayCircle className="h-4 w-4" />} loading={actionLoading === 'start'} onClick={handleStart}>
              เริ่มดำเนินการ
            </Button>
          )}
          {canComplete && (
            <Button
              icon={<CheckCircle className="h-4 w-4" />}
              onClick={() => {
                setCompleteForm({
                  cost: '',
                  vendor_name: '',
                  note: item.service_note ?? '',
                  cost_owner: 'company',
                  payment_method: 'paid_already',
                })
                setCompleteErr('')
                setCompleteModal(true)
              }}
            >
              บันทึกเสร็จ
            </Button>
          )}
          {canCancel && (
            <Button
              variant="danger"
              icon={<XCircle className="h-4 w-4" />}
              onClick={() => {
                setCancelReason('')
                setCancelErr('')
                setCancelModal(true)
              }}
            >
              ยกเลิก
            </Button>
          )}
          {actionErr && <p className="text-sm text-red-600">{actionErr}</p>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 max-w-4xl">
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">สถานที่</p>
          <p className="text-sm font-semibold text-gray-900">
            {item.buildings?.name ?? 'ไม่ระบุอาคาร'}
            {item.rooms?.room_number ? ` · ห้อง ${item.rooms.room_number}` : ''}
          </p>
          {item.area_description && <p className="text-xs text-gray-500">{item.area_description}</p>}
        </Card>

        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">แจ้งโดย</p>
          <p className="text-sm font-semibold text-gray-900">{item.reporter?.full_name ?? '—'}</p>
          <p className="text-xs text-gray-400">{formatThaiDateTime(item.reported_at)}</p>
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">ข้อมูลติดต่อ</p>
            {canManageMaintenance && (
              <button type="button" onClick={openContactModal} className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                แก้ไข
              </button>
            )}
          </div>
          <div className="space-y-1.5 text-sm">
            <div>
              <p className="text-xs text-gray-400">ชื่อผู้ติดต่อ</p>
              <p className="font-medium text-gray-900">{item.contact_name || 'ยังไม่ระบุ'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">เบอร์ติดต่อ</p>
              <p className="font-medium text-gray-900">{item.contact_phone || 'ยังไม่ระบุ'}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">วันที่ลูกค้าต้องการ</p>
            {canManageMaintenance && (
              <button type="button" onClick={openScheduleModal} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                <CalendarDays className="h-3.5 w-3.5" />
                แก้ไข
              </button>
            )}
          </div>
          <div className="space-y-1.5 text-sm">
            <div>
              <p className="text-xs text-gray-400">วันที่อยากเข้าดำเนินการ</p>
              <p className="font-medium text-gray-900">{item.preferred_start_date ? formatThaiDate(item.preferred_start_date) : 'ยังไม่ระบุ'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">วันที่ต้องการให้เสร็จ</p>
              <p className="font-medium text-gray-900">{item.preferred_due_date ? formatThaiDate(item.preferred_due_date) : 'ยังไม่ระบุ'}</p>
            </div>
          </div>
        </Card>

        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">ไทม์ไลน์</p>
          <div className="space-y-1.5 text-sm">
            {item.started_at && <div><p className="text-xs text-gray-400">เริ่มดำเนินการ</p><p className="font-medium">{formatThaiDate(item.started_at)}</p></div>}
            {item.completed_at && <div><p className="text-xs text-gray-400">เสร็จสิ้น</p><p className="font-medium">{formatThaiDate(item.completed_at)}</p></div>}
            {item.cancelled_at && <div><p className="text-xs text-gray-400">ยกเลิก</p><p className="font-medium">{formatThaiDate(item.cancelled_at)}</p></div>}
          </div>
        </Card>

        <Card className="min-h-[150px] lg:row-span-2 lg:min-h-[320px]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">หมายเหตุฝ่ายซ่อม</p>
            {canManageMaintenance && (
              <button type="button" onClick={openContactModal} className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                แก้ไข
              </button>
            )}
          </div>
          <p className={`whitespace-pre-wrap text-sm ${item.service_note ? 'text-gray-700' : 'text-gray-400'}`}>
            {item.service_note || 'ยังไม่มีหมายเหตุฝ่ายซ่อม'}
          </p>
        </Card>

        {item.description && (
          <Card className="lg:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">รายละเอียด</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.description}</p>
          </Card>
        )}

        {item.status === 'completed' && (
          <Card>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">ผลการซ่อม</p>
            <div className="space-y-1.5 text-sm">
              {item.cost != null && <div><p className="text-xs text-gray-400">ค่าใช้จ่าย</p><p className="font-semibold">฿{Number(item.cost).toLocaleString('th-TH')}</p></div>}
              {item.vendor_name && <div><p className="text-xs text-gray-400">ช่าง/ผู้รับเหมา</p><p className="font-medium">{item.vendor_name}</p></div>}
              {item.completer?.full_name && <div><p className="text-xs text-gray-400">ปิดโดย</p><p className="font-medium">{item.completer.full_name}</p></div>}
            </div>
          </Card>
        )}

        {item.status === 'cancelled' && item.cancellation_reason && (
          <Card className="border-red-100 bg-red-50">
            <p className="mb-1 text-xs font-semibold text-red-500">เหตุผลยกเลิก</p>
            <p className="text-sm text-red-800">{item.cancellation_reason}</p>
          </Card>
        )}

        <Card className="lg:col-span-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">รูปภาพ</p>

          {canAddPhoto && (
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="flex gap-2">
                {['maintenance_before', 'maintenance_after'].map(ph => (
                  <button
                    key={ph}
                    type="button"
                    onClick={() => setPhotoPhase(ph)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${photoPhase === ph ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {ph === 'maintenance_before' ? 'ก่อนซ่อม' : 'หลังซ่อม'}
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 hover:border-blue-400 transition-colors">
                <Upload className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">{photoFile ? photoFile.name : 'เลือกรูป'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
              </label>
              {photoFile && <Button size="sm" loading={uploadingPhoto} onClick={handlePhotoUpload}>อัปโหลด</Button>}
              {photoErr && <p className="text-xs text-red-600">{photoErr}</p>}
            </div>
          )}

          {photos.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">ยังไม่มีรูปภาพ</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map(doc => (
                <button
                  key={doc.id}
                  onClick={async () => {
                    if (doc.signedUrl) {
                      window.open(doc.signedUrl, '_blank')
                      return
                    }
                    const { data } = await supabase.storage.from('maintenance-photos').createSignedUrl(doc.file_url, 3600)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-gray-100 bg-gray-50 hover:border-blue-300"
                >
                  {doc.signedUrl ? (
                    <>
                      <img src={doc.signedUrl} alt={doc.file_name || 'maintenance photo'} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
                        {doc.doc_type === 'maintenance_before' ? 'ก่อนซ่อม' : 'หลังซ่อม'}
                      </span>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400 group-hover:text-blue-500 px-2 text-center">
                      {doc.doc_type === 'maintenance_before' ? 'ก่อนซ่อม' : 'หลังซ่อม'}
                      <br />{doc.file_name}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={contactModal}
        onClose={() => setContactModal(false)}
        title="ข้อมูลติดต่อและหมายเหตุฝ่ายซ่อม"
        footer={
          <>
            <Button variant="secondary" onClick={() => setContactModal(false)}>ปิด</Button>
            <Button form="contact-form" type="submit" loading={contactSaving}>บันทึก</Button>
          </>
        }
      >
        <form id="contact-form" onSubmit={handleContactUpdate} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="ชื่อผู้ติดต่อ" value={contactForm.contact_name} onChange={e => setContactForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="คนที่ช่างควรโทรหา" />
            <Input label="เบอร์ติดต่อ" phone value={contactForm.contact_phone} onChange={e => setContactForm(p => ({ ...p, contact_phone: e.target.value }))} placeholder="เบอร์สำหรับนัดเข้าซ่อม" />
          </div>
          <Textarea
            label="หมายเหตุฝ่ายซ่อม"
            rows={3}
            value={contactForm.service_note}
            onChange={e => setContactForm(p => ({ ...p, service_note: e.target.value }))}
            placeholder="เช่น โทรแล้วนัดใหม่, ลูกค้าสะดวกหลัง 18:00"
          />
          {contactErr && <p className="text-sm text-red-600">{contactErr}</p>}
        </form>
      </Modal>

      <Modal
        open={scheduleModal}
        onClose={() => setScheduleModal(false)}
        title="แก้ไขวันที่ลูกค้าต้องการ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduleModal(false)}>ปิด</Button>
            <Button form="schedule-form" type="submit" loading={scheduleSaving}>บันทึก</Button>
          </>
        }
      >
        <form id="schedule-form" onSubmit={handleScheduleUpdate} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">วันที่อยากเข้าดำเนินการ</label>
              <input
                type="date"
                value={scheduleForm.preferred_start_date}
                onChange={e => setScheduleForm(p => ({ ...p, preferred_start_date: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">วันที่ต้องการให้เสร็จ</label>
              <input
                type="date"
                value={scheduleForm.preferred_due_date}
                onChange={e => setScheduleForm(p => ({ ...p, preferred_due_date: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {scheduleErr && <p className="text-sm text-red-600">{scheduleErr}</p>}
        </form>
      </Modal>

      <Modal
        open={completeModal}
        onClose={() => setCompleteModal(false)}
        title="บันทึกการซ่อมเสร็จ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleteModal(false)}>ปิด</Button>
            <Button form="complete-form" type="submit" loading={completing}>บันทึก</Button>
          </>
        }
      >
        <form id="complete-form" onSubmit={handleComplete} className="flex flex-col gap-4">
          <Input label="ค่าใช้จ่าย (฿)" type="number" min={0} value={completeForm.cost} onChange={e => setCompleteForm(p => ({ ...p, cost: e.target.value }))} />
          <Input label="ช่าง / ผู้รับเหมา" value={completeForm.vendor_name} onChange={e => setCompleteForm(p => ({ ...p, vendor_name: e.target.value }))} />
          <Textarea label="หมายเหตุฝ่ายซ่อม" rows={2} value={completeForm.note} onChange={e => setCompleteForm(p => ({ ...p, note: e.target.value }))} />

          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600">ค่าใช้จ่ายเป็นของ</p>
            <div className="flex gap-2">
              {[
                { value: 'company', label: 'ของบริษัท' },
                { value: 'customer', label: 'ของลูกค้า' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCompleteForm(p => ({ ...p, cost_owner: opt.value }))}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${completeForm.cost_owner === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {completeForm.cost_owner === 'customer' && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-600">วิธีชำระ</p>
              <div className="flex gap-2">
                {[
                  { value: 'paid_already', label: 'ชำระแล้ว' },
                  { value: 'pay_with_rent', label: 'ชำระพร้อมค่าเช่า' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCompleteForm(p => ({ ...p, payment_method: opt.value }))}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${completeForm.payment_method === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {completeForm.payment_method === 'pay_with_rent' && (
                <p className="mt-1.5 text-xs text-blue-600">
                  จะเพิ่มเป็นรายการครั้งเดียวในบิลรอบถัดไปของห้องนี้โดยอัตโนมัติ
                </p>
              )}
            </div>
          )}

          {completeErr && <p className="text-sm text-red-600">{completeErr}</p>}
        </form>
      </Modal>

      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="ยกเลิกการแจ้งซ่อม"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelModal(false)}>ปิด</Button>
            <Button variant="danger" loading={cancelling} onClick={handleCancel}>ยืนยันยกเลิก</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea label="เหตุผล" required rows={3} value={cancelReason} onChange={e => { setCancelReason(e.target.value); setCancelErr('') }} />
          {cancelErr && <p className="text-sm text-red-600">{cancelErr}</p>}
        </div>
      </Modal>
    </div>
  )
}
