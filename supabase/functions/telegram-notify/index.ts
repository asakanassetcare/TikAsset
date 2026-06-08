import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_API = 'https://api.telegram.org'

type WorkType =
  | 'move_in_ready'
  | 'contract_pending_approval'
  | 'move_out_pending_approval'
  | 'contract_ready_for_initial_invoice'
  | 'invoice_paid_pending_confirm'
  | 'move_out_settlement_pending'

const WORK_TYPES: WorkType[] = [
  'move_in_ready',
  'contract_pending_approval',
  'move_out_pending_approval',
  'contract_ready_for_initial_invoice',
  'invoice_paid_pending_confirm',
  'move_out_settlement_pending',
]

type WorkItem = {
  item: any
  refTable: string
  refId: string
  occurrenceKey: string
}

const TYPE_LABEL: Record<WorkType, string> = {
  move_in_ready: 'รอบันทึกเข้าพัก',
  contract_pending_approval: 'สัญญารออนุมัติ',
  move_out_pending_approval: 'แจ้งย้ายออกรออนุมัติ',
  contract_ready_for_initial_invoice: 'สัญญารอบัญชีตรวจบิลแรก',
  invoice_paid_pending_confirm: 'Invoice รอยืนยันชำระ',
  move_out_settlement_pending: 'Settlement move-out รอเคลียร์',
}

const TYPE_ROLE: Record<WorkType, 'staff' | 'head_staff' | 'accounting'> = {
  move_in_ready: 'staff',
  contract_pending_approval: 'head_staff',
  move_out_pending_approval: 'head_staff',
  contract_ready_for_initial_invoice: 'accounting',
  invoice_paid_pending_confirm: 'accounting',
  move_out_settlement_pending: 'accounting',
}

type TelegramRole = 'staff' | 'head_staff' | 'accounting'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? ''
}

