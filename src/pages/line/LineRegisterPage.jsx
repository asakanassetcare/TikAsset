import { useEffect, useState } from 'react'
import liff from '@line/liff'
import { supabase } from '../../lib/supabase'

const LIFF_ID = import.meta.env.VITE_LIFF_ID

export default function LineRegisterPage() {
  const [step,    setStep]    = useState('loading') // loading | form | success | error | already
  const [lineProfile, setLineProfile] = useState(null)
  const [phone,   setPhone]   = useState('')
  const [roomNo,  setRoomNo]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [errMsg,  setErrMsg]  = useState('')

  useEffect(() => {
    async function initLiff() {
      try {
        await liff.init({ liffId: LIFF_ID })
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href })
          return
        }
        const profile = await liff.getProfile()
        setLineProfile(profile)

        // เช็คว่าเคยลงทะเบียนแล้วหรือยัง
        const { data } = await supabase
          .from('tenants')
          .select('id')
          .eq('line_user_id', profile.userId)
          .maybeSingle()

        if (data) {
          setStep('already')
        } else {
          setStep('form')
        }
      } catch (e) {
        setErrMsg(e.message || 'เกิดข้อผิดพลาด')
        setStep('error')
      }
    }
    initLiff()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setErrMsg('')

    const normalized = phone.replace(/\D/g, '')
    const room = roomNo.trim()

    // หาสัญญา active ที่เบอร์และเลขห้องตรงกัน
    const { data: contract, error } = await supabase
      .from('contracts')
      .select('id, tenant_id, tenants!inner(id, full_name, line_user_id), rooms!inner(room_number)')
      .eq('status', 'active')
      .eq('tenants.phone', normalized)
      .eq('rooms.room_number', room)
      .maybeSingle()

    if (error || !contract || !contract.tenants) {
      setSaving(false)
      setErrMsg('ไม่พบข้อมูลผู้เช่าที่ตรงกับเบอร์และเลขห้องนี้ กรุณาติดต่อเจ้าหน้าที่')
      return
    }

    const tenant = contract.tenants

    if (tenant.line_user_id) {
      setSaving(false)
      setErrMsg('เบอร์นี้ผูก LINE แล้ว หากต้องการเปลี่ยนกรุณาติดต่อเจ้าหน้าที่')
      return
    }

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({ line_user_id: lineProfile.userId })
      .eq('id', tenant.id)

    setSaving(false)
    if (updateErr) {
      setErrMsg('บันทึกไม่สำเร็จ กรุณาลองใหม่')
      return
    }
    setStep('success')
  }

  if (step === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
          <p className="text-sm text-gray-500">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-semibold text-gray-800">เกิดข้อผิดพลาด</p>
          <p className="mt-1 text-sm text-gray-500">{errMsg}</p>
          <p className="mt-3 text-xs text-gray-400">กรุณาเปิดลิงก์นี้ผ่านแอป LINE เท่านั้น</p>
        </div>
      </div>
    )
  }

  if (step === 'already') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="text-center">
          <p className="text-5xl mb-4">✅</p>
          <p className="text-lg font-semibold text-gray-800">ลงทะเบียนแล้ว</p>
          <p className="mt-2 text-sm text-gray-500">บัญชี LINE นี้ผูกกับระบบเรียบร้อยแล้ว</p>
          <p className="mt-1 text-xs text-gray-400">คุณจะได้รับการแจ้งเตือนใบแจ้งหนี้และข้อมูลสัญญาผ่าน LINE</p>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="text-center">
          <p className="text-5xl mb-4">🎉</p>
          <p className="text-lg font-semibold text-gray-800">ลงทะเบียนสำเร็จ!</p>
          <p className="mt-2 text-sm text-gray-500">ผูก LINE กับบัญชีผู้เช่าของคุณเรียบร้อยแล้ว</p>
          <p className="mt-1 text-xs text-gray-400">คุณจะได้รับการแจ้งเตือนใบแจ้งหนี้และข้อมูลสัญญาผ่าน LINE นี้</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-6 text-center">
          {lineProfile?.pictureUrl && (
            <img src={lineProfile.pictureUrl} alt="" className="mx-auto mb-3 h-16 w-16 rounded-full" />
          )}
          <p className="text-base font-semibold text-gray-800">สวัสดี, {lineProfile?.displayName}</p>
          <p className="mt-1 text-sm text-gray-500">กรอกเบอร์โทรศัพท์ที่ลงทะเบียนกับระบบเพื่อผูกบัญชี LINE</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">เลขห้อง</label>
            <input
              type="text"
              value={roomNo}
              onChange={e => setRoomNo(e.target.value)}
              placeholder="507"
              required
              className="h-11 w-full rounded-xl border border-gray-300 px-4 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">เบอร์โทรศัพท์</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0812345678"
              required
              className="h-11 w-full rounded-xl border border-gray-300 px-4 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {errMsg && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errMsg}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="h-11 w-full rounded-xl bg-[#06C755] text-base font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก...' : 'ยืนยันการลงทะเบียน'}
          </button>
        </form>
      </div>
    </div>
  )
}
