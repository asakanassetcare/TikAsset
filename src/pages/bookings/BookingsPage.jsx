import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Select from '../../components/ui/Select'
import EmptyState from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import BookingFormModal from '../../components/bookings/BookingFormModal'
import { formatThaiDate } from '../../lib/date'
import { BookOpen } from 'lucide-react'

const STATUS_OPTS = [
  { value: '',          label: 'ทุกสถานะ' },
  { value: 'waiting',   label: 'รอ' },
  { value: 'converted', label: 'แปลงสัญญาแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

export default function BookingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [bookings, setBookings] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [search,   setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState(location.state?.filterStatus ?? '')

  useEffect(() => { fetchBookings() }, [])

  async function fetchBookings() {
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_number, status, deposit_amount, created_at, rooms(room_number, buildings(name)), tenants(full_name, phone)')
      .order('created_at', { ascending: false })
    setBookings(data ?? [])
    setLoading(false)
  }

  const filtered = bookings.filter(b => {
    if (filterStatus && b.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        b.booking_number?.toLowerCase().includes(q) ||
        b.tenants?.full_name?.toLowerCase().includes(q) ||
        b.tenants?.phone?.includes(q) ||
        b.rooms?.room_number?.toLowerCase().includes(q)
      )
    }
    return true
  })

  if (loading) return <PageSpinner />

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">การจอง</h1>
          <p className="mt-1 text-sm text-gray-500">{filtered.length} รายการ</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal(true)}>สร้างการจอง</Button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขจอง ผู้เช่า หรือห้อง..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select options={STATUS_OPTS} value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-40" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="ไม่มีการจอง" action={<Button onClick={() => setModal(true)} icon={<Plus className="h-4 w-4" />}>สร้างการจอง</Button>} />
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          {filtered.map((b, i) => (
            <div
              key={b.id}
              onClick={() => navigate(`/bookings/${b.id}`)}
              className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{b.booking_number}</p>
                <p className="text-xs text-gray-500">
                  {b.rooms?.buildings?.name} · ห้อง {b.rooms?.room_number}
                  {' · '}{b.tenants?.full_name}
                </p>
                <p className="text-xs text-gray-400">{formatThaiDate(b.created_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                {b.deposit_amount > 0 && (
                  <span className="text-sm font-medium text-gray-700">฿{Number(b.deposit_amount).toLocaleString('th-TH')}</span>
                )}
                <Badge variant={b.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      <BookingFormModal open={modal} onClose={() => setModal(false)} onSaved={fetchBookings} />
    </div>
  )
}
