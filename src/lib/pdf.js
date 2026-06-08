import { Font } from '@react-pdf/renderer'

let registered = false

export function registerFonts() {
  if (registered) return
  Font.register({
    family: 'Sarabun',
    fonts: [
      { src: '/fonts/Sarabun-Regular.ttf', fontWeight: 400 },
      { src: '/fonts/Sarabun-Bold.ttf',    fontWeight: 700 },
      { src: '/fonts/Sarabun-Italic.ttf',  fontWeight: 400, fontStyle: 'italic' },
    ],
  })
  Font.registerHyphenationCallback(word => [word])
  registered = true
}

export function toBE(year) { return year + 543 }

export function thaiDate(d) {
  if (!d) return '-'
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  const dt = new Date(d)
  return `${dt.getDate()} ${months[dt.getMonth()]} ${toBE(dt.getFullYear())}`
}

export function baht(v) { return `฿${Number(v || 0).toLocaleString('th-TH')}` }
