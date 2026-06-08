import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Select from '../../components/ui/Select'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { formatThaiDateTime } from '../../lib/date'
import { ClipboardList } from 'lucide-react'

const TABLE_OPTS = [
  { value: '', label: 'ทุกตาราง' },
  { value: 'contracts',            label: 'สัญญา' },
  { value: 'invoices',             label: 'ใบแจ้งหนี้' },
  { value: 'payments',             label: 'การชำระเงิน' },
  { value: 'bookings',             label: 'การจอง' },
  { value: 'move_outs',            label: 'ย้ายออก' },
  { value: 'settlements',          label: 'Settlement' },
  { value: 'owner_transfers',      label: 'โอนเจ้าของ' },
  { value: 'rooms',                label: 'ห้อง' },
  { value: 'tenants',              label: 'ผู้เช่า' },
  { value: 'maintenance_requests', label: 'แจ้งซ่อม' },
  { value: 'profiles',             label: 'ผู้ใช้' },
]

const ACTION_COLOR = {
  insert: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
}

const TABLE_LABEL = {
  contracts:            'สัญญา',
  invoices:             'ใบแจ้งหนี้',
  payments:             'ชำระเงิน',
  bookings:             'การจอง',
  move_outs:            'ย้ายออก',
  settlements:          'Settlement',
  owner_transfers:      'โอนเจ้าของ',
  rooms:                'ห้อง',
  tenants:              'ผู้เช่า',
  maintenance_requests: 'แจ้งซ่อม',
  profiles:             'ผู้ใช้',
}

async function fetchLabelsForTable(table, ids, labelMap) {
  const key = (id, label) => { labelMap[`${table}_${id}`] = label }
  const roomLabel = r => r?.buildings?.name ? `${r.buildings.name} ห้อง ${r.room_number}` : `ห้อง ${r?.room_number ?? '-'}`

  if (table === 'rooms') {
    const { data } = await supabase.from('rooms').select('id, room_number, buildings(name)').in('id', ids)
    data?.forEach(r => key(r.id, roomLabel(r)))
  } else if (table === 'invoices') {
    const { data } = await supabase.from('invoices').select('id, invoice_number, rooms(room_number, buildings(name))').in('id', ids)
    data?.forEach(r => key(r.id, `${r.invoice_number}${r.rooms ? ` · ${roomLabel(r.rooms)}` : ''}`))
  } else if (table === 'payments') {
    const { data } = await supabase.from('payments').select('id, amount, invoices(invoice_number, rooms(room_number, buildings(name)))').in('id', ids)
    data?.forEach(r => key(r.id, `฿${Number(r.amount).toLocaleString('th-TH')} · ${r.invoices?.invoice_number ?? '-'}${r.invoices?.rooms ? ` · ${roomLabel(r.invoices.rooms)}` : ''}`))
  } else if (table === 'contracts') {
    const { data } = await supabase.from('contracts').select('id, contract_number, rooms(room_number, buildings(name))').in('id', ids)
    data?.forEach(r => key(r.id, `${r.contract_number}${r.rooms ? ` · ${roomLabel(r.rooms)}` : ''}`))
  } else if (table === 'bookings') {
    const { data } = await supabase.from('bookings').select('id, booking_number, rooms(room_number, buildings(name))').in('id', ids)
    data?.forEach(r => key(r.id, `${r.booking_number}${r.rooms ? ` · ${roomLabel(r.rooms)}` : ''}`))
  } else if (table === 'move_outs') {
    const { data } = await supabase.from('move_outs').select('id, move_out_number, rooms(room_number, buildings(name))').in('id', ids)
    data?.forEach(r => key(r.id, `${r.move_out_number}${r.rooms ? ` · ${roomLabel(r.rooms)}` : ''}`))
  } else if (table === 'maintenance_requests') {
    const { data } = await supabase.from('maintenance_requests').select('id, title, rooms(room_number, buildings(name))').in('id', ids)
    data?.forEach(r => key(r.id, `${r.title}${r.rooms ? ` · ${roomLabel(r.rooms)}` : ''}`))
  } else if (table === 'tenants') {
    const { data } = await supabase.from('tenants').select('id, full_name').in('id', ids)
    data?.forEach(r => key(r.id, r.full_name))
  } else if (table === 'profiles') {
    const { data } = await supabase.from('profiles').select('id, full_name, role').in('id', ids)
    data?.forEach(r => key(r.id, `${r.full_name} (${r.role})`))
  } else if (table === 'settlements') {
    const { data } = await supabase.from('settlements').select('id, amount, direction, move_outs(move_out_number)').in('id', ids)
    data?.forEach(r => key(r.id, `฿${Number(r.amount).toLocaleString('th-TH')} · ${r.move_outs?.move_out_number ?? '-'}`))
  } else if (table === 'owner_transfers') {
    const { data } = await supabase.from('owner_transfers').select('id, rooms(room_number, buildings(name))').in('id', ids)
    data?.forEach(r => key(r.id, r.rooms ? roomLabel(r.rooms) : '-'))
  }
}

