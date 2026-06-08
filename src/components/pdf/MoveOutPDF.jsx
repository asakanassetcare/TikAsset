import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { registerFonts, thaiDate, baht } from '../../lib/pdf'

registerFonts()

const S = StyleSheet.create({
  page:    { fontFamily: 'Sarabun', fontSize: 11, padding: 40, color: '#111' },
  header:  { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 12 },
  company: { fontSize: 15, fontWeight: 700 },
  title:   { fontSize: 14, fontWeight: 700, textAlign: 'center', marginBottom: 16 },
  section: { marginBottom: 14 },
  sHd:     { fontSize: 10, fontWeight: 700, color: '#555', marginBottom: 6, textTransform: 'uppercase' },
  row:     { flexDirection: 'row', marginBottom: 5 },
  label:   { width: 170, color: '#555' },
  value:   { flex: 1, fontWeight: 700 },
  divider: { borderTopWidth: 1, borderTopColor: '#ddd', marginVertical: 10 },
  sumBox:  { padding: 14, backgroundColor: '#f9fafb', borderRadius: 6, marginTop: 10 },
  sumRow:  { flexDirection: 'row', marginBottom: 5 },
  netPos:  { fontSize: 14, fontWeight: 700, color: '#16a34a' },
  netNeg:  { fontSize: 14, fontWeight: 700, color: '#dc2626' },
  footer:  { marginTop: 40, flexDirection: 'row', justifyContent: 'space-between' },
  sigBox:  { width: 180, alignItems: 'center' },
  sigLine: { borderTopWidth: 1, borderTopColor: '#333', width: 150, marginTop: 40, marginBottom: 4 },
})

export default function MoveOutPDF({ moveOut: mo, company = {} }) {
  if (!mo) return null
  const refund = Number(mo.refund_amount) || 0
  const charge = Number(mo.additional_charge) || 0
  return (
    <Document title={`ย้ายออก ${mo.move_out_number}`}>
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <Text style={S.company}>{company.name || 'บริษัท'}</Text>
          {company.address && <Text style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{company.address}</Text>}
        </View>

        <Text style={S.title}>เอกสารสรุปการย้ายออก</Text>

        <View style={S.section}>
          <Text style={S.sHd}>ข้อมูลทั่วไป</Text>
          <View style={S.row}><Text style={S.label}>เลขที่</Text><Text style={S.value}>{mo.move_out_number}</Text></View>
          <View style={S.row}><Text style={S.label}>สัญญา</Text><Text style={S.value}>{mo.contracts?.contract_number}</Text></View>
          <View style={S.row}><Text style={S.label}>ห้อง</Text><Text style={S.value}>{mo.rooms?.buildings?.name} ห้อง {mo.rooms?.room_number}</Text></View>
          <View style={S.row}><Text style={S.label}>ผู้เช่า</Text><Text style={S.value}>{mo.tenants?.full_name}</Text></View>
          <View style={S.row}><Text style={S.label}>วันย้ายออก</Text><Text style={S.value}>{thaiDate(mo.move_out_date)}</Text></View>
          {mo.is_early_termination && <View style={S.row}><Text style={S.label}>ยกเลิกก่อนกำหนด</Text><Text style={[S.value, { color: '#dc2626' }]}>ใช่</Text></View>}
        </View>

        {(mo.electric_meter_end != null || mo.water_meter_end != null) && (
          <View style={S.section}>
            <Text style={S.sHd}>มิเตอร์ปลายสัญญา</Text>
            {mo.electric_meter_end != null && <View style={S.row}><Text style={S.label}>มิเตอร์ไฟ</Text><Text style={S.value}>{mo.electric_meter_end}</Text></View>}
            {mo.water_meter_end   != null && <View style={S.row}><Text style={S.label}>มิเตอร์น้ำ</Text><Text style={S.value}>{mo.water_meter_end}</Text></View>}
          </View>
        )}

        <View style={S.sumBox}>
          <Text style={S.sHd}>สรุปการคืนเงินประกัน</Text>
          <View style={S.sumRow}><Text style={{ flex: 1 }}>เงินประกัน</Text><Text>{baht(mo.deposit_amount)}</Text></View>
          {Number(mo.outstanding_invoice_total) > 0 && <View style={S.sumRow}><Text style={{ flex: 1, color: '#dc2626' }}>ค่าเช่าค้างชำระ</Text><Text style={{ color: '#dc2626' }}>- {baht(mo.outstanding_invoice_total)}</Text></View>}
          {Number(mo.repair_cost) > 0 && <View style={S.sumRow}><Text style={{ flex: 1, color: '#dc2626' }}>ค่าซ่อมแซม</Text><Text style={{ color: '#dc2626' }}>- {baht(mo.repair_cost)}</Text></View>}
          {Number(mo.penalty_cost) > 0 && <View style={S.sumRow}><Text style={{ flex: 1, color: '#dc2626' }}>ค่าปรับ</Text><Text style={{ color: '#dc2626' }}>- {baht(mo.penalty_cost)}</Text></View>}
          {Number(mo.other_deduction) > 0 && <View style={S.sumRow}><Text style={{ flex: 1, color: '#dc2626' }}>หักอื่นๆ</Text><Text style={{ color: '#dc2626' }}>- {baht(mo.other_deduction)}</Text></View>}
          {Number(mo.rent_to_move_out) > 0 && <View style={S.sumRow}><Text style={{ flex: 1, color: '#dc2626' }}>ค่าเช่าจนถึงวันย้ายออก</Text><Text style={{ color: '#dc2626' }}>- {baht(mo.rent_to_move_out)}</Text></View>}
          <View style={S.divider} />
          {refund > 0 && (
            <View style={S.sumRow}>
              <Text style={{ flex: 1, fontWeight: 700 }}>คืนให้ผู้เช่า</Text>
              <Text style={S.netPos}>{baht(refund)}</Text>
            </View>
          )}
          {charge > 0 && (
            <View style={S.sumRow}>
              <Text style={{ flex: 1, fontWeight: 700 }}>ผู้เช่าต้องชำระเพิ่ม</Text>
              <Text style={S.netNeg}>{baht(charge)}</Text>
            </View>
          )}
          {refund === 0 && charge === 0 && (
            <View style={S.sumRow}><Text style={{ flex: 1 }}>ยอดสุทธิ</Text><Text>฿0</Text></View>
          )}
        </View>

        {mo.reason && (
          <View style={[S.section, { marginTop: 14 }]}>
            <Text style={S.sHd}>เหตุผลย้ายออก</Text>
            <Text>{mo.reason}</Text>
          </View>
        )}

        <View style={S.footer}>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={{ fontSize: 10 }}>ผู้จัดการ / บริษัท</Text>
            <Text style={{ fontSize: 10, color: '#888' }}>วันที่ ............</Text>
          </View>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={{ fontSize: 10 }}>ผู้เช่า ({mo.tenants?.full_name})</Text>
            <Text style={{ fontSize: 10, color: '#888' }}>วันที่ ............</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
