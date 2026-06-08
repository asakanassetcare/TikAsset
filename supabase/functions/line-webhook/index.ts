import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LINE_CONTENT_API = 'https://api-data.line.me/v2/bot/message'
const LINE_REPLY_API   = 'https://api.line.me/v2/bot/message/reply'

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const enc  = new TextEncoder()
  const key  = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac  = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  const b64  = btoa(String.fromCharCode(...new Uint8Array(mac)))
  return b64 === signature
}

async function replyLine(replyToken: string, text: string, token: string) {
  await fetch(LINE_REPLY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-line-signature' },
    })
  }

  const token     = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!
  const secret    = Deno.env.get('LINE_CHANNEL_SECRET')!
  const supabase  = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const rawBody  = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  // verify LINE signature
  if (!(await verifySignature(rawBody, signature, secret))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { events } = JSON.parse(rawBody)

  for (const event of events ?? []) {
    if (event.type !== 'message') continue
    const userId     = event.source?.userId
    const replyToken = event.replyToken
    if (!userId) continue

    // ดึง tenant จาก line_user_id
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, full_name')
      .eq('line_user_id', userId)
      .maybeSingle()

    if (!tenant) {
      await replyLine(replyToken, 'ไม่พบข้อมูลผู้เช่าในระบบ กรุณาลงทะเบียน LINE ก่อนที่ลิงก์ที่แจ้งไว้', token)
      continue
    }

    // รับเฉพาะ message ประเภทรูปภาพ
    if (event.message.type !== 'image') {
      await replyLine(replyToken,
        `สวัสดีครับคุณ ${tenant.full_name} 😊\nกรุณาส่งรูปสลิปโอนเงินมาได้เลยครับ\n(ส่งเป็นรูปภาพเท่านั้น)`,
        token
      )
      continue
    }

    // ดาวน์โหลดรูปจาก LINE
    const imageRes = await fetch(`${LINE_CONTENT_API}/${event.message.id}/content`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!imageRes.ok) {
      await replyLine(replyToken, 'เกิดข้อผิดพลาดในการรับรูป กรุณาลองใหม่', token)
      continue
    }

    const imageBlob  = await imageRes.blob()
    const storagePath = `line-slips/${userId}/${event.message.id}.jpg`

    const { error: uploadErr } = await supabase.storage
      .from('payment-slips')
      .upload(storagePath, imageBlob, { contentType: 'image/jpeg', upsert: false })

    if (uploadErr) {
      await replyLine(replyToken, 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่', token)
      continue
    }

    // บันทึก submission
    await supabase.from('line_payment_submissions').insert({
      tenant_id:    tenant.id,
      line_user_id: userId,
      slip_url:     storagePath,
      status:       'pending',
    })

    // แจ้ง staff ผ่าน notifications
    await supabase.from('notifications').insert({
      type:       'line_slip_received',
      title:      `ได้รับสลิปจาก ${tenant.full_name}`,
      body:       'กรุณาตรวจสอบและเชื่อมโยงกับใบแจ้งหนี้',
      target_role: 'staff',
      link:       '/payments?tab=line_slips',
    })

    await replyLine(replyToken,
      `ได้รับสลิปการโอนเงินของคุณ ${tenant.full_name} แล้วครับ\nเจ้าหน้าที่จะตรวจสอบและยืนยันภายในไม่เกิน 1 ชั่วโมง`,
      token
    )
  }

  return Response.json({ ok: true })
})
