import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { registerFonts, thaiDate, baht } from '../../lib/pdf'

registerFonts()

const S = StyleSheet.create({
  page:      { fontFamily: 'Sarabun', fontSize: 10, color: '#111827', padding: '44 50 38 50' },

  // ── Header ──────────────────────────────────────────────────
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  companyCol:{ flex: 1, paddingRight: 28 },
  coName:    { fontSize: 15.5, fontWeight: 700, letterSpacing: 0.2 },
  coSub:     { fontSize: 8.6, color: '#4b5563', marginTop: 3, lineHeight: 1.55 },
  titleCol:  { width: 205, alignItems: 'flex-end' },
  titleMain: { fontSize: 22, fontWeight: 700, textAlign: 'right', lineHeight: 1.15 },
  titleEn:   { fontSize: 8.8, color: '#4b5563', marginTop: 2, textAlign: 'right', letterSpacing: 0.4 },
  titleOrig: { fontSize: 8.2, color: '#6b7280', marginTop: 5, textAlign: 'right' },

  // ── Rules ───────────────────────────────────────────────────
  ruleTop:   { borderBottomWidth: 1.2, borderBottomColor: '#111827', marginBottom: 2 },
  ruleSub:   { borderBottomWidth: 0.45, borderBottomColor: '#9ca3af', marginBottom: 14 },

  // ── Doc meta ────────────────────────────────────────────────
  introRow:  { flexDirection: 'row', marginBottom: 18 },
  introText: { flex: 1, paddingRight: 22 },
  introLine: { fontSize: 9.4, color: '#374151', lineHeight: 1.7 },
  metaPanel: { width: 205, borderWidth: 0.65, borderColor: '#111827' },
  metaRow:   { flexDirection: 'row', borderBottomWidth: 0.45, borderBottomColor: '#d1d5db' },
  metaRowLast:{ flexDirection: 'row' },
  metaLbl:   { width: 78, fontSize: 8.4, color: '#4b5563', padding: '5 7', borderRightWidth: 0.45, borderRightColor: '#d1d5db' },
  metaVal:   { flex: 1, fontSize: 9.6, fontWeight: 700, padding: '5 7', textAlign: 'right' },

  // ── Party row ───────────────────────────────────────────────
  partyRow:  { flexDirection: 'row', borderTopWidth: 0.65, borderBottomWidth: 0.65, borderColor: '#111827', marginBottom: 20 },
  partyBox:  { flex: 1, padding: '10 12 10 0' },
  partyBoxMid:{ flex: 1, padding: '10 12', borderLeftWidth: 0.45, borderLeftColor: '#d1d5db' },
  partyBoxLast:{ flex: 1, padding: '10 0 10 12', borderLeftWidth: 0.45, borderLeftColor: '#d1d5db' },
  partyLbl:  { fontSize: 8, color: '#6b7280', marginBottom: 5, paddingRight: 6 },
  partyName: { fontSize: 11.2, fontWeight: 700, marginBottom: 3, paddingRight: 6 },
  partySub:  { fontSize: 8.6, color: '#374151', lineHeight: 1.55, paddingRight: 6 },

  // ── Table ───────────────────────────────────────────────────
  table:     { marginBottom: 12 },
  tblHead:   { flexDirection: 'row', borderTopWidth: 0.8, borderBottomWidth: 0.8, borderColor: '#111827', paddingVertical: 7 },
  tblRow:    { flexDirection: 'row', borderBottomWidth: 0.45, borderBottomColor: '#d1d5db', paddingVertical: 10, minHeight: 36 },
  cNo:       { width: 26, fontSize: 8.3, textAlign: 'center', paddingRight: 2 },
  cDesc:     { flex: 1, paddingRight: 12 },
  cQty:      { width: 58, textAlign: 'center', paddingRight: 3 },
  cPrice:    { width: 94, textAlign: 'right', paddingRight: 3 },
  cAmt:      { width: 106, textAlign: 'right', paddingRight: 4 },
  thTxt:     { fontSize: 8.2, fontWeight: 700, color: '#374151', paddingRight: 5 },
  tdTxt:     { fontSize: 9.3, paddingRight: 4 },
  tdSub:     { fontSize: 8.2, color: '#6b7280', marginTop: 2, lineHeight: 1.45 },

  // ── Totals ──────────────────────────────────────────────────
  summaryWrap:{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 22 },
  totals:    { width: 255 },
  totRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 0.45, borderBottomColor: '#d1d5db' },
  totLbl:    { fontSize: 9, color: '#4b5563', paddingRight: 6 },
  totVal:    { fontSize: 9.2, paddingRight: 2 },
  grandRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1.2, borderBottomWidth: 1.2, borderColor: '#111827', marginTop: 2 },
  grandLbl:  { fontSize: 10.5, fontWeight: 700, paddingRight: 6 },
  grandVal:  { fontSize: 13.5, fontWeight: 700, paddingRight: 2 },

  // ── Note ────────────────────────────────────────────────────
  note:      { borderTopWidth: 0.45, borderTopColor: '#9ca3af', paddingTop: 9, marginBottom: 28 },
  noteLbl:   { fontSize: 8.2, color: '#6b7280', marginBottom: 4, paddingRight: 6 },
  noteTxt:   { fontSize: 8.8, color: '#374151', lineHeight: 1.65, paddingRight: 8 },

  // ── Signatures ──────────────────────────────────────────────
  sigRow:    { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
  sigBox:    { alignItems: 'center', width: 205 },
  sigSpace:  { height: 38 },
  sigLine:   { width: 185, borderBottomWidth: 0.8, borderBottomColor: '#111827', marginBottom: 6 },
  sigLbl:    { fontSize: 8.8, color: '#374151', paddingRight: 6 },
  sigDate:   { fontSize: 8.1, color: '#6b7280', marginTop: 4 },

  // ── Footer ──────────────────────────────────────────────────
  footer:    { borderTopWidth: 0.45, borderTopColor: '#d1d5db', paddingTop: 7, marginTop: 'auto' },
  footerTxt: { fontSize: 7.8, color: '#6b7280', textAlign: 'center', lineHeight: 1.65 },
})

