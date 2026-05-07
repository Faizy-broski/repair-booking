import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'

const BUCKET = 'avatars'
const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPG, PNG, WebP.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2 MB.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Delete old avatar if one exists
    const { data: profile } = await (admin as any)
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single()

    if (profile?.avatar_url) {
      const oldPath = extractStoragePath(profile.avatar_url, BUCKET)
      if (oldPath) {
        await admin.storage.from(BUCKET).remove([oldPath])
      }
    }

    // Upload new avatar — scoped per user
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
    const path = `${user.id}/avatar.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, new Uint8Array(bytes), {
        contentType: file.type,
        upsert: true,
      })

    if (uploadErr) {
      console.error('[account/avatar] Storage error:', uploadErr.message)
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)

    // Add cache-busting to force browsers to reload the new image
    const avatarUrl = `${publicUrl}?t=${Date.now()}`

    // Update profile
    const { error: updateErr } = await (admin as any)
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id)

    if (updateErr) {
      console.error('[account/avatar] Profile update error:', updateErr.message)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ url: avatarUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: profile } = await (admin as any)
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single()

    if (profile?.avatar_url) {
      const oldPath = extractStoragePath(profile.avatar_url, BUCKET)
      if (oldPath) {
        await admin.storage.from(BUCKET).remove([oldPath])
      }
    }

    const { error: updateErr } = await (admin as any)
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id)

    if (updateErr) {
      console.error('[account/avatar] Profile update error:', updateErr.message)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Remove failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Extract the storage path (after /public/{bucket}/) from a full public URL */
function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  // Strip any query string (cache-busting param)
  return url.slice(idx + marker.length).split('?')[0]
}
