import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { registerFonts, thaiDate, baht } from '../../lib/pdf'

registerFonts()

const TYPE_LABEL = {
  contract_initial: 'เงินประกัน + ค่าเช่าล่วงหน้า',
  monthly_rent:     'ค่าเช่ารายเดือน',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินจอง',
  other:            'อื่นๆ',
}

const S = StyleSheet.create({
  page:    { fontFamily: 'Sarabun', fontSize: 11, padding: 40, color: '#111' },
  header:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 12 },
  company: { fontSize: 15, fontWeight: 700 },
  docType: { fontSize: 14, fontWeight: 700, textAlign: 'right' },
  docNum:  { fontSize: 11, color: '#555', textAlign: 'right' },
  section: { marginBottom: 14 },
  row:     { flexDirection: 'row', marginBottom: 4 },
  label:   { width: 140, color: '#555' },
  value:   { flex: 1, fontWeight: 700 },
  table:   { borderWidth: 1, borderColor: '#ddd', marginTop: 6 },
  th:      { flexDirection: 'row', backgroundColor: '#f5f5f5', borderBottomWidth: 1, borderBottomColor: '#ddd', padding: '6 8' },
  tr:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', padding: '6 8' },
  tfoot:   { flexDirection: 'row', padding: '8 8', borderTopWidth: 1, borderTopColor: '#ddd', backgroundColor: '#fafafa' },
  amt:     { textAlign: 'right' },
  total:   { fontSize: 13, fontWeight: 700 },
  note:    { marginTop: 20, fontSize: 10, color: '#888' },
})

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function calcPenaltyPDF(inv, ratePerDay) {
  if (inv.invoice_type !== 'monthly_rent') return null
  if (!inv.due_date) return null
  if (!['pending', 'overdue'].includes(inv.status)) return null
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const graceEndStr = addDays(inv.due_date, 4)
  if (today <= graceEndStr) return null
  const startStr = addDays(graceEndStr, 1)
  const startD = new Date(startStr + 'T00:00:00Z')
  const endD = new Date(today + 'T00:00:00Z')
  const days = Math.floor((endD - startD) / 86400000) + 1
  const fmt = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  return { days, label: `${fmt(startStr)} – ${fmt(today)} (${days} วัน)`, amount: days * ratePerDay, ratePerDay }
}

