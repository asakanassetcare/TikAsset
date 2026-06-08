import dayjs from 'dayjs'
import buddhistEra from 'dayjs/plugin/buddhistEra'
import 'dayjs/locale/th'

dayjs.extend(buddhistEra)
dayjs.locale('th')

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]
const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** Convert CE year to BE year */
export function toBE(ceYear) {
  return ceYear + 543
}

/** "5 พ.ค. 2569" */
export function formatThaiDate(date) {
  if (!date) return '-'
  const d = dayjs(date)
  return `${d.date()} ${THAI_MONTHS_SHORT[d.month()]} ${toBE(d.year())}`
}

/** "พ.ค. 2569" */
export function formatThaiMonth(date) {
  if (!date) return '-'
  const d = dayjs(date)
  return `${THAI_MONTHS_SHORT[d.month()]} ${toBE(d.year())}`
}

/** "พฤษภาคม 2569" */
export function formatThaiMonthFull(date) {
  if (!date) return '-'
  const d = dayjs(date)
  return `${THAI_MONTHS_FULL[d.month()]} ${toBE(d.year())}`
}

/** "5 พ.ค. 2569 14:30" */
export function formatThaiDateTime(date) {
  if (!date) return '-'
  const d = dayjs(date)
  return `${formatThaiDate(date)} ${d.format('HH:mm')}`
}

/** ISO string for DB (CE) */
export function toISO(date) {
  return dayjs(date).toISOString()
}

/** Period key "2026-05" for invoice periods */
export function toPeriodKey(date) {
  return dayjs(date).format('YYYY-MM')
}

/** dayjs instance */
export function djs(date) {
  return dayjs(date)
}
