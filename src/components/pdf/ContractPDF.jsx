import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { registerFonts, thaiDate, baht } from '../../lib/pdf'

registerFonts()

const F = 9.5
const PAGE = { fontFamily: 'Sarabun', fontSize: F, paddingTop: 48, paddingBottom: 56, paddingHorizontal: 65, color: '#111' }

const S = StyleSheet.create({
  title:    { fontSize: 15, fontWeight: 700, textAlign: 'center', marginBottom: 5 },
  rule:     { borderBottomWidth: 1, borderBottomColor: '#222', marginBottom: 10 },
  ruleLight:{ borderBottomWidth: 0.5, borderBottomColor: '#bbb', marginVertical: 10 },
  metaRow:  { flexDirection: 'row', justifyContent: 'space-between', fontSize: F - 0.5, color: '#555', marginBottom: 12 },

  partyHd:  { fontWeight: 700, textDecoration: 'underline', fontSize: F + 0.5, marginTop: 8, marginBottom: 5 },
  pRow:     { flexDirection: 'row', marginBottom: 4 },
  pLabel:   { width: 140, color: '#555' },
  pVal:     { flex: 1, fontWeight: 700 },

  intro:    { fontSize: F, lineHeight: 1.75, marginTop: 10, marginBottom: 2 },

  clHd:     { fontWeight: 700, fontSize: F + 0.5, marginTop: 13, marginBottom: 5 },
  p:        { fontSize: F, lineHeight: 1.75, marginBottom: 5, marginLeft: 0, textIndent: 28 },
  sub:      { fontSize: F, lineHeight: 1.75, marginBottom: 4, marginLeft: 24 },
  subSub:   { fontSize: F, lineHeight: 1.75, marginBottom: 3, marginLeft: 52 },

  sigRow:   { flexDirection: 'row', justifyContent: 'space-around', marginTop: 32 },
  sigBox:   { alignItems: 'center', width: 165 },
  sigLine:  { borderTopWidth: 1, borderTopColor: '#333', width: 150, marginBottom: 5 },
  sigName:  { fontSize: 8.5, textAlign: 'center' },
  sigLabel: { fontSize: 8, color: '#555', textAlign: 'center', marginTop: 1 },

  tblWrap:  { marginTop: 8, borderWidth: 0.5, borderColor: '#888' },
  tblHead:  { flexDirection: 'row', backgroundColor: '#efefef', borderBottomWidth: 0.5, borderBottomColor: '#888' },
  tblRow:   { flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: '#ccc', minHeight: 20 },
  tblCell:  { fontSize: 8.5, lineHeight: 1.5, paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.3, borderRightColor: '#ccc' },
})

const DOT   = '......................................................'
const DOT_S = '..........................'

function Cl({ no, title }) {
  return <Text style={S.clHd}>ข้อ {no}  {title}</Text>
}
function P({ children }) { return <Text style={S.p}>{children}</Text> }
function Sub({ children }) { return <Text style={S.sub}>{children}</Text> }
function SubSub({ children }) { return <Text style={S.subSub}>{children}</Text> }
function PR({ label, value }) {
  return (
    <View style={S.pRow}>
      <Text style={S.pLabel}>{label}</Text>
      <Text style={S.pVal}>{value}</Text>
    </View>
  )
}
function SigPair({ left, right, leftLabel, rightLabel, date = true }) {
  return (
    <View style={S.sigRow}>
      <View style={S.sigBox}>
        <View style={S.sigLine} />
        <Text style={S.sigName}>{left}</Text>
        <Text style={S.sigLabel}>{leftLabel}</Text>
        {date && <Text style={[S.sigLabel, { marginTop: 3 }]}>วันที่ {DOT_S}</Text>}
      </View>
      <View style={S.sigBox}>
        <View style={S.sigLine} />
        <Text style={S.sigName}>{right}</Text>
        <Text style={S.sigLabel}>{rightLabel}</Text>
        {date && <Text style={[S.sigLabel, { marginTop: 3 }]}>วันที่ {DOT_S}</Text>}
      </View>
    </View>
  )
}

