import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/backend/config/supabase'
import { getEffectiveUserId } from '@/lib/auth/get-effective-user'

const BUCKET = 'product-images'
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

export async function POST(request: NextRequest) {
  try {
    const userId = await getEffectiveUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Get business_id
    const admin = createAdminClient()
    const { data: profile } = await (admin as any)
      .from('profiles')
      .select('business_id')
      .eq('id', userId)
      .single()

    if (!profile?.business_id) {
      return NextResponse.json({ error: 'No business found' }, { status: 400 })
    }

    // Parse multipart body
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPG, PNG, WebP, GIF.' },
        { status: 400 }
      )
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10 MB.' },
        { status: 400 }
      )
    }

    // Build unique path: {businessId}/{uuid}.{ext}
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
    const uniqueId = crypto.randomUUID()
    const path = `${profile.business_id}/${uniqueId}.${ext}`

    // Upload to Supabase storage
    const bytes = await file.arrayBuffer()
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, new Uint8Array(bytes), {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      console.error('[upload/image] Storage error:', uploadErr.message)
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    // Return public URL
    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