export default function InvoicePDF({ invoice: inv, items = [], company = {} }) {
  if (!inv) return null

  const ratePerDay  = Number(company?.invoice?.penalty_rate_per_day ?? 100)
  const penalty     = calcPenaltyPDF(inv, ratePerDay)
  const discount    = Math.min(Number(inv.penalty_discount ?? 0), penalty?.amount ?? 0)
  const netPenalty  = (penalty?.amount ?? 0) - discount
  const grandTotal  = Number(inv.total_amount) + netPenalty

  // fallback row ถ้าไม่มี invoice_items (เช่น invoice สร้างตรงๆ ไม่ผ่าน flow ปกติ)
  const displayItems = items.length > 0 ? items : [{
    description: TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type,
    quantity: 1,
    unit_price: inv.total_amount,
    amount: inv.total_amount,
  }]

  return (
    <Document title={`ใบแจ้งหนี้ ${inv.invoice_number}`}>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.company}>{company.name || 'บริษัท'}</Text>
            {company.address && <Text style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{company.address}</Text>}
            {company.phone && <Text style={{ fontSize: 10, color: '#555' }}>{company.phone}</Text>}
            {company.tax_id && <Text style={{ fontSize: 10, color: '#555' }}>เลขผู้เสียภาษี: {company.tax_id}</Text>}
          </View>
          <View>
            <Text style={S.docType}>ใบแจ้งหนี้</Text>
            <Text style={S.docNum}>{inv.invoice_number}</Text>
          </View>
        </View>

        {/* Bill to / Info */}
        <View style={{ flexDirection: 'row', marginBottom: 16, gap: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>เรียน</Text>
            <Text style={{ fontWeight: 700 }}>{inv.tenants?.full_name}</Text>
            <Text style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
              {inv.rooms?.buildings?.name} ห้อง {inv.rooms?.room_number}
            </Text>
          </View>
          <View style={{ width: 180 }}>
            <View style={S.row}><Text style={[S.label, { width: 80 }]}>ประเภท</Text><Text style={{ flex: 1 }}>{TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}</Text></View>
            {inv.billing_period && <View style={S.row}><Text style={[S.label, { width: 80 }]}>รอบบิล</Text><Text style={{ flex: 1 }}>{inv.billing_period}</Text></View>}
            <View style={S.row}><Text style={[S.label, { width: 80 }]}>วันออก</Text><Text style={{ flex: 1 }}>{thaiDate(inv.issue_date)}</Text></View>
            <View style={S.row}><Text style={[S.label, { width: 80 }]}>ครบกำหนด</Text><Text style={{ flex: 1, color: '#d00' }}>{thaiDate(inv.due_date)}</Text></View>
          </View>
        </View>

        {/* Items table */}
        <View style={S.table}>
          <View style={S.th}>
            <Text style={{ flex: 3, fontSize: 10, fontWeight: 700 }}>รายการ</Text>
            <Text style={{ width: 50, textAlign: 'right', fontSize: 10, fontWeight: 700 }}>จำนวน</Text>
            <Text style={{ width: 90, textAlign: 'right', fontSize: 10, fontWeight: 700 }}>ราคา/หน่วย</Text>
            <Text style={{ width: 90, textAlign: 'right', fontSize: 10, fontWeight: 700 }}>รวม</Text>
          </View>
          {displayItems.map((it, i) => (
            <View key={i} style={S.tr}>
              <Text style={{ flex: 3 }}>{it.description}</Text>
              <Text style={{ width: 50, textAlign: 'right' }}>{it.quantity}</Text>
              <Text style={{ width: 90, textAlign: 'right' }}>{baht(it.unit_price)}</Text>
              <Text style={{ width: 90, textAlign: 'right', color: it.amount < 0 ? '#16a34a' : '#111' }}>
                {it.amount < 0 ? '-' : ''}{baht(Math.abs(it.amount))}
              </Text>
            </View>
          ))}
          {penalty && (
            <View style={[S.tr, { backgroundColor: '#fff5f5' }]}>
              <Text style={{ flex: 3, color: '#c00' }}>ค่าปรับล่าช้า  <Text style={{ fontSize: 9, color: '#e55' }}>{penalty.label}</Text></Text>
              <Text style={{ width: 50, textAlign: 'right', color: '#c00' }}>{penalty.days}</Text>
              <Text style={{ width: 90, textAlign: 'right', color: '#c00' }}>{baht(penalty.ratePerDay)}</Text>
              <Text style={{ width: 90, textAlign: 'right', color: '#c00', fontWeight: 700 }}>{baht(penalty.amount)}</Text>
            </View>
          )}
          {discount > 0 && (
            <View style={[S.tr, { backgroundColor: '#f0fdf4' }]}>
              <Text style={{ flex: 3, color: '#16a34a' }}>
                ส่วนลดค่าปรับ{inv.penalty_discount_note ? `  (${inv.penalty_discount_note})` : ''}
              </Text>
              <Text style={{ width: 50 }}></Text>
              <Text style={{ width: 90 }}></Text>
              <Text style={{ width: 90, textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>-{baht(discount)}</Text>
            </View>
          )}
          <View style={S.tfoot}>
            <Text style={{ flex: 3 }}></Text>
            <Text style={{ width: 50 }}></Text>
            <Text style={{ width: 90, textAlign: 'right', fontWeight: 700 }}>ยอดรวม</Text>
            <Text style={{ width: 90, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{baht(grandTotal)}</Text>
          </View>
        </View>

        {/* Bank info */}
        {company.bank_account && (
          <View style={{ marginTop: 20, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>ชำระเงิน</Text>
            <Text style={{ fontSize: 10, color: '#555' }}>{company.bank_account}</Text>
          </View>
        )}

        {company.footer_note && (
          <Text style={S.note}>{company.footer_note}</Text>
        )}
      </Page>
    </Document>
  )
}