async function enrichLogs(logs) {
  const groups = {}
  for (const log of logs) {
    if (!log.ref_id || !log.ref_table) continue
    if (!groups[log.ref_table]) groups[log.ref_table] = new Set()
    groups[log.ref_table].add(log.ref_id)
  }
  const labelMap = {}
  await Promise.all(
    Object.entries(groups).map(([table, ids]) => fetchLabelsForTable(table, [...ids], labelMap))
  )
  return logs.map(log => ({
    ...log,
    _label: log.ref_id ? (labelMap[`${log.ref_table}_${log.ref_id}`] ?? null) : null,
  }))
}

export default function ActivityLogPage() {
  const [logs,        setLogs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [filterTable, setFilterTable] = useState('')
  const [filterDate,  setFilterDate]  = useState('')
  const [page,        setPage]        = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => { fetchLogs() }, [filterTable, filterDate, page])

  async function fetchLogs() {
    setLoading(true)
    let q = supabase.from('activity_logs')
      .select('*, profiles!actor_id(full_name, role)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterTable) q = q.eq('ref_table', filterTable)
    if (filterDate)  q = q.gte('created_at', filterDate + 'T00:00:00').lte('created_at', filterDate + 'T23:59:59')

    const { data } = await q
    const enriched = await enrichLogs(data ?? [])
    setLogs(enriched)
    setLoading(false)
  }

  const filtered = logs.filter(log => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      log.profiles?.full_name?.toLowerCase().includes(q) ||
      log.ref_table?.toLowerCase().includes(q) ||
      log.action?.toLowerCase().includes(q) ||
      log._label?.toLowerCase().includes(q) ||
      log.context?.toLowerCase().includes(q) ||
      String(log.ref_id ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Activity Log</h1>
        <p className="mt-1 text-sm text-gray-500">บันทึกการเปลี่ยนแปลงทั้งหมดในระบบ</p>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา actor, action, context..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <Select options={TABLE_OPTS} value={filterTable} onChange={e => { setFilterTable(e.target.value); setPage(0) }} className="w-48" />
        <input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(0) }}
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {filterDate && <button onClick={() => setFilterDate('')} className="text-xs text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>}
      </div>

      {loading ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="ไม่มีรายการ" />
      ) : (
        <>
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400">
                  <th className="px-4 py-3 text-left font-medium">วันที่</th>
                  <th className="px-4 py-3 text-left font-medium">ผู้กระทำ</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium">ตาราง</th>
                  <th className="px-4 py-3 text-left font-medium">รายการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatThaiDateTime(log.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{log.profiles?.full_name ?? 'ระบบ'}</p>
                      {log.profiles?.role && <p className="text-xs text-gray-400">{log.profiles.role}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLOR[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {TABLE_LABEL[log.ref_table] ?? log.ref_table}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-sm">
                      {log._label ? (
                        <span className="text-sm text-gray-800">{log._label}</span>
                      ) : log.context && !log.context.match(/^[0-9a-f-]{36}$/) ? (
                        <span className="text-sm text-gray-700">{log.context}</span>
                      ) : (
                        <span className="font-mono text-[11px] text-gray-300">{log.ref_id?.slice(0, 8)}…</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50">
              ← ก่อนหน้า
            </button>
            <span className="text-sm text-gray-500">หน้า {page + 1}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={logs.length < PAGE_SIZE}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50">
              ถัดไป →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
