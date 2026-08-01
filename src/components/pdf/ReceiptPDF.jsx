import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { registerFonts, thaiDate, baht } from '../../lib/pdf'

registerFonts()

const S = StyleSheet.create({
  page:       { fontFamily: 'Sarabun', fontSize: 10, color: '#111827', padding: '44 50 38 50' },
  watermarkMain:  {
    position: 'absolute',
    top: 365,
    left: 30,
    width: 540,
    textAlign: 'center',
    fontSize: 52,
    fontWeight: 700,
    color: '#94a3b8',
    opacity: 0.055,
    transform: 'rotate(-30deg)',
  },
  watermarkVoid: {
    position: 'absolute',
    top: 290,
    left: 30,
    width: 540,
    textAlign: 'center',
    fontSize: 68,
    fontWeight: 700,
    color: '#ef4444',
    opacity: 0.12,
    transform: 'rotate(-30deg)',
  },
  watermarkMicro: {
    position: 'absolute',
    left: -22,
    width: 660,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: 700,
    color: '#64748b',
    opacity: 0.07,
    transform: 'rotate(-30deg)',
  },

  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  companyCol: { flex: 1, paddingRight: 28 },
  coName:     { fontSize: 15.5, fontWeight: 700, letterSpacing: 0.2 },
  coSub:      { fontSize: 8.6, color: '#4b5563', marginTop: 3, lineHeight: 1.55 },
  titleCol:   { width: 205, alignItems: 'flex-end' },
  titleMain:  { fontSize: 22, fontWeight: 700, textAlign: 'right', lineHeight: 1.15 },
  titleEn:    { fontSize: 8.8, color: '#4b5563', marginTop: 2, textAlign: 'right', letterSpacing: 0.4 },
  titleOrig:  { fontSize: 8.2, color: '#6b7280', marginTop: 5, textAlign: 'right' },

  ruleTop:    { borderBottomWidth: 1.2, borderBottomColor: '#111827', marginBottom: 2 },
  ruleSub:    { borderBottomWidth: 0.45, borderBottomColor: '#9ca3af', marginBottom: 14 },

  introRow:   { flexDirection: 'row', marginBottom: 18 },
  introText:  { flex: 1, paddingRight: 22 },
  introLine:  { fontSize: 9.4, color: '#374151', lineHeight: 1.7 },
  metaPanel:  { width: 205, borderWidth: 0.65, borderColor: '#111827' },
  metaRow:    { flexDirection: 'row', borderBottomWidth: 0.45, borderBottomColor: '#d1d5db' },
  metaRowLast:{ flexDirection: 'row' },
  metaLbl:    { width: 78, fontSize: 8.4, color: '#4b5563', padding: '5 7', borderRightWidth: 0.45, borderRightColor: '#d1d5db' },
  metaVal:    { flex: 1, fontSize: 9.6, fontWeight: 700, padding: '5 7', textAlign: 'right' },

  partyRow:   { flexDirection: 'row', borderTopWidth: 0.65, borderBottomWidth: 0.65, borderColor: '#111827', marginBottom: 20 },
  partyBox:   { flex: 1, padding: '10 12 10 0' },
  partyBoxMid:{ flex: 1, padding: '10 12', borderLeftWidth: 0.45, borderLeftColor: '#d1d5db' },
  partyBoxLast:{ flex: 1, padding: '10 0 10 12', borderLeftWidth: 0.45, borderLeftColor: '#d1d5db' },
  partyLbl:   { fontSize: 8, color: '#6b7280', marginBottom: 5, paddingRight: 6 },
  partyName:  { fontSize: 11.2, fontWeight: 700, marginBottom: 3, paddingRight: 6 },
  partySub:   { fontSize: 8.6, color: '#374151', lineHeight: 1.55, paddingRight: 6 },

  table:      { marginBottom: 12 },
  tblHead:    { flexDirection: 'row', borderTopWidth: 0.8, borderBottomWidth: 0.8, borderColor: '#111827', paddingVertical: 7 },
  tblRow:     { flexDirection: 'row', borderBottomWidth: 0.45, borderBottomColor: '#d1d5db', paddingVertical: 10, minHeight: 36 },
  cNo:        { width: 26, fontSize: 8.3, textAlign: 'center', paddingRight: 2 },
  cDesc:      { flex: 1, paddingRight: 12 },
  cQty:       { width: 58, textAlign: 'center', paddingRight: 3 },
  cPrice:     { width: 94, textAlign: 'right', paddingRight: 3 },
  cAmt:       { width: 106, textAlign: 'right', paddingRight: 4 },
  thTxt:      { fontSize: 8.2, fontWeight: 700, color: '#374151', paddingRight: 5 },
  tdTxt:      { fontSize: 9.3, paddingRight: 4 },
  tdSub:      { fontSize: 8.2, color: '#6b7280', marginTop: 2, lineHeight: 1.45 },

  summaryWrap:{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 22 },
  totals:     { width: 255 },
  totRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 0.45, borderBottomColor: '#d1d5db' },
  totLbl:     { fontSize: 9, color: '#4b5563', paddingRight: 6 },
  totVal:     { fontSize: 9.2, paddingRight: 2 },
  grandRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1.2, borderBottomWidth: 1.2, borderColor: '#111827', marginTop: 2 },
  grandLbl:   { fontSize: 10.5, fontWeight: 700, paddingRight: 6 },
  grandVal:   { fontSize: 13.5, fontWeight: 700, paddingRight: 2 },

  note:       { borderTopWidth: 0.45, borderTopColor: '#9ca3af', paddingTop: 9, marginBottom: 28 },
  noteLbl:    { fontSize: 8.2, color: '#6b7280', marginBottom: 4 },
  noteTxt:    { fontSize: 8.8, color: '#374151', lineHeight: 1.65, paddingRight: 8 },

  sigRow:     { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
  sigBox:     { alignItems: 'center', width: 205 },
  sigSpace:   { height: 38 },
  sigLine:    { width: 185, borderBottomWidth: 0.8, borderBottomColor: '#111827', marginBottom: 6 },
  sigLbl:     { fontSize: 8.8, color: '#374151', paddingRight: 6 },
  sigDate:    { fontSize: 8.1, color: '#6b7280', marginTop: 4 },

  footer:     { borderTopWidth: 0.45, borderTopColor: '#d1d5db', paddingTop: 7, marginTop: 'auto' },
  footerTxt:  { fontSize: 7.8, color: '#6b7280', textAlign: 'center', lineHeight: 1.65 },
})

