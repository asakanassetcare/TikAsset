import { Copy } from 'lucide-react'
import Badge from '../ui/Badge'

const STATUS_DOT = {
  available:   'bg-green-500',
  occupied:    'bg-blue-500',
  reserved:    'bg-orange-500',
  maintenance: 'bg-yellow-500',
  blocked:     'bg-red-500',
}

export default function RoomCard({ room, onClick, onCopy, buildingColor }) {
  const borderColor = room.status_color || buildingColor || undefined
  const dotColor    = room.status_color || buildingColor || undefined

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-all"
      style={borderColor ? { borderColor } : { borderColor: '#f3f4f6' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {dotColor ? (
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
          ) : (
            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[room.status] ?? 'bg-gray-400'}`} />
          )}
          <span className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
            {room.room_number}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={room.status} />
          {onCopy && (
            <button
              onClick={e => { e.stopPropagation(); onCopy(room) }}
              className="rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600 transition-all"
              title="คัดลอกห้อง"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-gray-500">
        {room.room_types?.name && <p>{room.room_types.name}{room.size_sqm ? ` · ${room.size_sqm} ม²` : ''}</p>}
        <p className="text-sm font-medium text-gray-700">
          ฿{Number(room.base_rent).toLocaleString('th-TH')}
          <span className="text-xs font-normal text-gray-400">/เดือน</span>
        </p>
        {room.ownership === 'managed' && room.owners?.full_name && (
          <p className="text-gray-400">เจ้าของ: {room.owners.full_name}</p>
        )}
        {!room.is_rentable && (
          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">ปิดการเช่า</span>
        )}
      </div>

      {room.internal_note && (
        <p className="mt-2 line-clamp-1 text-[11px] text-gray-400 italic">{room.internal_note}</p>
      )}
    </div>
  )
}