export default function AdvancePaymentReceiptPDF({ advancePayment, contract, company = {} }) {
  if (!advancePayment || !contract) return null

  const c   = contract
  const ap  = advancePayment
  const amt = Number(ap.amount)
  const docRef = `ADV-${c.contract_number}`
  const keep = (text) => `${text}\u00A0\u00A0`

  return (
    <Document title={`ใบรับเงิน ${docRef}`}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.header}>
          <View style={S.companyCol}>
            <Text style={S.coName}>{company.name || 'บริษัท'}</Text>
            {company.address && <Text style={S.coSub}>{company.address}</Text>}
            {(company.phone || company.tax_id) && (
              <Text style={S.coSub}>
                {[company.phone && `โทร ${company.phone}`, company.tax_id && `เลขที่ผู้เสียภาษี ${company.tax_id}`].filter(Boolean).join('   ·   ')}
              </Text>
            )}
          </View>
          <View style={S.titleCol}>
            <Text style={S.titleMain}>{keep('ใบรับเงิน')}</Text>
            <Text style={S.titleEn}>Advance Payment Receipt</Text>
            <Text style={S.titleOrig}>{keep('ต้นฉบับ / Original')}</Text>
          </View>
        </View>

        <View style={S.ruleTop} />
        <View style={S.ruleSub} />

        {/* Doc meta */}
        <View style={S.introRow}>
          <View style={S.introText}>
            <Text style={S.introLine}>
              {keep('ได้รับเงินค่าทำสัญญาล่วงหน้าตามรายละเอียดด้านล่าง เพื่อใช้เป็นหลักฐานการรับชำระเงินก่อนออกใบแจ้งหนี้หลักของสัญญา')}
            </Text>
          </View>
          <View style={S.metaPanel}>
            <View style={S.metaRow}>
              <Text style={S.metaLbl}>{keep('เลขที่เอกสาร')}</Text>
              <Text style={S.metaVal}>{docRef}</Text>
            </View>
            <View style={S.metaRowLast}>
              <Text style={S.metaLbl}>{keep('วันที่')}</Text>
              <Text style={S.metaVal}>{keep(thaiDate(ap.created_at))}</Text>
            </View>
          </View>
        </View>

        {/* Parties */}
        <View style={S.partyRow}>
          <View style={S.partyBox}>
            <Text style={S.partyLbl}>{keep('ผู้รับเงิน')}</Text>
            <Text style={S.partyName}>{company.name || '—'}</Text>
            {company.address && <Text style={S.partySub}>{company.address}</Text>}
            {company.phone   && <Text style={S.partySub}>{keep(`โทร ${company.phone}`)}</Text>}
          </View>
          <View style={S.partyBoxMid}>
            <Text style={S.partyLbl}>{keep('ผู้ชำระ')}</Text>
            <Text style={S.partyName}>{c.tenants?.full_name ?? '—'}</Text>
            <Text style={S.partySub}>
              {keep(`${c.rooms?.buildings?.name ?? ''} ห้อง ${c.rooms?.room_number ?? ''}`)}
            </Text>
            {c.tenants?.phone && <Text style={S.partySub}>{keep(`โทร ${c.tenants.phone}`)}</Text>}
          </View>
          <View style={S.partyBoxLast}>
            <Text style={S.partyLbl}>{keep('อ้างอิงสัญญา')}</Text>
            <Text style={S.partyName}>{c.contract_number}</Text>
            <Text style={S.partySub}>{keep(`เริ่มสัญญา ${thaiDate(c.contract_start_date)}`)}</Text>
            <Text style={S.partySub}>{keep(`กำหนดเข้าพัก ${thaiDate(c.move_in_date)}`)}</Text>
          </View>
        </View>

        {/* Table */}
        <View style={S.table}>
          <View style={S.tblHead}>
            <Text style={[S.cNo,    S.thTxt]}>#</Text>
            <Text style={[S.cDesc,  S.thTxt]}>{keep('รายการ')}</Text>
            <Text style={[S.cQty,   S.thTxt]}>{keep('จำนวน')}</Text>
            <Text style={[S.cPrice, S.thTxt]}>{keep('ราคา/หน่วย')}</Text>
            <Text style={[S.cAmt,   S.thTxt]}>{keep('จำนวนเงิน')}</Text>
          </View>

          <View style={S.tblRow}>
            <Text style={[S.cNo, S.tdTxt]}>1</Text>
            <View style={S.cDesc}>
              <Text style={[S.tdTxt, { fontWeight: 700 }]}>{keep('ค่าทำสัญญาล่วงหน้า')}</Text>
              <Text style={S.tdSub}>{keep(`Advance payment · ${c.rooms?.buildings?.name ?? ''} ห้อง ${c.rooms?.room_number ?? ''}`)}</Text>
              {ap.note && <Text style={S.tdSub}>{ap.note}</Text>}
            </View>
            <Text style={[S.cQty,   S.tdTxt]}>1</Text>
            <Text style={[S.cPrice, S.tdTxt]}>{baht(amt)}</Text>
            <Text style={[S.cAmt,   S.tdTxt, { fontWeight: 700 }]}>{baht(amt)}</Text>
          </View>
        </View>

        {/* Totals */}
        <View style={S.summaryWrap}>
          <View style={S.totals}>
            <View style={S.totRow}>
              <Text style={S.totLbl}>{keep('จำนวนเงินรวม')}</Text>
              <Text style={S.totVal}>{baht(amt)}</Text>
            </View>
            <View style={S.totRow}>
              <Text style={S.totLbl}>{keep('ภาษีมูลค่าเพิ่ม (VAT)')}</Text>
              <Text style={S.totVal}>—</Text>
            </View>
            <View style={S.grandRow}>
              <Text style={S.grandLbl}>{keep('รวมทั้งสิ้น')}</Text>
              <Text style={S.grandVal}>{baht(amt)}</Text>
            </View>
          </View>
        </View>

        {/* Note */}
        <View style={S.note}>
          <Text style={S.noteLbl}>{keep('หมายเหตุ')}</Text>
          <Text style={S.noteTxt}>
            {keep('ยอดดังกล่าวเป็นค่าทำสัญญาล่วงหน้า จะถูกหักออกจากใบแจ้งหนี้ค่าประกันและค่าเช่าล่วงหน้าโดยอัตโนมัติเมื่อสัญญาได้รับการอนุมัติ')}
          </Text>
        </View>

        {/* Signatures */}
        <View style={S.sigRow}>
          <View style={S.sigBox}>
            <View style={S.sigSpace} />
            <View style={S.sigLine} />
            <Text style={S.sigLbl}>{keep('ผู้รับเงิน / Authorized Signature')}</Text>
            <Text style={S.sigDate}>{keep('วันที่ .....................................................')}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.footerTxt}>
            {keep('เอกสารนี้ออกโดยระบบคอมพิวเตอร์  ·  ใช้เป็นหลักฐานการรับชำระเงินชั่วคราว')}
            {company.email ? `  ·  ${company.email}` : ''}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
