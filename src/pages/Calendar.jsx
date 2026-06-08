import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toBE } from '../lib/date'

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const THAI_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const EVENT_TYPES = {
  invoice_due_unpaid:  { label: 'ครบกำหนดชำระ',   color: 'bg-red-100 text-red-700',    dot: 'bg-red-400' },
  invoice_due_paid:    { label: 'ครบกำหนด (ชำระ)', color: 'bg-green-100 text-green-700',dot: 'bg-green-400' },
  move_in:             { label: 'เข้าพัก',          color: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-400' },
  contract_end:        { label: 'ครบสัญญา',         color: 'bg-amber-100 text-amber-700',dot: 'bg-amber-400' },
  move_out:            { label: 'ย้ายออก',          color: 'bg-purple-100 text-purple-700',dot: 'bg-purple-400' },
  maintenance:         { label: 'แจ้งซ่อม',         color: 'bg-gray-100 text-gray-700',  dot: 'bg-gray-400' },
}

function toDateStr(d) {
  if (!d) return null
  return d.slice(0, 10)
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const now     = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-based
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const monthEnd   = new Date(year, month + 1, 1).toISOString().slice(0, 10)

  useEffect(() => { fetchEvents() }, [year, month])

  async function fetchEvents() {
    setLoading(true)
    const ACTIVE_STATUSES = ['pending_approve', 'approved', 'active']
    const [{ data: invs }, { data: contracts }, { data: moveOuts }, { data: maint }] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, due_date, status, rooms(room_number, buildings(name)), contracts(status)')
        .gte('due_date', monthStart).lt('due_date', monthEnd),
      supabase.from('contracts').select('id, contract_number, move_in_date, contract_end_date, rooms(room_number, buildings(name))')
        .or(`and(move_in_date.gte.${monthStart},move_in_date.lt.${monthEnd}),and(contract_end_date.gte.${monthStart},contract_end_date.lt.${monthEnd})`)
        .in('status', ACTIVE_STATUSES),
      supabase.from('move_outs').select('id, move_out_number, move_out_date, status, rooms(room_number, buildings(name))')
        .gte('move_out_date', monthStart).lt('move_out_date', monthEnd)
        .neq('status', 'settled'),
      supabase.from('maintenance_requests').select('id, title, reported_at, preferred_due_date, buildings(name), rooms(room_number)')
        .or(`and(reported_at.gte.${monthStart}T00:00:00,reported_at.lt.${monthEnd}T00:00:00),and(preferred_due_date.gte.${monthStart},preferred_due_date.lt.${monthEnd})`)
        .in('status', ['reported', 'in_progress']),
    ])

    const evts = []
    const activeInvs = (invs ?? []).filter(inv =>
      !['cancelled', 'rejected'].includes(inv.status) &&
      (!inv.contracts || ACTIVE_STATUSES.includes(inv.contracts.status))
    )

    for (const inv of activeInvs) {
      const d = toDateStr(inv.due_date)
      if (!d) continue
      const isPaid = inv.status === 'paid'
      evts.push({
        date: d, type: isPaid ? 'invoice_due_paid' : 'invoice_due_unpaid',
        label: `${inv.rooms?.buildings?.name} ห้อง ${inv.rooms?.room_number} ${isPaid ? 'ชำระแล้ว' : 'ครบกำหนดชำระ'}`,
        onClick: () => navigate(`/invoices/${inv.id}`),
      })
    }
    for (const c of contracts ?? []) {
      if (toDateStr(c.move_in_date) >= monthStart && toDateStr(c.move_in_date) < monthEnd) {
        evts.push({
          date: toDateStr(c.move_in_date), type: 'move_in',
          label: `${c.rooms?.buildings?.name} ห้อง ${c.rooms?.room_number} เข้าพัก`,
          onClick: () => navigate(`/contracts/${c.id}`),
        })
      }
      if (toDateStr(c.contract_end_date) >= monthStart && toDateStr(c.contract_end_date) < monthEnd) {
        evts.push({
          date: toDateStr(c.contract_end_date), type: 'contract_end',
          label: `${c.rooms?.buildings?.name} ห้อง ${c.rooms?.room_number} ครบสัญญา`,
          onClick: () => navigate(`/contracts/${c.id}`),
        })
      }
    }
    for (const mo of moveOuts ?? []) {
      evts.push({
        date: toDateStr(mo.move_out_date), type: 'move_out',
        label: `${mo.rooms?.buildings?.name} ห้อง ${mo.rooms?.room_number} ย้ายออก`,
        onClick: () => navigate(`/move-outs/${mo.id}`),
      })
    }
    for (const m of maint ?? []) {
      if (toDateStr(m.reported_at)) {
        evts.push({
          date: toDateStr(m.reported_at), type: 'maintenance',
          label: `${m.buildings?.name}${m.rooms?.room_number ? ` ห้อง ${m.rooms.room_number}` : ''} ${m.title}`,
          onClick: () => navigate(`/maintenance/${m.id}`),
        })
      }
      if (toDateStr(m.preferred_due_date)) {
        evts.push({
          date: toDateStr(m.preferred_due_date), type: 'maintenance',
          label: `${m.buildings?.name}${m.rooms?.room_number ? ` ห้อง ${m.rooms.room_number}` : ''} ต้องการให้เสร็จ`,
          onClick: () => navigate(`/maintenance/${m.id}`),
        })
      }
    }

    setEvents(evts)
    setLoading(false)
  }

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const e of events) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return map
  }, [events])

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth     = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const todayStr = now.toISOString().slice(0, 10)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">ปฏิทิน</h1>
        {/* Legend */}
        <div className="hidden sm:flex flex-wrap gap-3">
          {Object.entries(EVENT_TYPES).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`h-2 w-2 rounded-full ${v.dot}`} />
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* Month nav */}
      <div className="mb-4 flex items-center gap-4">
        <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <h2 className="text-base font-semibold text-gray-900 w-40 text-center">
          {THAI_MONTHS[month]} {toBE(year)}
        </h2>
        <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
          วันนี้
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {THAI_DOW.map((d, i) => (
            <div key={d} className={`py-2.5 text-center text-xs font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const dateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
            const dayEvents = dateStr ? (eventsByDate[dateStr] ?? []) : []
            const isToday = dateStr === todayStr
            const dow = (idx % 7)

            return (
              <div
                key={idx}
                className={`min-h-[90px] border-b border-r border-gray-50 p-1.5 ${!day ? 'bg-gray-50/50' : ''}`}
              >
                {day && (
                  <>
                    <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                      ${isToday ? 'bg-blue-600 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((evt, i) => {
                        const t = EVENT_TYPES[evt.type] ?? EVENT_TYPES.maintenance
                        return (
                          <button
                            key={i}
                            onClick={evt.onClick}
                            className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight ${t.color} hover:opacity-80 transition-opacity`}
                            title={evt.label}
                          >
                            {evt.label}
                          </button>
                        )
                      })}
                      {dayEvents.length > 3 && (
                        <p className="px-1 text-[10px] text-gray-400">+{dayEvents.length - 3} อีก</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {loading && <p className="mt-3 text-center text-sm text-gray-400">กำลังโหลด...</p>}
    </div>
  )
}