function chatIdsFor(role: TelegramRole) {
  const byRole = {
    staff: env('TELEGRAM_STAFF_CHAT_ID'),
    head_staff: env('TELEGRAM_HEAD_STAFF_CHAT_ID'),
    accounting: env('TELEGRAM_ACCOUNTING_CHAT_ID'),
  }[role]
  const fallback = env('TELEGRAM_ADMIN_CHAT_ID')
  return (byRole || fallback)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

function roomLabel(row: any) {
  const building = row?.rooms?.buildings?.name
  const room = row?.rooms?.room_number
  if (building && room) return `${building} ห้อง ${room}`
  if (room) return `ห้อง ${room}`
  return '-'
}

function money(value: unknown) {
  return `฿${Number(value ?? 0).toLocaleString('th-TH')}`
}

function thaiDate(dateStr?: string | null) {
  if (!dateStr) return '-'
  return new Date(`${String(dateStr).slice(0, 10)}T00:00:00+07:00`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function escapeHtml(text: unknown) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function occurrenceFrom(...values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined && String(value).trim() !== '')?.toString() ?? 'current'
}

function buildMessage(type: WorkType, item: any) {
  const title = `<b>${escapeHtml(TYPE_LABEL[type])}</b>`

  if (type === 'move_in_ready') {
    return [
      title,
      `สัญญา: <b>${escapeHtml(item.contract_number)}</b>`,
      `ห้อง: ${escapeHtml(roomLabel(item))}`,
      `ผู้เช่า: ${escapeHtml(item.tenants?.full_name)}`,
      `กำหนดเข้า: ${escapeHtml(thaiDate(item.move_in_date))}`,
      `งานต่อไป: Staff กดบันทึกเข้าพัก`,
    ].join('\n')
  }

  if (type === 'contract_pending_approval') {
    return [
      title,
      `สัญญา: <b>${escapeHtml(item.contract_number)}</b>`,
      `ห้อง: ${escapeHtml(roomLabel(item))}`,
      `ผู้เช่า: ${escapeHtml(item.tenants?.full_name)}`,
      `ค่าเช่า: ${escapeHtml(money(item.monthly_rent))}/เดือน`,
      `งานต่อไป: Head Staff/Manager ตรวจและอนุมัติ`,
    ].join('\n')
  }

  if (type === 'move_out_pending_approval') {
    return [
      title,
      `เลขที่: <b>${escapeHtml(item.move_out_number)}</b>`,
      `ห้อง: ${escapeHtml(roomLabel(item))}`,
      `ผู้เช่า: ${escapeHtml(item.tenants?.full_name)}`,
      `วันที่ย้ายออก: ${escapeHtml(thaiDate(item.move_out_date))}`,
      `งานต่อไป: Head Staff/Manager ตรวจและอนุมัติ`,
    ].join('\n')
  }

  if (type === 'contract_ready_for_initial_invoice') {
    const required = (item.invoices ?? []).filter((inv: any) => ['contract_initial', 'monthly_rent'].includes(inv.invoice_type))
    const invoiceText = required.length
      ? required.map((inv: any) => `${inv.invoice_number ?? inv.invoice_type}: ${inv.status}`).join(', ')
      : 'ยังไม่มีบิลแรก'
    return [
      title,
      `สัญญา: <b>${escapeHtml(item.contract_number)}</b>`,
      `ห้อง: ${escapeHtml(roomLabel(item))}`,
      `ผู้เช่า: ${escapeHtml(item.tenants?.full_name)}`,
      `สถานะบิล: ${escapeHtml(invoiceText)}`,
      `งานต่อไป: Accounting ออก/ตรวจบิลแรก`,
    ].join('\n')
  }

  if (type === 'invoice_paid_pending_confirm') {
    const inv = item.invoices
    return [
      title,
      `Invoice: <b>${escapeHtml(inv?.invoice_number)}</b>`,
      `ห้อง: ${escapeHtml(roomLabel(inv))}`,
      `ผู้เช่า: ${escapeHtml(inv?.tenants?.full_name)}`,
      `ยอดที่แจ้งชำระ: ${escapeHtml(money(item.amount))}`,
      `งานต่อไป: Accounting ตรวจสลิปและอนุมัติ`,
    ].join('\n')
  }

  const mo = item.move_outs
  return [
    title,
    `Move-out: <b>${escapeHtml(mo?.move_out_number)}</b>`,
    `ห้อง: ${escapeHtml(roomLabel(mo))}`,
    `ผู้เช่า: ${escapeHtml(mo?.tenants?.full_name)}`,
    `ยอด: ${escapeHtml(money(item.amount))} (${escapeHtml(item.direction)})`,
    `สถานะ: ${escapeHtml(item.status)}`,
    `งานต่อไป: Accounting เคลียร์ settlement`,
  ].join('\n')
}

async function sendTelegram(chatId: string, text: string, token: string) {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`)
}

async function claimDedupe(supabase: any, dedupeKey: string, type: WorkType, refTable: string, refId: string) {
  const { error } = await supabase
    .from('telegram_notification_logs')
    .insert({ dedupe_key: dedupeKey, type, ref_table: refTable, ref_id: refId, status: 'pending' })
  if (!error) return true
  if (error.code === '23505') return false
  throw error
}

async function markLog(supabase: any, dedupeKey: string, status: 'sent' | 'failed', errorMessage?: string) {
  await supabase
    .from('telegram_notification_logs')
    .update({
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      error_message: errorMessage?.slice(0, 1000) ?? null,
    })
    .eq('dedupe_key', dedupeKey)
}

async function fetchWorkItems(supabase: any, type: WorkType) {
  if (type === 'move_in_ready') {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        id, contract_number, move_in_date, approved_at, updated_at,
        rooms(room_number, buildings(name)),
        tenants(full_name),
        invoices(id, invoice_number, invoice_type, status, updated_at)
      `)
      .eq('status', 'approved')
      .is('actual_move_in_at', null)
      .order('move_in_date', { ascending: true })
      .limit(50)
    if (error) throw error
    return (data ?? []).filter((c: any) => {
      const required = (c.invoices ?? []).filter((inv: any) => ['contract_initial', 'monthly_rent'].includes(inv.invoice_type))
      return required.length > 0 && required.every((inv: any) => inv.status === 'paid')
    }).map((item: any): WorkItem => ({
      item,
      refTable: 'contracts',
      refId: item.id,
      occurrenceKey: occurrenceFrom(
        ...(item.invoices ?? []).map((inv: any) => inv.updated_at),
        item.approved_at,
        item.updated_at,
      ),
    }))
  }

  if (type === 'contract_pending_approval') {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        id, contract_number, monthly_rent, updated_at, submitted_for_approval_at, created_at,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `)
      .eq('status', 'pending_approve')
      .order('created_at', { ascending: true })
      .limit(50)
    if (error) throw error
    return (data ?? []).map((item: any): WorkItem => ({
      item,
      refTable: 'contracts',
      refId: item.id,
      occurrenceKey: occurrenceFrom(item.submitted_for_approval_at, item.updated_at, item.created_at),
    }))
  }

  if (type === 'move_out_pending_approval') {
    const { data, error } = await supabase
      .from('move_outs')
      .select(`
        id, move_out_number, move_out_date, updated_at, created_at,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      `)
      .eq('status', 'pending_accounting')
      .order('created_at', { ascending: true })
      .limit(50)
    if (error) throw error
    return (data ?? []).map((item: any): WorkItem => ({
      item,
      refTable: 'move_outs',
      refId: item.id,
      occurrenceKey: occurrenceFrom(item.updated_at, item.created_at),
    }))
  }

  if (type === 'contract_ready_for_initial_invoice') {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        id, contract_number, approved_at, updated_at,
        rooms(room_number, buildings(name)),
        tenants(full_name),
        invoices(id, invoice_number, invoice_type, status)
      `)
      .eq('status', 'approved')
      .is('actual_move_in_at', null)
      .order('approved_at', { ascending: true })
      .limit(50)
    if (error) throw error
    return (data ?? []).filter((c: any) => {
      const required = (c.invoices ?? []).filter((inv: any) => ['contract_initial', 'monthly_rent'].includes(inv.invoice_type))
      return required.length === 0 || required.some((inv: any) => inv.status !== 'paid')
    }).map((item: any): WorkItem => ({
      item,
      refTable: 'contracts',
      refId: item.id,
      occurrenceKey: occurrenceFrom(item.approved_at, item.updated_at),
    }))
  }

  if (type === 'invoice_paid_pending_confirm') {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        id, amount, created_at,
        invoices(
          id, invoice_number,
          rooms(room_number, buildings(name)),
          tenants(full_name)
        )
      `)
      .eq('status', 'pending_approve')
      .order('created_at', { ascending: true })
      .limit(50)
    if (error) throw error
    return (data ?? []).map((item: any): WorkItem => ({
      item,
      refTable: 'payments',
      refId: item.id,
      occurrenceKey: occurrenceFrom(item.created_at),
    }))
  }

  const { data, error } = await supabase
    .from('settlements')
    .select(`
      id, amount, direction, status, updated_at, created_at,
      move_outs(
        id, move_out_number,
        rooms(room_number, buildings(name)),
        tenants(full_name)
      )
    `)
    .in('status', ['pending', 'paid_by_staff'])
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) throw error
  return (data ?? []).map((item: any): WorkItem => ({
    item,
    refTable: 'settlements',
    refId: item.id,
    occurrenceKey: occurrenceFrom(item.updated_at, item.created_at),
  }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const token = env('TELEGRAM_BOT_TOKEN')
    if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN')

    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}

    if (body.test === true) {
      const role: TelegramRole = ['staff', 'head_staff', 'accounting'].includes(body.role)
        ? body.role
        : 'staff'
      const chatIds = chatIdsFor(role)
      if (chatIds.length === 0) throw new Error(`Missing Telegram chat id for ${role}`)
      const text = body.message
        ? String(body.message)
        : [
          '<b>TikAsset Telegram test</b>',
          `Role: ${escapeHtml(role)}`,
          `Time: ${escapeHtml(new Date().toISOString())}`,
          'ถ้าเห็นข้อความนี้ แปลว่า bot ส่งข้อความได้แล้ว',
        ].join('\n')
      for (const chatId of chatIds) {
        await sendTelegram(chatId, text, token)
      }
      return Response.json({ ok: true, test: true, role, sent: chatIds.length }, { headers: CORS_HEADERS })
    }

    const requestedTypes = Array.isArray(body.types) && body.types.length > 0
      ? body.types.filter((t: string) => WORK_TYPES.includes(t as WorkType)) as WorkType[]
      : WORK_TYPES
    const dryRun = body.dry_run === true

    const result: Record<string, { found: number; sent: number; skipped: number; failed: number }> = {}

    for (const type of requestedTypes) {
      const role = TYPE_ROLE[type]
      const chatIds = chatIdsFor(role)
      const workItems = await fetchWorkItems(supabase, type)
      result[type] = { found: workItems.length, sent: 0, skipped: 0, failed: 0 }

      if (chatIds.length === 0) {
        result[type].skipped = workItems.length
        continue
      }

      for (const { item, refTable, refId, occurrenceKey } of workItems) {
        const dedupeKey = `${type}:${refId}:${occurrenceKey}`
        const claimed = dryRun ? true : await claimDedupe(supabase, dedupeKey, type, refTable, refId)
        if (!claimed) {
          result[type].skipped++
          continue
        }

        if (dryRun) {
          result[type].sent++
          continue
        }

        try {
          const text = buildMessage(type, item)
          for (const chatId of chatIds) {
            await sendTelegram(chatId, text, token)
          }
          await markLog(supabase, dedupeKey, 'sent')
          result[type].sent++
        } catch (err) {
          await markLog(supabase, dedupeKey, 'failed', err instanceof Error ? err.message : String(err))
          result[type].failed++
        }
      }
    }

    return Response.json({ ok: true, result }, { headers: CORS_HEADERS })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS_HEADERS },
    )
  }
})
