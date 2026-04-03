export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          booking_source: string | null
          booking_token: string | null
          branch_id: string
          created_at: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_note: string | null
          customer_phone: string | null
          description: string | null
          employee_id: string | null
          end_time: string
          id: string
          no_show: boolean | null
          service_id: string | null
          start_time: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          booking_source?: string | null
          booking_token?: string | null
          branch_id: string
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          description?: string | null
          employee_id?: string | null
          end_time: string
          id?: string
          no_show?: boolean | null
          service_id?: string | null
          start_time: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          booking_source?: string | null
          booking_token?: string | null
          branch_id?: string
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          description?: string | null
          employee_id?: string | null
          end_time?: string
          id?: string
          no_show?: boolean | null
          service_id?: string | null
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_problems"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_dates: {
        Row: {
          blocked_date: string
          branch_id: string
          created_at: string | null
          id: string
          reason: string | null
        }
        Insert: {
          blocked_date: string
          branch_id: string
          created_at?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_date?: string
          branch_id?: string
          created_at?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_dates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_settings: {
        Row: {
          branch_id: string
          buffer_minutes: number | null
          cancellation_hours: number | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          max_advance_days: number | null
          max_per_slot: number | null
          min_advance_hours: number | null
          require_approval: boolean | null
          slot_duration_minutes: number | null
          updated_at: string | null
          widget_accent_color: string | null
          widget_welcome_text: string | null
        }
        Insert: {
          branch_id: string
          buffer_minutes?: number | null
          cancellation_hours?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_advance_days?: number | null
          max_per_slot?: number | null
          min_advance_hours?: number | null
          require_approval?: boolean | null
          slot_duration_minutes?: number | null
          updated_at?: string | null
          widget_accent_color?: string | null
          widget_welcome_text?: string | null
        }
        Update: {
          branch_id?: string
          buffer_minutes?: number | null
          cancellation_hours?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_advance_days?: number | null
          max_per_slot?: number | null
          min_advance_hours?: number | null
          require_approval?: boolean | null
          slot_duration_minutes?: number | null
          updated_at?: string | null
          widget_accent_color?: string | null
          widget_welcome_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_module_overrides: {
        Row: {
          branch_id: string
          id: string
          module: string
          settings_override: Json
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          id?: string
          module: string
          settings_override?: Json
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          id?: string
          module?: string
          settings_override?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_module_overrides_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          business_id: string
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_main: boolean | null
          name: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_main?: boolean | null
          name: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_main?: boolean | null
          name?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          branch_id: string
          close_time: string
          created_at: string | null
          day_of_week: number
          id: string
          is_closed: boolean | null
          open_time: string
        }
        Insert: {
          branch_id: string
          close_time?: string
          created_at?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean | null
          open_time?: string
        }
        Update: {
          branch_id?: string
          close_time?: string
          created_at?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean | null
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      business_module_access: {
        Row: {
          assigned_by: string | null
          business_id: string
          created_at: string | null
          id: string
          is_enabled: boolean
          module: string
          plan_override: boolean | null
          settings_override: Json
          template_id: string | null
          template_version: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          business_id: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean
          module: string
          plan_override?: boolean | null
          settings_override?: Json
          template_id?: string | null
          template_version?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          business_id?: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean
          module?: string
          plan_override?: boolean | null
          settings_override?: Json
          template_id?: string | null
          template_version?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_module_access_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_module_access_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_module_access_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "module_config_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      business_vertical_templates: {
        Row: {
          created_at: string
          default_plan_id: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          module_settings: Json
          modules_enabled: string[]
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_plan_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          module_settings?: Json
          modules_enabled?: string[]
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_plan_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          module_settings?: Json
          modules_enabled?: string[]
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_vertical_templates_default_plan_id_fkey"
            columns: ["default_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          email: string
          email_api_key: string | null
          email_provider: string | null
          id: string
          is_active: boolean | null
          is_suspended: boolean | null
          logo_url: string | null
          name: string
          phone: string | null
          sms_api_key: string | null
          sms_api_secret: string | null
          sms_gateway: string | null
          sms_sender_id: string | null
          subdomain: string
          timezone: string | null
          updated_at: string | null
          vertical_template_id: string | null
        }
        Insert: {
          address?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email: string
          email_api_key?: string | null
          email_provider?: string | null
          id?: string
          is_active?: boolean | null
          is_suspended?: boolean | null
          logo_url?: string | null
          name: string
          phone?: string | null
          sms_api_key?: string | null
          sms_api_secret?: string | null
          sms_gateway?: string | null
          sms_sender_id?: string | null
          subdomain: string
          timezone?: string | null
          updated_at?: string | null
          vertical_template_id?: string | null
        }
        Update: {
          address?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string
          email_api_key?: string | null
          email_provider?: string | null
          id?: string
          is_active?: boolean | null
          is_suspended?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          sms_api_key?: string | null
          sms_api_secret?: string | null
          sms_gateway?: string | null
          sms_sender_id?: string | null
          subdomain?: string
          timezone?: string | null
          updated_at?: string | null
          vertical_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_vertical_template_id_fkey"
            columns: ["vertical_template_id"]
            isOneToOne: false
            referencedRelation: "business_vertical_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      canned_responses: {
        Row: {
          body: string
          business_id: string
          created_at: string | null
          id: string
          title: string
          type: string | null
        }
        Insert: {
          body: string
          business_id: string
          created_at?: string | null
          id?: string
          title: string
          type?: string | null
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string | null
          id?: string
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canned_responses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          applies_to: string
          business_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          min_amount: number | null
          name: string
          rate: number
          rate_type: string
        }
        Insert: {
          applies_to?: string
          business_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          min_amount?: number | null
          name: string
          rate?: number
          rate_type?: string
        }
        Update: {
          applies_to?: string
          business_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          min_amount?: number | null
          name?: string
          rate?: number
          rate_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          business_id: string
          created_at: string | null
          field_key: string
          field_type: string
          id: string
          is_required: boolean | null
          label: string
          module: string
          options: Json | null
          sort_order: number | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          field_key: string
          field_type: string
          id?: string
          is_required?: boolean | null
          label: string
          module: string
          options?: Json | null
          sort_order?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          field_key?: string
          field_type?: string
          id?: string
          is_required?: boolean | null
          label?: string
          module?: string
          options?: Json | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_assets: {
        Row: {
          brand: string | null
          business_id: string
          color: string | null
          created_at: string | null
          customer_id: string
          id: string
          imei: string | null
          is_active: boolean | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          serial_number: string | null
        }
        Insert: {
          brand?: string | null
          business_id: string
          color?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          imei?: string | null
          is_active?: boolean | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
        }
        Update: {
          brand?: string | null
          business_id?: string
          color?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          imei?: string | null
          is_active?: boolean | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_assets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_groups: {
        Row: {
          billing_contact_name: string | null
          billing_email: string | null
          billing_phone: string | null
          business_id: string
          created_at: string | null
          discount_percent: number | null
          id: string
          name: string
          net_payment_days: number | null
          tax_class: string | null
          third_party_billing_enabled: boolean | null
        }
        Insert: {
          billing_contact_name?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          business_id: string
          created_at?: string | null
          discount_percent?: number | null
          id?: string
          name: string
          net_payment_days?: number | null
          tax_class?: string | null
          third_party_billing_enabled?: boolean | null
        }
        Update: {
          billing_contact_name?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          business_id?: string
          created_at?: string | null
          discount_percent?: number | null
          id?: string
          name?: string
          net_payment_days?: number | null
          tax_class?: string | null
          third_party_billing_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_sessions: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          otp: string | null
          otp_expires: string | null
          token: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id: string
          expires_at?: string
          id?: string
          otp?: string | null
          otp_expires?: string | null
          token: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          otp?: string | null
          otp_expires?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          branch_id: string | null
          business_id: string
          created_at: string | null
          custom_fields: Json | null
          email: string | null
          first_name: string
          group_id: string | null
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          business_id: string
          created_at?: string | null
          custom_fields?: Json | null
          email?: string | null
          first_name: string
          group_id?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          business_id?: string
          created_at?: string | null
          custom_fields?: Json | null
          email?: string | null
          first_name?: string
          group_id?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_activity_log: {
        Row: {
          action: string
          branch_id: string | null
          business_id: string
          created_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          module: string
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          branch_id?: string | null
          business_id: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module: string
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          branch_id?: string | null
          business_id?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module?: string
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_activity_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_activity_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_commissions: {
        Row: {
          amount: number
          business_id: string
          created_at: string | null
          employee_id: string
          id: string
          rule_id: string | null
          source_id: string
          source_type: string
          status: string
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string | null
          employee_id: string
          id?: string
          rule_id?: string | null
          source_id: string
          source_type: string
          status?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string | null
          employee_id?: string
          id?: string
          rule_id?: string | null
          source_id?: string
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_commissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_commissions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_ip_whitelist: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          ip_address: string
          label: string | null
          profile_id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          ip_address: string
          label?: string | null
          profile_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          ip_address?: string
          label?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_ip_whitelist_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ip_whitelist_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_shifts: {
        Row: {
          created_at: string | null
          effective_from: string
          employee_id: string
          id: string
          shift_id: string
        }
        Insert: {
          created_at?: string | null
          effective_from?: string
          employee_id: string
          id?: string
          shift_id: string
        }
        Update: {
          created_at?: string | null
          effective_from?: string
          employee_id?: string
          id?: string
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shifts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          access_pin: string | null
          branch_id: string
          commission_rate: number | null
          created_at: string | null
          email: string | null
          first_name: string
          hire_date: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          last_name: string | null
          phone: string | null
          profile_id: string | null
          role: string | null
        }
        Insert: {
          access_pin?: string | null
          branch_id: string
          commission_rate?: number | null
          created_at?: string | null
          email?: string | null
          first_name: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          phone?: string | null
          profile_id?: string | null
          role?: string | null
        }
        Update: {
          access_pin?: string | null
          branch_id?: string
          commission_rate?: number | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          phone?: string | null
          profile_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string
          category_id: string | null
          created_at: string | null
          created_by: string | null
          expense_date: string
          id: string
          notes: string | null
          receipt_url: string | null
          title: string
        }
        Insert: {
          amount: number
          branch_id: string
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          title: string
        }
        Update: {
          amount?: number
          branch_id?: string
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          balance: number
          branch_id: string
          code: string
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_ids: string[] | null
          expires_at: string | null
          id: string
          initial_value: number
          is_active: boolean | null
        }
        Insert: {
          balance: number
          branch_id: string
          code: string
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_ids?: string[] | null
          expires_at?: string | null
          id?: string
          initial_value: number
          is_active?: boolean | null
        }
        Update: {
          balance?: number
          branch_id?: string
          code?: string
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_ids?: string[] | null
          expires_at?: string | null
          id?: string
          initial_value?: number
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receiving_notes: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string | null
          id: string
          notes: string | null
          po_id: string
          received_at: string | null
          received_by: string | null
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          po_id: string
          received_at?: string | null
          received_by?: string | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          po_id?: string
          received_at?: string | null
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receiving_notes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receiving_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receiving_notes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receiving_notes_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_review_settings: {
        Row: {
          api_key: string | null
          branch_id: string
          created_at: string | null
          id: string
          last_synced: string | null
          place_id: string | null
        }
        Insert: {
          api_key?: string | null
          branch_id: string
          created_at?: string | null
          id?: string
          last_synced?: string | null
          place_id?: string | null
        }
        Update: {
          api_key?: string | null
          branch_id?: string
          created_at?: string | null
          id?: string
          last_synced?: string | null
          place_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_review_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      google_reviews: {
        Row: {
          author_name: string | null
          branch_id: string
          fetched_at: string | null
          id: string
          published_at: string | null
          rating: number | null
          review_id: string | null
          text: string | null
        }
        Insert: {
          author_name?: string | null
          branch_id: string
          fetched_at?: string | null
          id?: string
          published_at?: string | null
          rating?: number | null
          review_id?: string | null
          text?: string | null
        }
        Update: {
          author_name?: string | null
          branch_id?: string
          fetched_at?: string | null
          id?: string
          published_at?: string | null
          rating?: number | null
          review_id?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_reviews_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_items: {
        Row: {
          grn_id: string
          id: string
          notes: string | null
          po_item_id: string
          quantity_received: number
        }
        Insert: {
          grn_id: string
          id?: string
          notes?: string | null
          po_item_id: string
          quantity_received?: number
        }
        Update: {
          grn_id?: string
          id?: string
          notes?: string | null
          po_item_id?: string
          quantity_received?: number
        }
        Relationships: [
          {
            foreignKeyName: "grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_receiving_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          branch_id: string
          id: string
          low_stock_alert: number | null
          product_id: string | null
          quantity: number
          updated_at: string | null
          variant_id: string | null
        }
        Insert: {
          branch_id: string
          id?: string
          low_stock_alert?: number | null
          product_id?: string | null
          quantity?: number
          updated_at?: string | null
          variant_id?: string | null
        }
        Update: {
          branch_id?: string
          id?: string
          low_stock_alert?: number | null
          product_id?: string | null
          quantity?: number
          updated_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_cost_layers: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          received_at: string | null
          source_id: string | null
          source_type: string | null
          unit_cost: number
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          product_id: string
          quantity?: number
          received_at?: string | null
          source_id?: string | null
          source_type?: string | null
          unit_cost?: number
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          received_at?: string | null
          source_id?: string | null
          source_type?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_cost_layers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_cost_layers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          count_id: string
          counted_qty: number | null
          id: string
          notes: string | null
          product_id: string
          system_qty: number
        }
        Insert: {
          count_id: string
          counted_qty?: number | null
          id?: string
          notes?: string | null
          product_id: string
          system_qty?: number
        }
        Update: {
          count_id?: string
          counted_qty?: number | null
          id?: string
          notes?: string | null
          product_id?: string
          system_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          branch_id: string
          business_id: string
          completed_at: string | null
          created_at: string | null
          id: string
          name: string
          notes: string | null
          started_by: string | null
          status: string
        }
        Insert: {
          branch_id: string
          business_id: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          started_by?: string | null
          status?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          started_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_serials: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          imei: string | null
          notes: string | null
          product_id: string
          purchase_order_id: string | null
          repair_id: string | null
          sale_id: string | null
          serial_number: string
          status: string
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          imei?: string | null
          notes?: string | null
          product_id: string
          purchase_order_id?: string | null
          repair_id?: string | null
          sale_id?: string | null
          serial_number: string
          status?: string
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          imei?: string | null
          notes?: string | null
          product_id?: string
          purchase_order_id?: string | null
          repair_id?: string | null
          sale_id?: string | null
          serial_number?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_serials_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_serials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_serials_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_serials_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_serials_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminder_settings: {
        Row: {
          business_id: string
          channel: string
          created_at: string
          days_after_overdue: number[]
          days_before_due: number
          enabled: boolean
          id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          channel?: string
          created_at?: string
          days_after_overdue?: number[]
          days_before_due?: number
          enabled?: boolean
          id?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          channel?: string
          created_at?: string
          days_after_overdue?: number[]
          days_before_due?: number
          enabled?: boolean
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminder_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number | null
          branch_id: string
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          discount: number | null
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          items: Json
          notes: string | null
          pdf_url: string | null
          reference_id: string | null
          reference_type: string | null
          status: string | null
          subtotal: number
          tax: number | null
          total: number
        }
        Insert: {
          amount_paid?: number | null
          branch_id: string
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          discount?: number | null
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          items?: Json
          notes?: string | null
          pdf_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          subtotal?: number
          tax?: number | null
          total?: number
        }
        Update: {
          amount_paid?: number | null
          branch_id?: string
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          discount?: number | null
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          items?: Json
          notes?: string | null
          pdf_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          subtotal?: number
          tax?: number | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points: {
        Row: {
          balance: number
          business_id: string
          customer_id: string
          id: string
          updated_at: string | null
        }
        Insert: {
          balance?: number
          business_id: string
          customer_id: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          balance?: number
          business_id?: string
          customer_id?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          business_id: string
          earn_rate: number | null
          id: string
          is_enabled: boolean | null
          min_redeem_points: number | null
          redeem_rate: number | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          earn_rate?: number | null
          id?: string
          is_enabled?: boolean | null
          min_redeem_points?: number | null
          redeem_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          earn_rate?: number | null
          id?: string
          is_enabled?: boolean | null
          min_redeem_points?: number | null
          redeem_rate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          business_id: string
          created_at: string | null
          customer_id: string
          id: string
          points: number
          reference_id: string | null
          type: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          customer_id: string
          id?: string
          points: number
          reference_id?: string | null
          type: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          customer_id?: string
          id?: string
          points?: number
          reference_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          business_id: string
          created_at: string | null
          from_branch_id: string | null
          id: string
          is_read: boolean | null
          parent_id: string | null
          sender_id: string
          subject: string | null
          to_branch_id: string | null
        }
        Insert: {
          body: string
          business_id: string
          created_at?: string | null
          from_branch_id?: string | null
          id?: string
          is_read?: boolean | null
          parent_id?: string | null
          sender_id: string
          subject?: string | null
          to_branch_id?: string | null
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string | null
          from_branch_id?: string | null
          id?: string
          is_read?: boolean | null
          parent_id?: string | null
          sender_id?: string
          subject?: string | null
          to_branch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      module_config_template_push_log: {
        Row: {
          affected_business_ids: string[] | null
          created_at: string | null
          id: string
          new_version: number | null
          old_version: number | null
          push_mode: string
          pushed_by: string | null
          template_id: string
        }
        Insert: {
          affected_business_ids?: string[] | null
          created_at?: string | null
          id?: string
          new_version?: number | null
          old_version?: number | null
          push_mode: string
          pushed_by?: string | null
          template_id: string
        }
        Update: {
          affected_business_ids?: string[] | null
          created_at?: string | null
          id?: string
          new_version?: number | null
          old_version?: number | null
          push_mode?: string
          pushed_by?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_config_template_push_log_pushed_by_fkey"
            columns: ["pushed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_config_template_push_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "module_config_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      module_config_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          module: string
          name: string
          settings: Json
          updated_at: string | null
          version: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          module: string
          name: string
          settings?: Json
          updated_at?: string | null
          version?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          module?: string
          name?: string
          settings?: Json
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "module_config_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      module_settings: {
        Row: {
          branch_id: string
          id: string
          module: string
          settings: Json
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          id?: string
          module: string
          settings?: Json
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          id?: string
          module?: string
          settings?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          body: string
          branch_id: string | null
          business_id: string
          channel: string
          created_at: string
          error_message: string | null
          id: string
          recipient: string
          related_id: string | null
          related_type: string | null
          status: string
          subject: string | null
          template_id: string | null
          trigger_event: string
        }
        Insert: {
          body: string
          branch_id?: string | null
          business_id: string
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient: string
          related_id?: string | null
          related_type?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          trigger_event: string
        }
        Update: {
          body?: string
          branch_id?: string | null
          business_id?: string
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient?: string
          related_id?: string | null
          related_type?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          business_id: string
          channel: string
          created_at: string
          email_body: string | null
          id: string
          is_active: boolean
          sms_body: string | null
          subject: string | null
          trigger_event: string
          updated_at: string
        }
        Insert: {
          business_id: string
          channel?: string
          created_at?: string
          email_body?: string | null
          id?: string
          is_active?: boolean
          sms_body?: string | null
          subject?: string | null
          trigger_event: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          channel?: string
          created_at?: string
          email_body?: string | null
          id?: string
          is_active?: boolean
          sms_body?: string | null
          subject?: string | null
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          business_id: string
          commission_total: number
          created_at: string | null
          employee_id: string
          end_date: string
          gross_pay: number | null
          hourly_pay: number | null
          hourly_rate: number
          id: string
          notes: string | null
          start_date: string
          status: string
          total_hours: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          business_id: string
          commission_total?: number
          created_at?: string | null
          employee_id: string
          end_date: string
          gross_pay?: number | null
          hourly_pay?: number | null
          hourly_rate?: number
          id?: string
          notes?: string | null
          start_date: string
          status?: string
          total_hours?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          business_id?: string
          commission_total?: number
          created_at?: string | null
          employee_id?: string
          end_date?: string
          gross_pay?: number | null
          hourly_pay?: number | null
          hourly_rate?: number
          id?: string
          notes?: string | null
          start_date?: string
          status?: string
          total_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          features: Json
          id: string
          is_active: boolean | null
          limits: Json
          max_branches: number
          max_users: number
          name: string
          price_monthly: number
          price_yearly: number | null
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
        }
        Insert: {
          created_at?: string | null
          features?: Json
          id?: string
          is_active?: boolean | null
          limits?: Json
          max_branches?: number
          max_users?: number
          name: string
          price_monthly?: number
          price_yearly?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Update: {
          created_at?: string | null
          features?: Json
          id?: string
          is_active?: boolean | null
          limits?: Json
          max_branches?: number
          max_users?: number
          name?: string
          price_monthly?: number
          price_yearly?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Relationships: []
      }
      product_bundle_items: {
        Row: {
          bundle_id: string
          id: string
          product_id: string
          quantity: number
        }
        Insert: {
          bundle_id: string
          id?: string
          product_id: string
          quantity?: number
        }
        Update: {
          bundle_id?: string
          id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "product_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bundles: {
        Row: {
          bundle_price: number
          business_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sku: string | null
        }
        Insert: {
          bundle_price?: number
          business_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sku?: string | null
        }
        Update: {
          bundle_price?: number
          business_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_bundles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          condition_grade: string | null
          cost_price: number | null
          created_at: string | null
          id: string
          name: string
          product_id: string
          selling_price: number | null
          sku: string | null
        }
        Insert: {
          barcode?: string | null
          condition_grade?: string | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          name: string
          product_id: string
          selling_price?: number | null
          sku?: string | null
        }
        Update: {
          barcode?: string | null
          condition_grade?: string | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          name?: string
          product_id?: string
          selling_price?: number | null
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          average_cost: number | null
          barcode: string | null
          brand_id: string | null
          business_id: string
          category_id: string | null
          cost_price: number | null
          created_at: string | null
          custom_fields: Json | null
          description: string | null
          has_variants: boolean | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_serialized: boolean | null
          is_service: boolean | null
          is_trade_in: boolean | null
          name: string
          selling_price: number
          sku: string | null
          updated_at: string | null
          valuation_method: string | null
        }
        Insert: {
          average_cost?: number | null
          barcode?: string | null
          brand_id?: string | null
          business_id: string
          category_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          custom_fields?: Json | null
          description?: string | null
          has_variants?: boolean | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_serialized?: boolean | null
          is_service?: boolean | null
          is_trade_in?: boolean | null
          name: string
          selling_price?: number
          sku?: string | null
          updated_at?: string | null
          valuation_method?: string | null
        }
        Update: {
          average_cost?: number | null
          barcode?: string | null
          brand_id?: string | null
          business_id?: string
          category_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          custom_fields?: Json | null
          description?: string | null
          has_variants?: boolean | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_serialized?: boolean | null
          is_service?: boolean | null
          is_trade_in?: boolean | null
          name?: string
          selling_price?: number
          sku?: string | null
          updated_at?: string | null
          valuation_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          business_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          business_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          business_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          name: string
          po_id: string
          product_id: string | null
          quantity_ordered: number
          quantity_received: number
          sku: string | null
          tax_class: string | null
          unit_cost: number
        }
        Insert: {
          id?: string
          name: string
          po_id: string
          product_id?: string | null
          quantity_ordered?: number
          quantity_received?: number
          sku?: string | null
          tax_class?: string | null
          unit_cost?: number
        }
        Update: {
          id?: string
          name?: string
          po_id?: string
          product_id?: string | null
          quantity_ordered?: number
          quantity_received?: number
          sku?: string | null
          tax_class?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string | null
          created_by: string | null
          expected_delivery_date: string | null
          id: string
          notes: string | null
          po_number: string
          status: string
          subtotal: number | null
          supplier_id: string
          tax: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string | null
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          po_number: string
          status?: string
          subtotal?: number | null
          supplier_id: string
          tax?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string | null
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          po_number?: string
          status?: string
          subtotal?: number | null
          supplier_id?: string
          tax?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      register_sessions: {
        Row: {
          branch_id: string
          business_id: string
          card_sales: number | null
          cash_sales: number | null
          cashier_id: string
          closed_at: string | null
          closing_cash: number | null
          expected_cash: number | null
          id: string
          opened_at: string
          opening_float: number
          other_sales: number | null
          status: string
          total_refunds: number | null
          total_sales: number | null
          transaction_count: number | null
          variance: number | null
        }
        Insert: {
          branch_id: string
          business_id: string
          card_sales?: number | null
          cash_sales?: number | null
          cashier_id: string
          closed_at?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          opened_at?: string
          opening_float?: number
          other_sales?: number | null
          status?: string
          total_refunds?: number | null
          total_sales?: number | null
          transaction_count?: number | null
          variance?: number | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          card_sales?: number | null
          cash_sales?: number | null
          cashier_id?: string
          closed_at?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          opened_at?: string
          opening_float?: number
          other_sales?: number | null
          status?: string
          total_refunds?: number | null
          total_sales?: number | null
          transaction_count?: number | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "register_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_sessions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_condition_items: {
        Row: {
          created_at: string | null
          id: string
          label: string
          notes: string | null
          repair_id: string
          stage: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          label: string
          notes?: string | null
          repair_id: string
          stage: string
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string
          notes?: string | null
          repair_id?: string
          stage?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_condition_items_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_condition_templates: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          items: Json
          repair_category: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          items?: Json
          repair_category?: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          items?: Json
          repair_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_condition_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_estimates: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string | null
          customer_id: string
          customer_note: string | null
          id: string
          items: Json
          repair_id: string | null
          responded_at: string | null
          sent_at: string | null
          signature_data: string | null
          status: string
          total: number
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string | null
          customer_id: string
          customer_note?: string | null
          id?: string
          items?: Json
          repair_id?: string | null
          responded_at?: string | null
          sent_at?: string | null
          signature_data?: string | null
          status?: string
          total?: number
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string | null
          customer_id?: string
          customer_note?: string | null
          id?: string
          items?: Json
          repair_id?: string | null
          responded_at?: string | null
          sent_at?: string | null
          signature_data?: string | null
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "repair_estimates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimates_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_items: {
        Row: {
          id: string
          name: string
          problem_id: string | null
          product_id: string | null
          quantity: number
          repair_id: string
          unit_cost: number | null
          unit_price: number | null
          variant_id: string | null
          warranty_days: number | null
          warranty_starts_at: string | null
        }
        Insert: {
          id?: string
          name: string
          problem_id?: string | null
          product_id?: string | null
          quantity?: number
          repair_id: string
          unit_cost?: number | null
          unit_price?: number | null
          variant_id?: string | null
          warranty_days?: number | null
          warranty_starts_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          problem_id?: string | null
          product_id?: string | null
          quantity?: number
          repair_id?: string
          unit_cost?: number | null
          unit_price?: number | null
          variant_id?: string | null
          warranty_days?: number | null
          warranty_starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_items_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "service_problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_items_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_status_flags: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          message: string
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          message: string
          status: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          message?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_status_flags_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          email_sent: boolean | null
          id: string
          new_status: string
          note: string | null
          old_status: string | null
          repair_id: string
          sms_sent: boolean | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          new_status: string
          note?: string | null
          old_status?: string | null
          repair_id: string
          sms_sent?: boolean | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          new_status?: string
          note?: string | null
          old_status?: string | null
          repair_id?: string
          sms_sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_status_history_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
        ]
      }
      repairs: {
        Row: {
          actual_cost: number | null
          asset_id: string | null
          assigned_to: string | null
          branch_id: string
          collected_at: string | null
          created_at: string | null
          current_step_id: string | null
          custom_fields: Json | null
          customer_id: string | null
          deposit_paid: number | null
          device_brand: string | null
          device_model: string | null
          device_type: string | null
          diagnosis: string | null
          estimated_cost: number | null
          id: string
          issue: string
          job_number: string
          label_ids: string[] | null
          notify_customer: boolean | null
          serial_number: string | null
          status: string
          updated_at: string | null
          workflow_id: string | null
        }
        Insert: {
          actual_cost?: number | null
          asset_id?: string | null
          assigned_to?: string | null
          branch_id: string
          collected_at?: string | null
          created_at?: string | null
          current_step_id?: string | null
          custom_fields?: Json | null
          customer_id?: string | null
          deposit_paid?: number | null
          device_brand?: string | null
          device_model?: string | null
          device_type?: string | null
          diagnosis?: string | null
          estimated_cost?: number | null
          id?: string
          issue: string
          job_number: string
          label_ids?: string[] | null
          notify_customer?: boolean | null
          serial_number?: string | null
          status?: string
          updated_at?: string | null
          workflow_id?: string | null
        }
        Update: {
          actual_cost?: number | null
          asset_id?: string | null
          assigned_to?: string | null
          branch_id?: string
          collected_at?: string | null
          created_at?: string | null
          current_step_id?: string | null
          custom_fields?: Json | null
          customer_id?: string | null
          deposit_paid?: number | null
          device_brand?: string | null
          device_model?: string | null
          device_type?: string | null
          diagnosis?: string | null
          estimated_cost?: number | null
          id?: string
          issue?: string
          job_number?: string
          label_ids?: string[] | null
          notify_customer?: boolean | null
          serial_number?: string | null
          status?: string
          updated_at?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repairs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "customer_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "ticket_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "ticket_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action: string
          allowed: boolean
          business_id: string
          created_at: string | null
          id: string
          module: string
          requires_pin: boolean
          role: string
        }
        Insert: {
          action: string
          allowed?: boolean
          business_id: string
          created_at?: string | null
          id?: string
          module: string
          requires_pin?: boolean
          role: string
        }
        Update: {
          action?: string
          allowed?: boolean
          business_id?: string
          created_at?: string | null
          id?: string
          module?: string
          requires_pin?: boolean
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      salaries: {
        Row: {
          amount: number
          branch_id: string
          created_at: string | null
          created_by: string | null
          employee_id: string
          id: string
          notes: string | null
          pay_date: string
          pay_period: string | null
        }
        Insert: {
          amount: number
          branch_id: string
          created_at?: string | null
          created_by?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          pay_date: string
          pay_period?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string
          created_at?: string | null
          created_by?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          pay_date?: string
          pay_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salaries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salaries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salaries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          discount: number | null
          id: string
          name: string
          product_id: string | null
          quantity: number
          sale_id: string
          total: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          discount?: number | null
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          sale_id: string
          total: number
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          discount?: number | null
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          sale_id?: string
          total?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string
          cashier_id: string | null
          created_at: string | null
          customer_id: string | null
          discount: number | null
          gift_card_id: string | null
          id: string
          is_refund: boolean
          notes: string | null
          original_sale_id: string | null
          payment_method: string
          payment_splits: Json | null
          payment_status: string
          refund_reason: string | null
          subtotal: number
          tax: number | null
          total: number
        }
        Insert: {
          branch_id: string
          cashier_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          discount?: number | null
          gift_card_id?: string | null
          id?: string
          is_refund?: boolean
          notes?: string | null
          original_sale_id?: string | null
          payment_method?: string
          payment_splits?: Json | null
          payment_status?: string
          refund_reason?: string | null
          subtotal?: number
          tax?: number | null
          total?: number
        }
        Update: {
          branch_id?: string
          cashier_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          discount?: number | null
          gift_card_id?: string | null
          id?: string
          is_refund?: boolean
          notes?: string | null
          original_sale_id?: string | null
          payment_method?: string
          payment_splits?: Json | null
          payment_status?: string
          refund_reason?: string | null
          subtotal?: number
          tax?: number | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          business_id: string
          config: Json
          created_at: string
          created_by: string | null
          id: string
          is_favorite: boolean
          name: string
          report_type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          report_type?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          report_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          business_id: string
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          retail_margin: number | null
          show_on_pos: boolean | null
          slug: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          retail_margin?: number | null
          show_on_pos?: boolean | null
          slug: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          retail_margin?: number | null
          show_on_pos?: boolean | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      service_devices: {
        Row: {
          business_id: string
          colors: Json | null
          created_at: string | null
          id: string
          image_url: string | null
          manufacturer_id: string
          name: string
        }
        Insert: {
          business_id: string
          colors?: Json | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          manufacturer_id: string
          name: string
        }
        Update: {
          business_id?: string
          colors?: Json | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          manufacturer_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_devices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_devices_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "service_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_manufacturers: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_manufacturers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_problem_parts: {
        Row: {
          created_at: string | null
          default_qty: number | null
          default_warranty_days: number | null
          id: string
          part_status: string | null
          problem_id: string
          product_id: string
          supplier_id: string | null
          tax_class: string | null
        }
        Insert: {
          created_at?: string | null
          default_qty?: number | null
          default_warranty_days?: number | null
          id?: string
          part_status?: string | null
          problem_id: string
          product_id: string
          supplier_id?: string | null
          tax_class?: string | null
        }
        Update: {
          created_at?: string | null
          default_qty?: number | null
          default_warranty_days?: number | null
          id?: string
          part_status?: string | null
          problem_id?: string
          product_id?: string
          supplier_id?: string | null
          tax_class?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_problem_parts_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "service_problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_problem_parts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      service_problems: {
        Row: {
          business_id: string
          category_id: string | null
          cost: number | null
          created_at: string | null
          device_id: string | null
          id: string
          name: string
          notes: string | null
          price: number | null
          show_on_portal: boolean | null
          show_on_pos: boolean | null
          tax_class: string | null
          use_for_all_models: boolean | null
          warranty_days: number | null
        }
        Insert: {
          business_id: string
          category_id?: string | null
          cost?: number | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          name: string
          notes?: string | null
          price?: number | null
          show_on_portal?: boolean | null
          show_on_pos?: boolean | null
          tax_class?: string | null
          use_for_all_models?: boolean | null
          warranty_days?: number | null
        }
        Update: {
          business_id?: string
          category_id?: string | null
          cost?: number | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          price?: number | null
          show_on_portal?: boolean | null
          show_on_pos?: boolean | null
          tax_class?: string | null
          use_for_all_models?: boolean | null
          warranty_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_problems_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_problems_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_problems_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "service_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string | null
          days_of_week: number[]
          end_time: string
          id: string
          name: string
          start_time: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string | null
          days_of_week?: number[]
          end_time: string
          id?: string
          name: string
          start_time: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string | null
          days_of_week?: number[]
          end_time?: string
          id?: string
          name?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      special_orders: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string | null
          customer_id: string | null
          id: string
          name: string
          notes: string | null
          po_id: string | null
          product_id: string | null
          quantity: number
          repair_id: string | null
          status: string
          tracking_id: string | null
          unit_cost: number | null
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          name: string
          notes?: string | null
          po_id?: string | null
          product_id?: string | null
          quantity?: number
          repair_id?: string | null
          status?: string
          tracking_id?: string | null
          unit_cost?: number | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          po_id?: string | null
          product_id?: string | null
          quantity?: number
          repair_id?: string | null
          status?: string
          tracking_id?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "special_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_orders_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_orders_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          branch_id: string
          created_at: string | null
          created_by: string | null
          id: string
          note: string | null
          product_id: string | null
          quantity: number
          reference_id: string | null
          type: string
          variant_id: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          quantity: number
          reference_id?: string | null
          type: string
          variant_id?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          quantity?: number
          reference_id?: string | null
          type?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_credit_transactions: {
        Row: {
          amount: number
          business_id: string
          created_at: string | null
          created_by: string | null
          customer_id: string
          id: string
          note: string | null
          reference_id: string | null
          reference_type: string | null
          type: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          id?: string
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_credit_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credit_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credit_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      store_credits: {
        Row: {
          balance: number
          business_id: string
          customer_id: string
          id: string
          updated_at: string | null
        }
        Insert: {
          balance?: number
          business_id: string
          customer_id: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          balance?: number
          business_id?: string
          customer_id?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_credits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: string | null
          business_id: string
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_sub_id: string | null
          trial_ends_at: string | null
        }
        Insert: {
          billing_cycle?: string | null
          business_id: string
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_sub_id?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          billing_cycle?: string | null
          business_id?: string
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_sub_id?: string | null
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          business_id: string
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          id: string
          is_active: boolean | null
          mobile: string | null
          name: string
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          business_id: string
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          mobile?: string | null
          name: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          mobile?: string | null
          name?: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      template_push_previews: {
        Row: {
          business_id: string
          created_at: string
          diff: Json
          expires_at: string
          id: string
          push_mode: string
          template_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          diff?: Json
          expires_at?: string
          id?: string
          push_mode: string
          template_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          diff?: Json
          expires_at?: string
          id?: string
          push_mode?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_push_previews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_push_previews_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "module_config_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_labels: {
        Row: {
          business_id: string
          color: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          business_id: string
          color?: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          business_id?: string
          color?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_labels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_workflow_steps: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          required_role: string | null
          step_order: number
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          required_role?: string | null
          step_order: number
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          required_role?: string | null
          step_order?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "ticket_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_workflows: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_workflows_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clocks: {
        Row: {
          branch_id: string
          break_minutes: number | null
          clock_in: string
          clock_out: string | null
          created_at: string | null
          employee_id: string
          id: string
          notes: string | null
        }
        Insert: {
          branch_id: string
          break_minutes?: number | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          branch_id?: string
          break_minutes?: number | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_clocks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clocks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_in_transactions: {
        Row: {
          branch_id: string
          business_id: string
          condition_grade: string
          created_at: string | null
          customer_id: string | null
          id: string
          imei: string | null
          notes: string | null
          product_id: string
          sale_id: string | null
          serial_number: string | null
          trade_in_value: number
          variant_id: string | null
        }
        Insert: {
          branch_id: string
          business_id: string
          condition_grade: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          imei?: string | null
          notes?: string | null
          product_id: string
          sale_id?: string | null
          serial_number?: string | null
          trade_in_value?: number
          variant_id?: string | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          condition_grade?: string
          created_at?: string | null
          customer_id?: string | null
          id?: string
          imei?: string | null
          notes?: string | null
          product_id?: string
          sale_id?: string | null
          serial_number?: string | null
          trade_in_value?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_in_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_in_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_in_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_in_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_in_transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_in_transactions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      vertical_template_apply_log: {
        Row: {
          applied_by: string | null
          apply_mode: string
          business_id: string
          created_at: string
          diff_snapshot: Json | null
          id: string
          modules_applied: string[]
          template_id: string
        }
        Insert: {
          applied_by?: string | null
          apply_mode?: string
          business_id: string
          created_at?: string
          diff_snapshot?: Json | null
          id?: string
          modules_applied?: string[]
          template_id: string
        }
        Update: {
          applied_by?: string | null
          apply_mode?: string
          business_id?: string
          created_at?: string
          diff_snapshot?: Json | null
          id?: string
          modules_applied?: string[]
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vertical_template_apply_log_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vertical_template_apply_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vertical_template_apply_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "business_vertical_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_store_credit: {
        Args: {
          p_amount: number
          p_business_id: string
          p_created_by?: string
          p_customer_id: string
          p_note?: string
          p_reference_id?: string
          p_reference_type?: string
        }
        Returns: number
      }
      calculate_payroll: {
        Args: {
          p_branch_id: string
          p_employee_id: string
          p_end_date: string
          p_start_date: string
        }
        Returns: {
          commission_total: number
          gross_pay: number
          hourly_pay: number
          total_hours: number
        }[]
      }
      check_plan_limit: {
        Args: {
          p_business_id: string
          p_current_count?: number
          p_limit_key: string
        }
        Returns: Json
      }
      close_register_session: {
        Args: { p_closing_cash: number; p_session_id: string }
        Returns: Json
      }
      complete_inventory_count: {
        Args: { p_adjusted_by: string; p_count_id: string }
        Returns: undefined
      }
      consume_cost_layers: {
        Args: {
          p_branch_id: string
          p_method?: string
          p_product_id: string
          p_qty: number
        }
        Returns: number
      }
      generate_invoice_number: {
        Args: { p_branch_id: string }
        Returns: string
      }
      generate_job_number: { Args: { p_branch_id: string }; Returns: string }
      generate_po_number: { Args: { p_branch_id: string }; Returns: string }
      get_dashboard_stats: {
        Args: {
          p_branch_id: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_profit_loss: {
        Args: { p_branch_id: string; p_end_date: string; p_start_date: string }
        Returns: Json
      }
      is_owner_or_manager: { Args: never; Returns: boolean }
      merge_customers: {
        Args: { p_drop_id: string; p_keep_id: string }
        Returns: undefined
      }
      process_grn: {
        Args: { p_grn_id: string; p_user_id?: string }
        Returns: undefined
      }
      process_refund: { Args: { p_refund_data: Json }; Returns: string }
      process_sale: { Args: { p_sale_data: Json }; Returns: string }
      resolve_all_module_configs: {
        Args: { p_branch_id: string }
        Returns: Json
      }
      resolve_module_config: {
        Args: { p_branch_id: string; p_module: string }
        Returns: Json
      }
      seed_notification_templates: {
        Args: { p_business_id: string }
        Returns: undefined
      }
      update_average_cost: {
        Args: { p_new_cost: number; p_new_qty: number; p_product_id: string }
        Returns: undefined
      }
      update_repair_status: {
        Args: {
          p_changed_by: string
          p_new_status: string
          p_note: string
          p_repair_id: string
        }
        Returns: undefined
      }
      user_branch_id: { Args: never; Returns: string }
      user_business_id: { Args: never; Returns: string }
      user_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// ── Convenience aliases ───────────────────────────────────────────────────────
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type Product  = Row<'products'>
export type Customer = Row<'customers'>
export type Profile  = Row<'profiles'>
export type Branch   = Row<'branches'>
export type Repair   = Row<'repairs'>
export type ProductVariant = Row<'product_variants'>
