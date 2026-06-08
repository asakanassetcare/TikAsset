import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'

export default function ChangePassword() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (next.length < 8) { setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return }
    if (next !== confirm) { setError('รหัสผ่านใหม่ไม่ตรงกัน'); return }

    setLoading(true)
    const { error } = await updatePassword(next)
    setLoading(false)

    if (error) { setError('เกิดข้อผิดพลาด: ' + error.message); return }
    setSuccess(true)
    setTimeout(() => navigate('/'), 2000)
  }

  return (
    <div className="mx-auto max-w-sm pt-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
          <Lock className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">เปลี่ยนรหัสผ่าน</h1>
          <p className="text-sm text-gray-500">กรุณาตั้งรหัสผ่านใหม่</p>
        </div>
      </div>

      <Card>
        {success ? (
          <div className="py-4 text-center">
            <div className="mb-3 text-3xl">✓</div>
            <p className="font-medium text-green-700">เปลี่ยนรหัสผ่านสำเร็จ</p>
            <p className="mt-1 text-sm text-gray-500">กำลังกลับหน้าหลัก...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">รหัสผ่านใหม่ <span className="text-red-500">*</span></label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={8}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">ยืนยันรหัสผ่านใหม่ <span className="text-red-500">*</span></label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="ยืนยันรหัสผ่านอีกครั้ง"
                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</div>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)} className="flex-1">
                ยกเลิก
              </Button>
              <Button type="submit" loading={loading} className="flex-1">
                บันทึก
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
