import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { FileDown, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function isDuplicateStorageError(err) {
  if (!err) return false
  const message = String(err.message ?? '').toLowerCase()
  return err.statusCode === '409' || message.includes('already exists') || message.includes('duplicate')
}

export default function PdfDownloadButton({
  document: doc,
  filename,
  label = 'PDF',
  size = 'sm',
  storageBucket,
  storagePath,
}) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      let blob = null

      if (storageBucket && storagePath) {
        const existing = await supabase.storage.from(storageBucket).download(storagePath)
        blob = existing.data ?? null

        if (!blob) {
          if (!doc) throw new Error('ไม่พบไฟล์ PDF ใน storage และไม่มีเอกสารสำหรับสร้างใหม่')
          const generated = await pdf(doc).toBlob()
          const { error: uploadErr } = await supabase.storage
            .from(storageBucket)
            .upload(storagePath, generated, { contentType: 'application/pdf', upsert: false })

          if (uploadErr && !isDuplicateStorageError(uploadErr)) throw uploadErr

          const stored = await supabase.storage.from(storageBucket).download(storagePath)
          if (stored.error || !stored.data) throw stored.error ?? new Error('ดาวน์โหลด PDF จาก storage ไม่สำเร็จ')
          blob = stored.data
        }
      } else {
        blob = await pdf(doc).toBlob()
      }

      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      alert('สร้าง PDF ไม่สำเร็จ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const sz = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 ${sz}`}
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <FileDown className="h-3.5 w-3.5" />
      }
      {label}
    </button>
  )
}
