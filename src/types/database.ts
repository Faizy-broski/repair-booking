/**
 * Database types — generated from Supabase schema.
 * Run: npx supabase gen types typescript --project-id <id> > types/database.ts
 * This file is a manual approximation until Supabase CLI is configured.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      plans: {
        Row: {
          id: string
          name: string
          price_monthly: number
          price_yearly: number | null
          max_branches: number
          max_users: number
          features: Json
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['plans']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['plans']['Insert']>
      }
      businesses: {
        Row: {
          id: string
          name: string
          subdomain: string
          email: string
          phone: string | null
          address: string | null
          logo_url: string | null
          country: string
          currency: string
          timezone: string
          is_active: boolean
          is_suspended: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['businesses']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['businesses']['Insert']>
      }
      subscriptions: {
        Row: {
          id: string
          business_id: string
          plan_id: string
          stripe_sub_id: string | null
          stripe_customer_id: string | null
          status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'suspended'
          billing_cycle: 'monthly' | 'yearly'
          current_period_start: string | null
          current_period_end: string | null
          trial_ends_at: string | null
          canceled_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['subscriptions']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
      }
      branches: {
        Row: {
          id: string
          business_id: string
          name: string
          address: string | null
          phone: string | null
          email: string | null
          is_main: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['branches']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['branches']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          business_id: string | null
          branch_id: string | null
          role: 'super_admin' | 'business_owner' | 'branch_manager' | 'staff' | 'cashier'
          full_name: string | null
          email: string | null
          phone: string | null
          avatar_url: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      brands: {
        Row: { id: string; business_id: string; name: string; created_at: string }
        Insert: Omit<Database['public']['Tables']['brands']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['brands']['Insert']>
      }
      categories: {
        Row: { id: string; business_id: string; name: string; parent_id: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['categories']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['categories']['Insert']>
      }
      products: {
        Row: {
          id: string; business_id: string; category_id: string | null; brand_id: string | null
          name: string; description: string | null; sku: string | null; barcode: string | null
          cost_price: number; selling_price: number; image_url: string | null
          has_variants: boolean; is_service: boolean; is_active: boolean
          custom_fields: Json; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      product_variants: {
        Row: { id: string; product_id: string; name: string; sku: string | null; barcode: string | null; cost_price: number | null; selling_price: number | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['product_variants']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['product_variants']['Insert']>
      }
      inventory: {
        Row: { id: string; branch_id: string; product_id: string | null; variant_id: string | null; quantity: number; low_stock_alert: number; updated_at: string }
        Insert: Omit<Database['public']['Tables']['inventory']['Row'], 'id' | 'updated_at'> & { id?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>
      }
      customers: {
        Row: { id: string; business_id: string; branch_id: string | null; first_name: string; last_name: string | null; email: string | null; phone: string | null; address: string | null; notes: string | null; custom_fields: Json; created_at: string; updated_at: string }
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      sales: {
        Row: { id: string; branch_id: string; customer_id: string | null; cashier_id: string | null; subtotal: number; discount: number; tax: number; total: number; payment_method: string; payment_status: string; gift_card_id: string | null; notes: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['sales']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['sales']['Insert']>
      }
      sale_items: {
        Row: { id: string; sale_id: string; product_id: string | null; variant_id: string | null; name: string; quantity: number; unit_price: number; discount: number; total: number }
        Insert: Omit<Database['public']['Tables']['sale_items']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['sale_items']['Insert']>
      }
      repairs: {
        Row: { id: string; branch_id: string; customer_id: string | null; assigned_to: string | null; job_number: string; device_type: string | null; device_brand: string | null; device_model: string | null; serial_number: string | null; issue: string; diagnosis: string | null; status: string; estimated_cost: number | null; actual_cost: number | null; deposit_paid: number; notify_customer: boolean; custom_fields: Json; created_at: string; updated_at: string }
        Insert: Omit<Database['public']['Tables']['repairs']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['repairs']['Insert']>
      }
      repair_status_history: {
        Row: { id: string; repair_id: string; old_status: string | null; new_status: string; note: string | null; changed_by: string | null; email_sent: boolean; created_at: string }
        Insert: Omit<Database['public']['Tables']['repair_status_history']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['repair_status_history']['Insert']>
      }
      expenses: {
        Row: { id: string; branch_id: string; category_id: string | null; title: string; amount: number; expense_date: string; receipt_url: string | null; notes: string | null; created_by: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['expenses']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>
      }
      employees: {
        Row: { id: string; branch_id: string; profile_id: string | null; first_name: string; last_name: string | null; email: string | null; phone: string | null; role: string | null; hourly_rate: number | null; hire_date: string | null; is_active: boolean; created_at: string }
        Insert: Omit<Database['public']['Tables']['employees']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['employees']['Insert']>
      }
      time_clocks: {
        Row: { id: string; branch_id: string; employee_id: string; clock_in: string; clock_out: string | null; break_minutes: number; notes: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['time_clocks']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['time_clocks']['Insert']>
      }
      appointments: {
        Row: { id: string; branch_id: string; customer_id: string | null; employee_id: string | null; title: string; description: string | null; start_time: string; end_time: string; status: string; created_at: string }
        Insert: Omit<Database['public']['Tables']['appointments']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['appointments']['Insert']>
      }
      messages: {
        Row: { id: string; business_id: string; from_branch_id: string | null; to_branch_id: string | null; sender_id: string; subject: string | null; body: string; parent_id: string | null; is_read: boolean; created_at: string }
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
      invoices: {
        Row: { id: string; branch_id: string; customer_id: string | null; reference_type: string | null; reference_id: string | null; invoice_number: string; items: Json; subtotal: number; discount: number; tax: number; total: number; status: string; issued_at: string; due_at: string | null; pdf_url: string | null; notes: string | null; created_by: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
      }
      gift_cards: {
        Row: { id: string; branch_id: string; code: string; initial_value: number; balance: number; customer_id: string | null; is_active: boolean; expires_at: string | null; created_by: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['gift_cards']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['gift_cards']['Insert']>
      }
      custom_field_definitions: {
        Row: { id: string; business_id: string; module: string; field_key: string; label: string; field_type: string; options: Json | null; is_required: boolean; sort_order: number; created_at: string }
        Insert: Omit<Database['public']['Tables']['custom_field_definitions']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['custom_field_definitions']['Insert']>
      }
      module_settings: {
        Row: { id: string; branch_id: string; module: string; settings: Json; updated_at: string }
        Insert: Omit<Database['public']['Tables']['module_settings']['Row'], 'id' | 'updated_at'> & { id?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['module_settings']['Insert']>
      }
      salaries: {
        Row: { id: string; branch_id: string; employee_id: string; amount: number; pay_date: string; pay_period: string | null; notes: string | null; created_by: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['salaries']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['salaries']['Insert']>
      }
      google_reviews: {
        Row: { id: string; branch_id: string; review_id: string | null; author_name: string | null; rating: number | null; text: string | null; published_at: string | null; fetched_at: string }
        Insert: Omit<Database['public']['Tables']['google_reviews']['Row'], 'id' | 'fetched_at'> & { id?: string; fetched_at?: string }
        Update: Partial<Database['public']['Tables']['google_reviews']['Insert']>
      }
      stock_movements: {
        Row: { id: string; branch_id: string; product_id: string | null; variant_id: string | null; type: string; quantity: number; reference_id: string | null; note: string | null; created_by: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['stock_movements']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['stock_movements']['Insert']>
      }
      repair_items: {
        Row: { id: string; repair_id: string; product_id: string | null; variant_id: string | null; name: string; quantity: number; unit_cost: number | null; unit_price: number | null }
        Insert: Omit<Database['public']['Tables']['repair_items']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['repair_items']['Insert']>
      }
      expense_categories: {
        Row: { id: string; business_id: string; name: string; created_at: string }
        Insert: Omit<Database['public']['Tables']['expense_categories']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['expense_categories']['Insert']>
      }
      google_review_settings: {
        Row: { id: string; branch_id: string; place_id: string | null; api_key: string | null; last_synced: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['google_review_settings']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['google_review_settings']['Insert']>
      }
      service_categories: {
        Row: { id: string; business_id: string; name: string; slug: string; parent_id: string | null; image_url: string | null; retail_margin: number; show_on_pos: boolean; display_order: number; created_at: string }
        Insert: Omit<Database['public']['Tables']['service_categories']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['service_categories']['Insert']>
      }
      service_manufacturers: {
        Row: { id: string; business_id: string; name: string; logo_url: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['service_manufacturers']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['service_manufacturers']['Insert']>
      }
      service_devices: {
        Row: { id: string; business_id: string; manufacturer_id: string; name: string; image_url: string | null; colors: Json; created_at: string }
        Insert: Omit<Database['public']['Tables']['service_devices']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['service_devices']['Insert']>
      }
      service_problems: {
        Row: { id: string; business_id: string; category_id: string | null; device_id: string | null; name: string; price: number; cost: number; warranty_days: number; tax_class: string | null; show_on_pos: boolean; show_on_portal: boolean; use_for_all_models: boolean; notes: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['service_problems']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['service_problems']['Insert']>
      }
      service_problem_parts: {
        Row: { id: string; problem_id: string; product_id: string; default_qty: number; default_warranty_days: number; part_status: 'used' | 'faulty' | 'broken'; tax_class: string | null; supplier_id: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['service_problem_parts']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['service_problem_parts']['Insert']>
      }
      ticket_workflows: {
        Row: { id: string; business_id: string; name: string; is_default: boolean; created_at: string }
        Insert: Omit<Database['public']['Tables']['ticket_workflows']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['ticket_workflows']['Insert']>
      }
      ticket_workflow_steps: {
        Row: { id: string; workflow_id: string; name: string; description: string | null; required_role: string | null; step_order: number; created_at: string }
        Insert: Omit<Database['public']['Tables']['ticket_workflow_steps']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['ticket_workflow_steps']['Insert']>
      }
      repair_status_flags: {
        Row: { id: string; business_id: string; status: string; message: string; created_at: string }
        Insert: Omit<Database['public']['Tables']['repair_status_flags']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['repair_status_flags']['Insert']>
      }
      canned_responses: {
        Row: { id: string; business_id: string; title: string; body: string; type: 'note' | 'sms' | 'email'; created_at: string }
        Insert: Omit<Database['public']['Tables']['canned_responses']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['canned_responses']['Insert']>
      }
      store_credits: {
        Row: { id: string; business_id: string; customer_id: string; balance: number; updated_at: string }
        Insert: Omit<Database['public']['Tables']['store_credits']['Row'], 'id' | 'updated_at'> & { id?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['store_credits']['Insert']>
      }
      store_credit_transactions: {
        Row: { id: string; business_id: string; customer_id: string; amount: number; type: 'credit' | 'debit' | 'refund' | 'adjustment'; reference_id: string | null; reference_type: string | null; note: string | null; created_by: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['store_credit_transactions']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['store_credit_transactions']['Insert']>
      }
      loyalty_settings: {
        Row: { id: string; business_id: string; earn_rate: number; redeem_rate: number; min_redeem_points: number; is_enabled: boolean; updated_at: string }
        Insert: Omit<Database['public']['Tables']['loyalty_settings']['Row'], 'id' | 'updated_at'> & { id?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['loyalty_settings']['Insert']>
      }
      loyalty_points: {
        Row: { id: string; business_id: string; customer_id: string; balance: number; updated_at: string }
        Insert: Omit<Database['public']['Tables']['loyalty_points']['Row'], 'id' | 'updated_at'> & { id?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['loyalty_points']['Insert']>
      }
      loyalty_transactions: {
        Row: { id: string; business_id: string; customer_id: string; points: number; type: 'earned' | 'redeemed' | 'adjusted' | 'expired'; reference_id: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['loyalty_transactions']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['loyalty_transactions']['Insert']>
      }
      customer_groups: {
        Row: { id: string; business_id: string; name: string; tax_class: string | null; discount_percent: number; third_party_billing_enabled: boolean; billing_contact_name: string | null; billing_email: string | null; billing_phone: string | null; net_payment_days: number; created_at: string }
        Insert: Omit<Database['public']['Tables']['customer_groups']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['customer_groups']['Insert']>
      }
      customer_assets: {
        Row: { id: string; business_id: string; customer_id: string; name: string; serial_number: string | null; imei: string | null; model: string | null; brand: string | null; color: string | null; purchase_date: string | null; notes: string | null; is_active: boolean; created_at: string }
        Insert: Omit<Database['public']['Tables']['customer_assets']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['customer_assets']['Insert']>
      }
      suppliers: {
        Row: { id: string; business_id: string; name: string; contact_person: string | null; email: string | null; phone: string | null; mobile: string | null; address: string | null; city: string | null; country: string | null; tax_id: string | null; payment_terms_days: number; currency: string; notes: string | null; is_active: boolean; created_at: string }
        Insert: Omit<Database['public']['Tables']['suppliers']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['suppliers']['Insert']>
      }
      purchase_orders: {
        Row: { id: string; business_id: string; branch_id: string; supplier_id: string; po_number: string; status: string; expected_delivery_date: string | null; notes: string | null; subtotal: number; tax: number; total: number; created_by: string | null; created_at: string; updated_at: string }
        Insert: Omit<Database['public']['Tables']['purchase_orders']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['purchase_orders']['Insert']>
      }
      purchase_order_items: {
        Row: { id: string; po_id: string; product_id: string | null; name: string; sku: string | null; quantity_ordered: number; quantity_received: number; unit_cost: number; tax_class: string | null }
        Insert: Omit<Database['public']['Tables']['purchase_order_items']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['purchase_order_items']['Insert']>
      }
      goods_receiving_notes: {
        Row: { id: string; po_id: string; business_id: string; branch_id: string; received_by: string | null; notes: string | null; received_at: string; created_at: string }
        Insert: Omit<Database['public']['Tables']['goods_receiving_notes']['Row'], 'id' | 'created_at' | 'received_at'> & { id?: string; created_at?: string; received_at?: string }
        Update: Partial<Database['public']['Tables']['goods_receiving_notes']['Insert']>
      }
      grn_items: {
        Row: { id: string; grn_id: string; po_item_id: string; quantity_received: number; notes: string | null }
        Insert: Omit<Database['public']['Tables']['grn_items']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['grn_items']['Insert']>
      }
      special_orders: {
        Row: { id: string; business_id: string; branch_id: string; repair_id: string | null; customer_id: string | null; product_id: string | null; name: string; quantity: number; unit_cost: number; tracking_id: string | null; po_id: string | null; status: string; notes: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['special_orders']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['special_orders']['Insert']>
      }
      inventory_serials: {
        Row: { id: string; product_id: string; branch_id: string; serial_number: string; imei: string | null; status: string; purchase_order_id: string | null; sale_id: string | null; repair_id: string | null; notes: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['inventory_serials']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['inventory_serials']['Insert']>
      }
      inventory_cost_layers: {
        Row: { id: string; product_id: string; branch_id: string; quantity: number; unit_cost: number; received_at: string; source_id: string | null; source_type: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['inventory_cost_layers']['Row'], 'id' | 'created_at' | 'received_at'> & { id?: string; created_at?: string; received_at?: string }
        Update: Partial<Database['public']['Tables']['inventory_cost_layers']['Insert']>
      }
      inventory_counts: {
        Row: { id: string; business_id: string; branch_id: string; name: string; status: string; started_by: string | null; notes: string | null; completed_at: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['inventory_counts']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['inventory_counts']['Insert']>
      }
      inventory_count_items: {
        Row: { id: string; count_id: string; product_id: string; system_qty: number; counted_qty: number | null; notes: string | null }
        Insert: Omit<Database['public']['Tables']['inventory_count_items']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['inventory_count_items']['Insert']>
      }
      product_bundles: {
        Row: { id: string; business_id: string; name: string; description: string | null; bundle_price: number; sku: string | null; is_active: boolean; created_at: string }
        Insert: Omit<Database['public']['Tables']['product_bundles']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['product_bundles']['Insert']>
      }
      product_bundle_items: {
        Row: { id: string; bundle_id: string; product_id: string; quantity: number }
        Insert: Omit<Database['public']['Tables']['product_bundle_items']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['product_bundle_items']['Insert']>
      }
      trade_in_transactions: {
        Row: { id: string; business_id: string; branch_id: string; customer_id: string | null; product_id: string; variant_id: string | null; trade_in_value: number; condition_grade: string; serial_number: string | null; imei: string | null; sale_id: string | null; notes: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['trade_in_transactions']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['trade_in_transactions']['Insert']>
      }
      role_permissions: {
        Row: { id: string; business_id: string; role: string; module: string; action: string; allowed: boolean; requires_pin: boolean; created_at: string }
        Insert: { id?: string; business_id: string; role: string; module: string; action: string; allowed: boolean; requires_pin?: boolean; created_at?: string }
        Update: { role?: string; module?: string; action?: string; allowed?: boolean; requires_pin?: boolean }
      }
      shifts: {
        Row: { id: string; business_id: string; branch_id: string; name: string; start_time: string; end_time: string; days_of_week: number[]; created_at: string }
        Insert: { id?: string; business_id: string; branch_id: string; name: string; start_time: string; end_time: string; days_of_week: number[]; created_at?: string }
        Update: { name?: string; start_time?: string; end_time?: string; days_of_week?: number[] }
      }
      employee_shifts: {
        Row: { id: string; shift_id: string; employee_id: string; effective_from: string; created_at: string }
        Insert: { id?: string; shift_id: string; employee_id: string; effective_from: string; created_at?: string }
        Update: { effective_from?: string }
      }
      payroll_periods: {
        Row: { id: string; business_id: string; branch_id: string; employee_id: string; start_date: string; end_date: string; total_hours: number; hourly_rate: number; hourly_pay: number; commission_total: number; gross_pay: number; status: string; notes: string | null; approved_by: string | null; approved_at: string | null; created_at: string }
        Insert: { id?: string; business_id: string; branch_id: string; employee_id: string; start_date: string; end_date: string; total_hours: number; hourly_rate: number; commission_total?: number; status?: string; notes?: string | null; approved_by?: string | null; approved_at?: string | null; created_at?: string }
        Update: { total_hours?: number; hourly_rate?: number; commission_total?: number; status?: string; notes?: string | null; approved_by?: string | null; approved_at?: string | null }
      }
      commission_rules: {
        Row: { id: string; business_id: string; name: string; applies_to: string; rate_type: string; rate: number; min_amount: number | null; is_active: boolean; created_at: string }
        Insert: { id?: string; business_id: string; name: string; applies_to?: string; rate_type?: string; rate: number; min_amount?: number | null; is_active?: boolean; created_at?: string }
        Update: { name?: string; applies_to?: string; rate_type?: string; rate?: number; min_amount?: number | null; is_active?: boolean }
      }
      employee_commissions: {
        Row: { id: string; business_id: string; employee_id: string; source_type: string; source_id: string; rule_id: string | null; amount: number; status: string; created_at: string }
        Insert: { id?: string; business_id: string; employee_id: string; source_type: string; source_id: string; rule_id?: string | null; amount: number; status?: string; created_at?: string }
        Update: { status?: string; amount?: number }
      }
      employee_activity_log: {
        Row: { id: string; business_id: string; branch_id: string | null; user_id: string; module: string; action: string; record_id: string | null; table_name: string | null; ip_address: string | null; user_agent: string | null; metadata: Json | null; created_at: string }
        Insert: { id?: string; business_id: string; branch_id?: string | null; user_id: string; module: string; action: string; record_id?: string | null; table_name?: string | null; ip_address?: string | null; user_agent?: string | null; metadata?: Json | null; created_at?: string }
        Update: never
      }
      employee_ip_whitelist: {
        Row: { id: string; business_id: string; profile_id: string; ip_address: string; label: string | null; created_at: string }
        Insert: { id?: string; business_id: string; profile_id: string; ip_address: string; label?: string | null; created_at?: string }
        Update: { ip_address?: string; label?: string | null }
      }
      register_sessions: {
        Row: { id: string; business_id: string; branch_id: string; cashier_id: string; opening_float: number; closing_cash: number | null; expected_cash: number | null; variance: number | null; total_sales: number | null; total_refunds: number | null; cash_sales: number | null; card_sales: number | null; other_sales: number | null; transaction_count: number | null; opened_at: string; closed_at: string | null; status: string }
        Insert: { id?: string; business_id: string; branch_id: string; cashier_id: string; opening_float?: number; closing_cash?: number | null; expected_cash?: number | null; variance?: number | null; total_sales?: number | null; total_refunds?: number | null; cash_sales?: number | null; card_sales?: number | null; other_sales?: number | null; transaction_count?: number | null; opened_at?: string; closed_at?: string | null; status?: string }
        Update: { closing_cash?: number | null; expected_cash?: number | null; variance?: number | null; total_sales?: number | null; total_refunds?: number | null; cash_sales?: number | null; card_sales?: number | null; other_sales?: number | null; transaction_count?: number | null; closed_at?: string | null; status?: string }
      }
      saved_reports: {
        Row: { id: string; business_id: string; created_by: string | null; name: string; report_type: string; config: Json; is_favorite: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; business_id: string; created_by?: string | null; name: string; report_type?: string; config?: Json; is_favorite?: boolean; created_at?: string; updated_at?: string }
        Update: { name?: string; report_type?: string; config?: Json; is_favorite?: boolean; updated_at?: string }
      }
    }
    Functions: {
      process_sale: { Args: { p_sale_data: Json }; Returns: string }
      generate_job_number: { Args: { p_branch_id: string }; Returns: string }
      generate_invoice_number: { Args: { p_branch_id: string }; Returns: string }
      update_repair_status: { Args: { p_repair_id: string; p_new_status: string; p_note: string; p_changed_by: string }; Returns: void }
      get_dashboard_stats: { Args: { p_branch_id: string; p_start_date?: string; p_end_date?: string }; Returns: Json }
      complete_inventory_count: { Args: { p_count_id: string; p_adjusted_by: string }; Returns: void }
      update_average_cost: { Args: { p_product_id: string; p_new_qty: number; p_new_cost: number }; Returns: void }
      calculate_payroll: { Args: { p_employee_id: string; p_branch_id: string; p_start_date: string; p_end_date: string }; Returns: { total_hours: number; hourly_pay: number; commission_total: number; gross_pay: number }[] }
      close_register_session: { Args: { p_session_id: string; p_closing_cash: number }; Returns: Json }
      get_profit_loss: { Args: { p_branch_id: string; p_start_date: string; p_end_date: string }; Returns: Json }
    }
  }
}

// Convenient row type aliases
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

export type Plan = Tables<'plans'>
export type Business = Tables<'businesses'>
export type Subscription = Tables<'subscriptions'>
export type Branch = Tables<'branches'>
export type Profile = Tables<'profiles'>
export type Brand = Tables<'brands'>
export type Category = Tables<'categories'>
export type Product = Tables<'products'>
export type ProductVariant = Tables<'product_variants'>
export type Inventory = Tables<'inventory'>
export type Customer = Tables<'customers'>
export type Sale = Tables<'sales'>
export type SaleItem = Tables<'sale_items'>
export type Repair = Tables<'repairs'>
export type RepairItem = Tables<'repair_items'>
export type RepairStatusHistory = Tables<'repair_status_history'>
export type Expense = Tables<'expenses'>
export type ExpenseCategory = Tables<'expense_categories'>
export type Employee = Tables<'employees'>
export type Salary = Tables<'salaries'>
export type TimeClock = Tables<'time_clocks'>
export type Appointment = Tables<'appointments'>
export type Message = Tables<'messages'>
export type Invoice = Tables<'invoices'>
export type GiftCard = Tables<'gift_cards'>
export type GoogleReview = Tables<'google_reviews'>
export type CustomFieldDefinition = Tables<'custom_field_definitions'>
export type ModuleSetting = Tables<'module_settings'>
export type StockMovement = Tables<'stock_movements'>
export type InventorySerial = Tables<'inventory_serials'>
export type InventoryCount = Tables<'inventory_counts'>
export type InventoryCountItem = Tables<'inventory_count_items'>
export type ProductBundle = Tables<'product_bundles'>
export type ProductBundleItem = Tables<'product_bundle_items'>
export type TradeInTransaction = Tables<'trade_in_transactions'>
export type RolePermission = Tables<'role_permissions'>
export type Shift = Tables<'shifts'>
export type EmployeeShift = Tables<'employee_shifts'>
export type PayrollPeriod = Tables<'payroll_periods'>
export type CommissionRule = Tables<'commission_rules'>
export type EmployeeCommission = Tables<'employee_commissions'>
export type EmployeeActivityLog = Tables<'employee_activity_log'>
export type EmployeeIpWhitelist = Tables<'employee_ip_whitelist'>
export type RegisterSession = Tables<'register_sessions'>
export type SavedReport = Tables<'saved_reports'>
