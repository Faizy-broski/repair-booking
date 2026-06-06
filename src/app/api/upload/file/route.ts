import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/backend/config/supabase'
import { getEffectiveUserId } from '@/lib/auth/get-effective-user'

const BUCKET = 'message-attachments'
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg':                                  'jpg',
  'image/jpg':                                   'jpg',
  'image/png':                                   'png',
  'image/webp':                                  'webp',
  'image/gif':                                   'gif',
  'application/pdf':                             'pdf',
  'application/msword':                          'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel':                    'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain':                                  'txt',
  'text/csv':                                    'csv',
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getEffectiveUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile } = await (admin as any)
      .from('profiles')
      .select('business_id')
      .eq('id', userId)
      .single()

    if (!profile?.business_id) {
      return NextResponse.json({ error: 'No business found' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES[file.type]) {
      return NextResponse.json(
        { error: 'File type not allowed. Supported: images, PDF, Word, Excel, CSV, TXT.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10 MB.' },
        { status: 400 }
      )
    }

    const ext = ALLOWED_TYPES[file.type]
    const uniqueId = crypto.randomUUID()
    const path = `${profile.business_id}/${uniqueId}.${ext}`

    const bytes = await file.arrayBuffer()

    // Ensure bucket exists (migration may not have run yet on this environment)
    const { data: bucketData } = await admin.storage.getBucket(BUCKET)
    if (!bucketData) {
      await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_SIZE_BYTES,
      })
    }

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, new Uint8Array(bytes), {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      console.error('[upload/file] Storage error:', uploadErr.message)
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)

    return NextResponse.json({
      url:  publicUrl,
      name: file.name,
      type: file.type,
      size: file.size,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
