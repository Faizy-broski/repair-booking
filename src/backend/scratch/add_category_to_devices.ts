import { adminSupabase } from './src/backend/config/supabase.js'

async function run() {
  console.log('Adding category_id to service_devices...')
  const { error } = await adminSupabase.rpc('exec_sql', { 
    sql: 'ALTER TABLE service_devices ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL;' 
  })
  if (error) {
    console.error('Error adding column:', error)
    // Fallback: maybe exec_sql doesn't exist. Try direct query if possible?
    // Supabase JS doesn't support direct SQL easily.
  } else {
    console.log('Success!')
  }
}

run()
