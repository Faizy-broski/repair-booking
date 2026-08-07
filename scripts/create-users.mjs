/**
 * Seed script: creates two new business owner accounts directly via the
 * Supabase admin API, mirroring AuthService.register exactly.
 *
 * Run from the project root:
 *   node --env-file=.env.local scripts/create-users.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const USERS = [
  {
    fullName: 'Muneeb',
    businessName: 'Phones & Gadgets',
    subdomain: 'phones-and-gadgets',
    email: 'Mubeen912009@hotmail.com',
    phone: '+447459768734',
    mainBranchName: 'Phones & Gadgets - Main',
    password: '1234abcd',
  },
  {
    fullName: 'Raman',
    businessName: 'Mega Fone',
    subdomain: 'mega-fone',
    email: 'megafone@gmail.com',
    phone: '+447977227766',
    mainBranchName: 'Mega Fone - Main',
    password: '1234abcd',
  },
  {
    fullName: 'Manjot',
    businessName: 'PC Xpress',
    subdomain: 'pc-xpress',
    email: 'pcxpress@gmail.com',
    phone: '+447723010031',
    mainBranchName: 'PC Xpress - Main',
    password: '1234abcd',
  },
  {
    fullName: 'Abid',
    businessName: 'Matlock Phones & Vapes',
    subdomain: 'matlock-phones-vapes',
    email: 'matlock@gmail.com',
    phone: '+447490137787',
    mainBranchName: 'Matlock Phones & Vapes - Main',
    password: '1234abcd',
  },
  {
    fullName: 'Karan',
    businessName: 'Infinity Phones & Vapes',
    subdomain: 'infinity-phones-vapes',
    email: 'infinity@gmail.com',
    phone: '+447597854142',
    mainBranchName: 'Infinity Phones & Vapes - Main',
    password: '1234abcd',
  },
  {
    fullName: 'Khawaja Muhammad Uns',
    businessName: 'Kokab Shoes',
    subdomain: 'kokab-shoes',
    email: 'khawajamuns@gmail.com',
    phone: '+923214422476',
    mainBranchName: 'Kokab Shoes - Main',
    password: '1234abcd',
  },
  {
    fullName: 'Sami',
    businessName: 'RAS Mobile Tyres UK',
    subdomain: 'ras-mobile-tyres',
    email: 'sami@rasmobiletyres.com',
    phone: '+447554452474',
    mainBranchName: 'RAS Mobile Tyres UK - Main',
    password: '1234abcd',
    planName: 'Starter',
    verticalSlug: 'mobile-tyre-fitting',
  },
]

const TYRE_FAULTS = [
  { name: 'Tyre Burst',                sort_order: 1 },
  { name: 'Puncture / Flat Tyre',      sort_order: 2 },
  { name: 'Slow Puncture',             sort_order: 3 },
  { name: 'Worn Tread / Bald Tyre',    sort_order: 4 },
  { name: 'Sidewall Damage',           sort_order: 5 },
  { name: 'Wheel Alignment Issue',     sort_order: 6 },
  { name: 'Wheel Balancing Required',  sort_order: 7 },
]

const DEFAULT_STATUSES = [
  { name: 'Received',              color: '#64748b', sort_order: 1 },
  { name: 'In Progress',           color: '#0ea5e9', sort_order: 2 },
  { name: 'Waiting for Parts',     color: '#f59e0b', sort_order: 3 },
  { name: 'Ready for Collection',  color: '#10b981', sort_order: 4 },
  { name: 'Collected',             color: '#6366f1', sort_order: 5 },
  { name: 'Unrepairable',          color: '#ef4444', sort_order: 6 },
]

const DEFAULT_FAULTS = [
  { name: 'No Power',       sort_order: 1 },
  { name: 'Broken Screen',  sort_order: 2 },
  { name: 'Liquid Damage',  sort_order: 3 },
  { name: 'Software Issue', sort_order: 4 },
  { name: 'Battery Issue',  sort_order: 5 },
  { name: 'Charging Port',  sort_order: 6 },
]

async function createUser(payload) {
  payload = { ...payload, email: payload.email.toLowerCase() }
  console.log(`\n--- Creating: ${payload.fullName} / ${payload.businessName} ---`)

  // 1. Check subdomain availability
  const { data: existing } = await supabase
    .from('businesses')
    .select('id')
    .eq('subdomain', payload.subdomain)
    .maybeSingle()

  if (existing) {
    console.warn(`  [SKIP] Subdomain "${payload.subdomain}" already taken`)
    return
  }

  // 2. Create Supabase auth user (email pre-confirmed, no verification email)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: { full_name: payload.fullName, role: 'business_owner' },
  })

  if (authError || !authData?.user) {
    console.error('  [ERROR] Auth user creation failed:', authError?.message)
    return
  }

  const userId = authData.user.id
  console.log(`  Auth user created: ${userId}`)

  // 3. Look up the requested plan (defaults to Growth, matching existing entries)
  const planName = payload.planName ?? 'growth'
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id')
    .ilike('name', planName)
    .eq('is_active', true)
    .maybeSingle()

  if (planError || !plan) {
    console.error(`  [ERROR] "${planName}" plan not found:`, planError?.message ?? 'no row returned')
    await supabase.auth.admin.deleteUser(userId)
    return
  }
  console.log(`  ${planName} plan found: ${plan.id}`)

  // 4. Create business (immediately active)
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .insert({
      name: payload.businessName,
      subdomain: payload.subdomain,
      email: payload.email,
      phone: payload.phone,
      is_active: true,
      trial_ends_at: trialEndsAt,
    })
    .select()
    .single()

  if (bizError || !business) {
    console.error('  [ERROR] Business creation failed:', bizError?.message)
    await supabase.auth.admin.deleteUser(userId)
    console.log('  Auth user rolled back')
    return
  }
  console.log(`  Business created: ${business.id}`)

  // 5. Create active plan subscription
  const periodStart = new Date().toISOString()
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { error: subError } = await supabase
    .from('subscriptions')
    .insert({
      business_id: business.id,
      plan_id: plan.id,
      status: 'active',
      billing_cycle: 'monthly',
      current_period_start: periodStart,
      current_period_end: periodEnd,
    })

  if (subError) {
    console.warn('  [WARN] Subscription creation failed (non-fatal):', subError.message)
  } else {
    console.log(`  ${planName} plan subscription activated`)
  }

  // 6. Create main branch
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .insert({
      business_id: business.id,
      name: payload.mainBranchName,
      is_main: true,
    })
    .select()
    .single()

  if (branchError || !branch) {
    console.error('  [ERROR] Branch creation failed:', branchError?.message)
    await supabase.auth.admin.deleteUser(userId)
    return
  }
  console.log(`  Branch created: ${branch.id}`)

  // 7. Upsert profile (handles trigger-created rows safely)
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      business_id: business.id,
      branch_id: null,
      role: 'business_owner',
      full_name: payload.fullName,
      email: payload.email,
      is_active: true,
    })

  if (profileError) {
    console.warn('  [WARN] Profile upsert issue (non-fatal):', profileError.message)
  } else {
    console.log('  Profile upserted')
  }

  // 8. Seed default repair statuses
  const { error: statusError } = await supabase
    .from('repair_custom_statuses')
    .insert(DEFAULT_STATUSES.map(s => ({ ...s, business_id: business.id })))

  if (statusError) {
    console.warn('  [WARN] Statuses seed failed (non-fatal):', statusError.message)
  } else {
    console.log('  Repair statuses seeded')
  }

  // 9. Seed common faults (tyre-relevant set for the tyre-fitting vertical,
  // generic device-repair set otherwise)
  const faultSet = payload.verticalSlug === 'mobile-tyre-fitting' ? TYRE_FAULTS : DEFAULT_FAULTS
  const { error: faultError } = await supabase
    .from('repair_faults')
    .insert(faultSet.map(f => ({ ...f, business_id: business.id })))

  if (faultError) {
    console.warn('  [WARN] Faults seed failed (non-fatal):', faultError.message)
  } else {
    console.log('  Repair faults seeded')
  }

  // 10. Apply vertical template, if requested (module access + faults/categories
  // already vertical-appropriate above)
  if (payload.verticalSlug) {
    const { data: template } = await supabase
      .from('business_vertical_templates')
      .select('*')
      .eq('slug', payload.verticalSlug)
      .single()

    if (!template) {
      console.warn(`  [WARN] Vertical template "${payload.verticalSlug}" not found`)
    } else {
      const modules = template.modules_enabled || []
      const rows = modules.map(mod => ({
        business_id: business.id,
        module: mod,
        is_enabled: true,
        settings_override: (template.module_settings || {})[mod] || {},
        updated_at: new Date().toISOString(),
      }))
      if (rows.length > 0) {
        await supabase.from('business_module_access').upsert(rows, { onConflict: 'business_id,module' })
      }
      await supabase.from('businesses').update({
        vertical_template_id: template.id,
        vertical_template_version: template.version ?? 1,
        updated_at: new Date().toISOString(),
      }).eq('id', business.id)
      await supabase.from('vertical_template_apply_log').insert({
        template_id: template.id,
        business_id: business.id,
        applied_by: null,
        apply_mode: 'initial',
        modules_applied: modules,
        diff_snapshot: { modules_count: modules.length, mode: 'initial' },
      })
      console.log(`  Applied vertical template: ${template.name} (${modules.join(', ')})`)
    }
  }

  console.log(`  Done. Login: ${payload.email} / ${payload.password}`)
  console.log(`  Subdomain: ${payload.subdomain}.repairbooking.co.uk`)
}

for (const user of USERS) {
  await createUser(user)
}

console.log('\nAll done.')
