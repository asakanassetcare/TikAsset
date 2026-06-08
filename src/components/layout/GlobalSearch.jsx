import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function useDebouncedCallback(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const doSearch = useDebouncedCallback(async (q) => {
    if (!q.trim() || q.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const lq = `%${q}%`
    const [rooms, tenants, contracts, invoices] = await Promise.all([
      supabase.from('rooms').select('id, room_number, buildings(name)').ilike('room_number', lq).limit(4),
      supabase.from('tenants').select('id, full_name, phone').or(`full_name.ilike.${lq},phone.ilike.${lq}`).limit(4),
      supabase.from('contracts').select('id, contract_number, tenants(full_name)').ilike('contract_number', lq).limit(4),
      supabase.from('invoices').select('id, invoice_number').ilike('invoice_number', lq).limit(4),
    ])
    const hits = [
      ...(rooms.data ?? []).map(r => ({
        label: `ห้อง ${r.room_number}`,
        sub:   r.buildings?.name ?? '',
        path:  null,
        type:  'room',
      })),
      ...(tenants.data ?? []).map(t => ({
        label: t.full_name,
        sub:   t.phone ?? '',
        path:  `/tenants/${t.id}`,
        type:  'tenant',
      })),
      ...(contracts.data ?? []).map(c => ({
        label: c.contract_number,
        sub:   c.tenants?.full_name ?? '',
        path:  `/contracts/${c.id}`,
        type:  'contract',
      })),
      ...(invoices.data ?? []).map(inv => ({
        label: inv.invoice_number,
        sub:   '',
        path:  `/invoices/${inv.id}`,
        type:  'invoice',
      })),
    ]
    setResults(hits)
    setLoading(false)
    setOpen(true)
  }, 300)

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    if (q.length >= 2) doSearch(q)
    else { setResults([]); setOpen(false) }
  }

  function handleSelect(item) {
    setOpen(false)
    setQuery('')
    if (item.path) navigate(item.path)
  }

  const TYPE_LABEL = { room: 'ห้อง', tenant: 'ผู้เช่า', contract: 'สัญญา', invoice: 'ใบแจ้งหนี้' }
  const TYPE_COLOR = {
    room:     'bg-blue-100 text-blue-700',
    tenant:   'bg-green-100 text-green-700',
    contract: 'bg-purple-100 text-purple-700',
    invoice:  'bg-amber-100 text-amber-700',
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="ค้นหาห้อง ผู้เช่า สัญญา..."
          className="h-8 w-56 rounded-lg border border-gray-200 bg-gray-50 pl-7 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
          {loading ? (
            <p className="px-4 py-3 text-xs text-gray-400">กำลังค้นหา...</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400">ไม่พบผลลัพธ์</p>
          ) : (
            results.map((item, i) => (
              <button
                key={i}
                onClick={() => handleSelect(item)}
                className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
              >
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLOR[item.type]}`}>
                  {TYPE_LABEL[item.type]}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{item.label}</p>
                  {item.sub && <p className="truncate text-xs text-gray-400">{item.sub}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
