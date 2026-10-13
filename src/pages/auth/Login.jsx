import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, PackageCheck } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

export default function Login() {
  const { signIn, signInWithGoogle, authError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authError) setError(authError)
  }, [authError])

  async function handleGoogle() {
    setError('')
    setGoogleLoading(true)
    const { error } = await signInWithGoogle(from)
    if (error) {
      setError('เข้าสู่ระบบด้วย Google ไม่สำเร็จ')
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      if (error.message === 'account_disabled') {
        setError('บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ')
        return
      }
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 shadow-lg shadow-teal-200">
            <PackageCheck className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900">TikAsset</h1>
            <p className="text-sm text-gray-500">ระบบบริหารการปล่อยเช่าคอนโด</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
          <h2 className="mb-6 text-base font-semibold text-gray-900">เข้าสู่ระบบ</h2>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            เข้าสู่ระบบด้วย Google
          </button>

          {!showPasswordForm && (
            <>
              {error && (
                <div className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
                  {error}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowPasswordForm(true)}
                className="mt-4 w-full text-center text-xs text-gray-400 hover:text-gray-600"
              >
                เข้าด้วยอีเมลและรหัสผ่าน
              </button>
            </>
          )}

          {showPasswordForm && (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <Input
              label="อีเมล"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                รหัสผ่าน <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="mt-1 w-full h-10">
              เข้าสู่ระบบ
            </Button>
          </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          TikAsset © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
