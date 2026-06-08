import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Admin client (service_role) for creating auth users
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Caller client (JWT) — for RLS-aware operations like calling create_profile_for_user
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify caller can manage users. Super admin can create any non-super-admin
    // role; head staff can manage operational users only.
    const { data: roleData, error: roleError } = await callerClient.rpc('current_user_role')
    if (roleError || !['super_admin', 'head_staff'].includes(roleData)) {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders })
    }

    const { email, full_name, role, phone } = await req.json()
    if (!email || !full_name || !role) {
      return Response.json({ error: 'email, full_name, role are required' }, { status: 400, headers: corsHeaders })
    }
    if (role === 'super_admin') {
      return Response.json({ error: 'Cannot invite super_admin from this form' }, { status: 403, headers: corsHeaders })
    }
    if (roleData === 'head_staff' && !['head_staff', 'staff', 'service'].includes(role)) {
      return Response.json({ error: 'Forbidden role for head_staff' }, { status: 403, headers: corsHeaders })
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase() + '@1'

    // Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })
    if (authError) {
      return Response.json({ error: authError.message }, { status: 400, headers: corsHeaders })
    }

    const userId = authData.user.id

    // Create profile (RLS check via caller JWT)
    const { error: profileError } = await callerClient.rpc('create_profile_for_user', {
      p_user_id: userId,
      p_email: email,
      p_full_name: full_name,
      p_role: role,
      p_phone: phone ?? null,
    })

    if (profileError) {
      // Rollback: delete auth user
      await adminClient.auth.admin.deleteUser(userId)
      return Response.json({ error: profileError.message }, { status: 500, headers: corsHeaders })
    }

    return Response.json({ user_id: userId, temporary_password: tempPassword }, { headers: corsHeaders })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: corsHeaders })
  }
})
