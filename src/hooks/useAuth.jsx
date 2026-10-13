import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const NO_ACCESS = 'บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
const DISABLED = 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ'

// Supabase ส่ง error กลับมาใน URL หลัง Google OAuth (เช่น signup_disabled เมื่ออีเมลไม่มีบัญชี)
// ต้องอ่านตอนโหลดครั้งแรก ก่อน RequireAuth redirect ไป /login แล้ว query/hash หายไป
function readOAuthError() {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = params.get('error_code') || hash.get('error_code')
  const err = params.get('error') || hash.get('error')
  if (!code && !err) return ''
  window.history.replaceState(null, '', window.location.pathname)
  if (code === 'signup_disabled' || code === 'user_banned') return NO_ACCESS
  return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(undefined) // undefined = not yet fetched
  const [authError, setAuthError] = useState(readOAuthError)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) fetchProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ไม่มี profile หรือ is_active = false → sign out (Google ยืนยันตัวตนได้ทุกบัญชี
  // ต้องมี profile ที่ active ถึงจะเข้าได้)
  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    setProfile(data)
    if (!data || data.is_active === false) {
      setAuthError(!data ? NO_ACCESS : DISABLED)
      await supabase.auth.signOut()
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', data.user.id)
      .single()

    if (profileError || profileData?.is_active === false) {
      await supabase.auth.signOut()
      return { error: { message: 'account_disabled' } }
    }

    return { error: null }
  }

  async function signInWithGoogle(redirectPath = '/') {
    setAuthError('')
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + redirectPath,
        // ให้เลือกบัญชีทุกครั้ง ไม่งั้น Google ใช้บัญชีเดิมอัตโนมัติจนเปลี่ยนบัญชีไม่ได้
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error }
  }

  const value = {
    session,
    profile,
    role: profile?.is_active === false ? null : (profile?.role ?? null),
    loading: session === undefined || (session !== null && profile === undefined),
    authError,
    signIn,
    signInWithGoogle,
    signOut,
    updatePassword,
    refetchProfile: () => session?.user && fetchProfile(session.user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
