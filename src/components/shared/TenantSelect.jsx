import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function TenantSelect({ value, onChange, label = 'ผู้เช่า', required = false, wrapperClass = '', prefillTenant = null }) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [selected, setSelected] = useState(null)
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const wrapRef  = useRef(null)
  const inputRef = useRef(null)
  const timer    = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Prefill from parent (e.g. converting a booking)
  useEffect(() => {
    if (prefillTenant?.id) {
      setSelected(prefillTenant)
      setQuery(prefillTenant.full_name + (prefillTenant.phone ? ' · ' + prefillTenant.phone : ''))
    } else {
      setSelected(null)
      setQuery('')
    }
  }, [prefillTenant?.id])

  // When value cleared externally
  useEffect(() => {
    if (!value) { setSelected(null); setQuery('') }
  }, [value])

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    setOpen(true)
    clearTimeout(timer.current)
    if (!q.trim()) { setResults([]); return }
    timer.current = setTimeout(() => search(q.trim()), 250)
  }

  async function search(q) {
    setLoading(true)
    const { data } = await supabase
      .from('tenants')
      .select('id, full_name, phone, id_card_last4')
      .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,id_card_last4.ilike.%${q}%`)
      .order('full_name')
      .limit(10)
    setResults(data ?? [])
    setLoading(false)
  }

  function handleSelect(t) {
    setSelected(t)
    setQuery(t.full_name + (t.phone ? ' · ' + t.phone : ''))
    setOpen(false)
    onChange(t.id)
  }

  function handleClear() {
    setSelected(null)
    setQuery('')
    setResults([])
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={`flex flex-col gap-1 ${wrapperClass}`} ref={wrapRef}>
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}{required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => { if (query.trim()) setOpen(true) }}
          placeholder="ค้นหาชื่อ เบอร์ หรือ 4 หลักท้ายบัตร..."
          required={required && !selected}
          className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {query && (
          <button type="button" onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {open && (query.trim()) && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
            {loading ? (
              <p className="px-3 py-2.5 text-sm text-gray-400">กำลังค้นหา...</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-gray-400">ไม่พบผู้เช่า</p>
            ) : (
              <ul className="max-h-52 overflow-y-auto py-1">
                {results.map(t => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onMouseDown={() => handleSelect(t)}
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-blue-50"
                    >
                      <span className="text-sm font-medium text-gray-900">{t.full_name}</span>
                      <span className="text-xs text-gray-400">
                        {t.phone ?? ''}
                        {t.id_card_last4 ? ` · บัตร ****${t.id_card_last4}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
