import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSettings } from '../../hooks/useSettings'

const MONTHS_LONG  = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function thaiLong(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS_LONG[dt.getMonth()]} ${dt.getFullYear() + 543}`
}

function thaiShort(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear() + 543}`
}

function fmt(v) {
  return Number(v || 0).toLocaleString('th-TH')
}

function calcProrate(startDate, monthlyRent) {
  if (!startDate || !monthlyRent) return null
  const dt   = new Date(startDate)
  const day  = dt.getDate()
  if (day === 1) return 0
  const daysInMonth = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  const daysLeft    = daysInMonth - day + 1
  return Math.ceil((daysLeft / 30) * Number(monthlyRent))
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// ────────────────────────────────────────────��───────────
export default function ContractQuotationPage() {
  const { contractId } = useParams()
  const { settings }   = useSettings()
  const [c,         setC]         = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    supabase.from('contracts').select(`
      *,
      rooms(room_number, floor, size_sqm, buildings(name, projects(name))),
      tenants(full_name, phone)
    `).eq('id', contractId).single()
      .then(({ data, error }) => {
        if (error) setLoadError(error.message)
        else       setC(data)
        setLoading(false)
      })
  }, [contractId])

  useEffect(() => {
    if (!loading && c) document.title = `ใบเสนอราคา ${c.contract_number}`
  }, [loading, c])

  if (loading)   return <div className="flex h-screen items-center justify-center text-slate-500">กำลังโหลด...</div>
  if (!c)        return <div className="flex h-screen items-center justify-center text-red-500">{loadError || 'ไม่พบข้อมูล'}</div>

  // ── Company / bank from settings ────────���─────────────
  const co        = settings?.company?.name    || ''
  const coAddr    = settings?.company?.address || ''
  const coPhone   = settings?.company?.phone   || ''
  const coTax     = settings?.company?.tax_id  || ''
  const bank      = settings?.invoice?.bank_account ?? {}
  const bankName  = bank.bank_name      || ''
  const bankBranch= bank.branch         || ''
  const bankNo    = bank.account_number || ''
  const bankOwner = bank.account_name   || ''
  const penaltyRate = Number(settings?.invoice?.penalty_rate_per_day ?? 100)

  // ── Contract data ──────────────────────────────────────
  const tName   = c.tenants?.full_name || ''
  const tPhone  = c.tenants?.phone     || ''
  const proj    = c.rooms?.buildings?.projects?.name || ''
  const bld     = c.rooms?.buildings?.name           || ''
  const roomNo  = c.rooms?.room_number               || ''
  const floor   = c.rooms?.floor                     || null
  const size    = c.rooms?.size_sqm                  || null

  const monthlyRent = Number(c.monthly_rent        || 0)
  const deposit     = Number(c.deposit_amount      || 0)
  const advance     = Number(c.advance_rent_amount || 0)
  const payDay      = c.payment_day ?? 5

  const prorated        = calcProrate(c.contract_start_date, monthlyRent)
  const hasProrate      = prorated != null && prorated > 0
  const bookingDeposit  = Number(c.booking_deposit_applied || 0)
  const firstPayment    = deposit + advance + (hasProrate ? prorated : 0) - bookingDeposit

  const months = (() => {
    if (!c.contract_start_date || !c.contract_end_date) return null
    const s = new Date(c.contract_start_date)
    const e = new Date(c.contract_end_date)
    return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  })()

  const today       = new Date()
  const todayStr    = thaiLong(today)
  const deadlineStr = thaiLong(addDays(today, 3))

  // ── Condition sentence for footer ─────────────────────
  const payItems = [
    'เงินประกันความเสียหาย',
    ...(advance > 0     ? ['ค่าเช่าล่วงหน้า']                             : []),
    ...(hasProrate      ? ['ค่าเช่าส่วน prorated จนถึงสิ้นเดือน'] : []),
  ]
  const payItemsText = payItems.join(' ')

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4 portrait; margin: 13mm 13mm; }
        @media print {
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; width: 100% !important; padding: 0 !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Toolbar (hidden on print) ── */}
      <div className="no-print mx-auto mb-5 flex max-w-[210mm] items-center justify-between rounded-xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-200">
        <div>
          <p className="font-bold">ใบเสนอราคาห้องเช่า — {c.contract_number}</p>
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
      <main className="print-page mx-auto w-[210mm] bg-white px-[13mm] py-[11mm] shadow-xl ring-1 ring-slate-200 print:ring-0 text-slate-800">

        {/* Header */}
        <header className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
          <div>
            <p className="text-[16px] font-bold leading-tight">{co}</p>
            {(coAddr || coPhone) && (
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                {coAddr}{coPhone ? `  โทร. ${coPhone}` : ''}
              </p>
            )}
            {coTax && <p className="text-[11px] text-slate-400">เลขประจำตัวผู้เสียภาษี {coTax}</p>}
          </div>
          <div className="text-right shrink-0 ml-4">
            <p className="text-[20px] font-bold tracking-wide">ใบเสนอราคาห้องเช่า</p>
            <p className="text-[11.5px] text-slate-500">เลขที่ {c.contract_number}/Q &nbsp;·&nbsp; วันที่ {todayStr}</p>
          </div>
        </header>

        {/* Addressee */}
        <div className="mt-2.5 text-[13px]">
          <span className="font-semibold">เรียน:</span>{' '}
          {tName || <span className="text-slate-400">—</span>}
          {tPhone && <span className="ml-3 text-slate-500">โทร. {tPhone}</span>}
        </div>
        <p className="mt-0.5 text-[12.5px] text-slate-600">
          บริษัทมีความยินดีขอเสนอห้องชุดให้เช่าตามรายละเอียดดังต่อไปนี้
        </p>

        {/* Main grid: room info (left) + financial table (right) */}
        <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-3 items-start">

          {/* Left: Room details */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[12.5px]">
            <SectionLabel>ข้อมูลห้องชุด</SectionLabel>
            <table className="w-full">
              <tbody>
                {proj   && <InfoRow label="โครงการ"   value={proj}            />}
                          <InfoRow label="อาคาร"     value={bld || '—'}       />
                          <InfoRow label="ห้องเลขที่" value={roomNo || '—'}   />
                {floor  && <InfoRow label="ชั้น"       value={String(floor)}  />}
                {size   && <InfoRow label="พื้นที่"    value={`${size} ตร.ม.`}/>}
              </tbody>
            </table>

            <div className="mt-2 border-t border-slate-200 pt-2">
              <SectionLabel>ระยะเวลาสัญญา</SectionLabel>
              <p className="font-medium">{thaiShort(c.contract_start_date)}</p>
              <p className="text-slate-500 text-[12px]">ถึง {thaiShort(c.contract_end_date)}{months ? ` (${months} เดือน)` : ''}</p>
            </div>

            <div className="mt-2 border-t border-slate-200 pt-2">
              <SectionLabel>กำหนดชำระค่าเช่า</SectionLabel>
              <p>ทุกวันที่ <span className="font-semibold">{payDay}</span> ของเดือน</p>
            </div>
          </div>

          {/* Right: Financial table */}
          <div className="w-[62mm] shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[12.5px]">
            <SectionLabel>ยอดชำระ</SectionLabel>
            <table className="w-full">
              <tbody>
                <MoneyRow label="ค่าเช่ารายเดือน" value={monthlyRent} bold />
                <tr><td colSpan={2} className="py-1.5"><div className="border-t border-dashed border-slate-300" /></td></tr>
                <MoneyRow label="เงินประกัน"      value={deposit} />
                {advance > 0 && <MoneyRow label="ค่าเช่าล่วงหน้า" value={advance} />}
                {hasProrate      && <MoneyRow label="ค่าเช่า prorated *" value={prorated} />}
                {bookingDeposit > 0 && <MoneyRow label="หักเงินจอง" value={-bookingDeposit} />}
                <tr><td colSpan={2} className="py-1"><div className="border-t border-slate-500" /></td></tr>
                <MoneyRow label="ยอดชำระแรกเข้า" value={firstPayment} bold />
              </tbody>
            </table>
            {hasProrate && (
              <p className="mt-1 text-[10px] text-slate-400 leading-tight">* โดยประมาณ ยืนยันเมื่อเข้าพักจริง</p>
            )}
          </div>
        </div>

        {/* Bank account */}
        {(bankName || bankNo) && (
          <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px]">
            <SectionLabel>บัญชีสำหรับโอนเงิน</SectionLabel>
            <p>
              {bankName && <><span className="font-semibold">ธนาคาร{bankName}</span>{bankBranch ? `  สาขา${bankBranch}` : ''}{bankNo ? `  เลขบัญชี ` : ''}</>}
              {bankNo   && <span className="font-mono font-semibold">{bankNo}</span>}
              {bankOwner && <span className="text-slate-500">  ชื่อบัญชี{bankOwner}</span>}
            </p>
          </div>
        )}

        {/* Key conditions */}
        <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12px]">
          <SectionLabel>เงื่อนไขสำคัญ</SectionLabel>
          <ol className="list-decimal ml-4 space-y-0.5 text-slate-700 leading-snug">
            <li>ใช้ห้องชุดเพื่ออยู่อาศัยส่วนตัวเท่านั้น ห้ามประกอบธุรกิจหรือจดทะเบียนนิติบุคคล</li>
            <li>ห้ามเลี้ยงสัตว์ทุกชนิดในห้องชุดโดยเด็ดขาด</li>
            <li>ห้ามให้เช่าช่วงหรือโอนสิทธิ์โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษร</li>
            <li>บอกเลิกก่อนครบกำหนดต้องแจ้งล่วงหน้า 30 วัน และบริษัทฯสงวนสิทธิ์ยึดเงินประกันทั้งจำนวน</li>
            <li>ค่าปรับชำระล่าช้า {fmt(penaltyRate)} บาท/วัน (เริ่มนับหลังวันครบกำหนด 5 วัน)</li>
            <li>ค่าน้ำประปาชำระตามมาตรวัดจริงตามอัตรานิติบุคคลอาคารชุดกำหนด ค่าไฟฟ้าชำระกับการไฟฟ้าโดยตรง</li>
          </ol>
        </div>

        {/* Validity / completion condition */}
        <div className="mt-2.5 rounded-lg border-2 border-slate-700 bg-slate-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-700">
          <p className="font-bold text-slate-800 text-[13px] mb-1">เงื่อนไขการมีผลสมบูรณ์ของใบเสนอราคา</p>
          <p>
            ใบเสนอราคาฉบับนี้จะมีผลสมบูรณ์เมื่อผู้เช่าชำระ<strong>{payItemsText}</strong>ให้แก่บริษัทครบถ้วน
            ภายในวันที่ <strong>{deadlineStr}</strong> (ภายใน 3 วันนับแต่วันที่ออกเอกสารฉบับนี้)
          </p>
          <p className="mt-1">
            ในกรณีที่สัญญาเช่าไม่ได้รับการอนุมัติจากบริษัทไม่ว่าด้วยเหตุใดก็ตาม
            บริษัทจะคืนเงินที่ผู้เช่าชำระมาแล้ว<strong>ทั้งจำนวนภายใน 3 วันทำการ</strong>
            นับแต่วันที่แจ้งผล และให้ถือว่าใบเสนอราคาฉบับนี้เป็นอันยุติ
          </p>
        </div>

        {/* Signature */}
        <div className="mt-4 flex justify-end text-[13px]">
          <div className="text-center">
            <div className="mx-auto w-52 border-b border-dotted border-slate-600 mb-1 mt-10" />
            <p>(สุมนาวดี วันมา)</p>
            <p className="font-semibold">ตัวแทนผู้ได้รับมอบอำนาจ</p>
            <p className="text-slate-500 text-[12px]">บริษัท อัสสกาญจน์ จำกัด</p>
          </div>
        </div>

      </main>
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{children}</p>
  )
}

function InfoRow({ label, value }) {
  return (
    <tr>
      <td className="pr-2 py-0.5 text-slate-500 whitespace-nowrap">{label}</td>
      <td className="py-0.5 font-medium">{value}</td>
    </tr>
  )
}

function MoneyRow({ label, value, bold }) {
  const cls = bold ? 'font-bold text-slate-800' : 'text-slate-600'
  return (
    <tr>
      <td className={`pr-3 py-0.5 ${cls}`}>{label}</td>
      <td className={`py-0.5 text-right tabular-nums ${cls}`}>{Number(value || 0).toLocaleString('th-TH')}</td>
    </tr>
  )
}
