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

const k = (t) => `${t}  `

const S = StyleSheet.create({
  page:        { fontFamily: 'Sarabun', fontSize: 10, color: '#111827', padding: '44 50 38 50' },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  companyCol:  { flex: 1, paddingRight: 28 },
  coName:      { fontSize: 15.5, fontWeight: 700, letterSpacing: 0.2 },
  coSub:       { fontSize: 8.6, color: '#4b5563', marginTop: 3, lineHeight: 1.55 },
  titleCol:    { width: 205, alignItems: 'flex-end' },
  titleMain:   { fontSize: 22, fontWeight: 700, textAlign: 'right', lineHeight: 1.15 },
  titleEn:     { fontSize: 8.8, color: '#4b5563', marginTop: 2, textAlign: 'right', letterSpacing: 0.4 },
  titleCopy:   { fontSize: 8.2, color: '#6b7280', marginTop: 5, textAlign: 'right' },

  ruleTop:     { borderBottomWidth: 1.2, borderBottomColor: '#111827', marginBottom: 2 },
  ruleSub:     { borderBottomWidth: 0.45, borderBottomColor: '#9ca3af', marginBottom: 14 },

  introRow:    { flexDirection: 'row', marginBottom: 18 },
  introText:   { flex: 1, paddingRight: 22 },
  introLine:   { fontSize: 9.4, color: '#374151', lineHeight: 1.7 },
  metaPanel:   { width: 205, borderWidth: 0.65, borderColor: '#111827' },
  metaRow:     { flexDirection: 'row', borderBottomWidth: 0.45, borderBottomColor: '#d1d5db' },
  metaRowLast: { flexDirection: 'row' },
  metaLbl:     { width: 78, fontSize: 8.4, color: '#4b5563', padding: '5 7', borderRightWidth: 0.45, borderRightColor: '#d1d5db' },
  metaVal:     { flex: 1, fontSize: 9.6, fontWeight: 700, padding: '5 7', textAlign: 'right' },
  metaValRed:  { flex: 1, fontSize: 9.6, fontWeight: 700, padding: '5 7', textAlign: 'right', color: '#dc2626' },

  partyRow:      { flexDirection: 'row', borderTopWidth: 0.65, borderBottomWidth: 0.65, borderColor: '#111827', marginBottom: 20 },
  partyBox:      { flex: 1, padding: '10 12 10 0' },
  partyBoxMid:   { flex: 1, padding: '10 12', borderLeftWidth: 0.45, borderLeftColor: '#d1d5db' },
  partyBoxLast:  { flex: 1, padding: '10 0 10 12', borderLeftWidth: 0.45, borderLeftColor: '#d1d5db' },
  partyLbl:      { fontSize: 8, color: '#6b7280', marginBottom: 5, paddingRight: 6 },
  partyName:     { fontSize: 11.2, fontWeight: 700, marginBottom: 3, paddingRight: 6 },
  partySub:      { fontSize: 8.6, color: '#374151', lineHeight: 1.55, paddingRight: 6 },

  table:       { marginBottom: 12 },
  tblHead:     { flexDirection: 'row', borderTopWidth: 0.8, borderBottomWidth: 0.8, borderColor: '#111827', paddingVertical: 7 },
  tblRow:      { flexDirection: 'row', borderBottomWidth: 0.45, borderBottomColor: '#d1d5db', paddingVertical: 10, minHeight: 36 },
  tblRowRed:   { flexDirection: 'row', borderBottomWidth: 0.45, borderBottomColor: '#d1d5db', paddingVertical: 10, minHeight: 36, backgroundColor: '#fef2f2' },
  tblRowGreen: { flexDirection: 'row', borderBottomWidth: 0.45, borderBottomColor: '#d1d5db', paddingVertical: 10, minHeight: 36, backgroundColor: '#f0fdf4' },
  cNo:         { width: 26, fontSize: 8.3, textAlign: 'center', paddingRight: 2 },
  cDesc:       { flex: 1, paddingRight: 12 },
  cQty:        { width: 58, textAlign: 'center', paddingRight: 3 },
  cPrice:      { width: 94, textAlign: 'right', paddingRight: 3 },
  cAmt:        { width: 106, textAlign: 'right', paddingRight: 4 },
  thTxt:       { fontSize: 8.2, fontWeight: 700, color: '#374151', paddingRight: 5 },
  tdTxt:       { fontSize: 9.3, paddingRight: 4 },
  tdSub:       { fontSize: 8.2, color: '#6b7280', marginTop: 2, lineHeight: 1.45 },
  tdRed:       { fontSize: 9.3, paddingRight: 4, color: '#dc2626' },
  tdGreen:     { fontSize: 9.3, paddingRight: 4, color: '#16a34a' },

  summaryWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 20 },
  totals:      { width: 255 },
  totRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 0.45, borderBottomColor: '#d1d5db' },
  totLbl:      { fontSize: 9, color: '#4b5563', paddingRight: 6 },
  totVal:      { fontSize: 9.2, paddingRight: 2 },
  totValRed:   { fontSize: 9.2, paddingRight: 2, color: '#dc2626' },
  totValGreen: { fontSize: 9.2, paddingRight: 2, color: '#16a34a' },
  grandRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1.2, borderBottomWidth: 1.2, borderColor: '#111827', marginTop: 2 },
  grandLbl:    { fontSize: 10.5, fontWeight: 700, paddingRight: 6 },
  grandVal:    { fontSize: 13.5, fontWeight: 700, paddingRight: 2 },

  bankBox:     { borderWidth: 0.65, borderColor: '#9ca3af', padding: '10 14', marginBottom: 22, borderRadius: 3 },
  bankTitle:   { fontSize: 8.6, fontWeight: 700, marginBottom: 5, color: '#374151' },
  bankLine:    { fontSize: 9, color: '#374151', lineHeight: 1.7 },

  sigRow:      { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
  sigBox:      { alignItems: 'center', width: 205 },
  sigSpace:    { height: 38 },
  sigLine:     { width: 185, borderBottomWidth: 0.8, borderBottomColor: '#111827', marginBottom: 6 },
  sigLbl:      { fontSize: 8.8, color: '#374151', paddingRight: 6 },
  sigDate:     { fontSize: 8.1, color: '#6b7280', marginTop: 4 },

  footer:      { borderTopWidth: 0.45, borderTopColor: '#d1d5db', paddingTop: 7, marginTop: 'auto' },
  footerTxt:   { fontSize: 7.8, color: '#6b7280', textAlign: 'center', lineHeight: 1.65 },
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
  const endD   = new Date(today + 'T00:00:00Z')
  const days   = Math.floor((endD - startD) / 86400000) + 1
  const fmt    = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  return { days, label: `${fmt(startStr)} – ${fmt(today)} (${days} วัน)`, amount: days * ratePerDay, ratePerDay }
}