const TYPE_LABEL = {
  contract_initial: 'ค่าประกัน + ค่าเช่าล่วงหน้า',
  monthly_rent:     'ค่าเช่ารายเดือน',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินมัดจำจอง',
  other:            'อื่นๆ',
}

const k = (t) => `${t}  `

export default function ReceiptPDF({ payment, invoice: inv, company = {}, isVoided = false, originalReceiptNumber = null }) {
  if (!payment || !inv) return null

  const penaltyAmt = Number(payment.penalty_amount ?? 0)
  const baseAmt    = Number(payment.amount) - penaltyAmt
  const amt        = Number(payment.amount)
  const docRef     = `RCV-${inv.invoice_number}`
  const room   = inv.rooms
  const bldg   = room?.buildings
  const roomHouseNo = room?.title_deed_number
  const typeLabel = TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type ?? 'ค่าเช่า'

  return (
    <Document title={`ใบเสร็จรับเงิน ${docRef}`}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.header}>
          <View style={S.companyCol}>
            <Text style={S.coName}>{company.name || 'บริษัท'}</Text>
            {company.address && <Text style={S.coSub}>{k(company.address)}</Text>}
            {(company.phone || company.tax_id) && (
              <Text style={S.coSub}>
                {k([company.phone && `โทร ${company.phone}`, company.tax_id && `เลขที่ผู้เสียภาษี ${company.tax_id}`].filter(Boolean).join('   ·   '))}
              </Text>
            )}
          </View>
          <View style={S.titleCol}>
            <Text style={S.titleMain}>{k('ใบเสร็จรับเงิน')}</Text>
            <Text style={S.titleEn}>Official Receipt</Text>
            <Text style={S.titleOrig}>{k(isVoided ? 'ยกเลิกแล้ว / VOID' : originalReceiptNumber ? 'ใบแทน / Replacement' : 'ต้นฉบับ / Original')}</Text>
          </View>
        </View>

        <View style={S.ruleTop} />
        <View style={S.ruleSub} />

        {/* Doc meta */}
        <View style={S.introRow}>
          <View style={S.introText}>
            <Text style={S.introLine}>
              {k('ได้รับชำระเงินตามใบแจ้งหนี้ที่ระบุด้านล่างเรียบร้อยแล้ว เอกสารนี้ใช้เป็นหลักฐานการรับชำระเงิน')}
            </Text>
          </View>
          <View style={S.metaPanel}>
            <View style={S.metaRow}>
              <Text style={S.metaLbl}>{k('เลขที่เอกสาร')}</Text>
              <Text style={S.metaVal}>{docRef}</Text>
            </View>
            <View style={S.metaRow}>
              <Text style={S.metaLbl}>{k('วันที่ชำระ')}</Text>
              <Text style={S.metaVal}>{k(thaiDate(payment.paid_date))}</Text>
            </View>
            <View style={S.metaRow}>
              <Text style={S.metaLbl}>{k('วันออกเอกสาร')}</Text>
              <Text style={S.metaVal}>{k(thaiDate(payment.approved_at))}</Text>
            </View>
            <View style={originalReceiptNumber ? S.metaRow : S.metaRowLast}>
              <Text style={S.metaLbl}>{k('อ้างอิงธนาคาร')}</Text>
              <Text style={S.metaVal}>{payment.bank_reference || '—'}</Text>
            </View>
            {originalReceiptNumber && (
              <View style={S.metaRowLast}>
                <Text style={S.metaLbl}>{k('แทนใบเสร็จ')}</Text>
                <Text style={[S.metaVal, { fontSize: 8.4 }]}>{originalReceiptNumber}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Parties */}
        <View style={S.partyRow}>
          <View style={S.partyBox}>
            <Text style={S.partyLbl}>{k('ผู้รับเงิน')}</Text>
            <Text style={S.partyName}>{company.name || '—'}</Text>
            {company.address && <Text style={S.partySub}>{k(company.address)}</Text>}
            {company.phone   && <Text style={S.partySub}>{k(`โทร ${company.phone}`)}</Text>}
          </View>
          <View style={S.partyBoxMid}>
            <Text style={S.partyLbl}>{k('ผู้ชำระ')}</Text>
            <Text style={S.partyName}>{inv.tenants?.full_name ?? '—'}</Text>
            <Text style={S.partySub}>{k(`${bldg?.name ?? ''} ห้อง ${room?.room_number ?? ''}`)}</Text>
            {inv.tenants?.phone && <Text style={S.partySub}>{k(`โทร ${inv.tenants.phone}`)}</Text>}
            {roomHouseNo && <Text style={S.partySub}>{k(`บ้านเลขที่ ${roomHouseNo}`)}</Text>}
          </View>
          <View style={S.partyBoxLast}>
            <Text style={S.partyLbl}>{k('อ้างอิงใบแจ้งหนี้')}</Text>
            <Text style={S.partyName}>{inv.invoice_number}</Text>
            {inv.billing_period && <Text style={S.partySub}>{k(`งวด ${inv.billing_period}`)}</Text>}
            {payment.bank_name  && <Text style={S.partySub}>{k(`ธนาคาร ${payment.bank_name}`)}</Text>}
          </View>
        </View>

        {/* Table */}
        <View style={S.table}>
          <View style={S.tblHead}>
            <Text style={[S.cNo,   S.thTxt]}>#</Text>
            <Text style={[S.cDesc, S.thTxt]}>{k('รายการ')}</Text>
            <Text style={[S.cQty,  S.thTxt]}>{k('จำนวน')}</Text>
            <Text style={[S.cPrice,S.thTxt]}>{k('ราคา/หน่วย')}</Text>
            <Text style={[S.cAmt,  S.thTxt]}>{k('จำนวนเงิน')}</Text>
          </View>

          <View style={S.tblRow}>
            <Text style={[S.cNo, S.tdTxt]}>1</Text>
            <View style={S.cDesc}>
              <Text style={[S.tdTxt, { fontWeight: 700 }]}>{k(typeLabel)}</Text>
              <Text style={S.tdSub}>{k(`${bldg?.name ?? ''} ห้อง ${room?.room_number ?? ''}`)}</Text>
              {payment.note && <Text style={S.tdSub}>{payment.note}</Text>}
            </View>
            <Text style={[S.cQty,  S.tdTxt]}>1</Text>
            <Text style={[S.cPrice,S.tdTxt]}>{baht(baseAmt)}</Text>
            <Text style={[S.cAmt,  S.tdTxt, { fontWeight: 700 }]}>{baht(baseAmt)}</Text>
          </View>

          {penaltyAmt > 0 && (
            <View style={S.tblRow}>
              <Text style={[S.cNo, S.tdTxt]}>2</Text>
              <View style={S.cDesc}>
                <Text style={[S.tdTxt, { fontWeight: 700 }]}>{k('ค่าปรับชำระล่าช้า')}</Text>
                <Text style={S.tdSub}>{k(`${payment.penalty_days ?? 0} วัน`)}</Text>
              </View>
              <Text style={[S.cQty,  S.tdTxt]}>1</Text>
              <Text style={[S.cPrice,S.tdTxt]}>{baht(penaltyAmt)}</Text>
              <Text style={[S.cAmt,  S.tdTxt, { fontWeight: 700 }]}>{baht(penaltyAmt)}</Text>
            </View>
          )}
        </View>

        {/* Totals */}
        <View style={S.summaryWrap}>
          <View style={S.totals}>
            <View style={S.totRow}>
              <Text style={S.totLbl}>{k('จำนวนเงินรวม')}</Text>
              <Text style={S.totVal}>{baht(amt)}</Text>
            </View>
            <View style={S.totRow}>
              <Text style={S.totLbl}>{k('ภาษีมูลค่าเพิ่ม (VAT)')}</Text>
              <Text style={S.totVal}>—</Text>
            </View>
            <View style={S.grandRow}>
              <Text style={S.grandLbl}>{k('รวมทั้งสิ้น')}</Text>
              <Text style={S.grandVal}>{baht(amt)}</Text>
            </View>
          </View>
        </View>

        {/* Note */}
        <View style={S.note}>
          <Text style={S.noteLbl}>{k('หมายเหตุ')}</Text>
          <Text style={S.noteTxt}>
            {k('เอกสารนี้ออกโดยระบบคอมพิวเตอร์ ใช้เป็นหลักฐานการรับชำระเงินชั่วคราว')}
          </Text>
        </View>

        {/* Signatures */}
        <View style={S.sigRow}>
          <View style={S.sigBox}>
            <View style={S.sigSpace} />
            <View style={S.sigLine} />
            <Text style={S.sigLbl}>{k('ผู้รับเงิน / Authorized Signature')}</Text>
            <Text style={S.sigDate}>{k('วันที่ .....................................................')}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.footerTxt}>
            {k('เอกสารนี้ออกโดยระบบคอมพิวเตอร์  ·  ใช้เป็นหลักฐานการรับชำระเงินชั่วคราว')}
            {company.email ? `  ·  ${company.email}` : ''}
          </Text>
        </View>

        <Text fixed style={S.watermarkMain}>Asakan AssetCare</Text>
        {[245, 430, 615].map(top => (
          <Text key={top} fixed style={[S.watermarkMicro, { top }]}>
            {`Asakan AssetCare · ${docRef} · Asakan AssetCare · ${docRef} · Asakan AssetCare`}
          </Text>
        ))}
        {isVoided && (
          <Text fixed style={S.watermarkVoid}>VOID / ยกเลิก</Text>
        )}

      </Page>
    </Document>
  )
}
