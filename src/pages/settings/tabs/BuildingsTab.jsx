import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Building2, DoorOpen } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import EmptyState from '../../../components/ui/EmptyState'

export default function BuildingsTab() {
  const [buildings, setBuildings] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')

  useEffect(() => { fetchBuildings() }, [])

  async function fetchBuildings() {
    const { data } = await supabase
      .from('buildings')
      .select('id, name, total_floors, total_rentable_rooms, note, card_color, project_id, projects(id, name)')
      .order('name')
    setBuildings(data ?? [])
    setLoading(false)
  }

  const filtered = buildings.filter(b => {
    if (!search) return true
    const q = search.toLowerCase()
    return b.name.toLowerCase().includes(q) || b.projects?.name?.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="mb-5">
        <p className="text-sm text-gray-500">อาคารทั้งหมดในระบบ — คลิกเพื่อจัดการห้อง</p>
      </div>

      <div className="mb-5 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาอาคาร หรือโครงการ..."
          className="h-9 w-full max-w-sm rounded-lg border border-gray-300 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="ไม่พบอาคาร"
          description={search ? 'ลองค้นหาคำอื่น' : 'เพิ่มอาคารผ่านหน้าโครงการ'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(b => (
            <Link key={b.id} to={`/projects/${b.projects?.id}/buildings/${b.id}`}
              className="group rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-all"
              style={{ borderColor: b.card_color ?? '#f3f4f6' }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                  style={{ backgroundColor: b.card_color ? `${b.card_color}20` : '#eff6ff' }}>
                  <Building2 className="h-4 w-4" style={{ color: b.card_color ?? '#2563eb' }} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">{b.name}</p>
                  <p className="text-xs text-gray-400 truncate">{b.projects?.name}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {b.total_floors} ชั้น
                </span>
                <span className="flex items-center gap-1">
                  <DoorOpen className="h-3 w-3" />
                  {b.total_rentable_rooms} ห้อง
                </span>
              </div>
              {b.note && <p className="mt-2 line-clamp-1 text-[11px] text-gray-400 italic">{b.note}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