export default function InvoicePDF({ invoice: inv, items = [], company: settingsMap = {} }) {
  if (!inv) return null

  const company    = settingsMap?.company ?? {}
  const ratePerDay = Number(settingsMap?.invoice?.penalty_rate_per_day ?? 100)
  const penalty    = calcPenaltyPDF(inv, ratePerDay)
  const discount   = Math.min(Number(inv.penalty_discount ?? 0), penalty?.amount ?? 0)
  const netPenalty = (penalty?.amount ?? 0) - discount
  const grandTotal = Number(inv.total_amount) + netPenalty

  const displayItems = items.length > 0 ? items : [{
    description: TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type,
    quantity: 1,
    unit_price: inv.total_amount,
    amount: inv.total_amount,
  }]

  const room      = inv.rooms
  const bldg      = room?.buildings
  const typeLabel = TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type

  return (
    <Document title={`ใบแจ้งหนี้ ${inv.invoice_number}`}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.header}>
          <View style={S.companyCol}>
            <Text style={S.coName}>{company.name || 'บริษัท'}</Text>
            {company.address && <Text style={S.coSub}>{k(company.address)}</Text>}
            {(company.phone || company.tax_id) && (
              <Text style={S.coSub}>
                {k([
                  company.phone  && `โทร ${company.phone}`,
                  company.tax_id && `เลขที่ผู้เสียภาษี ${company.tax_id}`,
                ].filter(Boolean).join('   ·   '))}
              </Text>
            )}
          </View>
          <View style={S.titleCol}>
            <Text style={S.titleMain}>{k('ใบแจ้งหนี้')}</Text>
            <Text style={S.titleEn}>Invoice</Text>
            <Text style={S.titleCopy}>{k('ต้นฉบับ / Original')}</Text>
          </View>
        </View>

        <View style={S.ruleTop} />
        <View style={S.ruleSub} />

        {/* Doc meta */}
        <View style={S.introRow}>
          <View style={S.introText}>
            <Text style={S.introLine}>{k('กรุณาชำระเงินตามรายการด้านล่างภายในวันที่กำหนด')}</Text>
            <Text style={S.introLine}>{k('หากมีข้อสงสัยกรุณาติดต่อเจ้าหน้าที่')}</Text>
          </View>
          <View style={S.metaPanel}>
            <View style={S.metaRow}>
              <Text style={S.metaLbl}>{k('เลขที่เอกสาร')}</Text>
              <Text style={S.metaVal}>{inv.invoice_number}</Text>
            </View>
            {inv.billing_period && (
              <View style={S.metaRow}>
                <Text style={S.metaLbl}>{k('รอบบิล')}</Text>
                <Text style={S.metaVal}>{k(inv.billing_period)}</Text>
              </View>
            )}
            <View style={S.metaRow}>
              <Text style={S.metaLbl}>{k('วันออกเอกสาร')}</Text>
              <Text style={S.metaVal}>{k(thaiDate(inv.issue_date))}</Text>
            </View>
            <View style={S.metaRowLast}>
              <Text style={S.metaLbl}>{k('ครบกำหนดชำระ')}</Text>
              <Text style={S.metaValRed}>{k(thaiDate(inv.due_date))}</Text>
            </View>
          </View>
        </View>

        {/* Parties */}
        <View style={S.partyRow}>
          <View style={S.partyBox}>
            <Text style={S.partyLbl}>{k('ผู้ออกใบแจ้งหนี้')}</Text>
            <Text style={S.partyName}>{company.name || '—'}</Text>
            {company.address && <Text style={S.partySub}>{k(company.address)}</Text>}
            {company.phone   && <Text style={S.partySub}>{k(`โทร ${company.phone}`)}</Text>}
          </View>
          <View style={S.partyBoxMid}>
            <Text style={S.partyLbl}>{k('เรียน / ผู้รับแจ้ง')}</Text>
            <Text style={S.partyName}>{inv.tenants?.full_name ?? '—'}</Text>
            {inv.tenants?.phone && <Text style={S.partySub}>{k(`โทร ${inv.tenants.phone}`)}</Text>}
          </View>
          <View style={S.partyBoxLast}>
            <Text style={S.partyLbl}>{k('ข้อมูลห้อง')}</Text>
            <Text style={S.partyName}>{k(`ห้อง ${room?.room_number ?? '—'}`)}</Text>
            {bldg?.name  && <Text style={S.partySub}>{k(bldg.name)}</Text>}
            {typeLabel   && <Text style={S.partySub}>{k(typeLabel)}</Text>}
          </View>
        </View>

        {/* Table */}
        <View style={S.table}>
          <View style={S.tblHead}>
            <Text style={[S.cNo,    S.thTxt]}>#</Text>
            <Text style={[S.cDesc,  S.thTxt]}>{k('รายการ')}</Text>
            <Text style={[S.cQty,   S.thTxt]}>{k('จำนวน')}</Text>
            <Text style={[S.cPrice, S.thTxt]}>{k('ราคา/หน่วย')}</Text>
            <Text style={[S.cAmt,   S.thTxt]}>{k('จำนวนเงิน')}</Text>
          </View>

          {displayItems.map((it, i) => (
            <View key={i} style={it.amount < 0 ? S.tblRowGreen : S.tblRow}>
              <Text style={[S.cNo, it.amount < 0 ? S.tdGreen : S.tdTxt]}>{i + 1}</Text>
              <View style={S.cDesc}>
                <Text style={[it.amount < 0 ? S.tdGreen : S.tdTxt, { fontWeight: 700 }]}>{k(it.description)}</Text>
                {it.sub && <Text style={S.tdSub}>{k(it.sub)}</Text>}
              </View>
              <Text style={[S.cQty,   it.amount < 0 ? S.tdGreen : S.tdTxt]}>{it.quantity}</Text>
              <Text style={[S.cPrice, it.amount < 0 ? S.tdGreen : S.tdTxt]}>{baht(Math.abs(it.unit_price))}</Text>
              <Text style={[S.cAmt,   it.amount < 0 ? S.tdGreen : S.tdTxt, { fontWeight: 700 }]}>
                {it.amount < 0 ? '-' : ''}{baht(Math.abs(it.amount))}
              </Text>
            </View>
          ))}

          {penalty && (
            <View style={S.tblRowRed}>
              <Text style={[S.cNo, S.tdRed]}>{displayItems.length + 1}</Text>
              <View style={S.cDesc}>
                <Text style={[S.tdRed, { fontWeight: 700 }]}>{k('ค่าปรับชำระล่าช้า')}</Text>
                <Text style={[S.tdSub, { color: '#ef4444' }]}>{k(penalty.label)}</Text>
              </View>
              <Text style={[S.cQty,   S.tdRed]}>{penalty.days}</Text>
              <Text style={[S.cPrice, S.tdRed]}>{baht(penalty.ratePerDay)}</Text>
              <Text style={[S.cAmt,   S.tdRed, { fontWeight: 700 }]}>{baht(penalty.amount)}</Text>
            </View>
          )}

          {discount > 0 && (
            <View style={S.tblRowGreen}>
              <Text style={[S.cNo, S.tdGreen]}>{displayItems.length + (penalty ? 2 : 1)}</Text>
              <View style={S.cDesc}>
                <Text style={[S.tdGreen, { fontWeight: 700 }]}>{k('ส่วนลดค่าปรับ')}</Text>
                {inv.penalty_discount_note && (
                  <Text style={[S.tdSub, { color: '#16a34a' }]}>{k(inv.penalty_discount_note)}</Text>
                )}
              </View>
              <Text style={[S.cQty,   S.tdGreen]}>1</Text>
              <Text style={[S.cPrice, S.tdGreen]}></Text>
              <Text style={[S.cAmt,   S.tdGreen, { fontWeight: 700 }]}>-{baht(discount)}</Text>
            </View>
          )}
        </View>

        {/* Totals */}
        <View style={S.summaryWrap}>
          <View style={S.totals}>
            <View style={S.totRow}>
              <Text style={S.totLbl}>{k('รวมค่าเช่า / บริการ')}</Text>
              <Text style={S.totVal}>{baht(Number(inv.total_amount))}</Text>
            </View>
            {penalty && (
              <View style={S.totRow}>
                <Text style={S.totLbl}>{k('ค่าปรับชำระล่าช้า')}</Text>
                <Text style={S.totValRed}>{baht(penalty.amount)}</Text>
              </View>
            )}
            {discount > 0 && (
              <View style={S.totRow}>
                <Text style={S.totLbl}>{k('ส่วนลดค่าปรับ')}</Text>
                <Text style={S.totValGreen}>-{baht(discount)}</Text>
              </View>
            )}
            <View style={S.grandRow}>
              <Text style={S.grandLbl}>{k('ยอดที่ต้องชำระ')}</Text>
              <Text style={S.grandVal}>{baht(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Bank info */}
        {company.bank_account && (
          <View style={S.bankBox}>
            <Text style={S.bankTitle}>{k('ช่องทางการชำระเงิน')}</Text>
            <Text style={S.bankLine}>{k(company.bank_account)}</Text>
          </View>
        )}

        {/* Signature */}
        <View style={S.sigRow}>
          <View style={S.sigBox}>
            <View style={S.sigSpace} />
            <View style={S.sigLine} />
            <Text style={S.sigLbl}>{k('ผู้ออกเอกสาร / Authorized By')}</Text>
            <Text style={S.sigDate}>{k('วันที่ .....................................................')}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.footerTxt}>
            {k('เอกสารนี้ออกโดยระบบคอมพิวเตอร์  ·  กรุณาเก็บเอกสารนี้ไว้เป็นหลักฐาน')}
            {company.email ? `  ·  ${company.email}` : ''}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
