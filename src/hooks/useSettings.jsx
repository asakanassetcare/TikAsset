import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const { session } = useAuth()
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    fetchSettings()
  }, [session])

  async function fetchSettings() {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .neq('key', '_encryption')
    if (data) {
      const map = {}
      data.forEach((row) => {
        if (row.key !== '_encryption') map[row.key] = row.value
      })
      setSettings(map)
    }
    setLoading(false)
  }

  async function updateSetting(key, value) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_by: session?.user?.id }, { onConflict: 'key' })
    if (!error) {
      setSettings((prev) => ({ ...prev, [key]: value }))
    }
    return { error }
  }

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSetting, refetch: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
