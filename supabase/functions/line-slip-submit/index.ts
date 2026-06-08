import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const body = await req.json()
  const { userId, action } = body

  if (!userId) {
    return Response.json({ error: 'missing userId' }, { status: 400 })
  }

  // ตรวจสอบ tenant — อาจมีหลาย tenant ต่อ LINE account
  const { data: tenantRows } = await supabase
    .from('tenants')
    .select('id, full_name')
    .eq('line_user_id', userId)

  if (!tenantRows?.length) {
    return Response.json({ error: 'tenant not found' }, { status: 404 })
  }

  // action=init → คืนข้อมูล tenant + invoices สำหรับ LIFF หน้าโหลด
  if (action === 'init') {
    const tenantIds = tenantRows.map(r => r.id)
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, billing_period, invoice_type, tenant_id, rooms(room_number)')
      .in('tenant_id', tenantIds)
      .not('status', 'eq', 'paid')
      .order('created_at', { ascending: false })
      .limit(20)
    return Response.json({ tenants: tenantRows, invoices: invoices ?? [], _debug_tenantIds: tenantIds })
  }

  const { invoiceId, note, imageBase64, imageType } = body

  if (!imageBase64) {
    return Response.json({ error: 'missing imageBase64' }, { status: 400 })
  }

  // ถ้าเลือก invoice มา ใช้ tenant_id จาก invoice นั้น
  let tenant = tenantRows[0]
  if (invoiceId) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('tenant_id, tenants(id, full_name)')
      .eq('id', invoiceId)
      .maybeSingle()
    if (inv?.tenants) tenant = inv.tenants as { id: string; full_name: string }
  }

  // Decode base64 → Uint8Array
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  const binary = atob(base64Data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  const ext = (imageType ?? '').includes('png') ? 'png' : 'jpg'
  const storagePath = `line-slips/${userId}/${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('payment-slips')
    .upload(storagePath, bytes, { contentType: imageType || 'image/jpeg', upsert: false })

  if (uploadErr) {
    return Response.json({ error: uploadErr.message }, { status: 500 })
  }

  // บันทึก submission (ถ้าเลือก invoice มาแล้ว ใส่ invoice_id ไว้เลย)
  await supabase.from('line_payment_submissions').insert({
    tenant_id:   tenant.id,
    line_user_id: userId,
    slip_url:    storagePath,
    invoice_id:  invoiceId ?? null,
    note:        note ?? null,
    status:      'pending',
  })

  // แจ้ง staff
  await supabase.from('notifications').insert({
    type:        'line_slip_received',
    title:       `ได้รับสลิปจาก ${tenant.full_name}`,
    body:        'กรุณาตรวจสอบและยืนยันการชำระเงิน',
    target_role: 'staff',
    link:        '/payments',
  })

  return Response.json({ ok: true })
})
