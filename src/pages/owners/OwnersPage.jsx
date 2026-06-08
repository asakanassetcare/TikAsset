import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, UserCircle, ChevronRight, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'

export default function OwnersPage() {
  const navigate = useNavigate()
  const [owners, setOwners] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchOwners() }, [])

  async function fetchOwners() {
    const { data } = await supabase
      .from('owners')
      .select('*, rooms(id)')
      .order('full_name')
    if (data) setOwners(data)
    setLoading(false)
  }

  const filtered = owners.filter((o) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      o.full_name.toLowerCase().includes(q) ||
      o.phone?.toLowerCase().includes(q) ||
      o.email?.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">เจ้าของห้อง</h1>
          <p className="mt-1 text-sm text-gray-500">{owners.length} ราย</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/owners/new')}>เพิ่มเจ้าของ</Button>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ, เบอร์, อีเมล..."
          className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1,2,3,4].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserCircle}
          title={search ? 'ไม่พบผู้ที่ตรงกับการค้นหา' : 'ยังไม่มีเจ้าของห้อง'}
          description={!search ? 'เพิ่มเจ้าของห้องรายแรก' : undefined}
          action={!search && <Button onClick={() => navigate('/owners/new')} icon={<Plus className="h-4 w-4" />}>เพิ่มเจ้าของ</Button>}
        />
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          {filtered.map((o, i) => (
            <div
              key={o.id}
              onClick={() => navigate(`/owners/${o.id}`)}
              className={`group flex cursor-pointer items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors ${i < filtered.length - 1 ? 'border-b border-gray-50' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700 shrink-0">
                  {o.full_name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">{o.full_name}</p>
                  <p className="text-xs text-gray-400">
                    {[o.phone, o.email].filter(Boolean).join(' · ')}
                    {o.rooms?.length > 0 && ` · ${o.rooms.length} ห้อง`}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
