const variants = {
  // Room status
  available:   'bg-green-100 text-green-700',
  occupied:    'bg-blue-100 text-blue-700',
  reserved:    'bg-orange-100 text-orange-700',
  maintenance: 'bg-yellow-100 text-yellow-700',
  blocked:     'bg-red-100 text-red-700',

  // Contract status
  pending_approve:     'bg-amber-100 text-amber-700',
  approved:            'bg-blue-100 text-blue-700',
  active:              'bg-green-100 text-green-700',
  expired:             'bg-gray-100 text-gray-600',
  terminated:          'bg-red-100 text-red-700',
  rejected:            'bg-red-100 text-red-700',
  cancelled:           'bg-gray-100 text-gray-500',

  // Booking status
  waiting:             'bg-amber-100 text-amber-700',
  converted:           'bg-blue-100 text-blue-700',

  // Invoice status
  pending:             'bg-gray-100 text-gray-600',
  overdue:             'bg-red-100 text-red-700',
  paid:                'bg-green-100 text-green-700',
  paid_pending_approve:'bg-yellow-100 text-yellow-700',

  // Payment status
  // pending_approve — already covered above

  // Owner transfer status
  pending_staff:          'bg-amber-100 text-amber-700',
  transferred_by_staff:   'bg-blue-100 text-blue-700',
  confirmed:              'bg-green-100 text-green-700',

  // Move-out status
  pending_accounting: 'bg-amber-100 text-amber-700',
  settled:            'bg-green-100 text-green-700',

  // Settlement status
  paid_by_staff:      'bg-blue-100 text-blue-700',
  completed:          'bg-green-100 text-green-700',

  // Maintenance status
  reported:           'bg-amber-100 text-amber-700',
  in_progress:        'bg-blue-100 text-blue-700',

  // Generic
  default: 'bg-gray-100 text-gray-600',
  info:    'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger:  'bg-red-100 text-red-700',
}

const LABEL_MAP = {
  available:            'ว่าง',
  occupied:             'มีผู้เช่า',
  reserved:             'จองแล้ว',
  maintenance:          'ซ่อมบำรุง',
  blocked:              'ปิดใช้งาน',
  pending_approve:      'รออนุมัติ',
  approved:             'อนุมัติแล้ว',
  active:               'ใช้งาน',
  expired:              'หมดอายุ',
  terminated:           'ยกเลิกก่อนครบ',
  rejected:             'ถูกปฏิเสธ',
  cancelled:            'ยกเลิก',
  waiting:              'รอ',
  converted:            'แปลงสัญญาแล้ว',
  pending:              'รอดำเนินการ',
  overdue:              'เกินกำหนด',
  paid:                 'ชำระแล้ว',
  paid_pending_approve: 'รอยืนยัน',
  pending_staff:        'รอ Staff โอน',
  transferred_by_staff: 'โอนแล้ว รอยืนยัน',
  confirmed:            'ยืนยันแล้ว',
  pending_accounting:   'รออนุมัติ',
  settled:              'เคลียร์แล้ว',
  paid_by_staff:        'Staff โอนแล้ว',
  completed:            'เสร็จสิ้น',
  reported:             'รับแจ้ง',
  in_progress:          'กำลังซ่อม',
}

export default function Badge({ variant = 'default', label, className = '' }) {
  const display = label ?? LABEL_MAP[variant] ?? variant
  const cls = variants[variant] ?? variants.default
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls} ${className}`}>
      {display}
    </span>
  )
}
