import { useEffect, useRef, useState, useCallback } from 'react'
import { Upload, FileText, Trash2, Eye, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { formatThaiDateTime } from '../../lib/date'

const DOC_TYPE_LABEL = {
  id_card_front:        'บัตร ปชช. ด้านหน้า',
  id_card_back:         'บัตร ปชช. ด้านหลัง',
  vehicle_registration: 'ทะเบียนรถ',
  owner_document:       'เอกสารเจ้าของห้อง',
  contract_pdf:         'สัญญาเช่า',
  contract_addendum:    'สัญญาเพิ่มเติม',
  payment_slip:         'สลิปชำระเงิน',
  maintenance_before:   'รูปก่อนซ่อม',
  maintenance_after:    'รูปหลังซ่อม',
  other:                'อื่นๆ',
}

export default function DocumentUpload({ refTable, refId, bucket, allowedTypes, readOnly = false }) {
  const { profile, role } = useAuth()
  const canDelete = ['head_staff', 'super_admin'].includes(role)
  const [docs,         setDocs]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [uploading,    setUploading]    = useState(false)
  const [selectedType, setSelectedType] = useState(allowedTypes?.[0] ?? 'other')
  const [dragOver,     setDragOver]     = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (refId && refId !== 'new') fetchDocs()
  }, [refId])

  async function fetchDocs() {
    const { data } = await supabase
      .from('documents').select('*')
      .eq('ref_table', refTable).eq('ref_id', refId)
      .order('created_at', { ascending: false })
    if (data) setDocs(data)
    setLoading(false)
  }

  async function uploadFile(file) {
    if (!file || !refId || refId === 'new') return
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `${refId}/${selectedType}_${Date.now()}.${ext}`
    const { data: sd, error: se } = await supabase.storage.from(bucket).upload(path, file, { upsert: false })
    if (se) { alert('อัปโหลดไม่สำเร็จ: ' + se.message); setUploading(false); return }
    await supabase.from('documents').insert({
      ref_table:       refTable,
      ref_id:          refId,
      doc_type:        selectedType,
      file_url:        sd.path,
      file_name:       file.name,
      file_size_bytes: file.size,
      mime_type:       file.type,
      uploaded_by:     profile.id,
    })
    setUploading(false)
    fetchDocs()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  // Drag-and-drop handlers
  const handleDragOver  = useCallback(e => { e.preventDefault(); setDragOver(true)  }, [])
  const handleDragLeave = useCallback(e => { e.preventDefault(); setDragOver(false) }, [])
  const handleDrop      = useCallback(e => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }, [selectedType, refId])

  async function openSignedUrl(filePath) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(doc) {
    if (!confirm(`ลบไฟล์ "${doc.file_name}" ?\n\nการลบไม่สามารถกู้คืนได้`)) return
    await supabase.storage.from(bucket).remove([doc.file_url])
    await supabase.from('documents').delete().eq('id', doc.id)
    fetchDocs()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Upload area */}
      {!readOnly && refId && refId !== 'new' && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors
            ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <p className="text-sm text-gray-500">กำลังอัปโหลด...</p>
            </div>
          ) : (
            <>
              <Upload className={`mx-auto mb-2 h-6 w-6 ${dragOver ? 'text-blue-500' : 'text-gray-300'}`} />
              <p className="text-sm font-medium text-gray-600">
                {dragOver ? 'วางไฟล์ที่นี่' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}
              </p>
              <p className="mt-1 text-xs text-gray-400">PNG, JPG, PDF — สูงสุด 10 MB</p>
              {allowedTypes && allowedTypes.length > 1 && (
                <div className="mt-3 flex justify-center" onClick={e => e.stopPropagation()}>
                  <select
                    value={selectedType}
                    onChange={e => setSelectedType(e.target.value)}
                    className="h-8 rounded-lg border border-gray-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {allowedTypes.map(t => <option key={t} value={t}>{DOC_TYPE_LABEL[t] ?? t}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {refId === 'new' && (
        <p className="text-sm text-gray-400 italic">บันทึกข้อมูลก่อนเพื่ออัปโหลดเอกสาร</p>
      )}

      {/* Document list */}
      {loading ? (
        <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
      ) : docs.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีเอกสาร</p>
      ) : (
        <div className="flex flex-col gap-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}</p>
                  <p className="text-xs text-gray-400">
                    {doc.file_name}
                    {doc.file_size_bytes ? ` · ${(doc.file_size_bytes / 1024).toFixed(0)} KB` : ''}
                    {` · ${formatThaiDateTime(doc.created_at)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openSignedUrl(doc.file_url)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors" title="เปิดดู">
                  <Eye className="h-4 w-4" />
                </button>
                {!readOnly && canDelete && (
                  <button onClick={() => handleDelete(doc)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="ลบ">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
