import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSettings } from '../../hooks/useSettings'

const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function thaiDateLong(d) {
  if (!d) return null
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`
}

function fmt(v) { return Number(v || 0).toLocaleString('th-TH') }

function fmtPhone(p) {
  if (!p) return null
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
  return p
}

function thaiBahtText(value) {
  const amount = Math.round(Number(value || 0))
  if (amount === 0) return 'ศูนย์บาทถ้วน'

  const digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

  function readGroup(num) {
    const chars = String(num).split('').map(Number)
    const len = chars.length
    return chars.map((n, i) => {
      if (n === 0) return ''
      const pos = len - i - 1
      if (pos === 0 && n === 1 && len > 1) return 'เอ็ด'
      if (pos === 1 && n === 1) return 'สิบ'
      if (pos === 1 && n === 2) return 'ยี่สิบ'
      return digits[n] + units[pos]
    }).join('')
  }

  function readNumber(num) {
    if (num >= 1000000) {
      const high = Math.floor(num / 1000000)
      const low = num % 1000000
      return readNumber(high) + 'ล้าน' + (low ? readNumber(low) : '')
    }
    return readGroup(num)
  }

  return `${readNumber(amount)}บาทถ้วน`
}

const D  = <span className="inline-block min-w-[100px] border-b border-dotted border-slate-600 px-1 text-center">&#8203;</span>
const DS = <span className="inline-block min-w-[60px]  border-b border-dotted border-slate-600 px-1 text-center">&#8203;</span>

function TL({ v, min = 'min-w-[100px]', placeholder = '' }) {
  return (
    <span className={`inline-block indent-0 ${min} border-b border-dotted border-slate-600 px-1 text-center`}>
      {v || (placeholder ? <span className="text-slate-400">{placeholder}</span> : <span>&#8203;</span>)}
    </span>
  )
}

function Sec({ title, children }) {
  return (
    <section className="mt-4 break-inside-avoid">
      <h2 className="mb-2 rounded bg-slate-100 px-3 py-1 text-[14px] font-bold print:bg-slate-100">{title}</h2>
      <div className="space-y-1.5 text-justify text-[13.5px] leading-[2.05]">{children}</div>
    </section>
  )
}

function Sig({ role, name, wideName = false, smallName = false }) {
  const nameInner = name || (wideName
    ? <span className="inline-block w-[150px] border-b border-dotted border-slate-600">&#8203;</span>
    : DS)
  return (
    <div className="mt-6 text-[13.5px] leading-7">
      <table className="mx-auto border-separate border-spacing-0">
        <tbody>
          <tr>
            <td className="whitespace-nowrap pr-1 align-bottom">ลงชื่อ</td>
            <td className="w-[170px] border-b border-dotted border-slate-600 align-bottom">&nbsp;</td>
            <td className="whitespace-nowrap pl-1 align-bottom">{role}</td>
          </tr>
          <tr>
            <td />
            <td className={`text-center align-top${smallName ? ' whitespace-nowrap' : ''}`}>({nameInner})</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const EMPTY_ASSETS = Array.from({ length: 16 }, (_, i) => ({ id: i + 1 }))

export default function ContractPrintPage() {
  const { contractId } = useParams()
  const { settings } = useSettings()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('contracts').select(`
        *,
        rooms(id, room_number, floor, size_sqm, ownership, title_deed_number, buildings(id, name, projects(name))),
        tenants(id, full_name, phone, email, id_card_last4, birth_date, address_house_no, address_road, address_subdistrict, address_district, address_province)
      `).eq('id', contractId).single()

      if (error) {
        setLoadError(error.message)
        setLoading(false)
        return
      }
      if (!data) { setLoading(false); return }

      // ถอดรหัสเลขบัตรประชาชน (ถ้ามี)
      let idCard = null
      if (data.tenants?.id) {
        const { data: dec } = await supabase.rpc('decrypt_tenant_id_card', { p_tenant_id: data.tenants.id })
        idCard = dec || null
      }
      setC({ ...data, tenants: { ...data.tenants, id_card_number: idCard } })
      setLoading(false)
    }
    load()
  }, [contractId])

  useEffect(() => {
    if (!loading && c) document.title = `สัญญาเช่า ${c.contract_number}`
  }, [loading, c])

  if (loading) return <div className="flex h-screen items-center justify-center text-slate-500">กำลังโหลด...</div>
  if (!c) {
    return (
      <div className="flex h-screen items-center justify-center text-red-500">
        {loadError ? `โหลดสัญญาไม่สำเร็จ: ${loadError}` : 'ไม่พบสัญญา'}
      </div>
    )
  }

  const co      = settings?.company?.name    || DS
  const coTax   = settings?.company?.tax_id  || DS
  const coAddr  = settings?.company?.address || DS
  const coPhone = settings?.company?.phone   || ''
  const coAddrFull = coAddr + (coPhone ? `  โทร. ${coPhone}` : '')
  const bankAccount = settings?.invoice?.bank_account ?? settings?.bank_account ?? {}
  const bankName    = bankAccount.bank_name      || null
  const bankBranch  = bankAccount.branch         || bankAccount.branch_name || null
  const bankNumber  = bankAccount.account_number || null
  const bankOwner   = bankAccount.account_name   || null

  const tName   = c.tenants?.full_name      || null
  const tPhone  = fmtPhone(c.tenants?.phone)
  const tIdCard = c.tenants?.id_card_number || null  // decrypted via RPC
  const tHouseNo  = c.tenants?.address_house_no    || null
  const tRoad     = c.tenants?.address_road        || null
  const tSubdist  = c.tenants?.address_subdistrict || null
  const tDistrict = c.tenants?.address_district    || null
  const tProvince = c.tenants?.address_province    || null
  const tAge = (() => {
    const bd = c.tenants?.birth_date
    if (!bd) return null
    const today = new Date(), birth = new Date(bd)
    let age = today.getFullYear() - birth.getFullYear()
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
    return String(age)
  })()

  const bld       = c.rooms?.buildings?.name           || ''
  const proj      = c.rooms?.buildings?.projects?.name || ''
  const roomNo    = c.rooms?.room_number               || ''
  const floor     = c.rooms?.floor                     || null
  const size      = c.rooms?.size_sqm                  || null
  const titleDeed      = c.rooms?.title_deed_number     || null
  const elecMeterStart  = c.electric_meter_start != null ? String(c.electric_meter_start) : null
  const waterMeterStart = c.water_meter_start   != null ? String(c.water_meter_start)   : null

  const startDate = thaiDateLong(c.contract_start_date)
  const endDate   = thaiDateLong(c.contract_end_date)

  const months = (() => {
    if (!c.contract_start_date || !c.contract_end_date) return null
    const s = new Date(c.contract_start_date), e = new Date(c.contract_end_date)
    return String((e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()))
  })()

  const rent    = fmt(c.monthly_rent)
  const dep     = fmt(c.deposit_amount)
  const adv     = fmt(c.advance_rent_amount)
  const rentText = thaiBahtText(c.monthly_rent)
  const depText  = thaiBahtText(c.deposit_amount)
  const advText  = thaiBahtText(c.advance_rent_amount)
  const payDay  = c.payment_day || null

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; width: 100% !important; padding: 0 !important; }
          .page-break { break-before: page; page-break-before: always; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Toolbar (hidden on print) ── */}
      <div className="no-print mx-auto mb-5 flex max-w-[210mm] items-center justify-between rounded-xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-200">
        <div>
          <p className="font-bold">{c.contract_number}</p>
          <p className="text-sm text-slate-500">{tName} · ห้อง {roomNo}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          พิมพ์ / Save PDF
        </button>
      </div>

      {/* ── A4 page ── */}
      <main className="print-page mx-auto w-[210mm] bg-white px-[14mm] py-[13mm] shadow-xl ring-1 ring-slate-200 print:ring-0">

        {/* Header */}
        <header className="border-b-2 border-slate-900 pb-4 text-[13.5px]">
          <div className="flex items-baseline justify-between">
            <div className="flex-1" />
            <h1 className="text-[21px] font-bold tracking-wide">สัญญาเช่าห้องชุด</h1>
            <div className="flex-1 text-right">เลขที่สัญญา <TL v={c.contract_number} min="min-w-[110px]" /></div>
          </div>
          <div className="mt-3 flex justify-between">
            <span>ทำที่ <TL v="อาคาร อัสสกาญจน์ เลขที่ 191 ถนนรามคำแหง" min="min-w-[200px]" /></span>
            <span>วันที่ <TL v={startDate} min="min-w-[100px]" /></span>
          </div>
        </header>

        {/* Intro */}
        <div className="mt-4 space-y-2.5 text-justify text-[13.5px] leading-[2.05]">
          <p className="indent-[4em]">
            สัญญาฉบับนี้ทำขึ้นระหว่าง <TL v={co} /> เลขประจำตัวผู้เสียภาษีอากร <TL v={coTax} />
            {' '}สำนักงานตั้งอยู่ <TL v={coAddrFull} min="min-w-[160px]" /> โดย <TL v="นางสาว ภัสสรมณฑ์ สิริณลญากรณ์" /> ผู้มีอำนาจกระทำการแทน
            {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า "ผู้ให้เช่า" ฝ่ายหนึ่ง
          </p>
          <p>
            กับ <TL v={tName} /> อายุ <TL v={tAge} min="min-w-[40px]" /> ปี เลขประจำตัวประชาชน <TL v={tIdCard} />
            {' '}อยู่บ้านเลขที่ <TL v={tHouseNo} min="min-w-[60px]" /> ถนน <TL v={tRoad} min="min-w-[80px]" /> แขวง/ตำบล <TL v={tSubdist} min="min-w-[80px]" /> เขต/อำเภอ <TL v={tDistrict} min="min-w-[80px]" /> จังหวัด <TL v={tProvince} min="min-w-[80px]" />
            {' '}โทร. <TL v={tPhone} min="min-w-[110px]" placeholder="xxx-xxx-xxxx" />
            {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า "ผู้เช่า" อีกฝ่ายหนึ่ง
          </p>
          <p>คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญากันโดยมีข้อความดังต่อไปนี้</p>
        </div>

        {/* ข้อ 1 */}
        <Sec title="ข้อ 1. ทรัพย์สินที่เช่า">
          <p>
            ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าห้องชุดเพื่อการอยู่อาศัย
            {proj ? <> โครงการ <TL v={proj} /></> : null}
            {' '}ห้องชุดเลขที่ <TL v={roomNo} min="min-w-[60px]" />
            {' '}ชั้นที่ <TL v={floor} min="min-w-[40px]" />
            {' '}อาคาร <TL v={bld} />
            {size ? <> เนื้อที่ประมาณ <TL v={size} min="min-w-[50px]" /> ตารางเมตร</> : null}
            {' '}ตามหนังสือกรรมสิทธิ์ห้องชุดเลขที่ <TL v={titleDeed} min="min-w-[120px]" />
            {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า "ห้องชุดที่เช่า"
          </p>
          <p>ผู้ให้เช่าตกลงส่งมอบห้องชุดที่เช่าพร้อมเฟอร์นิเจอร์ เครื่องใช้ไฟฟ้า และอุปกรณ์ตกแต่งตามรายการที่ระบุไว้ในบัญชีทรัพย์สินแนบท้ายสัญญา เอกสารแนบท้ายหมายเลข 1 ซึ่งถือเป็นส่วนหนึ่งของสัญญานี้</p>
        </Sec>

        {/* ข้อ 2 */}
        <Sec title="ข้อ 2. ระยะเวลาการเช่า">
          <p>
            คู่สัญญาตกลงเช่ามีกำหนดระยะเวลา <TL v={months} min="min-w-[40px]" /> เดือน
            {' '}นับตั้งแต่วันที่ <TL v={startDate} /> เป็นต้นไป และสิ้นสุดในวันที่ <TL v={endDate} />
          </p>
        </Sec>

        {/* ข้อ 3 */}
        <Sec title="ข้อ 3. ค่าเช่าและการชำระค่าเช่า">
          <p>3.1 ผู้เช่าตกลงชำระค่าเช่าให้แก่ผู้ให้เช่าในอัตราเดือนละ <TL v={rent} min="min-w-[70px]" /> บาท (<TL v={rentText} min="min-w-[130px]" />) โดยชำระเป็นรายเดือนล่วงหน้า ภายในวันที่ <TL v={payDay} min="min-w-[40px]" /> ของทุกเดือน</p>
          <p>
            3.2 การชำระค่าเช่าให้ชำระโดยวิธีโอนเงินเข้าบัญชีธนาคารของผู้ให้เช่า
            {' '}ธนาคาร <TL v={bankName} min="min-w-[90px]" />
            {' '}สาขา <TL v={bankBranch} min="min-w-[80px]" />
            {' '}เลขที่บัญชี <TL v={bankNumber} min="min-w-[120px]" />
            {bankOwner ? <> ชื่อบัญชี <TL v={bankOwner} min="min-w-[140px]" /></> : null}
            {' '}และให้ถือหลักฐานการโอนเงินหรือใบเสร็จรับเงินที่ผู้ให้เช่าออกให้เป็นหลักฐานการชำระเงิน
          </p>
          <p>3.3 หากผู้เช่าผิดนัดชำระค่าเช่าหรือค่าใช้จ่ายอื่นใดตามสัญญานี้ ผู้เช่ายินยอมชำระค่าปรับในอัตราวันละ {Number(settings?.invoice?.penalty_rate_per_day ?? 100).toLocaleString('th-TH')} บาท ของยอดที่ค้างชำระตามแต่ละรายการ นับแต่วันที่ผิดนัดจนถึงวันที่ชำระเสร็จสิ้น</p>
		<p>3.4 หากผู้เช่าผิดนัดชำระหนี้และผู้ให้เช่าทำหนังสือแจ้งให้ชำระเกิน 30 วันแล้วแต่ผู้เช่าเพิกเฉยไม่ดำเนินการชำระค่าเช่า ผู้เช่าตกลงให้ผู้ให้เช่าสามารถตัดมิเตอร์ประปา ไฟฟ้า ขนย้ายทรัพย์สินของผู้เช่ามากองไว้เพื่อให้ผู้เช่ามารับคืน โดยหากเกิดความเสียหายผู้เช่าสละสิทธิ์เรียกร้องใดๆเกี่ยวกับทรัพย์สินที่ขนย้าย รวมถึงยินยอมให้ผู้ให้เช่าสามารถเข้าครอบครองห้องชุดดังกล่าวได้ทันที</p>
        </Sec>

        {/* ข้อ 4 */}
        <Sec title="ข้อ 4. เงินประกันและเงินค่าเช่าล่วงหน้า">
          <p>4.1 ในวันทำสัญญานี้ ผู้เช่าตกลงวางเงินประกันการเช่าและการปฏิบัติตามสัญญาให้แก่ผู้ให้เช่า เป็นจำนวน <TL v={dep} min="min-w-[70px]" /> บาท (<TL v={depText} min="min-w-[130px]" />) และชำระค่าเช่าล่วงหน้าจำนวน <TL v={adv} min="min-w-[70px]" /> บาท (<TL v={advText} min="min-w-[130px]" />)</p>
          <p>4.2 เงินประกันตามข้อ 4.1 ผู้ให้เช่าจะเก็บรักษาไว้ตลอดอายุสัญญา โดยไม่มีดอกเบี้ย เพื่อเป็นประกันการปฏิบัติตามสัญญา ค่าเสียหายแก่ห้องชุดที่เช่าและทรัพย์สินภายในห้อง ค่าสาธารณูปโภคค้างชำระ และหนี้สินอื่นใดที่ผู้เช่าพึงต้องชำระตามสัญญานี้</p>
          <p>4.3 เมื่อสัญญาสิ้นสุดลงและผู้เช่าได้ส่งมอบห้องชุดที่เช่าคืนแก่ผู้ให้เช่าในสภาพเรียบร้อย พร้อมทั้งชำระค่าใช้จ่ายต่างๆ ครบถ้วนแล้ว ผู้ให้เช่าจะคืนเงินประกันส่วนที่เหลือให้แก่ผู้เช่า ภายใน 30 วัน นับแต่วันที่ผู้เช่าส่งมอบห้องชุดที่เช่าคืน</p>
          <p>4.4 หากผู้เช่าผิดสัญญาข้อหนึ่งข้อใด หรือบอกเลิกสัญญาก่อนครบกำหนดโดยมิได้รับความยินยอมเป็นลายลักษณ์อักษรจากผู้ให้เช่า ผู้ให้เช่ามีสิทธิริบเงินประกันได้ทั้งจำนวน โดยไม่ตัดสิทธิที่จะเรียกร้องค่าเสียหายเพิ่มเติม</p>
        </Sec>

        {/* ข้อ 5 */}
        <Sec title="ข้อ 5. ค่าสาธารณูปโภคและค่าใช้จ่ายอื่น">
          <p>5.1 ผู้เช่าตกลงรับผิดชอบค่ากระแสไฟฟ้าและค่าน้ำประปาที่ใช้ในห้องชุดที่เช่าตามมาตรวัดจริง ตามอัตราที่หน่วยงานผู้ให้บริการหรือนิติบุคคลอาคารชุดเรียกเก็บ</p>
          <p>5.2 ค่าใช้บริการอินเทอร์เน็ต โทรศัพท์ เคเบิลทีวี และบริการอื่นใดที่ผู้เช่าสมัครใช้เพิ่มเติม ผู้เช่าเป็นผู้รับผิดชอบทั้งสิ้น</p>
          <p>5.3 ค่าส่วนกลางของนิติบุคคลอาคารชุด ภาษีโรงเรือนและที่ดิน หรือภาษีอื่นใดที่เกี่ยวกับกรรมสิทธิ์ในห้องชุด ผู้ให้เช่าเป็นผู้รับผิดชอบ</p>
          <p>5.4 หากผู้เช่าไม่ชำระค่าสาธารณูปโภคตามข้อ 5.1 จนเป็นเหตุให้ถูกตัดบริการหรือเกิดค่าปรับ ผู้เช่าต้องรับผิดชอบค่าใช้จ่ายในการต่อบริการและค่าปรับทั้งสิ้น</p>
          <p>5.5 หากผู้เช่าทำคีย์การ์ดสูญหายหรือชำรุด ผู้เช่าต้องแจ้งให้ผู้ให้เช่าทราบและชำระค่าทำคีย์การ์ดใหม่ในอัตราใบละ 200 บาท</p>
        </Sec>

        {/* ข้อ 6 */}
        <Sec title="ข้อ 6. การใช้ห้องชุดที่เช่า">
          <p>6.1 ผู้เช่าตกลงใช้ห้องชุดที่เช่าเพื่อการอยู่อาศัยส่วนตัวเท่านั้น จะไม่นำไปใช้เพื่อการพาณิชย์ ประกอบธุรกิจ จดทะเบียนนิติบุคคล หรือกิจการใดที่ขัดต่อกฎหมายและศีลธรรมอันดี รวมทั้งจะไม่ใช้เป็นที่เก็บวัตถุไวไฟ วัตถุระเบิด หรือสิ่งของผิดกฎหมาย</p>
          <p>6.2 ผู้เช่าตกลงปฏิบัติตามข้อบังคับ ระเบียบ และมติของนิติบุคคลอาคารชุดโดยเคร่งครัด หากผู้เช่ากระทำการอันเป็นการฝ่าฝืนและก่อให้เกิดค่าปรับหรือความเสียหายใดๆ ผู้เช่าจะเป็นผู้รับผิดชอบ</p>
          <p>6.3 ผู้เช่าไม่อนุญาตให้นำสัตว์เลี้ยงทุกชนิดเข้ามาเลี้ยงหรือนำเข้ามาในห้องชุดที่เช่าโดยเด็ดขาด หากผู้เช่าฝ่าฝืน ผู้ให้เช่ามีสิทธิบอกเลิกสัญญาได้ทันที และผู้เช่าต้องรับผิดชอบค่าทำความสะอาด ค่าซ่อมแซมความเสียหาย และค่าปรับใดๆ ที่อาจเกิดขึ้น</p>
          <p>6.4 ผู้เช่าจะไม่ก่อความเดือดร้อนรำคาญแก่ผู้พักอาศัยข้างเคียง ไม่ส่งเสียงดังเกินสมควร และไม่กระทำการใดๆ อันเป็นการรบกวนความสงบสุขของส่วนรวม</p>
          <p>6.5 จำนวนผู้พักอาศัยในห้องชุดที่เช่าต้องไม่เกินจำนวนที่ระเบียบของนิติบุคคลอาคารชุดกำหนด และผู้เช่าต้องแจ้งรายชื่อผู้พักอาศัยทั้งหมดให้ผู้ให้เช่าทราบเป็นลายลักษณ์อักษร</p>
        </Sec>

        {/* ข้อ 7 */}
        <Sec title="ข้อ 7. ข้อห้ามให้เช่าช่วงและโอนสิทธิ">
          <p>7.1 ผู้เช่าจะไม่ให้เช่าช่วง ไม่โอนสิทธิตามสัญญานี้ ไม่ให้บุคคลอื่นใช้ห้องชุดที่เช่าไม่ว่าทั้งหมดหรือบางส่วน ไม่ว่าโดยมีค่าตอบแทนหรือไม่ก็ตาม โดยไม่ได้รับความยินยอมเป็นลายลักษณ์อักษรจากผู้ให้เช่า</p>
          <p>7.2 หากผู้เช่าฝ่าฝืนข้อ 7.1 ให้ถือว่าผู้เช่าผิดสัญญาในสาระสำคัญ ผู้ให้เช่ามีสิทธิบอกเลิกสัญญาได้ทันที ริบเงินประกันทั้งจำนวน และเรียกร้องค่าเสียหายเพิ่มเติมได้</p>
        </Sec>

        {/* ข้อ 8 */}
        <Sec title="ข้อ 8. การบำรุงรักษาและการซ่อมแซม">
          <p>8.1 ผู้เช่าจะดูแลรักษาห้องชุดที่เช่าและทรัพย์สินภายในห้องให้อยู่ในสภาพดีตลอดอายุสัญญา เสมือนวิญญูชนพึงสงวนรักษาทรัพย์สินของตน</p>
          <p>8.2 การซ่อมแซมเล็กน้อยอันเป็นปกติของการใช้สอย เช่น การเปลี่ยนหลอดไฟ ก๊อกน้ำ ฝักบัว อุปกรณ์ที่ชำรุดจากการใช้งานทั่วไป ที่มีค่าใช้จ่ายไม่เกิน 2,000 บาท ต่อครั้ง ผู้เช่าเป็นผู้รับผิดชอบ</p>
          <p>8.3 การซ่อมแซมใหญ่อันเกิดจากความเสื่อมสภาพตามปกติ หรือจากเหตุที่มิใช่ความผิดของผู้เช่า เช่น ระบบไฟฟ้าหลัก ระบบประปาหลัก โครงสร้างอาคาร ผู้ให้เช่าเป็นผู้รับผิดชอบ โดยผู้เช่าต้องแจ้งให้ผู้ให้เช่าทราบโดยพลันเมื่อพบความชำรุดบกพร่อง</p>
          <p>8.4 ผู้เช่าจะไม่ดัดแปลง ต่อเติม รื้อถอน เจาะ ทำลาย หรือเปลี่ยนแปลงโครงสร้างของห้องชุดที่เช่า รวมทั้งระบบไฟฟ้า ระบบประปา และระบบอื่นใด โดยไม่ได้รับความยินยอมเป็นลายลักษณ์อักษรจากผู้ให้เช่า</p>
          <p>8.5 หากเกิดความเสียหายแก่ห้องชุดที่เช่าหรือทรัพย์สินภายในห้องอันเกิดจากการกระทำของผู้เช่า ผู้ที่อาศัยอยู่ร่วมกับผู้เช่า หรือผู้มาเยือน ผู้เช่าต้องรับผิดชอบค่าซ่อมแซมหรือชดใช้ค่าเสียหายเต็มจำนวน</p>
        </Sec>

        {/* ข้อ 9 */}
        <Sec title="ข้อ 9. การต่อสัญญา">
          <p>9.1 หากผู้เช่าประสงค์จะต่อสัญญาเช่า ผู้เช่าต้องแจ้งความประสงค์เป็นลายลักษณ์อักษรให้ผู้ให้เช่าทราบล่วงหน้าไม่น้อยกว่า 30 วัน ก่อนวันสิ้นสุดสัญญา</p>
          <p>9.2 การต่อสัญญาจะเกิดผลก็ต่อเมื่อคู่สัญญาทั้งสองฝ่ายตกลงเงื่อนไขกันได้ และได้ลงนามในสัญญาฉบับใหม่หรือบันทึกข้อตกลงต่อท้ายสัญญาเป็นลายลักษณ์อักษร</p>
          <p>9.3 หากเมื่อสัญญาสิ้นสุดลงแล้ว ผู้เช่ายังคงครอบครองห้องชุดที่เช่าต่อไปโดยผู้ให้เช่ามิได้ทักท้วง ให้ถือว่าคู่สัญญาตกลงเช่ากันต่อไปโดยไม่มีกำหนดระยะเวลา ภายใต้เงื่อนไขเดิม จนกว่าฝ่ายใดฝ่ายหนึ่งจะบอกเลิกสัญญาตามข้อ 10</p>
        </Sec>

        {/* ข้อ 10 */}
        <Sec title="ข้อ 10. การบอกเลิกสัญญาก่อนครบกำหนด">
          <p>10.1 หากผู้เช่าประสงค์จะบอกเลิกสัญญาก่อนครบกำหนดระยะเวลาเช่าตามข้อ 2 ผู้เช่าต้องแจ้งให้ผู้ให้เช่าทราบเป็นลายลักษณ์อักษรล่วงหน้าไม่น้อยกว่า 30 วัน และยินยอมให้ผู้ให้เช่าริบเงินประกันทั้งจำนวนตามข้อ 4 เป็นค่าเสียหายจากการบอกเลิกสัญญาก่อนกำหนด ทั้งนี้ผู้เช่ายังคงต้องชำระค่าเช่าและค่าสาธารณูปโภคจนถึงวันที่ส่งมอบห้องชุดที่เช่าคืน</p>
          <p>10.2 ผู้ให้เช่ามีสิทธิบอกเลิกสัญญาได้ทันที โดยไม่ต้องบอกกล่าวล่วงหน้า และมีสิทธิริบเงินประกันทั้งจำนวน รวมทั้งเรียกร้องค่าเสียหายเพิ่มเติม หากผู้เช่ากระทำการอย่างใดอย่างหนึ่งดังต่อไปนี้</p>
          <ol className="ml-8 list-decimal space-y-1">
            <li>ผิดนัดชำระค่าเช่าหรือค่าใช้จ่ายอื่นใดตามสัญญานี้เป็นเวลา 2 เดือนติดต่อกัน</li>
            <li>ใช้ห้องชุดที่เช่าผิดวัตถุประสงค์ตามข้อ 6.1</li>
            <li>ให้เช่าช่วงหรือโอนสิทธิตามสัญญาโดยฝ่าฝืนข้อ 7</li>
            <li>นำสัตว์เลี้ยงเข้ามาในห้องชุดที่เช่าโดยฝ่าฝืนข้อ 6.3</li>
            <li>ดัดแปลงต่อเติมห้องชุดที่เช่าโดยฝ่าฝืนข้อ 8.4</li>
            <li>ก่อให้เกิดความเสียหายอย่างร้ายแรงแก่ห้องชุดที่เช่าหรือทรัพย์สินของผู้ให้เช่า</li>
            <li>ใช้ห้องชุดที่เช่ากระทำการอันผิดกฎหมายหรือขัดต่อความสงบเรียบร้อยหรือศีลธรรมอันดี</li>
            <li>ผิดสัญญาในข้อหนึ่งข้อใด และไม่แก้ไขให้แล้วเสร็จภายใน 15 วัน นับแต่วันที่ได้รับหนังสือบอกกล่าวจากผู้ให้เช่า</li>
          </ol>
          <p>10.3 ในกรณีที่ผู้ให้เช่าประสงค์จะบอกเลิกสัญญาก่อนครบกำหนดโดยมิใช่เหตุตามข้อ 10.2 ผู้ให้เช่าต้องแจ้งให้ผู้เช่าทราบเป็นลายลักษณ์อักษรล่วงหน้าไม่น้อยกว่า 60 วัน และคืนเงินประกันพร้อมค่าเช่าล่วงหน้าส่วนที่ยังไม่ได้ใช้ให้แก่ผู้เช่าเต็มจำนวน</p>
        </Sec>

        {/* ข้อ 11 */}
        <Sec title="ข้อ 11. การส่งมอบห้องชุดที่เช่าคืน">
          <p>11.1 เมื่อสัญญาสิ้นสุดลง ไม่ว่าด้วยเหตุใด ผู้เช่าต้องส่งมอบห้องชุดที่เช่าพร้อมทรัพย์สินภายในห้องคืนแก่ผู้ให้เช่าในสภาพเรียบร้อย ใช้งานได้ดี เว้นแต่ความเสื่อมสภาพอันเกิดจากการใช้งานตามปกติ</p>
          <p>11.2 ผู้เช่าต้องขนย้ายทรัพย์สินส่วนตัวออกจากห้องชุดที่เช่าทั้งหมด หากพ้นกำหนดส่งมอบแล้วยังมีทรัพย์สินของผู้เช่าหลงเหลืออยู่ ผู้ให้เช่ามีสิทธิขนย้าย เก็บรักษา หรือจำหน่ายทรัพย์สินดังกล่าวได้ โดยผู้เช่าต้องรับผิดชอบค่าใช้จ่ายที่เกิดขึ้น</p>
          <p>11.3 หากผู้เช่าไม่ส่งมอบห้องชุดที่เช่าคืนภายในวันที่สัญญาสิ้นสุด ผู้เช่ายินยอมชำระค่าเสียหายเป็นรายวัน ในอัตราวันละ 2 เท่าของค่าเช่ารายวัน นับแต่วันที่ครบกำหนดส่งมอบ จนถึงวันที่ส่งมอบจริง</p>
        </Sec>

        {/* ข้อ 12 */}
        <Sec title="ข้อ 12. ข้อกำหนดทั่วไป">
          <p>12.1 ผู้ให้เช่าหรือผู้แทนมีสิทธิเข้าตรวจสอบสภาพห้องชุดที่เช่าได้ตามสมควร โดยแจ้งให้ผู้เช่าทราบล่วงหน้าไม่น้อยกว่า 24 ชั่วโมง เว้นแต่กรณีฉุกเฉินที่อาจก่อให้เกิดความเสียหาย ผู้ให้เช่ามีสิทธิเข้าตรวจสอบได้ทันที</p>
          <p>12.2 หนังสือบอกกล่าวใดๆ ที่ส่งตามที่อยู่ที่ปรากฏในสัญญานี้ ให้ถือว่าได้ส่งโดยชอบแล้ว การเปลี่ยนแปลงที่อยู่ของคู่สัญญา ต้องแจ้งให้อีกฝ่ายทราบเป็นลายลักษณ์อักษร</p>
          <p>12.3 หากข้อกำหนดข้อหนึ่งข้อใดของสัญญานี้ตกเป็นโมฆะหรือไม่อาจบังคับได้ตามกฎหมาย ให้ข้อกำหนดอื่นที่เหลือยังคงมีผลใช้บังคับได้ต่อไป</p>
          <p>12.4 การแก้ไขเพิ่มเติมสัญญานี้ จะกระทำได้ก็ต่อเมื่อทำเป็นหนังสือและลงลายมือชื่อคู่สัญญาทั้งสองฝ่าย</p>
          <p>12.5 สัญญานี้อยู่ภายใต้บังคับและการตีความตามกฎหมายไทย หากเกิดข้อพิพาทใดๆ ให้คู่สัญญาเจรจาตกลงกัน หากไม่อาจตกลงกันได้ ให้นำคดีขึ้นสู่ศาลที่มีเขตอำนาจในกรุงเทพมหานคร</p>
        </Sec>

        {/* ข้อ 13 */}
        <Sec title="ข้อ 13. เอกสารแนบท้ายสัญญา">
          <p>เอกสารแนบท้ายสัญญาดังต่อไปนี้ ถือเป็นส่วนหนึ่งของสัญญาเช่าฉบับนี้</p>
          <ol className="ml-8 list-decimal">
            <li>เอกสารแนบท้ายหมายเลข 1 บัญชีทรัพย์สิน เฟอร์นิเจอร์ และเครื่องใช้ไฟฟ้า</li>
            <li>เอกสารแนบท้ายหมายเลข 2 สำเนาบัตรประจำตัวประชาชนของผู้เช่า</li>
            <li>เอกสารแนบท้ายหมายเลข 3 สำเนาทะเบียนบ้านของผู้เช่า</li>
            <li>เอกสารแนบท้ายหมายเลข 4 สำเนาหนังสือรับรองบริษัทของผู้ให้เช่า</li>
            <li>เอกสารแนบท้ายหมายเลข 5 สำเนาหนังสือกรรมสิทธิ์ห้องชุด</li>
          </ol>
        </Sec>

        {/* ปิดสัญญา + ลายเซ็น */}
        <p className="mt-5 text-justify text-[13.5px] leading-[2.05]">
          สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อความในสัญญานี้โดยตลอดแล้ว เห็นว่าถูกต้องตรงตามเจตนา จึงได้ลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน และคู่สัญญาต่างยึดถือไว้ฝ่ายละหนึ่งฉบับ
        </p>
        <div className="grid grid-cols-2 gap-x-8">
          <Sig role="ผู้ให้เช่า" name="นางสาว ภัสสรมณฑ์ สิริณลญากรณ์" smallName />
          <Sig role="ผู้เช่า" name={tName} />
          <Sig role="พยาน" wideName />
          <Sig role="พยาน" wideName />
        </div>

      </main>

      {/* ══ Appendix 1 ══ */}
      <main className="print-page page-break mx-auto mt-6 w-[210mm] bg-white px-[14mm] py-[13mm] shadow-xl ring-1 ring-slate-200 print:mt-0 print:ring-0">
        <div className="pt-2">
          <header className="border-b-2 border-slate-900 pb-3 text-center">
            <h1 className="text-[19px] font-bold">เอกสารแนบท้ายหมายเลข 1</h1>
            <p className="mt-1 text-[14px] font-semibold">บัญชีทรัพย์สิน เฟอร์นิเจอร์ และเครื่องใช้ไฟฟ้า</p>
            <p className="mt-1 text-[13.5px]">
              ประจำห้องชุดเลขที่ <TL v={roomNo} min="min-w-[50px]" />
              {proj ? <> โครงการ <TL v={proj} /></> : null}
              {' '}อาคาร <TL v={bld} />
            </p>
            <p className="mt-1 text-[13px]">
              เลขมิเตอร์ไฟเริ่มต้น <TL v={elecMeterStart} min="min-w-[90px]" />
              {'  '}เลขมิเตอร์น้ำเริ่มต้น <TL v={waterMeterStart} min="min-w-[90px]" />
            </p>
          </header>

          <table className="mt-4 w-full border-collapse text-[12.5px]">
            <colgroup>
              <col style={{ width: '6%' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-100">
                {['ลำดับ','รายการ','ยี่ห้อ/รุ่น','จำนวน','สภาพ','หมายเหตุ'].map(h => (
                  <th key={h} className="border border-slate-700 px-2 py-1.5 text-center">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EMPTY_ASSETS.map(a => (
                <tr key={a.id} className="h-8">
                  <td className="border border-slate-600 px-2 text-center">{a.id}</td>
                  <td className="border border-slate-600 px-2"></td>
                  <td className="border border-slate-600 px-2"></td>
                  <td className="border border-slate-600 px-2 text-center"></td>
                  <td className="border border-slate-600 px-2"></td>
                  <td className="border border-slate-600 px-2"></td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-5 text-justify text-[13.5px] leading-[2.05]">
            ผู้เช่าได้ตรวจสอบทรัพย์สิน เฟอร์นิเจอร์ และเครื่องใช้ไฟฟ้าตามรายการข้างต้นแล้ว เห็นว่าครบถ้วน อยู่ในสภาพดี ใช้งานได้ตามปกติ และยินยอมรับผิดชอบหากเกิดความเสียหายหรือสูญหายในระหว่างอายุสัญญาเช่า
          </p>
          <div className="grid grid-cols-2 gap-x-8">
            <Sig role="ตัวแทนผู้ให้เช่า" wideName />
            <Sig role="ผู้เช่า" name={tName} wideName />
          </div>
        </div>

      </main>
    </div>
  )
}