export default function ContractPDF({ contract: c, company = {} }) {
  if (!c) return null

  const co      = company.name    || DOT_S
  const coAddr  = company.address || DOT
  const coPhone = company.phone   || ''
  const coTax   = company.tax_id  || ''

  const tName   = c.tenants?.full_name || DOT_S
  const tPhone  = c.tenants?.phone     || ''
  const tIdCard = c.tenants?.id_card_number || DOT

  const bld    = c.rooms?.buildings?.name           || ''
  const proj   = c.rooms?.buildings?.projects?.name || ''
  const roomNo = c.rooms?.room_number               || ''
  const floor  = c.rooms?.floor ? `ชั้นที่ ${c.rooms.floor}` : ''

  const rent         = baht(c.monthly_rent)
  const dep          = baht(c.deposit_amount)
  const adv          = baht(c.advance_rent_amount)
  const payDay       = c.payment_day || '—'
  const totalDeposit = baht((Number(c.deposit_amount) || 0) + (Number(c.advance_rent_amount) || 0))

  const months = (() => {
    if (!c.contract_start_date || !c.contract_end_date) return DOT_S
    const s = new Date(c.contract_start_date), e = new Date(c.contract_end_date)
    return String((e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()))
  })()

  const startDate = thaiDate(c.contract_start_date)
  const endDate   = thaiDate(c.contract_end_date)

  /* ─────────── shared header ─────────── */
  function Header() {
    return (
      <>
        <Text style={S.title}>สัญญาเช่าห้องชุด</Text>
        <View style={S.rule} />
        <View style={S.metaRow}>
          <Text>ทำที่ {coAddr}</Text>
          <Text>เลขที่สัญญา {c.contract_number}   วันที่ {startDate}</Text>
        </View>
      </>
    )
  }

  return (
    <Document title={`สัญญาเช่าห้องชุด ${c.contract_number}`}>

      {/* ══════════ หน้า 1 : คู่สัญญา + ข้อ 1–3 ══════════ */}
      <Page size="A4" style={PAGE}>
        <Header />

        <Text style={S.partyHd}>ผู้ให้เช่า</Text>
        <PR label="ชื่อ" value={co} />
        <PR label="เลขทะเบียนนิติบุคคล" value={coTax || DOT_S} />
        <PR label="ที่อยู่" value={coAddr + (coPhone ? `  โทร. ${coPhone}` : '')} />
        <PR label="ผู้รับมอบอำนาจ" value={DOT_S} />

        <Text style={S.partyHd}>ผู้เช่า</Text>
        <PR label="ชื่อ-นามสกุล" value={tName} />
        <PR label="เลขบัตรประชาชน" value={tIdCard} />
        <PR label="ที่อยู่" value={DOT} />
        {tPhone ? <PR label="โทรศัพท์" value={tPhone} /> : null}

        <Text style={S.intro}>คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญาเช่ากันด้วยข้อความดังต่อไปนี้</Text>
        <View style={S.ruleLight} />

        <Cl no="1" title="ทรัพย์สินที่เช่า" />
        <P>ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าทรัพย์สิน ดังนี้</P>
        <Sub>ห้องชุดเลขที่ <Text style={{ fontWeight: 700 }}>{roomNo}</Text>{floor ? `  ${floor}` : ''}{'  '}อาคาร <Text style={{ fontWeight: 700 }}>{bld}</Text>{proj ? `  โครงการ ${proj}` : ''}{'  '}ตามหนังสือกรรมสิทธิ์ห้องชุดเลขที่ {DOT_S}</Sub>
        <P>ผู้ให้เช่าตกลงส่งมอบห้องชุดพร้อมอุปกรณ์ประกอบตามสภาพที่ปรากฏในรายการทะเบียนทรัพย์สิน (เอกสารแนบหมายเลข 1) ซึ่งถือเป็นส่วนหนึ่งของสัญญานี้</P>
        <P>ผู้เช่าตกลงใช้ทรัพย์สินที่เช่านี้เพื่อเป็นที่พักอาศัยส่วนตัวเท่านั้น ห้ามใช้เพื่อประกอบธุรกิจหรือกิจการอื่นใด</P>

        <Cl no="2" title="ระยะเวลาการเช่า" />
        <P>สัญญาเช่านี้มีกำหนดระยะเวลา <Text style={{ fontWeight: 700 }}>{months} เดือน</Text>  เริ่มตั้งแต่วันที่ <Text style={{ fontWeight: 700 }}>{startDate}</Text>  ถึงสิ้นสุดวันที่ <Text style={{ fontWeight: 700 }}>{endDate}</Text></P>
        <P>หากผู้เช่าประสงค์จะต่ออายุสัญญา ต้องแจ้งความประสงค์เป็นลายลักษณ์อักษรแก่ผู้ให้เช่าล่วงหน้าไม่น้อยกว่า 30 วัน ก่อนสัญญาสิ้นสุด</P>

        <Cl no="3" title="ค่าเช่าและกำหนดการชำระ" />
        <Sub>3.1  ผู้เช่าตกลงชำระค่าเช่ารายเดือนล่วงหน้าเดือนละ <Text style={{ fontWeight: 700 }}>{rent} บาท</Text>  ชำระทุกวันที่ <Text style={{ fontWeight: 700 }}>{payDay}</Text> ของทุกเดือน</Sub>
        <Sub>3.2  การชำระค่าเช่าให้โอนเงินผ่านธนาคาร {DOT_S}  สาขา {DOT_S}  เลขที่บัญชี {DOT_S}  ชื่อบัญชี {DOT_S}  พร้อมแจ้งหลักฐานการโอนเงิน</Sub>
        <Sub>3.3  หากผู้เช่าผิดนัดชำระค่าเช่าเกินกว่า 7 วัน นับแต่วันครบกำหนด ผู้เช่าตกลงชำระดอกเบี้ยผิดนัดในอัตราร้อยละ 15 ต่อปีของจำนวนเงินค่าเช่าที่ค้างชำระ</Sub>
      </Page>

      {/* ══════════ หน้า 2 : ข้อ 4–7 ══════════ */}
      <Page size="A4" style={PAGE}>
        <Header />

        <Cl no="4" title="เงินประกันและเงินค่าเช่าล่วงหน้า" />
        <Sub>4.1  ในวันทำสัญญานี้ ผู้เช่าตกลงวางเงินประกันและเงินค่าเช่าล่วงหน้ารวมเป็นจำนวน <Text style={{ fontWeight: 700 }}>{totalDeposit} บาท</Text>  (ประกอบด้วยเงินประกัน {dep}  และค่าเช่าล่วงหน้า {adv}) มอบแก่ผู้ให้เช่า</Sub>
        <Sub>4.2  เงินประกันตาม 4.1 ไม่ถือเป็นค่าเช่า ผู้ให้เช่าจะไม่นำไปหักค่าเช่า และไม่มีดอกเบี้ย</Sub>
        <Sub>4.3  เมื่อสัญญาสิ้นสุดและผู้เช่าส่งมอบห้องชุดคืนเรียบร้อย ผู้ให้เช่าจะคืนเงินประกันส่วนที่เหลือหลังหักค่าเสียหายต่างๆ ภายใน 30 วัน นับแต่วันที่ผู้เช่าส่งมอบ</Sub>
        <Sub>4.4  หากผู้เช่าผิดสัญญาหรือบอกเลิกสัญญาก่อนครบกำหนด ผู้ให้เช่ามีสิทธิ์ริบเงินประกันทั้งจำนวน โดยไม่ตัดสิทธิ์เรียกค่าเสียหายเพิ่มเติม</Sub>

        <Cl no="5" title="ค่าสาธารณูปโภคและค่าบริการ" />
        <Sub>5.1  ผู้เช่าตกลงรับผิดชอบชำระค่าไฟฟ้าและค่าน้ำประปาของห้องชุดตามอัตราที่หน่วยงานกำหนด</Sub>
        <Sub>5.2  ค่าบริการอินเทอร์เน็ต โทรศัพท์ หรือค่าบริการใดๆ ที่ผู้เช่าใช้เพิ่มเติม ถือเป็นความรับผิดชอบของผู้เช่า</Sub>
        <Sub>5.3  ค่าส่วนกลางของนิติบุคคลอาคารชุดที่เกี่ยวกับการใช้ห้องชุดที่เช่า ผู้เช่าเป็นผู้รับผิดชอบ</Sub>
        <Sub>5.4  หากผู้เช่าไม่ชำระค่าสาธารณูปโภคจนถูกตัดบริการ ผู้เช่าต้องรับผิดชอบค่าใช้จ่ายในการต่อบริการและค่าปรับทั้งหมด</Sub>
        <Sub>5.5  หากผู้เช่าทำคีย์การ์ดสูญหายหรือชำรุด ผู้เช่าต้องแจ้งให้ผู้ให้เช่าทราบและชำระค่าทำคีย์การ์ดใหม่ในอัตราใบละ 200 บาท</Sub>

        <Cl no="6" title="การใช้ทรัพย์สิน" />
        <Sub>6.1  ผู้เช่าตกลงใช้ห้องชุดเพื่อเป็นที่พักอาศัยส่วนตัวเท่านั้น ห้ามใช้เพื่อประกอบธุรกิจหรือกิจการใดๆ ที่ผิดกฎหมาย รวมทั้งห้ามเป็นที่พักบริการรายวันโดยเด็ดขาด</Sub>
        <Sub>6.2  ผู้เช่าตกลงปฏิบัติตามข้อบังคับ กฎระเบียบของนิติบุคคลอาคารชุดอย่างเคร่งครัด</Sub>
        <Sub>6.3  ห้ามนำสัตว์เลี้ยงทุกชนิดเข้ามาในห้องชุดโดยเด็ดขาด หากฝ่าฝืน ผู้ให้เช่ามีสิทธิ์บอกเลิกสัญญาได้ทันที</Sub>
        <Sub>6.4  ผู้เช่าจะไม่กระทำการอันก่อให้เกิดความเดือดร้อนรำคาญต่อผู้อื่น</Sub>
        <Sub>6.5  จำนวนผู้พักอาศัยในห้องชุด ผู้เช่าต้องแจ้งให้ผู้ให้เช่าทราบและได้รับความยินยอมก่อน</Sub>

        <Cl no="7" title="การให้เช่าช่วงและโอนสิทธิ์" />
        <Sub>7.1  ผู้เช่าจะไม่ให้เช่าช่วงห้องชุดที่เช่าไม่ว่าทั้งหมดหรือบางส่วน และจะไม่โอนสิทธิ์ตามสัญญาเช่านี้ให้แก่บุคคลอื่น โดยไม่ได้รับความยินยอมเป็นลายลักษณ์อักษรจากผู้ให้เช่า</Sub>
        <Sub>7.2  หากผู้เช่าฝ่าฝืนข้อ 7.1 ถือว่าผิดสัญญาอย่างร้ายแรง ผู้ให้เช่ามีสิทธิ์บอกเลิกสัญญาได้ทันทีและริบเงินประกันทั้งจำนวน</Sub>
      </Page>

      {/* ══════════ หน้า 3 : ข้อ 8–11 ══════════ */}
      <Page size="A4" style={PAGE}>
        <Header />

        <Cl no="8" title="การบำรุงรักษาและซ่อมแซม" />
        <Sub>8.1  ผู้เช่าจะดูแลรักษาห้องชุดและทรัพย์สินของผู้ให้เช่าให้อยู่ในสภาพดีตลอดระยะเวลาสัญญา</Sub>
        <Sub>8.2  การซ่อมแซมเล็กน้อย (ค่าใช้จ่ายไม่เกิน 2,000 บาท) เช่น เปลี่ยนหลอดไฟ อุปกรณ์เล็กน้อย ถือเป็นความรับผิดชอบของผู้เช่า</Sub>
        <Sub>8.3  การซ่อมแซมใหญ่ที่เกิดจากความชำรุดทรุดโทรมตามปกติ ระบบไฟฟ้าหลัก ระบบประปาหลัก โครงสร้างอาคาร ถือเป็นความรับผิดชอบของผู้ให้เช่า</Sub>
        <Sub>8.4  ผู้เช่าจะไม่ตัด ต่อ ดัดแปลง ถอนหรือย้ายสิ่งปลูกสร้าง ระบบไฟฟ้า ระบบประปา โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษร</Sub>
        <Sub>8.5  ความเสียหายที่เกิดจากการกระทำของผู้เช่า ครอบครัว แขกหรือผู้รับจ้างของผู้เช่า ผู้เช่าต้องรับผิดชอบซ่อมแซมให้กลับสู่สภาพเดิม</Sub>

        <Cl no="9" title="การต่อสัญญา" />
        <Sub>9.1  หากผู้เช่าประสงค์จะต่อสัญญา ต้องแจ้งเป็นลายลักษณ์อักษรล่วงหน้าไม่น้อยกว่า 30 วัน ก่อนวันสิ้นสุดสัญญา</Sub>
        <Sub>9.2  การต่อสัญญาจะกระทำโดยลงนามต่อท้ายสัญญาฉบับนี้ อัตราค่าเช่าและเงื่อนไขต่างๆ อาจมีการเปลี่ยนแปลงได้ตามที่คู่สัญญาตกลงกัน</Sub>
        <Sub>9.3  หากสัญญาสิ้นสุดแล้วแต่ผู้เช่ายังคงอยู่ในห้องชุด ผู้เช่าตกลงชำระค่าเช่าในอัตราเดิม และฝ่ายใดฝ่ายหนึ่งสามารถบอกเลิกสัญญาตามข้อ 10 ได้</Sub>

        <Cl no="10" title="การบอกเลิกสัญญาก่อนครบกำหนด" />
        <Sub>10.1  หากผู้เช่าประสงค์จะบอกเลิกสัญญาก่อนครบกำหนด ผู้เช่าต้องแจ้งเป็นลายลักษณ์อักษรล่วงหน้าไม่น้อยกว่า 30 วัน และผู้เช่าต้องชำระค่าเช่าจนถึงวันส่งมอบ โดยเงินประกันทั้งหมดจะถูกริบเป็นค่าเสียหาย</Sub>
        <Sub>10.2  ผู้ให้เช่ามีสิทธิ์บอกเลิกสัญญาได้ทันทีและริบเงินประกันทั้งจำนวนหากผู้เช่ากระทำอย่างใดอย่างหนึ่งดังนี้</Sub>
        <SubSub>(1)  ผิดนัดชำระค่าเช่าเกินกว่า 2 เดือนติดกัน</SubSub>
        <SubSub>(2)  ใช้ห้องชุดผิดวัตถุประสงค์ตามข้อ 6.1</SubSub>
        <SubSub>(3)  ให้เช่าช่วงหรือโอนสิทธิ์ตามข้อ 7</SubSub>
        <SubSub>(4)  นำสัตว์เลี้ยงเข้ามาในห้องชุดตามข้อ 6.3</SubSub>
        <SubSub>(5)  ตัดต่อดัดแปลงห้องชุดโดยไม่ได้รับอนุญาตตามข้อ 8.4</SubSub>
        <SubSub>(6)  กระทำการที่ก่อให้เกิดความเสียหายต่อห้องชุดหรือทรัพย์สินของผู้ให้เช่า</SubSub>
        <SubSub>(7)  ใช้ห้องชุดกระทำการใดที่ผิดกฎหมายหรือขัดต่อกฎระเบียบของนิติบุคคลอาคารชุด</SubSub>
        <SubSub>(8)  ผิดสัญญาในข้อหนึ่งข้อใดและไม่แก้ไขภายใน 15 วัน นับแต่วันที่ได้รับหนังสือบอกกล่าว</SubSub>
        <Sub>10.3  ในกรณีที่ผู้ให้เช่าประสงค์จะบอกเลิกสัญญาก่อนครบกำหนดโดยไม่ใช่เหตุตามข้อ 10.2 ผู้ให้เช่าต้องแจ้งล่วงหน้าไม่น้อยกว่า 60 วัน และคืนเงินประกันทั้งจำนวนพร้อมชดเชยค่าเสียหาย</Sub>

        <Cl no="11" title="การส่งมอบห้องชุดคืน" />
        <Sub>11.1  เมื่อสัญญาสิ้นสุดลงไม่ว่าด้วยเหตุใด ผู้เช่าต้องส่งมอบห้องชุดคืนในสภาพที่สะอาดและสภาพดีเทียบเท่าวันเข้าพัก เว้นแต่การสึกหรอตามปกติ</Sub>
        <Sub>11.2  ผู้เช่าต้องนำทรัพย์สินของตนออกจากห้องชุดก่อนวันส่งมอบ หากยังมีทรัพย์สินหลงเหลือ ผู้ให้เช่ามีสิทธิ์จัดการได้ตามเห็นสมควรโดยผู้เช่ารับผิดชอบค่าใช้จ่าย</Sub>
        <Sub>11.3  หากผู้เช่าไม่ส่งมอบห้องชุดคืนในกำหนด ผู้เช่าตกลงชำระค่าเสียหาย 2 เท่าของค่าเช่ารายวัน นับแต่วันครบกำหนดจนถึงวันส่งมอบจริง</Sub>
      </Page>

      {/* ══════════ หน้า 4 : ข้อ 12–13 + ลายเซ็น ══════════ */}
      <Page size="A4" style={PAGE}>
        <Header />

        <Cl no="12" title="ข้อกำหนดทั่วไป" />
        <Sub>12.1  ผู้ให้เช่าหรือผู้แทนมีสิทธิ์เข้าตรวจสอบสภาพห้องชุดได้ โดยแจ้งล่วงหน้าไม่น้อยกว่า 24 ชั่วโมง ยกเว้นกรณีฉุกเฉิน</Sub>
        <Sub>12.2  หนังสือบอกกล่าวที่ส่งโดยวิธีที่ชอบด้วยกฎหมาย ถือว่าผู้รับได้รับแล้วและมีผลบังคับตามนั้น</Sub>
        <Sub>12.3  หากข้อกำหนดหนึ่งข้อใดตกเป็นโมฆะ ให้ข้อกำหนดอื่นๆ ยังคงมีผลบังคับใช้ต่อไป</Sub>
        <Sub>12.4  สัญญานี้บังคับตามกฎหมายไทย หากเกิดข้อพิพาทให้อยู่ในเขตอำนาจศาลในกรุงเทพมหานคร</Sub>

        <Cl no="13" title="เอกสารแนบท้ายสัญญา" />
        <P>เอกสารแนบท้ายสัญญาดังต่อไปนี้ถือเป็นส่วนหนึ่งของสัญญาฉบับนี้</P>
        <Sub>เอกสารแนบหมายเลข 1  ทะเบียนทรัพย์สิน อุปกรณ์ เครื่องใช้ไฟฟ้าของห้องชุด</Sub>
        <Sub>เอกสารแนบหมายเลข 2  สำเนาบัตรประจำตัวประชาชนของผู้เช่า</Sub>
        <Sub>เอกสารแนบหมายเลข 3  สำเนาทะเบียนบ้านของผู้เช่า</Sub>
        <Sub>เอกสารแนบหมายเลข 4  สำเนาหนังสือบริคณห์สนธิของบริษัท</Sub>
        <Sub>เอกสารแนบหมายเลข 5  สำเนาหนังสือกรรมสิทธิ์ห้องชุด</Sub>

        <Text style={[S.p, { marginTop: 12 }]}>
          สัญญานี้ทำขึ้น 2 ฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อความในสัญญาโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน
        </Text>

        <SigPair left={DOT_S} right={tName} leftLabel={`ผู้ให้เช่า / ${co}`} rightLabel="ผู้เช่า" />
        <View style={[S.sigRow, { marginTop: 24 }]}>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigName}>{DOT_S}</Text>
            <Text style={S.sigLabel}>พยาน</Text>
          </View>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigName}>{DOT_S}</Text>
            <Text style={S.sigLabel}>พยาน</Text>
          </View>
        </View>
      </Page>

      {/* ══════════ หน้า 5 : เอกสารแนบ 1 ══════════ */}
      <Page size="A4" style={PAGE}>
        <Text style={[S.title, { fontSize: 12, marginBottom: 4 }]}>เอกสารแนบหมายเลข 1</Text>
        <Text style={[S.title, { fontSize: F + 0.5, marginBottom: 4 }]}>ทะเบียนทรัพย์สิน อุปกรณ์ เครื่องใช้ไฟฟ้าของห้องชุด</Text>
        <Text style={{ textAlign: 'center', fontSize: F - 0.5, color: '#555', marginBottom: 12 }}>
          ห้องชุดเลขที่ {roomNo}  อาคาร {bld}{proj ? `  โครงการ ${proj}` : ''}
        </Text>

        <View style={S.tblWrap}>
          <View style={S.tblHead}>
            {[['ลำดับ',32],['รายการ/ยี่ห้อ',178],['จำนวน',42],['สภาพ',54],['หมายเหตุ',0]].map(([label, w], i) => (
              <Text key={i} style={[S.tblCell, { fontWeight: 700, width: w || undefined, flex: w ? undefined : 1 }]}>{label}</Text>
            ))}
          </View>
          {Array.from({ length: 20 }, (_, i) => (
            <View key={i} style={S.tblRow}>
              <Text style={[S.tblCell, { width: 32, textAlign: 'center' }]}>{i + 1}</Text>
              <Text style={[S.tblCell, { width: 178 }]}> </Text>
              <Text style={[S.tblCell, { width: 42, textAlign: 'center' }]}> </Text>
              <Text style={[S.tblCell, { width: 54 }]}> </Text>
              <Text style={[S.tblCell, { flex: 1 }]}> </Text>
            </View>
          ))}
        </View>

        <Text style={{ marginTop: 12, fontSize: F - 0.5, lineHeight: 1.75 }}>
          ข้าพเจ้าได้ตรวจสอบทรัพย์สิน อุปกรณ์ เครื่องใช้ไฟฟ้าตามรายการข้างต้นแล้ว ผู้เช่ารับมอบไว้ครบถ้วนสมบูรณ์ พร้อมทั้งรับทราบว่าจะดูแลรักษาให้อยู่ในสภาพที่ใช้งานได้ และจะคืนให้ครบตามสภาพที่รับมา
        </Text>

        <SigPair left={DOT_S} right={tName} leftLabel="ผู้ให้เช่า" rightLabel="ผู้เช่า" date={false} />
      </Page>

    </Document>
  )
}
