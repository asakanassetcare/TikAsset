import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push'

const MONTHS_TH = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
]
const MONTHS_TH_SHORT = [
  'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.',
]

const TYPE_LABEL: Record<string, string> = {
  monthly_rent:     'ค่าเช่า',
  contract_initial: 'ประกัน+ล่วงหน้า',
  addon:            'ค่าบริการเสริม',
  final_settlement: 'เคลียร์ Move-out',
  booking_deposit:  'เงินจอง',
  other:            'อื่นๆ',
}

function thaiDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getUTCDate()} ${MONTHS_TH[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`
}

function thaiMonthYear(billing_period: string) {
  const [year, month] = billing_period.split('-')
  return `${MONTHS_TH[parseInt(month) - 1]} ${parseInt(year) + 543}`
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function pushLine(userId: string, messages: unknown[], token: string) {
  await fetch(LINE_PUSH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages }),
  })
}

function invoiceLabel(inv: any) {
  const base = TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type
  if (inv.invoice_type === 'monthly_rent' && inv.billing_period) {
    return `${base} ${thaiMonthYear(inv.billing_period)}`
  }
  return base
}

function thaiDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z')
  return `${d.getUTCDate()} ${MONTHS_TH_SHORT[d.getUTCMonth()]}`
}

function penaltyDetails(dueDate: string, _billingPeriod: string | null, ratePerDay: number, today: string) {
  if (today <= dueDate) return null
  const startD = new Date(dueDate + 'T00:00:00Z')
  startD.setUTCDate(startD.getUTCDate() + 1)
  const startStr = startD.toISOString().slice(0, 10)
  const endD = new Date(today + 'T00:00:00Z')
  const days = Math.floor((endD.getTime() - startD.getTime()) / 86400000) + 1
  return { days, startStr, endStr: today, amount: days * ratePerDay }
}

function overdueDays(dueDate: string, today: string) {
  if (today <= dueDate) return 0
  const dueD = new Date(dueDate + 'T00:00:00Z')
  const todayD = new Date(today + 'T00:00:00Z')
  return Math.floor((todayD.getTime() - dueD.getTime()) / 86400000)
}

function penaltyLabel(inv: any): string {
  if (inv.billing_period) {
    const [, m] = inv.billing_period.split('-')
    return `ค่าปรับล่าช้า ${MONTHS_TH_SHORT[parseInt(m) - 1]}`
  }
  return `ค่าปรับล่าช้า`
}

function buildSummaryFlex(tenantName: string, invoices: any[], bank: any, ratePerDay: number, today: string) {
  const subtotal = invoices.reduce((s, i) => s + Number(i.total_amount), 0)

  const penalties = invoices.map((inv) => ({
    inv,
    p: inv.invoice_type === 'monthly_rent'
      ? penaltyDetails(inv.due_date, inv.billing_period ?? null, ratePerDay, today)
      : null,
  }))
  const totalPenalty = penalties.reduce((s, { p }) => s + (p?.amount ?? 0), 0)
  const grandTotal   = subtotal + totalPenalty
  const grandFmt     = grandTotal.toLocaleString('th-TH')

  // หาวันครบกำหนดที่เร็วที่สุด
  const earliestDue = invoices.reduce((min, i) => i.due_date < min ? i.due_date : min, invoices[0].due_date)
  const dueDate1 = thaiDate(earliestDue)
  const dueDate5 = thaiDate(addDays(earliestDue, 4))
  const dueNoticeRows = today <= earliestDue
    ? [
        { type: 'text', text: `ครบกำหนดวันที่ ${dueDate1}`, size: 'sm', color: '#374151', margin: 'lg' },
        { type: 'text', text: `ชำระได้ไม่เกิน ${dueDate5}`, size: 'sm', color: '#DC2626', weight: 'bold', margin: 'xs' },
      ]
    : [
        { type: 'text', text: `ครบกำหนดวันที่ ${dueDate1}`, size: 'sm', color: '#374151', margin: 'lg' },
        { type: 'text', text: `เกินกำหนดชำระแล้ว ${overdueDays(earliestDue, today)} วัน`, size: 'sm', color: '#DC2626', weight: 'bold', margin: 'xs' },
      ]

  // rows ต่อ invoice + ค่าปรับ (ถ้ามี)
  const invoiceRows = penalties.flatMap(({ inv, p }) => {
    const rows: unknown[] = [
      {
        type: 'box', layout: 'horizontal',
        contents: [
          { type: 'text', text: invoiceLabel(inv), size: 'sm', color: '#374151', flex: 3, wrap: true },
          { type: 'text', text: `฿${Number(inv.total_amount).toLocaleString('th-TH')}`, size: 'sm', color: '#111827', weight: 'bold', align: 'end', flex: 2 },
        ],
      },
    ]
    if (p) {
      const rangeText = `${thaiDateShort(p.startStr)} - ${thaiDateShort(p.endStr)} (${p.days} วัน × ${ratePerDay})`
      rows.push({
        type: 'box', layout: 'horizontal',
        contents: [
          {
            type: 'box', layout: 'vertical', flex: 3,
            contents: [
              { type: 'text', text: penaltyLabel(inv), size: 'xs', color: '#DC2626', wrap: true },
              { type: 'text', text: rangeText, size: 'xxs', color: '#EF4444', wrap: true },
            ],
          },
          { type: 'text', text: `฿${p.amount.toLocaleString('th-TH')}`, size: 'xs', color: '#DC2626', weight: 'bold', align: 'end', flex: 2 },
        ],
      })
    }
    return rows
  })

  const bodyContents: unknown[] = [
    ...invoiceRows,
    { type: 'separator', margin: 'lg' },
    {
      type: 'box', layout: 'horizontal', margin: 'lg',
      contents: [
        { type: 'text', text: 'รวมทั้งหมด', size: 'sm', color: '#111827', weight: 'bold', flex: 3 },
        { type: 'text', text: `฿${grandFmt}`, size: 'sm', color: '#2563EB', weight: 'bold', align: 'end', flex: 2 },
      ],
    },
    { type: 'separator', margin: 'lg' },
    ...dueNoticeRows,
  ]

  if (totalPenalty > 0) {
    bodyContents.push({ type: 'text', text: `⚠️ มีค่าปรับล่าช้า ฿${totalPenalty.toLocaleString('th-TH')} รวมอยู่ด้านบนแล้ว`, size: 'xs', color: '#DC2626', margin: 'sm', wrap: true })
  } else {
    bodyContents.push({ type: 'text', text: 'โปรดชำระให้ทันเวลาเพื่อไม่ให้มีค่าปรับ', size: 'xs', color: '#6B7280', margin: 'sm', wrap: true })
  }

  const footerContents: unknown[] = []
  if (bank?.bank_name)      footerContents.push({ type: 'text', text: `ธนาคาร: ${bank.bank_name}${bank.branch ? ` สาขา${bank.branch}` : ''}`, size: 'xs', color: '#374151' })
  if (bank?.account_number) footerContents.push({ type: 'text', text: `เลขที่: ${bank.account_number}`, size: 'xs', color: '#374151' })
  if (bank?.account_name)   footerContents.push({ type: 'text', text: `ชื่อบัญชี: ${bank.account_name}`, size: 'xs', color: '#374151' })

  return {
    type: 'flex',
    altText: `สรุปยอดค้างชำระ ฿${grandFmt}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: 'lg',
        backgroundColor: '#2563EB',
        contents: [
          { type: 'text', text: '📄 สรุปยอดค้างชำระ', color: '#FFFFFF', size: 'md', weight: 'bold' },
          { type: 'text', text: tenantName, color: '#BFDBFE', size: 'sm', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg',
        contents: bodyContents,
      },
      footer: footerContents.length > 0 ? {
        type: 'box', layout: 'vertical', paddingAll: 'lg',
        backgroundColor: '#F9FAFB',
        contents: footerContents,
      } : undefined,
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    })
  }

  const token    = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body     = await req.json()
  const type     = body.type
  const today    = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) // YYYY-MM-DD UTC+7

  // ดึง invoice settings (bank account + penalty rate)
  const { data: settingRow } = await supabase.from('settings').select('value').eq('key', 'invoice').maybeSingle()
  const bank        = settingRow?.value?.bank_account ?? {}
  const ratePerDay  = Number(settingRow?.value?.penalty_rate_per_day ?? 100)

  // ดึง invoice ที่ค้างอยู่ทั้งหมด (ทุก type ทุกเดือน)
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_type, billing_period, total_amount, due_date,
      rooms(room_number, buildings(name)),
      tenants(id, line_user_id, full_name)
    `)
    .in('status', ['pending', 'overdue'])

  // Group by (line_user_id + room_id) → แต่ละห้องได้ Flex Message แยกกัน
  const byRoom = new Map<string, { userId: string; name: string; roomName: string; invoices: any[] }>()
  for (const inv of invoices ?? []) {
    const userId = inv.tenants?.line_user_id
    if (!userId) continue
    const roomId  = inv.room_id ?? inv.rooms?.room_number ?? 'unknown'
    const key     = `${userId}__${roomId}`
    const roomName = `${inv.rooms?.buildings?.name ?? ''} ห้อง ${inv.rooms?.room_number ?? ''}`
    if (!byRoom.has(key)) byRoom.set(key, { userId, name: inv.tenants.full_name ?? '', roomName, invoices: [] })
    byRoom.get(key)!.invoices.push(inv)
  }

  let sent = 0

  if (type === 'receipt') {
    const pid = body.payment_id
    if (pid) {
      const { data: pmt } = await supabase
        .from('payments')
        .select(`
          id, amount, paid_date, bank_name, bank_reference,
          invoices(invoice_number, invoice_type, billing_period, due_date, penalty_discount,
            rooms(room_number, buildings(name)),
            tenants(full_name, line_user_id))
        `)
        .eq('id', pid)
        .single()

      const userId = pmt?.invoices?.tenants?.line_user_id
      if (userId) {
        const inv      = pmt.invoices
        const tenantName = inv.tenants?.full_name ?? ''
        const roomName   = `${inv.rooms?.buildings?.name ?? ''} ห้อง ${inv.rooms?.room_number ?? ''}`
        const amtFmt     = Number(pmt.amount).toLocaleString('th-TH')
        const dateFmt    = thaiDate(pmt.paid_date)

        const flex = {
          type: 'flex',
          altText: `ใบเสร็จรับเงิน ฿${amtFmt}`,
          contents: {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', paddingAll: 'lg',
              backgroundColor: '#16A34A',
              contents: [
                { type: 'text', text: '✅ ใบเสร็จรับเงิน', color: '#FFFFFF', size: 'md', weight: 'bold' },
                { type: 'text', text: `${tenantName} · ${roomName}`, color: '#DCFCE7', size: 'sm', margin: 'xs' },
              ],
            },
            body: {
              type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg',
              contents: [
                {
                  type: 'box', layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'เลขที่', size: 'sm', color: '#6B7280', flex: 2 },
                    { type: 'text', text: inv.invoice_number ?? '', size: 'sm', color: '#111827', weight: 'bold', align: 'end', flex: 3 },
                  ],
                },
                {
                  type: 'box', layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'วันที่ชำระ', size: 'sm', color: '#6B7280', flex: 2 },
                    { type: 'text', text: dateFmt, size: 'sm', color: '#111827', weight: 'bold', align: 'end', flex: 3 },
                  ],
                },
                ...(pmt.bank_name ? [{
                  type: 'box', layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'ธนาคาร', size: 'sm', color: '#6B7280', flex: 2 },
                    { type: 'text', text: pmt.bank_name, size: 'sm', color: '#111827', align: 'end', flex: 3 },
                  ],
                }] : []),
                { type: 'separator', margin: 'lg' },
                {
                  type: 'box', layout: 'horizontal', margin: 'lg',
                  contents: [
                    { type: 'text', text: 'ยอดชำระ', size: 'md', color: '#111827', weight: 'bold', flex: 2 },
                    { type: 'text', text: `฿${amtFmt}`, size: 'md', color: '#16A34A', weight: 'bold', align: 'end', flex: 3 },
                  ],
                },
                { type: 'text', text: 'ขอบคุณที่ชำระเงินค่าเช่า', size: 'xs', color: '#6B7280', margin: 'lg', align: 'center' },
              ],
            },
            ...(body.receipt_url ? {
              footer: {
                type: 'box', layout: 'vertical', paddingAll: 'md',
                contents: [{
                  type: 'button',
                  action: { type: 'uri', label: '📄 ดูใบเสร็จรับเงิน', uri: body.receipt_url },
                  style: 'primary', color: '#16A34A', height: 'sm',
                }],
              },
            } : {}),
          },
        }
        await pushLine(userId, [flex], token)
        return Response.json({ ok: true, sent: 1 })
      }
    }
    return Response.json({ ok: true, sent: 0 })
  }

  if (type === 'contract_expiry') {
    const daysBefore = Number(body.days_before ?? 30)
    const targetDate = new Date(today)
    targetDate.setUTCDate(targetDate.getUTCDate() + daysBefore)
    const targetStr  = targetDate.toISOString().slice(0, 10)

    const { data: contracts } = await supabase
      .from('contracts')
      .select(`
        id, contract_number, contract_end_date,
        rooms(room_number, buildings(name)),
        tenants(full_name, line_user_id)
      `)
      .eq('status', 'active')
      .eq('contract_end_date', targetStr)

    for (const c of contracts ?? []) {
      const userId = c.tenants?.line_user_id
      if (!userId) continue

      const tenantName = c.tenants.full_name ?? ''
      const roomName   = `${c.rooms?.buildings?.name ?? ''} ห้อง ${c.rooms?.room_number ?? ''}`
      const endDateFmt = thaiDate(c.contract_end_date)

      const flex = {
        type: 'flex',
        altText: `⚠️ สัญญาเช่าจะหมดอายุใน ${daysBefore} วัน`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box', layout: 'vertical', paddingAll: 'lg',
            backgroundColor: '#D97706',
            contents: [
              { type: 'text', text: '⚠️ สัญญาใกล้หมดอายุ', color: '#FFFFFF', size: 'md', weight: 'bold' },
              { type: 'text', text: `${tenantName} · ${roomName}`, color: '#FEF3C7', size: 'sm', margin: 'xs' },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg',
            contents: [
              {
                type: 'box', layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เลขที่สัญญา', size: 'sm', color: '#6B7280', flex: 2 },
                  { type: 'text', text: c.contract_number ?? '', size: 'sm', color: '#111827', weight: 'bold', align: 'end', flex: 3 },
                ],
              },
              {
                type: 'box', layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'วันหมดสัญญา', size: 'sm', color: '#6B7280', flex: 2 },
                  { type: 'text', text: endDateFmt, size: 'sm', color: '#DC2626', weight: 'bold', align: 'end', flex: 3 },
                ],
              },
              {
                type: 'box', layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'คงเหลือ', size: 'sm', color: '#6B7280', flex: 2 },
                  { type: 'text', text: `${daysBefore} วัน`, size: 'sm', color: '#D97706', weight: 'bold', align: 'end', flex: 3 },
                ],
              },
              { type: 'separator', margin: 'lg' },
              { type: 'text', text: 'กรุณาติดต่อเจ้าหน้าที่เพื่อต่อสัญญา', size: 'sm', color: '#374151', margin: 'lg', wrap: true, align: 'center' },
              { type: 'text', text: '📞 080-000-0000', size: 'sm', color: '#2563EB', weight: 'bold', margin: 'xs', align: 'center' },
            ],
          },
        },
      }
      await pushLine(userId, [flex], token)
      sent++
    }
    return Response.json({ ok: true, sent })
  }

  if (type === 'invoice') {
    for (const { userId, name, roomName, invoices: roomInvoices } of byRoom.values()) {
      await pushLine(userId, [buildSummaryFlex(`${name} · ${roomName}`, roomInvoices, bank, ratePerDay, today)], token)
      sent++
    }
  }

  if (type === 'reminder') {
    for (const { userId, roomName, invoices: roomInvoices } of byRoom.values()) {
      const subtotal     = roomInvoices.reduce((s, i) => s + Number(i.total_amount), 0)
      const totalPenalty = roomInvoices.reduce((s, i) => s + (
        i.invoice_type === 'monthly_rent'
          ? (penaltyDetails(i.due_date, i.billing_period ?? null, ratePerDay, today)?.amount ?? 0)
          : 0
      ), 0)
      const grandTotal   = subtotal + totalPenalty
      const grandFmt     = grandTotal.toLocaleString('th-TH')
      const penaltyLine  = totalPenalty > 0 ? `\n⚠️ รวมค่าปรับล่าช้า ฿${totalPenalty.toLocaleString('th-TH')}` : ''
      const earliestDue = roomInvoices.reduce((min, i) => i.due_date < min ? i.due_date : min, roomInvoices[0].due_date)
      const dueLine = today <= earliestDue
        ? `ครบกำหนดวันที่ ${thaiDate(earliestDue)}\nชำระได้ไม่เกิน ${thaiDate(addDays(earliestDue, 4))}`
        : `ครบกำหนดวันที่ ${thaiDate(earliestDue)}\nเกินกำหนดชำระแล้ว ${overdueDays(earliestDue, today)} วัน`
      const title = today <= earliestDue ? '⏰ แจ้งเตือนค่าเช่า' : '⚠️ แจ้งเตือนค้างชำระ'
      const text = `${title}\n${roomName}\n${dueLine}\nยอดค้างรวม ฿${grandFmt}${penaltyLine}\nหากชำระแล้วกรุณาแจ้งเจ้าหน้าที่\n📞 080-000-0000`
      await pushLine(userId, [{ type: 'text', text }], token)
      sent++
    }
  }

  return Response.json({ ok: true, sent })
})
