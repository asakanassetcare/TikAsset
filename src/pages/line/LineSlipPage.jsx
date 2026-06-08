import { useEffect, useState, useRef } from 'react'
import liff from '@line/liff'
import { supabase } from '../../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function callFunction(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const LIFF_ID = '2010168327-yibY4xtl'

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function thaiMonth(str) {
  if (!str) return ''
  const [y, m] = str.split('-')
  return `${MONTHS_TH[parseInt(m) - 1]} ${parseInt(y) + 543}`
}

export default function LineSlipPage() {
  const [step,      setStep]      = useState('loading')
  const [tenant,    setTenant]    = useState(null)
  const [invoices,  setInvoices]  = useState([])
  const [invoiceId, setInvoiceId] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [preview,   setPreview]   = useState(null)
  const [note,      setNote]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [errMsg,    setErrMsg]    = useState('')
  const [profile,   setProfile]   = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    async function init() {
      try {
        await liff.init({ liffId: LIFF_ID })
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href })
          return
        }
        const p = await liff.getProfile()
        setProfile(p)

        const initData = await callFunction('dynamic-endpoint', { userId: p.userId, action: 'init' })
        setTenant(initData.tenants[0])
        const list = initData.invoices ?? []
        setInvoices(list)
        if (list.length === 1) setInvoiceId(list[0].id)
        setStep('form')
      } catch (e) {
        console.error('LIFF error:', e, 'code:', e.code, 'msg:', e.message)
        const msg = [e.code, e.message, e.toString()].filter(Boolean).join(' | ') || 'unknown'
        setErrMsg(msg)
        setStep('error')
      }
    }
    init()
  }, [])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!imageFile) { setErrMsg('กรุณาแนบรูปสลิป'); return }
    setLoading(true)
    setErrMsg('')

    const imageBase64 = await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = ev => resolve(ev.target.result)
      reader.readAsDataURL(imageFile)
    })

    try {
      await callFunction('dynamic-endpoint', {
        userId:      profile.userId,
        invoiceId:   invoiceId || null,
        note:        note.trim() || null,
        imageBase64,
        imageType:   imageFile.type,
      })
    } catch (err) {
      setLoading(false)
      setErrMsg('บันทึกไม่สำเร็จ: ' + err.message)
      return
    }
    setLoading(false)
    setStep('success')
  }

  if (step === 'loading') return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
        <p className="text-sm text-gray-500">กำลังโหลด...</p>
      </div>
    </div>
  )

  if (step === 'error') return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="font-semibold text-gray-800">เกิดข้อผิดพลาด</p>
        <p className="mt-1 text-sm text-gray-500">{errMsg}</p>
        <p className="mt-3 text-xs text-gray-400">กรุณาเปิดลิงก์นี้ผ่านแอป LINE เท่านั้น</p>
      </div>
    </div>
  )

  if (step === 'not_registered') return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="text-center">
        <p className="text-5xl mb-4">🔗</p>
        <p className="text-lg font-semibold text-gray-800">กรุณาลงทะเบียนก่อน</p>
        <p className="mt-2 text-sm text-gray-500">คุณยังไม่ได้ผูก LINE กับบัญชีผู้เช่า</p>
        <p className="mt-1 text-xs text-gray-400">กรุณากดปุ่ม "ลงทะเบียน" ในเมนูก่อนนะครับ</p>
        {profile?.userId && (
          <p className="mt-4 rounded bg-gray-100 px-3 py-1.5 text-[10px] text-gray-400 break-all">
            LINE ID: {profile.userId}
          </p>
        )}
      </div>
    </div>
  )

  if (step === 'success') return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="text-center">
        <p className="text-5xl mb-4">✅</p>
        <p className="text-lg font-semibold text-gray-800">ส่งสลิปสำเร็จ!</p>
        <p className="mt-2 text-sm text-gray-500">ได้รับสลิปของคุณแล้วครับ</p>
        <p className="mt-1 text-xs text-gray-400">เจ้าหน้าที่จะตรวจสอบและยืนยันภายในไม่เกิน 1 ชั่วโมง</p>
        <button
          onClick={() => liff.closeWindow()}
          className="mt-6 h-11 w-full rounded-xl bg-[#06C755] text-sm font-semibold text-white"
        >
          ปิดหน้าต่าง
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white px-4 py-5 text-center shadow-sm">
        {profile?.pictureUrl && (
          <img src={profile.pictureUrl} alt="" className="mx-auto mb-2 h-12 w-12 rounded-full" />
        )}
        <p className="text-base font-semibold text-gray-800">สวัสดี, {tenant?.full_name}</p>
        <p className="mt-0.5 text-sm text-gray-500">ส่งสลิปโอนเงินค่าเช่า</p>
      </div>

      <div className="mx-auto max-w-sm px-4 pt-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">

          {/* Invoice select */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-gray-700">ใบแจ้งหนี้</label>
            {invoices.length === 0 ? (
              <p className="text-sm text-gray-400">ไม่มีใบแจ้งหนี้ค้างชำระ</p>
            ) : (
              <select
                value={invoiceId}
                onChange={e => setInvoiceId(e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">-- เลือกใบแจ้งหนี้ (ถ้ามี) --</option>
                {invoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.rooms?.room_number ? `ห้อง ${inv.rooms.room_number} · ` : ''}
                    {inv.invoice_number}
                    {inv.billing_period ? ` · ${thaiMonth(inv.billing_period)}` : ''}
                    {` · ฿${Number(inv.total_amount).toLocaleString('th-TH')}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Image upload */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              รูปสลิปโอนเงิน <span className="text-red-500">*</span>
            </label>
            {preview ? (
              <div className="relative">
                <img src={preview} alt="slip" className="w-full rounded-lg object-contain max-h-64" />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="absolute top-2 right-2 rounded-full bg-white px-2 py-0.5 text-xs shadow text-gray-600"
                >
                  เปลี่ยน
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400"
              >
                <span className="text-3xl">📷</span>
                <span className="text-sm">แตะเพื่อเลือกรูปสลิป</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Note */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-gray-700">หมายเหตุ (ถ้ามี)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="เช่น โอนรวม 2 เดือน"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>

          {errMsg && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-xl bg-[#06C755] text-base font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'กำลังส่ง...' : 'ส่งสลิป'}
          </button>
        </form>
      </div>
    </div>
  )
}
