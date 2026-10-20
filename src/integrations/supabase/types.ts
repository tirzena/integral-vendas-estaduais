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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      accounts_payable: {
        Row: {
          amount: number
          category: string | null
          cost_center: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          due_date: string
          exchange_rate_locked_at: string | null
          exchange_rate_source: string | null
          exchange_rates_snapshot: Json | null
          id: string
          installment_number: number | null
          installments_total: number | null
          is_demo: boolean
          paid_at: string | null
          product_id: string | null
          recurrence: string
          settled_amount_brl: number | null
          settled_amount_pyg: number | null
          settled_amount_usd: number | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          cost_center?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description: string
          due_date?: string
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          is_demo?: boolean
          paid_at?: string | null
          product_id?: string | null
          recurrence?: string
          settled_amount_brl?: number | null
          settled_amount_pyg?: number | null
          settled_amount_usd?: number | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          cost_center?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          due_date?: string
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          is_demo?: boolean
          paid_at?: string | null
          product_id?: string | null
          recurrence?: string
          settled_amount_brl?: number | null
          settled_amount_pyg?: number | null
          settled_amount_usd?: number | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          amount: number
          category: string | null
          cost_center: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string | null
          description: string
          due_date: string
          exchange_rate_locked_at: string | null
          exchange_rate_source: string | null
          exchange_rates_snapshot: Json | null
          id: string
          installment_number: number | null
          installments_total: number | null
          is_demo: boolean
          order_id: string | null
          paid_at: string | null
          product_id: string | null
          recurrence: string
          settled_amount_brl: number | null
          settled_amount_pyg: number | null
          settled_amount_usd: number | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          cost_center?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          description: string
          due_date?: string
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          is_demo?: boolean
          order_id?: string | null
          paid_at?: string | null
          product_id?: string | null
          recurrence?: string
          settled_amount_brl?: number | null
          settled_amount_pyg?: number | null
          settled_amount_usd?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          cost_center?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          description?: string
          due_date?: string
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          is_demo?: boolean
          order_id?: string | null
          paid_at?: string | null
          product_id?: string | null
          recurrence?: string
          settled_amount_brl?: number | null
          settled_amount_pyg?: number | null
          settled_amount_usd?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          content: string | null
          created_at: string
          customer_id: string | null
          customer_product_id: string | null
          id: string
          product_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          customer_id?: string | null
          customer_product_id?: string | null
          id?: string
          product_id?: string | null
          type?: string
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          customer_id?: string | null
          customer_product_id?: string | null
          id?: string
          product_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_customer_product_id_fkey"
            columns: ["customer_product_id"]
            isOneToOne: false
            referencedRelation: "customer_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_metric_prefs: {
        Row: {
          cards: Json
          chart: Json
          created_at: string
          id: string
          scope_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cards?: Json
          chart?: Json
          created_at?: string
          id?: string
          scope_key: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          cards?: Json
          chart?: Json
          created_at?: string
          id?: string
          scope_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ad_metrics: {
        Row: {
          account_currency: string | null
          account_timezone: string | null
          campaign: string | null
          clicks: number
          conversions: number
          cost_per_result: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          currency: Database["public"]["Enums"]["currency_code"]
          frequency: number | null
          id: string
          impressions: number
          integration_id: string | null
          is_demo: boolean
          leads: number
          level: string
          meta_ad_account_id: string | null
          metric_date: string
          metrics: Json | null
          object_id: string
          object_name: string | null
          product_id: string | null
          reach: number | null
          result_type: string | null
          results: number | null
          revenue: number
          source: string
          spend: number
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          account_currency?: string | null
          account_timezone?: string | null
          campaign?: string | null
          clicks?: number
          conversions?: number
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          currency?: Database["public"]["Enums"]["currency_code"]
          frequency?: number | null
          id?: string
          impressions?: number
          integration_id?: string | null
          is_demo?: boolean
          leads?: number
          level?: string
          meta_ad_account_id?: string | null
          metric_date?: string
          metrics?: Json | null
          object_id?: string
          object_name?: string | null
          product_id?: string | null
          reach?: number | null
          result_type?: string | null
          results?: number | null
          revenue?: number
          source?: string
          spend?: number
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          account_currency?: string | null
          account_timezone?: string | null
          campaign?: string | null
          clicks?: number
          conversions?: number
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          currency?: Database["public"]["Enums"]["currency_code"]
          frequency?: number | null
          id?: string
          impressions?: number
          integration_id?: string | null
          is_demo?: boolean
          leads?: number
          level?: string
          meta_ad_account_id?: string | null
          metric_date?: string
          metrics?: Json | null
          object_id?: string
          object_name?: string | null
          product_id?: string | null
          reach?: number | null
          result_type?: string | null
          results?: number | null
          revenue?: number
          source?: string
          spend?: number
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_metrics_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_metrics_meta_ad_account_id_fkey"
            columns: ["meta_ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_metrics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      authenticity_attempts: {
        Row: {
          batch_id: string | null
          created_at: string
          id: number
          result: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: never
          result: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: never
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "authenticity_attempts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "authenticity_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      authenticity_batches: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          expiry_date: string
          id: string
          item_id: string
          lot_number: string
          manufacture_date: string
          product_name: string
          purchase_item_id: string | null
          quantity: number
          show_code_validator: boolean
          supplier_lot_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          expiry_date: string
          id?: string
          item_id: string
          lot_number: string
          manufacture_date: string
          product_name: string
          purchase_item_id?: string | null
          quantity: number
          show_code_validator?: boolean
          supplier_lot_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          expiry_date?: string
          id?: string
          item_id?: string
          lot_number?: string
          manufacture_date?: string
          product_name?: string
          purchase_item_id?: string | null
          quantity?: number
          show_code_validator?: boolean
          supplier_lot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authenticity_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authenticity_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authenticity_batches_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authenticity_batches_supplier_lot_id_fkey"
            columns: ["supplier_lot_id"]
            isOneToOne: true
            referencedRelation: "supplier_stock_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      authenticity_boxes: {
        Row: {
          batch_id: string
          code_hash: string
          first_validated_at: string | null
          id: string
          print_code: string
          serial: number
        }
        Insert: {
          batch_id: string
          code_hash: string
          first_validated_at?: string | null
          id?: string
          print_code: string
          serial: number
        }
        Update: {
          batch_id?: string
          code_hash?: string
          first_validated_at?: string | null
          id?: string
          print_code?: string
          serial?: number
        }
        Relationships: [
          {
            foreignKeyName: "authenticity_boxes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "authenticity_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      authenticity_limits: {
        Row: {
          attempts: number
          bucket: string
          window_start: string
        }
        Insert: {
          attempts: number
          bucket: string
          window_start: string
        }
        Update: {
          attempts?: number
          bucket?: string
          window_start?: string
        }
        Relationships: []
      }
      bonus_awards: {
        Row: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          id: string
          is_demo: boolean
          payment_due_date: string | null
          period_end: string | null
          period_start: string | null
          product_id: string | null
          remuneration_policy_id: string | null
          rule_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          id?: string
          is_demo?: boolean
          payment_due_date?: string | null
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
          remuneration_policy_id?: string | null
          rule_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          id?: string
          is_demo?: boolean
          payment_due_date?: string | null
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
          remuneration_policy_id?: string | null
          rule_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_awards_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_awards_remuneration_policy_id_fkey"
            columns: ["remuneration_policy_id"]
            isOneToOne: false
            referencedRelation: "remuneration_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_awards_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "bonus_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_awards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_rules: {
        Row: {
          active: boolean
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          is_demo: boolean
          metric: string
          name: string
          period: string
          product_id: string | null
          reward_type: string
          reward_value: number
          threshold: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_demo?: boolean
          metric?: string
          name: string
          period?: string
          product_id?: string | null
          reward_type?: string
          reward_value?: number
          threshold?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_demo?: boolean
          metric?: string
          name?: string
          period?: string
          product_id?: string | null
          reward_type?: string
          reward_value?: number
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          blocked_reason: string | null
          campaign_id: string
          created_at: string
          customer_id: string | null
          email: string | null
          id: string
          name: string | null
          phone: string | null
          status: string
        }
        Insert: {
          blocked_reason?: string | null
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          status?: string
        }
        Update: {
          blocked_reason?: string | null
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_segments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          filters: Json
          id: string
          name: string
          product_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          name: string
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          name?: string
          product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_segments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_steps: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          fallback_channel: string | null
          id: string
          position: number
          subject: string | null
          template_id: string | null
          wait_minutes: number
          workflow_id: string
        }
        Insert: {
          body?: string | null
          channel: string
          created_at?: string
          fallback_channel?: string | null
          id?: string
          position?: number
          subject?: string | null
          template_id?: string | null
          wait_minutes?: number
          workflow_id: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          fallback_channel?: string | null
          id?: string
          position?: number
          subject?: string | null
          template_id?: string | null
          wait_minutes?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "campaign_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "campaign_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          link: string | null
          media_url: string | null
          name: string
          occasion: string
          product_id: string | null
          subject: string | null
          updated_at: string
          whatsapp_template_name: string | null
        }
        Insert: {
          body?: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          media_url?: string | null
          name: string
          occasion?: string
          product_id?: string | null
          subject?: string | null
          updated_at?: string
          whatsapp_template_name?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          media_url?: string | null
          name?: string
          occasion?: string
          product_id?: string | null
          subject?: string | null
          updated_at?: string
          whatsapp_template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_templates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_workflows: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          recurrence: string | null
          trigger_date: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          recurrence?: string | null
          trigger_date?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          recurrence?: string | null
          trigger_date?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_workflows_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachments: Json
          body: string
          cancel_reason: string | null
          channels: string[]
          created_at: string
          created_by: string | null
          fallback_channel: string | null
          filters: Json
          id: string
          link: string | null
          name: string
          objective: string | null
          occasion: string
          product_id: string | null
          quiet_end: string
          quiet_start: string
          recurring: boolean
          scheduled_at: string | null
          segment_id: string | null
          sender: string | null
          status: string
          subject: string | null
          timezone: string
          updated_at: string
          whatsapp_account_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachments?: Json
          body?: string
          cancel_reason?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          fallback_channel?: string | null
          filters?: Json
          id?: string
          link?: string | null
          name: string
          objective?: string | null
          occasion?: string
          product_id?: string | null
          quiet_end?: string
          quiet_start?: string
          recurring?: boolean
          scheduled_at?: string | null
          segment_id?: string | null
          sender?: string | null
          status?: string
          subject?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachments?: Json
          body?: string
          cancel_reason?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          fallback_channel?: string | null
          filters?: Json
          id?: string
          link?: string | null
          name?: string
          objective?: string | null
          occasion?: string
          product_id?: string | null
          quiet_end?: string
          quiet_start?: string
          recurring?: boolean
          scheduled_at?: string | null
          segment_id?: string | null
          sender?: string | null
          status?: string
          subject?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "campaign_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          id: string
          is_demo: boolean
          kind: string
          occurred_at: string
          order_id: string | null
          payment_method: string | null
          product_id: string | null
          register_id: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          id?: string
          is_demo?: boolean
          kind?: string
          occurred_at?: string
          order_id?: string | null
          payment_method?: string | null
          product_id?: string | null
          register_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          id?: string
          is_demo?: boolean
          kind?: string
          occurred_at?: string
          order_id?: string | null
          payment_method?: string | null
          product_id?: string | null
          register_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          is_demo: boolean
          name: string | null
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_amount: number
          product_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_demo?: boolean
          name?: string | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          product_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_demo?: boolean
          name?: string | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          product_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start?: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      catalogs: {
        Row: {
          category: string | null
          content_type: string
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          file_url: string | null
          id: string
          is_demo: boolean
          link_url: string | null
          product_id: string | null
          published_at: string | null
          status: string
          title: string
          updated_at: string
          version: string | null
        }
        Insert: {
          category?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          is_demo?: boolean
          link_url?: string | null
          product_id?: string | null
          published_at?: string | null
          status?: string
          title: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          category?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          is_demo?: boolean
          link_url?: string | null
          product_id?: string | null
          published_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      company_access_vault: {
        Row: {
          category: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          page_url: string | null
          secret_cipher: string | null
          team_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
          username: string | null
          viewers_can_edit: boolean
          viewers_can_reveal: boolean
          visibility_scope: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          page_url?: string | null
          secret_cipher?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          username?: string | null
          viewers_can_edit?: boolean
          viewers_can_reveal?: boolean
          visibility_scope?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          page_url?: string | null
          secret_cipher?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          username?: string | null
          viewers_can_edit?: boolean
          viewers_can_reveal?: boolean
          visibility_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_access_vault_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      company_access_vault_audit: {
        Row: {
          access_id: string | null
          action: string
          created_at: string
          id: number
          user_id: string | null
        }
        Insert: {
          access_id?: string | null
          action: string
          created_at?: string
          id?: never
          user_id?: string | null
        }
        Update: {
          access_id?: string | null
          action?: string
          created_at?: string
          id?: never
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_access_vault_audit_access_id_fkey"
            columns: ["access_id"]
            isOneToOne: false
            referencedRelation: "company_access_vault"
            referencedColumns: ["id"]
          },
        ]
      }
      company_access_vault_grants: {
        Row: {
          access_id: string
          can_edit: boolean
          can_reveal: boolean
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          access_id: string
          can_edit?: boolean
          can_reveal?: boolean
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          access_id?: string
          can_edit?: boolean
          can_reveal?: boolean
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_access_vault_grants_access_id_fkey"
            columns: ["access_id"]
            isOneToOne: false
            referencedRelation: "company_access_vault"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          base_currency: Database["public"]["Enums"]["currency_code"]
          brand_name: string | null
          catalog_url: string | null
          city: string | null
          country: string | null
          created_at: string
          document: string | null
          email: string | null
          exchange_markup_brl: number
          id: string
          invoice_notes: string | null
          legal_name: string | null
          logo_url: string | null
          phone: string | null
          phone_secondary: string | null
          state: string | null
          state_registration: string | null
          tagline: string | null
          tracking_retention_days: number
          updated_at: string
          website: string | null
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          base_currency?: Database["public"]["Enums"]["currency_code"]
          brand_name?: string | null
          catalog_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          exchange_markup_brl?: number
          id?: string
          invoice_notes?: string | null
          legal_name?: string | null
          logo_url?: string | null
          phone?: string | null
          phone_secondary?: string | null
          state?: string | null
          state_registration?: string | null
          tagline?: string | null
          tracking_retention_days?: number
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          base_currency?: Database["public"]["Enums"]["currency_code"]
          brand_name?: string | null
          catalog_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          exchange_markup_brl?: number
          id?: string
          invoice_notes?: string | null
          legal_name?: string | null
          logo_url?: string | null
          phone?: string | null
          phone_secondary?: string | null
          state?: string | null
          state_registration?: string | null
          tagline?: string | null
          tracking_retention_days?: number
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      contact_leads: {
        Row: {
          assigned_to: string | null
          city: string | null
          company: string | null
          created_at: string
          customer_product_id: string | null
          email: string | null
          id: string
          is_demo: boolean
          list_id: string
          name: string
          notes: string | null
          origin: string | null
          phone: string | null
          product_id: string | null
          sent_to_crm_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          customer_product_id?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          list_id: string
          name: string
          notes?: string | null
          origin?: string | null
          phone?: string | null
          product_id?: string | null
          sent_to_crm_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          customer_product_id?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          list_id?: string
          name?: string
          notes?: string | null
          origin?: string | null
          phone?: string | null
          product_id?: string | null
          sent_to_crm_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_leads_customer_product_id_fkey"
            columns: ["customer_product_id"]
            isOneToOne: false
            referencedRelation: "customer_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_leads_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_leads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_demo: boolean
          name: string
          product_id: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          name: string
          product_id?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          product_id?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_lists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_sheet_links: {
        Row: {
          created_at: string
          last_error: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          list_id: string
          sheet_tab: string
          spreadsheet_id: string
          spreadsheet_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          list_id: string
          sheet_tab: string
          spreadsheet_id: string
          spreadsheet_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          list_id?: string
          sheet_tab?: string
          spreadsheet_id?: string
          spreadsheet_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_sheet_links_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: true
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          role: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_accounts: {
        Row: {
          balance: number
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          id: string
          kind: string
          note: string
          order_id: string | null
          order_item_id: string | null
          payment_id: string | null
          reverses_entry_id: string | null
          short_quantity: number | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          id?: string
          kind: string
          note: string
          order_id?: string | null
          order_item_id?: string | null
          payment_id?: string | null
          reverses_entry_id?: string | null
          short_quantity?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string
          id?: string
          kind?: string
          note?: string
          order_id?: string | null
          order_item_id?: string | null
          payment_id?: string | null
          reverses_entry_id?: string | null
          short_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_entries_customer_id_currency_fkey"
            columns: ["customer_id", "currency"]
            isOneToOne: false
            referencedRelation: "customer_credit_accounts"
            referencedColumns: ["customer_id", "currency"]
          },
          {
            foreignKeyName: "customer_credit_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_entries_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: true
            referencedRelation: "customer_credit_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          created_at: string
          customer_id: string
          file_path: string | null
          file_url: string | null
          id: string
          product_id: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          file_path?: string | null
          file_url?: string | null
          id?: string
          product_id?: string | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          file_path?: string | null
          file_url?: string | null
          id?: string
          product_id?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_products: {
        Row: {
          ad: string | null
          assistant_id: string | null
          campaign: string | null
          channel: string | null
          commercial_status: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          entered_at: string
          id: string
          is_demo: boolean
          last_contact_at: string | null
          lead_origin: string | null
          loss_reason: string | null
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          owner_id: string | null
          pipeline_id: string | null
          potential_value: number | null
          probability: number | null
          product_id: string
          stage_id: string | null
          tags: string[]
          team_id: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          ad?: string | null
          assistant_id?: string | null
          campaign?: string | null
          channel?: string | null
          commercial_status?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          entered_at?: string
          id?: string
          is_demo?: boolean
          last_contact_at?: string | null
          lead_origin?: string | null
          loss_reason?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id?: string | null
          pipeline_id?: string | null
          potential_value?: number | null
          probability?: number | null
          product_id: string
          stage_id?: string | null
          tags?: string[]
          team_id?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          ad?: string | null
          assistant_id?: string | null
          campaign?: string | null
          channel?: string | null
          commercial_status?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string
          entered_at?: string
          id?: string
          is_demo?: boolean
          last_contact_at?: string | null
          lead_origin?: string | null
          loss_reason?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id?: string | null
          pipeline_id?: string | null
          potential_value?: number | null
          probability?: number | null
          product_id?: string
          stage_id?: string | null
          tags?: string[]
          team_id?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_products_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_products_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_products_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_products_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_products_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_products_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document: string | null
          email: string | null
          foreign_document: string | null
          gender: string | null
          id: string
          is_demo: boolean
          language: string | null
          name: string
          notes: string | null
          origin: string | null
          person_type: string
          phone: string | null
          state: string | null
          status: string
          tags: string[]
          trade_name: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          foreign_document?: string | null
          gender?: string | null
          id?: string
          is_demo?: boolean
          language?: string | null
          name: string
          notes?: string | null
          origin?: string | null
          person_type?: string
          phone?: string | null
          state?: string | null
          status?: string
          tags?: string[]
          trade_name?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          foreign_document?: string | null
          gender?: string | null
          id?: string
          is_demo?: boolean
          language?: string | null
          name?: string
          notes?: string | null
          origin?: string | null
          person_type?: string
          phone?: string | null
          state?: string | null
          status?: string
          tags?: string[]
          trade_name?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_region_leaders: {
        Row: {
          region: string
          updated_at: string
          user_id: string
        }
        Insert: {
          region: string
          updated_at?: string
          user_id: string
        }
        Update: {
          region?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_region_leaders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_events: {
        Row: {
          created_at: string
          created_by: string | null
          distance_remaining_km: number | null
          estimated_arrival_at: string | null
          happened_at: string
          id: string
          location: string | null
          notes: string | null
          order_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          distance_remaining_km?: number | null
          estimated_arrival_at?: string | null
          happened_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          order_id: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          distance_remaining_km?: number | null
          estimated_arrival_at?: string | null
          happened_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tracking_sessions: {
        Row: {
          consent_at: string | null
          created_at: string
          created_by: string | null
          device_id: string | null
          driver_id: string | null
          end_reason: string | null
          ended_at: string | null
          expires_at: string
          id: string
          order_id: string
          purpose: string
          source: string
          started_at: string | null
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          driver_id?: string | null
          end_reason?: string | null
          ended_at?: string | null
          expires_at: string
          id?: string
          order_id: string
          purpose?: string
          source: string
          started_at?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          driver_id?: string | null
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          order_id?: string
          purpose?: string
          source?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tracking_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "tracking_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_sessions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_catalogs: {
        Row: {
          about: string | null
          accent_color: string | null
          banner_url: string | null
          brands: string[]
          catalog_kind: string
          category_ids: string[]
          consult_label: string
          contact_address: string | null
          contact_email: string | null
          contact_phone: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          default_seller_id: string | null
          delivery_enabled: boolean
          description: string | null
          id: string
          installments_enabled: boolean
          installments_max: number
          is_demo: boolean
          is_published: boolean
          item_ids: string[]
          layout: string
          logo_url: string | null
          offer_item_ids: string[]
          orders_enabled: boolean
          payment_methods: string[]
          pickup_address: string | null
          pickup_enabled: boolean
          pricing_rules: Json | null
          primary_color: string | null
          product_ids: string[]
          require_identification: boolean
          shipping_days: number | null
          shipping_fee: number
          shipping_mode: string
          shipping_regions: Json
          show_availability: boolean
          show_prices: boolean
          slug: string
          sort_mode: string
          success_message: string | null
          title: string
          updated_at: string
          visible_member_ids: string[]
          visible_to_all_members: boolean
          whatsapp: string | null
        }
        Insert: {
          about?: string | null
          accent_color?: string | null
          banner_url?: string | null
          brands?: string[]
          catalog_kind?: string
          category_ids?: string[]
          consult_label?: string
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          default_seller_id?: string | null
          delivery_enabled?: boolean
          description?: string | null
          id?: string
          installments_enabled?: boolean
          installments_max?: number
          is_demo?: boolean
          is_published?: boolean
          item_ids?: string[]
          layout?: string
          logo_url?: string | null
          offer_item_ids?: string[]
          orders_enabled?: boolean
          payment_methods?: string[]
          pickup_address?: string | null
          pickup_enabled?: boolean
          pricing_rules?: Json | null
          primary_color?: string | null
          product_ids?: string[]
          require_identification?: boolean
          shipping_days?: number | null
          shipping_fee?: number
          shipping_mode?: string
          shipping_regions?: Json
          show_availability?: boolean
          show_prices?: boolean
          slug: string
          sort_mode?: string
          success_message?: string | null
          title: string
          updated_at?: string
          visible_member_ids?: string[]
          visible_to_all_members?: boolean
          whatsapp?: string | null
        }
        Update: {
          about?: string | null
          accent_color?: string | null
          banner_url?: string | null
          brands?: string[]
          catalog_kind?: string
          category_ids?: string[]
          consult_label?: string
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          default_seller_id?: string | null
          delivery_enabled?: boolean
          description?: string | null
          id?: string
          installments_enabled?: boolean
          installments_max?: number
          is_demo?: boolean
          is_published?: boolean
          item_ids?: string[]
          layout?: string
          logo_url?: string | null
          offer_item_ids?: string[]
          orders_enabled?: boolean
          payment_methods?: string[]
          pickup_address?: string | null
          pickup_enabled?: boolean
          pricing_rules?: Json | null
          primary_color?: string | null
          product_ids?: string[]
          require_identification?: boolean
          shipping_days?: number | null
          shipping_fee?: number
          shipping_mode?: string
          shipping_regions?: Json
          show_availability?: boolean
          show_prices?: boolean
          slug?: string
          sort_mode?: string
          success_message?: string | null
          title?: string
          updated_at?: string
          visible_member_ids?: string[]
          visible_to_all_members?: boolean
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_catalogs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_catalogs_default_seller_id_fkey"
            columns: ["default_seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_counters: {
        Row: {
          last_number: number
          scope: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          scope: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          base_currency: Database["public"]["Enums"]["currency_code"]
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          quote_currency: Database["public"]["Enums"]["currency_code"]
          rate: number
          safety_margin: number
          source: string
        }
        Insert: {
          base_currency: Database["public"]["Enums"]["currency_code"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          quote_currency: Database["public"]["Enums"]["currency_code"]
          rate: number
          safety_margin?: number
          source?: string
        }
        Update: {
          base_currency?: Database["public"]["Enums"]["currency_code"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          quote_currency?: Database["public"]["Enums"]["currency_code"]
          rate?: number
          safety_margin?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicles: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_active: boolean
          label: string | null
          model: string | null
          notes: string | null
          plate: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          model?: string | null
          notes?: string | null
          plate: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          model?: string | null
          notes?: string | null
          plate?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          access_token_encrypted: string
          created_at: string
          google_email: string | null
          last_error: string | null
          last_synced_at: string | null
          refresh_token_encrypted: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          created_at?: string
          google_email?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          created_at?: string
          google_email?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_events: {
        Row: {
          content_hash: string
          google_event_id: string
          last_synced_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          content_hash: string
          google_event_id: string
          last_synced_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          content_hash?: string
          google_event_id?: string
          last_synced_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          redirect_uri: string
          return_path: string | null
          service: string
          state: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          redirect_uri: string
          return_path?: string | null
          service?: string
          state: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          return_path?: string | null
          service?: string
          state?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      google_sheets_connections: {
        Row: {
          access_token_encrypted: string
          created_at: string
          google_email: string | null
          last_error: string | null
          last_synced_at: string | null
          refresh_token_encrypted: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          created_at?: string
          google_email?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          created_at?: string
          google_email?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          applied_at: string | null
          apply_markup: boolean
          base_currency: Database["public"]["Enums"]["currency_code"]
          content_hash: string
          counts: Json
          created_at: string
          created_by: string | null
          id: string
          list_currency: Database["public"]["Enums"]["currency_code"]
          notes: string | null
          qty_mode: string
          rates: Json
          reverted_at: string | null
          reverted_by: string | null
          source: string
          status: string
          supplier_id: string
          updated_at: string
          value_target: string
        }
        Insert: {
          applied_at?: string | null
          apply_markup?: boolean
          base_currency: Database["public"]["Enums"]["currency_code"]
          content_hash: string
          counts?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          list_currency: Database["public"]["Enums"]["currency_code"]
          notes?: string | null
          qty_mode: string
          rates?: Json
          reverted_at?: string | null
          reverted_by?: string | null
          source?: string
          status?: string
          supplier_id: string
          updated_at?: string
          value_target: string
        }
        Update: {
          applied_at?: string | null
          apply_markup?: boolean
          base_currency?: Database["public"]["Enums"]["currency_code"]
          content_hash?: string
          counts?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          list_currency?: Database["public"]["Enums"]["currency_code"]
          notes?: string | null
          qty_mode?: string
          rates?: Json
          reverted_at?: string | null
          reverted_by?: string | null
          source?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          value_target?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          batch_id: string
          created_at: string
          description: string | null
          id: string
          inventory_item_id: string | null
          line_no: number
          new_price: number | null
          new_qty: number | null
          new_value: number | null
          old_price: number | null
          old_qty: number | null
          old_value: number | null
          qty: number | null
          raw_text: string | null
          state: string
          supplier_code: string | null
          unit: string | null
          value: number | null
          value_converted: number | null
          warning: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          description?: string | null
          id?: string
          inventory_item_id?: string | null
          line_no: number
          new_price?: number | null
          new_qty?: number | null
          new_value?: number | null
          old_price?: number | null
          old_qty?: number | null
          old_value?: number | null
          qty?: number | null
          raw_text?: string | null
          state?: string
          supplier_code?: string | null
          unit?: string | null
          value?: number | null
          value_converted?: number | null
          warning?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          description?: string | null
          id?: string
          inventory_item_id?: string | null
          line_no?: number
          new_price?: number | null
          new_qty?: number | null
          new_value?: number | null
          old_price?: number | null
          old_qty?: number | null
          old_value?: number | null
          qty?: number | null
          raw_text?: string | null
          state?: string
          supplier_code?: string | null
          unit?: string | null
          value?: number | null
          value_converted?: number | null
          warning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      integral_division_access: {
        Row: {
          can_view: boolean
          can_write: boolean
          created_at: string
          id: string
          municipality_ibge_id: number | null
          own_records_only: boolean
          product_id: string | null
          region_code: string | null
          system_code: string
          territory_uf: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          can_view?: boolean
          can_write?: boolean
          created_at?: string
          id?: string
          municipality_ibge_id?: number | null
          own_records_only?: boolean
          product_id?: string | null
          region_code?: string | null
          system_code: string
          territory_uf?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          can_view?: boolean
          can_write?: boolean
          created_at?: string
          id?: string
          municipality_ibge_id?: number | null
          own_records_only?: boolean
          product_id?: string | null
          region_code?: string | null
          system_code?: string
          territory_uf?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integral_division_access_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integral_division_access_system_code_fkey"
            columns: ["system_code"]
            isOneToOne: false
            referencedRelation: "integral_system_connections"
            referencedColumns: ["code"]
          },
        ]
      }
      integral_member_rules: {
        Row: {
          excluded_category_ids: string[]
          excluded_item_ids: string[]
          general_access: boolean | null
          inherit_new_products: boolean
          permission_overrides: Json
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          excluded_category_ids?: string[]
          excluded_item_ids?: string[]
          general_access?: boolean | null
          inherit_new_products?: boolean
          permission_overrides?: Json
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          excluded_category_ids?: string[]
          excluded_item_ids?: string[]
          general_access?: boolean | null
          inherit_new_products?: boolean
          permission_overrides?: Json
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integral_member_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integral_member_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integral_public_leads: {
        Row: {
          audience: string
          consent_at: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          origin: string
          phone: string
          quantity: number
          status: string
          territory_id: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          audience: string
          consent_at: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          origin?: string
          phone: string
          quantity: number
          status?: string
          territory_id: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          audience?: string
          consent_at?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          origin?: string
          phone?: string
          quantity?: number
          status?: string
          territory_id?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integral_public_leads_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "integral_territory_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      integral_sos_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          target_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          target_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          target_id?: string
        }
        Relationships: []
      }
      integral_sync_log: {
        Row: {
          canonical_id: string | null
          created_at: string
          entity_type: string
          error_message: string | null
          external_event_id: string
          id: string
          source_code: string
          status: string
          updated_at: string
        }
        Insert: {
          canonical_id?: string | null
          created_at?: string
          entity_type: string
          error_message?: string | null
          external_event_id: string
          id?: string
          source_code: string
          status: string
          updated_at?: string
        }
        Update: {
          canonical_id?: string | null
          created_at?: string
          entity_type?: string
          error_message?: string | null
          external_event_id?: string
          id?: string
          source_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      integral_system_connections: {
        Row: {
          active: boolean
          base_url: string
          code: string
          created_at: string
          name: string
          token_hash: string | null
          token_rotated_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_url: string
          code: string
          created_at?: string
          name: string
          token_hash?: string | null
          token_rotated_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_url?: string
          code?: string
          created_at?: string
          name?: string
          token_hash?: string | null
          token_rotated_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integral_territory_candidates: {
        Row: {
          created_at: string
          id: string
          municipality_ibge_id: number
          municipality_name: string
          region_code: string
          state_code: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          municipality_ibge_id: number
          municipality_name: string
          region_code: string
          state_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          municipality_ibge_id?: number
          municipality_name?: string
          region_code?: string
          state_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      internal_conversation_members: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          muted: boolean
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          muted?: boolean
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          muted?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "internal_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_conversations: {
        Row: {
          conversation_type: string
          created_at: string
          created_by: string | null
          id: string
          is_auto: boolean
          name: string | null
          product_id: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto?: boolean
          name?: string | null
          product_id?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto?: boolean
          name?: string | null
          product_id?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "internal_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          pinned: boolean
          reply_to: string | null
          sender_id: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          pinned?: boolean
          reply_to?: string | null
          sender_id?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          pinned?: boolean
          reply_to?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "internal_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "internal_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notices: {
        Row: {
          allow_comments: boolean
          archived: boolean
          author_id: string | null
          content: string
          created_at: string
          expires_at: string | null
          id: string
          image_url: string | null
          is_demo: boolean
          is_pinned: boolean
          is_urgent: boolean
          priority: string
          product_id: string | null
          publish_at: string
          require_read_receipt: boolean
          show_on_login: boolean
          target_role: Database["public"]["Enums"]["app_role"] | null
          target_systems: string[]
          team_id: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          allow_comments?: boolean
          archived?: boolean
          author_id?: string | null
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          is_pinned?: boolean
          is_urgent?: boolean
          priority?: string
          product_id?: string | null
          publish_at?: string
          require_read_receipt?: boolean
          show_on_login?: boolean
          target_role?: Database["public"]["Enums"]["app_role"] | null
          target_systems?: string[]
          team_id?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          allow_comments?: boolean
          archived?: boolean
          author_id?: string | null
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          is_pinned?: boolean
          is_urgent?: boolean
          priority?: string
          product_id?: string | null
          publish_at?: string
          require_read_receipt?: boolean
          show_on_login?: boolean
          target_role?: Database["public"]["Enums"]["app_role"] | null
          target_systems?: string[]
          team_id?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_notices_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notices_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_locations: {
        Row: {
          created_at: string
          item_id: string
          location: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          item_id: string
          location?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          item_id?: string
          location?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_locations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_users: {
        Row: {
          created_at: string
          created_by: string | null
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_users_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          barcode: string | null
          brand: string | null
          catalog_bestseller: boolean
          catalog_family: string | null
          category_id: string | null
          commission_percent: number
          cost: number | null
          cost_currency: Database["public"]["Enums"]["currency_code"] | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          extra_cost: number
          freight_other_brazil_percent: number
          freight_py_percent: number
          freight_sp_percent: number
          id: string
          image_url: string | null
          information_source_url: string | null
          intended_use: string | null
          is_active: boolean
          is_demo: boolean
          location: string | null
          markup_percent: number
          max_discount_percent: number
          min_quantity: number
          name: string
          price: number | null
          price_currency: Database["public"]["Enums"]["currency_code"] | null
          product_id: string | null
          public_description: string | null
          quantity: number
          reserved: number
          size: string | null
          sku: string | null
          supplier_id: string | null
          tax_percent: number
          unit: string | null
          updated_at: string
          usage_instructions: string | null
          variation: string | null
          volume: string | null
          weight: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          catalog_bestseller?: boolean
          catalog_family?: string | null
          category_id?: string | null
          commission_percent?: number
          cost?: number | null
          cost_currency?: Database["public"]["Enums"]["currency_code"] | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          extra_cost?: number
          freight_other_brazil_percent?: number
          freight_py_percent?: number
          freight_sp_percent?: number
          id?: string
          image_url?: string | null
          information_source_url?: string | null
          intended_use?: string | null
          is_active?: boolean
          is_demo?: boolean
          location?: string | null
          markup_percent?: number
          max_discount_percent?: number
          min_quantity?: number
          name: string
          price?: number | null
          price_currency?: Database["public"]["Enums"]["currency_code"] | null
          product_id?: string | null
          public_description?: string | null
          quantity?: number
          reserved?: number
          size?: string | null
          sku?: string | null
          supplier_id?: string | null
          tax_percent?: number
          unit?: string | null
          updated_at?: string
          usage_instructions?: string | null
          variation?: string | null
          volume?: string | null
          weight?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          catalog_bestseller?: boolean
          catalog_family?: string | null
          category_id?: string | null
          commission_percent?: number
          cost?: number | null
          cost_currency?: Database["public"]["Enums"]["currency_code"] | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          extra_cost?: number
          freight_other_brazil_percent?: number
          freight_py_percent?: number
          freight_sp_percent?: number
          id?: string
          image_url?: string | null
          information_source_url?: string | null
          intended_use?: string | null
          is_active?: boolean
          is_demo?: boolean
          location?: string | null
          markup_percent?: number
          max_discount_percent?: number
          min_quantity?: number
          name?: string
          price?: number | null
          price_currency?: Database["public"]["Enums"]["currency_code"] | null
          product_id?: string | null
          public_description?: string | null
          quantity?: number
          reserved?: number
          size?: string | null
          sku?: string | null
          supplier_id?: string | null
          tax_percent?: number
          unit?: string | null
          updated_at?: string
          usage_instructions?: string | null
          variation?: string | null
          volume?: string | null
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          bonus_quantity: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"] | null
          document_id: string | null
          document_number: number | null
          document_type: string | null
          freight_cost: number
          id: string
          item_id: string
          movement_type: string
          payable_id: string | null
          quantity: number
          reason: string | null
          source_warehouse_id: string | null
          target_warehouse_id: string | null
          total_cost: number
          unit_cost: number | null
          user_id: string | null
          variable_cost: number
        }
        Insert: {
          bonus_quantity?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"] | null
          document_id?: string | null
          document_number?: number | null
          document_type?: string | null
          freight_cost?: number
          id?: string
          item_id: string
          movement_type: string
          payable_id?: string | null
          quantity: number
          reason?: string | null
          source_warehouse_id?: string | null
          target_warehouse_id?: string | null
          total_cost?: number
          unit_cost?: number | null
          user_id?: string | null
          variable_cost?: number
        }
        Update: {
          bonus_quantity?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"] | null
          document_id?: string | null
          document_number?: number | null
          document_type?: string | null
          freight_cost?: number
          id?: string
          item_id?: string
          movement_type?: string
          payable_id?: string | null
          quantity?: number
          reason?: string | null
          source_warehouse_id?: string | null
          target_warehouse_id?: string | null
          total_cost?: number
          unit_cost?: number | null
          user_id?: string | null
          variable_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_target_warehouse_id_fkey"
            columns: ["target_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_price_history: {
        Row: {
          batch_id: string | null
          changed_by: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"] | null
          field: string
          id: string
          item_id: string
          list_currency: Database["public"]["Enums"]["currency_code"] | null
          new_value: number | null
          old_value: number | null
          rate_used: number | null
          source: string
        }
        Insert: {
          batch_id?: string | null
          changed_by?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"] | null
          field: string
          id?: string
          item_id: string
          list_currency?: Database["public"]["Enums"]["currency_code"] | null
          new_value?: number | null
          old_value?: number | null
          rate_used?: number | null
          source?: string
        }
        Update: {
          batch_id?: string | null
          changed_by?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"] | null
          field?: string
          id?: string
          item_id?: string
          list_currency?: Database["public"]["Enums"]["currency_code"] | null
          new_value?: number | null
          old_value?: number | null
          rate_used?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_price_history_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_price_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          amount: number
          annual_rate: number | null
          asset_type: string
          category: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          expected_return: number | null
          id: string
          invested_at: string
          is_demo: boolean
          name: string
          notes: string | null
          owner_id: string
          product_id: string | null
          quantity: number | null
          realized_return: number | null
          scope: string
          status: string
          symbol: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          annual_rate?: number | null
          asset_type?: string
          category?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          expected_return?: number | null
          id?: string
          invested_at?: string
          is_demo?: boolean
          name: string
          notes?: string | null
          owner_id: string
          product_id?: string | null
          quantity?: number | null
          realized_return?: number | null
          scope?: string
          status?: string
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          annual_rate?: number | null
          asset_type?: string
          category?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          expected_return?: number | null
          id?: string
          invested_at?: string
          is_demo?: boolean
          name?: string
          notes?: string | null
          owner_id?: string
          product_id?: string | null
          quantity?: number | null
          realized_return?: number | null
          scope?: string
          status?: string
          symbol?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      job_levels: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          rank: number
          system_key: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          rank?: number
          system_key?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          rank?: number
          system_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_role_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          job_level_id: string | null
          job_role_id: string
          permission_key: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          id?: string
          job_level_id?: string | null
          job_role_id: string
          permission_key: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          job_level_id?: string | null
          job_role_id?: string
          permission_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_role_permissions_job_level_id_fkey"
            columns: ["job_level_id"]
            isOneToOne: false
            referencedRelation: "job_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_role_permissions_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["key"]
          },
        ]
      }
      job_roles: {
        Row: {
          active: boolean
          allows_multiple_occupants: boolean
          area_id: string
          created_at: string
          description: string | null
          engagement_type: string
          functional_reports_to_role_id: string | null
          hierarchical_rank: number
          id: string
          is_corporate: boolean
          leadership: boolean
          name: string
          occupancy_status: string | null
          organization_tier: string
          planned_headcount: number
          recommendation_dismissed_by: string | null
          recommendation_dismissed_until: string | null
          recommendation_generated_at: string | null
          recommendation_status: string
          reports_to_role_id: string | null
          responsibilities: string | null
          system_key: string | null
          trigger_exceeded_since: string | null
          trigger_manual_value: number | null
          trigger_metric: string | null
          trigger_threshold: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allows_multiple_occupants?: boolean
          area_id: string
          created_at?: string
          description?: string | null
          engagement_type?: string
          functional_reports_to_role_id?: string | null
          hierarchical_rank?: number
          id?: string
          is_corporate?: boolean
          leadership?: boolean
          name: string
          occupancy_status?: string | null
          organization_tier?: string
          planned_headcount?: number
          recommendation_dismissed_by?: string | null
          recommendation_dismissed_until?: string | null
          recommendation_generated_at?: string | null
          recommendation_status?: string
          reports_to_role_id?: string | null
          responsibilities?: string | null
          system_key?: string | null
          trigger_exceeded_since?: string | null
          trigger_manual_value?: number | null
          trigger_metric?: string | null
          trigger_threshold?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allows_multiple_occupants?: boolean
          area_id?: string
          created_at?: string
          description?: string | null
          engagement_type?: string
          functional_reports_to_role_id?: string | null
          hierarchical_rank?: number
          id?: string
          is_corporate?: boolean
          leadership?: boolean
          name?: string
          occupancy_status?: string | null
          organization_tier?: string
          planned_headcount?: number
          recommendation_dismissed_by?: string | null
          recommendation_dismissed_until?: string | null
          recommendation_generated_at?: string | null
          recommendation_status?: string
          reports_to_role_id?: string | null
          responsibilities?: string | null
          system_key?: string | null
          trigger_exceeded_since?: string | null
          trigger_manual_value?: number | null
          trigger_metric?: string | null
          trigger_threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_roles_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "organization_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_roles_functional_reports_to_role_id_fkey"
            columns: ["functional_reports_to_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_roles_recommendation_dismissed_by_fkey"
            columns: ["recommendation_dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_roles_reports_to_role_id_fkey"
            columns: ["reports_to_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_watchlist: {
        Row: {
          created_at: string
          created_by: string | null
          decimals: number
          id: string
          kind: string
          label: string
          position: number
          symbol: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decimals?: number
          id?: string
          kind?: string
          label: string
          position?: number
          symbol: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decimals?: number
          id?: string
          kind?: string
          label?: string
          position?: number
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_watchlist_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_compensations: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          comp_type: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          is_demo: boolean
          item_id: string | null
          label: string | null
          notes: string | null
          period: string
          product_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount?: number
          category_id?: string | null
          comp_type?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_demo?: boolean
          item_id?: string | null
          label?: string | null
          notes?: string | null
          period?: string
          product_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          category_id?: string | null
          comp_type?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_demo?: boolean
          item_id?: string | null
          label?: string | null
          notes?: string | null
          period?: string
          product_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_compensations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_compensations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_compensations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_compensations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_job_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          employment_type: string
          end_date: string | null
          id: string
          is_primary: boolean
          job_level_id: string | null
          job_role_id: string
          manager_user_id: string | null
          notes: string | null
          start_date: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employment_type?: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          job_level_id?: string | null
          job_role_id: string
          manager_user_id?: string | null
          notes?: string | null
          start_date?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employment_type?: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          job_level_id?: string | null
          job_role_id?: string
          manager_user_id?: string | null
          notes?: string | null
          start_date?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_job_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_job_assignments_job_level_id_fkey"
            columns: ["job_level_id"]
            isOneToOne: false
            referencedRelation: "job_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_job_assignments_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_job_assignments_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_job_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attempts: {
        Row: {
          attempt_no: number
          created_at: string
          error: string | null
          id: string
          job_id: string
          provider_response: Json | null
          status: string
        }
        Insert: {
          attempt_no?: number
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          provider_response?: Json | null
          status: string
        }
        Update: {
          attempt_no?: number
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          provider_response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "message_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      message_consents: {
        Row: {
          channel: string
          consented_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          evidence: string | null
          id: string
          legal_basis: string | null
          revoked_at: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel: string
          consented_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          evidence?: string | null
          id?: string
          legal_basis?: string | null
          revoked_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          consented_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          evidence?: string | null
          id?: string
          legal_basis?: string | null
          revoked_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_consents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_jobs: {
        Row: {
          attempts: number
          body: string
          campaign_id: string
          channel: string
          created_at: string
          delivered_at: string | null
          error: string | null
          id: string
          idempotency_key: string
          lease_until: string | null
          locked_by: string | null
          media_mime: string | null
          media_path: string | null
          media_url: string | null
          next_attempt_at: string | null
          provider: string | null
          provider_message_id: string | null
          read_at: string | null
          recipient_id: string | null
          replied_at: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          step_id: string | null
          step_no: number
          subject: string | null
          template_lang: string | null
          template_name: string | null
          template_vars: Json
          to_address: string
          updated_at: string
          whatsapp_account_id: string | null
        }
        Insert: {
          attempts?: number
          body?: string
          campaign_id: string
          channel: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          idempotency_key: string
          lease_until?: string | null
          locked_by?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_url?: string | null
          next_attempt_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          recipient_id?: string | null
          replied_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          step_id?: string | null
          step_no?: number
          subject?: string | null
          template_lang?: string | null
          template_name?: string | null
          template_vars?: Json
          to_address: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          campaign_id?: string
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string
          lease_until?: string | null
          locked_by?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_url?: string | null
          next_attempt_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          recipient_id?: string | null
          replied_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          step_id?: string | null
          step_no?: number
          subject?: string | null
          template_lang?: string | null
          template_name?: string | null
          template_vars?: Json
          to_address?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "campaign_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_suppression: {
        Row: {
          address: string
          channel: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          reason: string | null
        }
        Insert: {
          address: string
          channel: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          address?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_suppression_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_suppression_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_webhook_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          provider: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          provider: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          provider?: string
        }
        Relationships: []
      }
      meta_ad_account_products: {
        Row: {
          created_at: string
          id: string
          meta_ad_account_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta_ad_account_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meta_ad_account_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_account_products_meta_ad_account_id_fkey"
            columns: ["meta_ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_account_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          account_status: number | null
          ad_account_id: string
          business_id: string | null
          business_name: string | null
          connection_id: string
          created_at: string
          currency: string | null
          dataset_id: string | null
          dataset_name: string | null
          id: string
          is_active: boolean
          last_sync_message: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          name: string | null
          timezone_name: string | null
          updated_at: string
        }
        Insert: {
          account_status?: number | null
          ad_account_id: string
          business_id?: string | null
          business_name?: string | null
          connection_id: string
          created_at?: string
          currency?: string | null
          dataset_id?: string | null
          dataset_name?: string | null
          id?: string
          is_active?: boolean
          last_sync_message?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          name?: string | null
          timezone_name?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: number | null
          ad_account_id?: string
          business_id?: string | null
          business_name?: string | null
          connection_id?: string
          created_at?: string
          currency?: string | null
          dataset_id?: string | null
          dataset_name?: string | null
          id?: string
          is_active?: boolean
          last_sync_message?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          name?: string | null
          timezone_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          access_token_encrypted: string | null
          connected_by: string | null
          created_at: string
          id: string
          last_error: string | null
          last_verified_at: string | null
          meta_user_id: string
          meta_user_name: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          meta_user_id: string
          meta_user_name?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          meta_user_id?: string
          meta_user_name?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_conversion_events: {
        Row: {
          created_at: string
          customer_product_id: string
          dataset_id: string | null
          error: string | null
          event_id: string
          event_name: string
          id: string
          response: Json | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_product_id: string
          dataset_id?: string | null
          error?: string | null
          event_id: string
          event_name?: string
          id?: string
          response?: Json | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_product_id?: string
          dataset_id?: string | null
          error?: string | null
          event_id?: string
          event_name?: string
          id?: string
          response?: Json | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_conversion_events_customer_product_id_fkey"
            columns: ["customer_product_id"]
            isOneToOne: false
            referencedRelation: "customer_products"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_integrations: {
        Row: {
          ad_account_id: string | null
          app_id: string | null
          business_account_name: string | null
          created_at: string
          demo_mode: boolean
          facebook_page_id: string | null
          id: string
          instagram_account_id: string | null
          product_id: string | null
          status: string
          updated_at: string
          verify_token: string | null
          webhook_url: string | null
        }
        Insert: {
          ad_account_id?: string | null
          app_id?: string | null
          business_account_name?: string | null
          created_at?: string
          demo_mode?: boolean
          facebook_page_id?: string | null
          id?: string
          instagram_account_id?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string
          verify_token?: string | null
          webhook_url?: string | null
        }
        Update: {
          ad_account_id?: string | null
          app_id?: string | null
          business_account_name?: string | null
          created_at?: string
          demo_mode?: boolean
          facebook_page_id?: string | null
          id?: string
          instagram_account_id?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string
          verify_token?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_integrations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          redirect_uri: string
          return_path: string | null
          state: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          redirect_uri: string
          return_path?: string | null
          state: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          return_path?: string | null
          state?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meta_sync_logs: {
        Row: {
          connection_id: string | null
          created_at: string
          date_start: string | null
          date_stop: string | null
          finished_at: string | null
          id: string
          kind: string
          message: string | null
          meta_ad_account_id: string | null
          rows_upserted: number
          started_at: string
          status: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          date_start?: string | null
          date_stop?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          meta_ad_account_id?: string | null
          rows_upserted?: number
          started_at?: string
          status?: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          date_start?: string | null
          date_stop?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          meta_ad_account_id?: string | null
          rows_upserted?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_sync_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_sync_logs_meta_ad_account_id_fkey"
            columns: ["meta_ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_reads: {
        Row: {
          id: string
          notice_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notice_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notice_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_reads_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "internal_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_recipients: {
        Row: {
          created_at: string
          id: string
          notice_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notice_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notice_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_recipients_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "internal_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          notification_type: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          notification_type?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          notification_type?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_materials: {
        Row: {
          audience: string
          created_at: string
          created_by: string
          description: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          published_at: string | null
          status: string
          storage_path: string
          title: string
        }
        Insert: {
          audience: string
          created_at?: string
          created_by: string
          description?: string
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          published_at?: string | null
          status?: string
          storage_path: string
          title: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string
          description?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          published_at?: string | null
          status?: string
          storage_path?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_history: {
        Row: {
          created_at: string
          customer_product_id: string
          description: string | null
          event_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_product_id: string
          description?: string | null
          event_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_product_id?: string
          description?: string | null
          event_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_history_customer_product_id_fkey"
            columns: ["customer_product_id"]
            isOneToOne: false
            referencedRelation: "customer_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_audit_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          new_order_id: string | null
          new_snapshot: Json | null
          note: string | null
          order_id: string
          previous_snapshot: Json | null
          revision_no: number
          root_order_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_order_id?: string | null
          new_snapshot?: Json | null
          note?: string | null
          order_id: string
          previous_snapshot?: Json | null
          revision_no?: number
          root_order_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_order_id?: string | null
          new_snapshot?: Json | null
          note?: string | null
          order_id?: string
          previous_snapshot?: Json | null
          revision_no?: number
          root_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_log_new_order_id_fkey"
            columns: ["new_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_log_new_order_id_fkey"
            columns: ["new_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_log_root_order_id_fkey"
            columns: ["root_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_log_root_order_id_fkey"
            columns: ["root_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_cancellation_requests: {
        Row: {
          disposition: string | null
          id: string
          order_id: string
          reason: string
          requested_at: string
          requested_by: string
          return_warehouse_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          disposition?: string | null
          id?: string
          order_id: string
          reason: string
          requested_at?: string
          requested_by: string
          return_warehouse_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          disposition?: string | null
          id?: string
          order_id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          return_warehouse_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_cancellation_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cancellation_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cancellation_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cancellation_requests_return_warehouse_id_fkey"
            columns: ["return_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cancellation_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_change_requests: {
        Row: {
          created_at: string
          id: string
          order_id: string
          previous_snapshot: Json
          proposed_args: Json
          proposed_exchange: Json | null
          proposed_followup: Json
          reason: string
          request_id: string
          requested_by: string
          resulting_order_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          previous_snapshot: Json
          proposed_args: Json
          proposed_exchange?: Json | null
          proposed_followup: Json
          reason: string
          request_id: string
          requested_by: string
          resulting_order_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          previous_snapshot?: Json
          proposed_args?: Json
          proposed_exchange?: Json | null
          proposed_followup?: Json
          reason?: string
          request_id?: string
          requested_by?: string
          resulting_order_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_change_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_change_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_change_requests_resulting_order_id_fkey"
            columns: ["resulting_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_change_requests_resulting_order_id_fkey"
            columns: ["resulting_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_delivery_private: {
        Row: {
          created_at: string
          order_id: string
          tracking_location: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          order_id: string
          tracking_location?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          order_id?: string
          tracking_location?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_delivery_private_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_delivery_private_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          barcode: string | null
          commission_amount: number
          commission_enabled: boolean
          commission_percent: number
          created_at: string
          description: string
          discount: number
          id: string
          item_id: string | null
          max_discount_percent: number
          order_id: string
          quantity: number
          sku: string | null
          total: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          barcode?: string | null
          commission_amount?: number
          commission_enabled?: boolean
          commission_percent?: number
          created_at?: string
          description: string
          discount?: number
          id?: string
          item_id?: string | null
          max_discount_percent?: number
          order_id: string
          quantity?: number
          sku?: string | null
          total?: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          barcode?: string | null
          commission_amount?: number
          commission_enabled?: boolean
          commission_percent?: number
          created_at?: string
          description?: string
          discount?: number
          id?: string
          item_id?: string | null
          max_discount_percent?: number
          order_id?: string
          quantity?: number
          sku?: string | null
          total?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_loss_resolutions: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"]
          freight_cost: number
          merchandise_cost: number
          order_id: string
          recorded_at: string
          recorded_by: string | null
          replacement_order_id: string | null
          resolution: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          currency: Database["public"]["Enums"]["currency_code"]
          freight_cost?: number
          merchandise_cost?: number
          order_id: string
          recorded_at?: string
          recorded_by?: string | null
          replacement_order_id?: string | null
          resolution?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"]
          freight_cost?: number
          merchandise_cost?: number
          order_id?: string
          recorded_at?: string
          recorded_by?: string | null
          replacement_order_id?: string | null
          resolution?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_loss_resolutions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_loss_resolutions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_loss_resolutions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_loss_resolutions_replacement_order_id_fkey"
            columns: ["replacement_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_loss_resolutions_replacement_order_id_fkey"
            columns: ["replacement_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_loss_resolutions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payment_proofs: {
        Row: {
          created_at: string
          external_url: string | null
          file_name: string | null
          file_path: string | null
          id: string
          mime_type: string | null
          order_id: string
          payment_id: string | null
          proof_type: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          order_id: string
          payment_id?: string | null
          proof_type?: string
          uploaded_by?: string
        }
        Update: {
          created_at?: string
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          order_id?: string
          payment_id?: string | null
          proof_type?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payment_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_proofs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_proofs_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid: number
          amount_receivable: number
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          bonus_amount: number
          bonus_percent: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          carrier: string | null
          catalog_id: string | null
          catalog_slug: string | null
          commission_enabled: boolean
          commission_total: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string | null
          customer_resolution: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery: Json | null
          delivery_deadline: string | null
          delivery_issue: string | null
          delivery_recipient_document: string | null
          delivery_recipient_name: string | null
          delivery_token: string
          discount: number
          exchange_rate: number | null
          exchange_rate_locked_at: string | null
          exchange_rate_source: string | null
          exchange_rates_snapshot: Json | null
          financial_closed_at: string | null
          financial_closed_by: string | null
          fulfillment_status: string
          grace_days: number
          gross_margin: number
          id: string
          idempotency_key: string | null
          integration_external_id: string | null
          integration_source: string | null
          is_demo: boolean
          kind: string
          merchandise_cost: number
          notes: string | null
          number: number
          order_date: string
          origin: string | null
          payment_installments: string | null
          payment_method: string | null
          payment_status: string
          previous_order_id: string | null
          product_id: string | null
          quote_id: string | null
          replacement_for_order_id: string | null
          return_warehouse_id: string | null
          review_outcome: string | null
          revision_no: number
          root_order_id: string | null
          seller_id: string | null
          share_token: string
          shipping_address: string | null
          shipping_address_number: string | null
          shipping_cep: string | null
          shipping_city: string | null
          shipping_cost: number
          shipping_country: string | null
          shipping_fee: number
          shipping_percentage: number | null
          shipping_state: string | null
          source_month: string | null
          source_payload: Json
          source_reference: string | null
          status: string
          stock_consumed_at: string | null
          stock_state: string
          superseded_at: string | null
          superseded_by: string | null
          superseded_by_order_id: string | null
          supplier_id: string | null
          total: number
          total_cost_brl: number
          total_cost_usd: number
          tracking_code: string | null
          tracking_enabled: boolean
          tracking_location: string | null
          tracking_status: string | null
          tracking_url: string | null
          transport_cost: number | null
          transport_cost_order_amount: number | null
          transport_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          updated_at: string
          variable_cost: number
          warehouse_id: string | null
          whatsapp: string | null
          workflow_stage: string
        }
        Insert: {
          amount_paid?: number
          amount_receivable?: number
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bonus_amount?: number
          bonus_percent?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          carrier?: string | null
          catalog_id?: string | null
          catalog_slug?: string | null
          commission_enabled?: boolean
          commission_total?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          customer_resolution?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery?: Json | null
          delivery_deadline?: string | null
          delivery_issue?: string | null
          delivery_recipient_document?: string | null
          delivery_recipient_name?: string | null
          delivery_token?: string
          discount?: number
          exchange_rate?: number | null
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          financial_closed_at?: string | null
          financial_closed_by?: string | null
          fulfillment_status?: string
          grace_days?: number
          gross_margin?: number
          id?: string
          idempotency_key?: string | null
          integration_external_id?: string | null
          integration_source?: string | null
          is_demo?: boolean
          kind?: string
          merchandise_cost?: number
          notes?: string | null
          number?: number
          order_date?: string
          origin?: string | null
          payment_installments?: string | null
          payment_method?: string | null
          payment_status?: string
          previous_order_id?: string | null
          product_id?: string | null
          quote_id?: string | null
          replacement_for_order_id?: string | null
          return_warehouse_id?: string | null
          review_outcome?: string | null
          revision_no?: number
          root_order_id?: string | null
          seller_id?: string | null
          share_token?: string
          shipping_address?: string | null
          shipping_address_number?: string | null
          shipping_cep?: string | null
          shipping_city?: string | null
          shipping_cost?: number
          shipping_country?: string | null
          shipping_fee?: number
          shipping_percentage?: number | null
          shipping_state?: string | null
          source_month?: string | null
          source_payload?: Json
          source_reference?: string | null
          status?: string
          stock_consumed_at?: string | null
          stock_state?: string
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_order_id?: string | null
          supplier_id?: string | null
          total?: number
          total_cost_brl?: number
          total_cost_usd?: number
          tracking_code?: string | null
          tracking_enabled?: boolean
          tracking_location?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          transport_cost?: number | null
          transport_cost_order_amount?: number | null
          transport_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          updated_at?: string
          variable_cost?: number
          warehouse_id?: string | null
          whatsapp?: string | null
          workflow_stage?: string
        }
        Update: {
          amount_paid?: number
          amount_receivable?: number
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bonus_amount?: number
          bonus_percent?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          carrier?: string | null
          catalog_id?: string | null
          catalog_slug?: string | null
          commission_enabled?: boolean
          commission_total?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          customer_resolution?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery?: Json | null
          delivery_deadline?: string | null
          delivery_issue?: string | null
          delivery_recipient_document?: string | null
          delivery_recipient_name?: string | null
          delivery_token?: string
          discount?: number
          exchange_rate?: number | null
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          financial_closed_at?: string | null
          financial_closed_by?: string | null
          fulfillment_status?: string
          grace_days?: number
          gross_margin?: number
          id?: string
          idempotency_key?: string | null
          integration_external_id?: string | null
          integration_source?: string | null
          is_demo?: boolean
          kind?: string
          merchandise_cost?: number
          notes?: string | null
          number?: number
          order_date?: string
          origin?: string | null
          payment_installments?: string | null
          payment_method?: string | null
          payment_status?: string
          previous_order_id?: string | null
          product_id?: string | null
          quote_id?: string | null
          replacement_for_order_id?: string | null
          return_warehouse_id?: string | null
          review_outcome?: string | null
          revision_no?: number
          root_order_id?: string | null
          seller_id?: string | null
          share_token?: string
          shipping_address?: string | null
          shipping_address_number?: string | null
          shipping_cep?: string | null
          shipping_city?: string | null
          shipping_cost?: number
          shipping_country?: string | null
          shipping_fee?: number
          shipping_percentage?: number | null
          shipping_state?: string | null
          source_month?: string | null
          source_payload?: Json
          source_reference?: string | null
          status?: string
          stock_consumed_at?: string | null
          stock_state?: string
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_order_id?: string | null
          supplier_id?: string | null
          total?: number
          total_cost_brl?: number
          total_cost_usd?: number
          tracking_code?: string | null
          tracking_enabled?: boolean
          tracking_location?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          transport_cost?: number | null
          transport_cost_order_amount?: number | null
          transport_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          updated_at?: string
          variable_cost?: number
          warehouse_id?: string | null
          whatsapp?: string | null
          workflow_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "digital_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_financial_closed_by_fkey"
            columns: ["financial_closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_previous_order_id_fkey"
            columns: ["previous_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_previous_order_id_fkey"
            columns: ["previous_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_replacement_for_order_id_fkey"
            columns: ["replacement_for_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_replacement_for_order_id_fkey"
            columns: ["replacement_for_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_return_warehouse_id_fkey"
            columns: ["return_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_root_order_id_fkey"
            columns: ["root_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_root_order_id_fkey"
            columns: ["root_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_superseded_by_order_id_fkey"
            columns: ["superseded_by_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_superseded_by_order_id_fkey"
            columns: ["superseded_by_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_areas: {
        Row: {
          active: boolean
          color: string
          cost_center: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          parent_area_id: string | null
          sort_order: number
          system_key: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          cost_center?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_area_id?: string | null
          sort_order?: number
          system_key?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          cost_center?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_area_id?: string | null
          sort_order?: number
          system_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_areas_parent_area_id_fkey"
            columns: ["parent_area_id"]
            isOneToOne: false
            referencedRelation: "organization_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_hierarchy_trigger_rules: {
        Row: {
          active: boolean
          area_id: string | null
          created_at: string
          created_by: string | null
          critical_after_days: number
          id: string
          label: string
          metric: string
          organization_tier: string | null
          priority: number
          role_id: string | null
          scope_type: string
          threshold: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          critical_after_days?: number
          id?: string
          label: string
          metric: string
          organization_tier?: string | null
          priority?: number
          role_id?: string | null
          scope_type: string
          threshold: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          critical_after_days?: number
          id?: string
          label?: string
          metric?: string
          organization_tier?: string | null
          priority?: number
          role_id?: string | null
          scope_type?: string
          threshold?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_hierarchy_trigger_rules_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "organization_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_hierarchy_trigger_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_hierarchy_trigger_rules_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_hierarchy_trigger_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_history: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_data: Json | null
          previous_data: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          due_date: string | null
          exchange_rate_locked_at: string | null
          exchange_rate_source: string | null
          exchange_rates_snapshot: Json | null
          id: string
          installment: number | null
          method: string | null
          order_id: string | null
          paid_at: string | null
          receipt_token: string
          received_amount: number | null
          received_currency: Database["public"]["Enums"]["currency_code"] | null
          review_decision: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          settled_amount_brl: number | null
          settled_amount_pyg: number | null
          settled_amount_usd: number | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date?: string | null
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          id?: string
          installment?: number | null
          method?: string | null
          order_id?: string | null
          paid_at?: string | null
          receipt_token?: string
          received_amount?: number | null
          received_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          review_decision?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          settled_amount_brl?: number | null
          settled_amount_pyg?: number | null
          settled_amount_usd?: number | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date?: string | null
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          id?: string
          installment?: number | null
          method?: string | null
          order_id?: string | null
          paid_at?: string | null
          receipt_token?: string
          received_amount?: number | null
          received_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          review_decision?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          settled_amount_brl?: number | null
          settled_amount_pyg?: number | null
          settled_amount_usd?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          entry_type: string
          exchange_rate_locked_at: string | null
          exchange_rate_source: string | null
          exchange_rates_snapshot: Json | null
          id: string
          is_demo: boolean
          member_receipt_path: string | null
          member_receipt_uploaded_at: string | null
          paid_at: string | null
          payable_id: string | null
          payment_due_date: string | null
          period_end: string | null
          period_start: string | null
          product_id: string | null
          receipt_required: boolean
          remuneration_policy_id: string | null
          settled_amount_brl: number | null
          settled_amount_pyg: number | null
          settled_amount_usd: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          entry_type?: string
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          id?: string
          is_demo?: boolean
          member_receipt_path?: string | null
          member_receipt_uploaded_at?: string | null
          paid_at?: string | null
          payable_id?: string | null
          payment_due_date?: string | null
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
          receipt_required?: boolean
          remuneration_policy_id?: string | null
          settled_amount_brl?: number | null
          settled_amount_pyg?: number | null
          settled_amount_usd?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          entry_type?: string
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          id?: string
          is_demo?: boolean
          member_receipt_path?: string | null
          member_receipt_uploaded_at?: string | null
          paid_at?: string | null
          payable_id?: string | null
          payment_due_date?: string | null
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
          receipt_required?: boolean
          remuneration_policy_id?: string | null
          settled_amount_brl?: number | null
          settled_amount_pyg?: number | null
          settled_amount_usd?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_remuneration_policy_id_fkey"
            columns: ["remuneration_policy_id"]
            isOneToOne: false
            referencedRelation: "remuneration_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_catalog: {
        Row: {
          description: string | null
          group_name: string
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          group_name?: string
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          group_name?: string
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          pipeline_id: string
          position: number
          stage_type: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          pipeline_id: string
          position?: number
          stage_type?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          pipeline_id?: string
          position?: number
          stage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_table_items: {
        Row: {
          created_at: string
          description: string
          id: string
          min_quantity: number | null
          price_table_id: string
          sku: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          min_quantity?: number | null
          price_table_id: string
          sku?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          min_quantity?: number | null
          price_table_id?: string
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_table_items_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      price_tables: {
        Row: {
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          is_current: boolean
          is_demo: boolean
          name: string
          product_id: string
          status: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_current?: boolean
          is_demo?: boolean
          name: string
          product_id: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_current?: boolean
          is_demo?: boolean
          name?: string
          product_id?: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_tables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_tables_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_authenticity_qr: {
        Row: {
          artwork: string
          created_at: string
          created_by: string
          item_id: string
          target_url: string
        }
        Insert: {
          artwork: string
          created_at?: string
          created_by: string
          item_id: string
          target_url: string
        }
        Update: {
          artwork?: string
          created_at?: string
          created_by?: string
          item_id?: string
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_authenticity_qr_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_authenticity_qr_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      product_authenticity_themes: {
        Row: {
          accent_color: string
          background_color: string
          content_links: Json
          description: string | null
          item_id: string
          logo_url: string | null
          primary_color: string
          public_base_url: string | null
          show_code_validator: boolean
          show_expiry: boolean
          show_lot: boolean
          show_manufacture: boolean
          title: string | null
          updated_at: string
          updated_by: string | null
          website_url: string | null
        }
        Insert: {
          accent_color?: string
          background_color?: string
          content_links?: Json
          description?: string | null
          item_id: string
          logo_url?: string | null
          primary_color?: string
          public_base_url?: string | null
          show_code_validator?: boolean
          show_expiry?: boolean
          show_lot?: boolean
          show_manufacture?: boolean
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          website_url?: string | null
        }
        Update: {
          accent_color?: string
          background_color?: string
          content_links?: Json
          description?: string | null
          item_id?: string
          logo_url?: string | null
          primary_color?: string
          public_base_url?: string | null
          show_code_validator?: boolean
          show_expiry?: boolean
          show_lot?: boolean
          show_manufacture?: boolean
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_authenticity_themes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_authenticity_themes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_catalog_configs: {
        Row: {
          info_group_url: string | null
          item_id: string
          media: Json
          seller_ids: string[]
          updated_at: string
        }
        Insert: {
          info_group_url?: string | null
          item_id: string
          media?: Json
          seller_ids?: string[]
          updated_at?: string
        }
        Update: {
          info_group_url?: string | null
          item_id?: string
          media?: Json
          seller_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_catalog_configs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          commission_percent: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_demo: boolean
          max_discount_percent: number
          name: string
          position: number
          product_id: string
          updated_at: string
        }
        Insert: {
          commission_percent?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          max_discount_percent?: number
          name: string
          position?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          commission_percent?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          max_discount_percent?: number
          name?: string
          position?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_category_users: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_category_users_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_users: {
        Row: {
          created_at: string
          id: string
          product_id: string
          role_in_product: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          role_in_product?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          role_in_product?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_users_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          color: string
          commercial_rules: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          goal_amount: number | null
          id: string
          image_url: string | null
          is_active: boolean
          is_demo: boolean
          main_currency: Database["public"]["Enums"]["currency_code"]
          manager_id: string | null
          name: string
          notes: string | null
          payment_methods: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          color?: string
          commercial_rules?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          goal_amount?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_demo?: boolean
          main_currency?: Database["public"]["Enums"]["currency_code"]
          manager_id?: string | null
          name: string
          notes?: string | null
          payment_methods?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          color?: string
          commercial_rules?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          goal_amount?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_demo?: boolean
          main_currency?: Database["public"]["Enums"]["currency_code"]
          manager_id?: string | null
          name?: string
          notes?: string | null
          payment_methods?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cargo: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_demo: boolean
          joined_at: string
          last_access: string | null
          manager_id: string | null
          phone: string | null
          setor: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          is_demo?: boolean
          joined_at?: string
          last_access?: string | null
          manager_id?: string | null
          phone?: string | null
          setor?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          joined_at?: string
          last_access?: string | null
          manager_id?: string | null
          phone?: string | null
          setor?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_month_closures: {
        Row: {
          allocation_usd: number
          created_at: string
          created_by: string
          id: string
          month: string
          percent: number
          product_id: string | null
          profit_usd: number
          share_id: string
        }
        Insert: {
          allocation_usd: number
          created_at?: string
          created_by?: string
          id?: string
          month: string
          percent: number
          product_id?: string | null
          profit_usd: number
          share_id: string
        }
        Update: {
          allocation_usd?: number
          created_at?: string
          created_by?: string
          id?: string
          month?: string
          percent?: number
          product_id?: string | null
          profit_usd?: number
          share_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_month_closures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_month_closures_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "profit_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_shares: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_demo: boolean
          name: string
          notes: string | null
          percent: number
          product_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          notes?: string | null
          percent?: number
          product_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          notes?: string | null
          percent?: number
          product_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profit_shares_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_withdrawals: {
        Row: {
          amount: number
          amount_usd: number
          canceled_at: string | null
          canceled_by: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          notes: string | null
          share_id: string
          status: string
          withdrawn_at: string
        }
        Insert: {
          amount: number
          amount_usd: number
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          created_by?: string
          currency: string
          id?: string
          notes?: string | null
          share_id: string
          status?: string
          withdrawn_at: string
        }
        Update: {
          amount?: number
          amount_usd?: number
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          notes?: string | null
          share_id?: string
          status?: string
          withdrawn_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_withdrawals_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_withdrawals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_withdrawals_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "profit_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          destination_scope: string
          ends_at: string
          id: string
          item_id: string
          origin_type: string
          original_cost: number | null
          original_freight_percent: number | null
          original_sale_price: number
          promotional_cost: number | null
          promotional_freight_percent: number | null
          promotional_sale_price: number
          starts_at: string
          status: string
          supplier_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          destination_scope?: string
          ends_at: string
          id?: string
          item_id: string
          origin_type: string
          original_cost?: number | null
          original_freight_percent?: number | null
          original_sale_price: number
          promotional_cost?: number | null
          promotional_freight_percent?: number | null
          promotional_sale_price: number
          starts_at: string
          status?: string
          supplier_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          destination_scope?: string
          ends_at?: string
          id?: string
          item_id?: string
          origin_type?: string
          original_cost?: number | null
          original_freight_percent?: number | null
          original_sale_price?: number
          promotional_cost?: number | null
          promotional_freight_percent?: number | null
          promotional_sale_price?: number
          starts_at?: string
          status?: string
          supplier_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          active: boolean
          bonus_quantity: number
          created_at: string
          description: string
          id: string
          item_id: string
          payable_quantity: number
          purchase_order_id: string
          quantity: number
          sku: string | null
          total: number
          unit_cost: number
        }
        Insert: {
          active?: boolean
          bonus_quantity?: number
          created_at?: string
          description: string
          id?: string
          item_id: string
          payable_quantity: number
          purchase_order_id: string
          quantity: number
          sku?: string | null
          total: number
          unit_cost: number
        }
        Update: {
          active?: boolean
          bonus_quantity?: number
          created_at?: string
          description?: string
          id?: string
          item_id?: string
          payable_quantity?: number
          purchase_order_id?: string
          quantity?: number
          sku?: string | null
          total?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          account_payable_id: string | null
          amount_paid: number
          amount_payable: number
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          due_date: string | null
          freight_cost: number
          id: string
          merchandise_total: number
          notes: string | null
          number: number
          payment_status: string
          purchase_date: string
          source_order_id: string | null
          source_root_order_id: string | null
          source_type: string
          status: string
          supplier_id: string
          total: number
          updated_at: string
          variable_cost: number
          warehouse_id: string
        }
        Insert: {
          account_payable_id?: string | null
          amount_paid?: number
          amount_payable?: number
          created_at?: string
          created_by: string
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date?: string | null
          freight_cost?: number
          id?: string
          merchandise_total?: number
          notes?: string | null
          number: number
          payment_status?: string
          purchase_date?: string
          source_order_id?: string | null
          source_root_order_id?: string | null
          source_type?: string
          status?: string
          supplier_id: string
          total?: number
          updated_at?: string
          variable_cost?: number
          warehouse_id: string
        }
        Update: {
          account_payable_id?: string | null
          amount_paid?: number
          amount_payable?: number
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date?: string | null
          freight_cost?: number
          id?: string
          merchandise_total?: number
          notes?: string | null
          number?: number
          payment_status?: string
          purchase_date?: string
          source_order_id?: string | null
          source_root_order_id?: string | null
          source_type?: string
          status?: string
          supplier_id?: string
          total?: number
          updated_at?: string
          variable_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_account_payable_id_fkey"
            columns: ["account_payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
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
            foreignKeyName: "purchase_orders_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_source_root_order_id_fkey"
            columns: ["source_root_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_source_root_order_id_fkey"
            columns: ["source_root_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          installment: number
          method: string
          notes: string | null
          paid_at: string
          purchase_order_id: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          installment: number
          method: string
          notes?: string | null
          paid_at?: string
          purchase_order_id: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          installment?: number
          method?: string
          notes?: string | null
          paid_at?: string
          purchase_order_id?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          barcode: string | null
          created_at: string
          description: string
          discount: number
          id: string
          item_id: string | null
          quantity: number
          quote_id: string
          sku: string | null
          total: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          description: string
          discount?: number
          id?: string
          item_id?: string | null
          quantity?: number
          quote_id: string
          sku?: string | null
          total?: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          barcode?: string | null
          created_at?: string
          description?: string
          discount?: number
          id?: string
          item_id?: string | null
          quantity?: number
          quote_id?: string
          sku?: string | null
          total?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          converted_at: string | null
          converted_order_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string | null
          discount: number
          exchange_rate: number | null
          exchange_rate_id: string | null
          id: string
          is_demo: boolean
          notes: string | null
          number: number
          origin: string | null
          payment_installments: string | null
          payment_method: string | null
          product_id: string | null
          seller_id: string | null
          status: string
          total: number
          updated_at: string
          valid_until: string | null
          whatsapp: string | null
        }
        Insert: {
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          discount?: number
          exchange_rate?: number | null
          exchange_rate_id?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          number?: number
          origin?: string | null
          payment_installments?: string | null
          payment_method?: string | null
          product_id?: string | null
          seller_id?: string | null
          status?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          whatsapp?: string | null
        }
        Update: {
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          discount?: number
          exchange_rate?: number | null
          exchange_rate_id?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          number?: number
          origin?: string | null
          payment_installments?: string | null
          payment_method?: string | null
          product_id?: string | null
          seller_id?: string | null
          status?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_exchange_rate_id_fkey"
            columns: ["exchange_rate_id"]
            isOneToOne: false
            referencedRelation: "exchange_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_championships: {
        Row: {
          counting_mode: string
          created_at: string
          destination: string
          eligible_category_ids: string[]
          eligible_item_ids: string[]
          eligible_macro_ids: string[]
          eligible_products: string[]
          enabled: boolean
          ends_at: string
          id: string
          individual_goal: number
          media: Json
          starts_at: string
          team_goal: number
          team_prize: string
          title: string
        }
        Insert: {
          counting_mode?: string
          created_at?: string
          destination: string
          eligible_category_ids?: string[]
          eligible_item_ids?: string[]
          eligible_macro_ids?: string[]
          eligible_products?: string[]
          enabled?: boolean
          ends_at: string
          id: string
          individual_goal: number
          media?: Json
          starts_at: string
          team_goal: number
          team_prize?: string
          title: string
        }
        Update: {
          counting_mode?: string
          created_at?: string
          destination?: string
          eligible_category_ids?: string[]
          eligible_item_ids?: string[]
          eligible_macro_ids?: string[]
          eligible_products?: string[]
          enabled?: boolean
          ends_at?: string
          id?: string
          individual_goal?: number
          media?: Json
          starts_at?: string
          team_goal?: number
          team_prize?: string
          title?: string
        }
        Relationships: []
      }
      remuneration_calculation_events: {
        Row: {
          actor: string | null
          created_at: string
          details: Json
          difference: number
          id: string
          new_amount: number
          order_id: string
          previous_amount: number
          seller_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          details: Json
          difference: number
          id?: string
          new_amount: number
          order_id: string
          previous_amount: number
          seller_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          details?: Json
          difference?: number
          id?: string
          new_amount?: number
          order_id?: string
          previous_amount?: number
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remuneration_calculation_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remuneration_calculation_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      remuneration_policies: {
        Row: {
          active: boolean
          app_roles: Database["public"]["Enums"]["app_role"][]
          change_reason: string
          created_at: string
          created_by: string | null
          definition: Json
          ends_at: string | null
          id: string
          job_role_ids: string[]
          legacy_agreement_id: string | null
          member_ids: string[]
          name: string
          priority: number
          series_id: string
          starts_at: string
          version: number
        }
        Insert: {
          active?: boolean
          app_roles?: Database["public"]["Enums"]["app_role"][]
          change_reason: string
          created_at?: string
          created_by?: string | null
          definition: Json
          ends_at?: string | null
          id?: string
          job_role_ids?: string[]
          legacy_agreement_id?: string | null
          member_ids?: string[]
          name: string
          priority?: number
          series_id?: string
          starts_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          app_roles?: Database["public"]["Enums"]["app_role"][]
          change_reason?: string
          created_at?: string
          created_by?: string | null
          definition?: Json
          ends_at?: string | null
          id?: string
          job_role_ids?: string[]
          legacy_agreement_id?: string | null
          member_ids?: string[]
          name?: string
          priority?: number
          series_id?: string
          starts_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "remuneration_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remuneration_policies_legacy_agreement_id_fkey"
            columns: ["legacy_agreement_id"]
            isOneToOne: true
            referencedRelation: "member_compensations"
            referencedColumns: ["id"]
          },
        ]
      }
      remuneration_policy_events: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          policy_id: string | null
          previous: Json | null
          proposed: Json | null
          reason: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          policy_id?: string | null
          previous?: Json | null
          proposed?: Json | null
          reason: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          policy_id?: string | null
          previous?: Json | null
          proposed?: Json | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "remuneration_policy_events_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remuneration_policy_events_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "remuneration_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_scripts: {
        Row: {
          category: string | null
          content: string | null
          created_at: string
          created_by: string | null
          credentials: Json
          description: string | null
          id: string
          image_url: string | null
          is_demo: boolean
          links: Json
          product_id: string | null
          script_type: string
          status: string
          team_id: string | null
          title: string
          updated_at: string
          video_url: string | null
          visibility_scope: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          credentials?: Json
          description?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          links?: Json
          product_id?: string | null
          script_type?: string
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
          visibility_scope?: string
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          credentials?: Json
          description?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          links?: Json
          product_id?: string | null
          script_type?: string
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
          visibility_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_scripts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_scripts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_scripts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_rate_rules: {
        Row: {
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          percentage: number
          state_code: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          percentage: number
          state_code?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          percentage?: number
          state_code?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rate_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lot_balances: {
        Row: {
          quantity: number
          receipt_id: string
          warehouse_id: string
        }
        Insert: {
          quantity: number
          receipt_id: string
          warehouse_id: string
        }
        Update: {
          quantity?: number
          receipt_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lot_balances_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "stock_lot_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lot_movements: {
        Row: {
          movement_id: string
          order_id: string
          quantity: number
          receipt_id: string
        }
        Insert: {
          movement_id: string
          order_id: string
          quantity: number
          receipt_id: string
        }
        Update: {
          movement_id?: string
          order_id?: string
          quantity?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lot_movements_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_movements_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "stock_lot_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lot_receipts: {
        Row: {
          available: number
          created_at: string
          id: string
          lot_id: string
          purchase_item_id: string
          quantity: number
          warehouse_id: string
        }
        Insert: {
          available: number
          created_at?: string
          id?: string
          lot_id: string
          purchase_item_id: string
          quantity: number
          warehouse_id: string
        }
        Update: {
          available?: number
          created_at?: string
          id?: string
          lot_id?: string
          purchase_item_id?: string
          quantity?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lot_receipts_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "supplier_stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_receipts_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: true
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_availability: {
        Row: {
          batch_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"] | null
          id: string
          inventory_item_id: string
          quantity: number
          supplier_id: string
          updated_at: string
          value: number | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string
          inventory_item_id: string
          quantity?: number
          supplier_id: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string
          inventory_item_id?: string
          quantity?: number
          supplier_id?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_availability_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_availability_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_availability_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bonus_policies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          item_id: string | null
          mode: string
          supplier_id: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          mode: string
          supplier_id: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          mode?: string
          supplier_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bonus_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bonus_policies_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bonus_policies_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_import_templates: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_import_templates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_issues: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_demo: boolean
          issue_type: string
          order_id: string | null
          resolved_at: string | null
          severity: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          issue_type?: string
          order_id?: string | null
          resolved_at?: string | null
          severity?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          issue_type?: string
          order_id?: string | null
          resolved_at?: string | null
          severity?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_issues_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_issues_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_issues_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_product_mappings: {
        Row: {
          alias_normalized: string | null
          confidence: number
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          id: string
          inventory_item_id: string
          received_description: string | null
          supplier_code: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          alias_normalized?: string | null
          confidence?: number
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          inventory_item_id: string
          received_description?: string | null
          supplier_code?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          alias_normalized?: string | null
          confidence?: number
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string
          received_description?: string | null
          supplier_code?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_mappings_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_mappings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          created_at: string
          id: string
          product_id: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_stock_lots: {
        Row: {
          available: number
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          expiry_date: string
          id: string
          item_id: string
          lot_number: string
          manufacture_date: string
          purchase_date: string
          quantity: number
          supplier_id: string
          unit_cost: number
        }
        Insert: {
          available: number
          created_at?: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          expiry_date: string
          id?: string
          item_id: string
          lot_number: string
          manufacture_date: string
          purchase_date: string
          quantity: number
          supplier_id: string
          unit_cost: number
        }
        Update: {
          available?: number
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          expiry_date?: string
          id?: string
          item_id?: string
          lot_number?: string
          manufacture_date?: string
          purchase_date?: string
          quantity?: number
          supplier_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_stock_lots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_stock_lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_stock_lots_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_user_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          supplier_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          supplier_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          supplier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_user_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_user_assignments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_user_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          bank_details: string | null
          commercial_terms: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          currencies: Database["public"]["Enums"]["currency_code"][]
          deleted_at: string | null
          document: string | null
          email: string | null
          id: string
          is_demo: boolean
          lead_time_days: number | null
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_details?: string | null
          commercial_terms?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          currencies?: Database["public"]["Enums"]["currency_code"][]
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          lead_time_days?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_details?: string | null
          commercial_terms?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          currencies?: Database["public"]["Enums"]["currency_code"][]
          deleted_at?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_routing_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          from_user_id: string | null
          id: string
          note: string | null
          task_id: string
          to_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          from_user_id?: string | null
          id?: string
          note?: string | null
          task_id: string
          to_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          from_user_id?: string | null
          id?: string
          note?: string | null
          task_id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_routing_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_routing_history_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_routing_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_routing_history_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          checklist: Json
          created_at: string
          creator_id: string | null
          customer_id: string | null
          customer_product_id: string | null
          description: string | null
          due_at: string | null
          id: string
          is_demo: boolean
          priority: string
          product_id: string | null
          request_category: string | null
          request_kind: string
          request_stage: string
          requested_by: string | null
          routed_at: string | null
          routed_by: string | null
          status: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          checklist?: Json
          created_at?: string
          creator_id?: string | null
          customer_id?: string | null
          customer_product_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_demo?: boolean
          priority?: string
          product_id?: string | null
          request_category?: string | null
          request_kind?: string
          request_stage?: string
          requested_by?: string | null
          routed_at?: string | null
          routed_by?: string | null
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          checklist?: Json
          created_at?: string
          creator_id?: string | null
          customer_id?: string | null
          customer_product_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_demo?: boolean
          priority?: string
          product_id?: string | null
          request_category?: string | null
          request_kind?: string
          request_stage?: string
          requested_by?: string | null
          routed_at?: string | null
          routed_by?: string | null
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_customer_product_id_fkey"
            columns: ["customer_product_id"]
            isOneToOne: false
            referencedRelation: "customer_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_routed_by_fkey"
            columns: ["routed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_demo: boolean
          manager_id: string | null
          name: string
          sellers_can_view_team_clients: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          manager_id?: string | null
          name: string
          sellers_can_view_team_clients?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          manager_id?: string | null
          name?: string
          sellers_can_view_team_clients?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          order_id: string | null
          session_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          order_id?: string | null
          session_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          order_id?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_audit_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_audit_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_audit_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "delivery_tracking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_devices: {
        Row: {
          created_at: string
          created_by: string | null
          external_device_id: string
          id: string
          label: string | null
          last_seen_at: string | null
          provider: string
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_device_id: string
          id?: string
          label?: string | null
          last_seen_at?: string | null
          provider: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_device_id?: string
          id?: string
          label?: string | null
          last_seen_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_devices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_devices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_positions: {
        Row: {
          accuracy_m: number | null
          dedupe_key: string | null
          device_id: string | null
          device_time: string
          driver_id: string | null
          heading_deg: number | null
          id: string
          latitude: number
          longitude: number
          order_id: string | null
          received_at: string
          session_id: string | null
          source: string
          speed_kmh: number | null
          vehicle_id: string | null
        }
        Insert: {
          accuracy_m?: number | null
          dedupe_key?: string | null
          device_id?: string | null
          device_time: string
          driver_id?: string | null
          heading_deg?: number | null
          id?: string
          latitude: number
          longitude: number
          order_id?: string | null
          received_at?: string
          session_id?: string | null
          source: string
          speed_kmh?: number | null
          vehicle_id?: string | null
        }
        Update: {
          accuracy_m?: number | null
          dedupe_key?: string | null
          device_id?: string | null
          device_time?: string
          driver_id?: string | null
          heading_deg?: number | null
          id?: string
          latitude?: number
          longitude?: number
          order_id?: string | null
          received_at?: string
          session_id?: string | null
          source?: string
          speed_kmh?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_positions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "tracking_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_positions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_positions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_positions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_positions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "delivery_tracking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_positions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_rate_limits: {
        Row: {
          bucket_key: string
          hits: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      tracking_view_sessions: {
        Row: {
          admin_id: string
          end_reason: string | null
          ended_at: string | null
          expires_at: string
          id: string
          last_seen_at: string
          order_id: string | null
          session_id: string | null
          started_at: string
        }
        Insert: {
          admin_id: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          last_seen_at?: string
          order_id?: string | null
          session_id?: string | null
          started_at?: string
        }
        Update: {
          admin_id?: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          last_seen_at?: string
          order_id?: string | null
          session_id?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_view_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_view_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_view_sessions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "delivery_tracking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_webhook_events: {
        Row: {
          event_id: string
          provider: string
          received_at: string
        }
        Insert: {
          event_id: string
          provider: string
          received_at?: string
        }
        Update: {
          event_id?: string
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
      ui_translations: {
        Row: {
          created_at: string
          id: string
          lang: string
          source: string
          translated: string
        }
        Insert: {
          created_at?: string
          id?: string
          lang: string
          source: string
          translated: string
        }
        Update: {
          created_at?: string
          id?: string
          lang?: string
          source?: string
          translated?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_inventory: {
        Row: {
          created_at: string
          id: string
          item_id: string
          location: string | null
          min_quantity: number
          quantity: number
          reserved: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          location?: string | null
          min_quantity?: number
          quantity?: number
          reserved?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          location?: string | null
          min_quantity?: number
          quantity?: number
          reserved?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_user_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          product_id: string | null
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          product_id?: string | null
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          product_id?: string | null
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_user_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_user_assignments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          city: string
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          latitude: number | null
          level: string
          longitude: number | null
          name: string
          parent_id: string | null
          state: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          level?: string
          longitude?: number | null
          name: string
          parent_id?: string | null
          state: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          level?: string
          longitude?: number | null
          name?: string
          parent_id?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_accounts: {
        Row: {
          connected_at: string | null
          connection_status: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          demo_mode: boolean
          disconnected_at: string | null
          display_name: string | null
          display_phone_number: string | null
          id: string
          instance_name: string | null
          last_error: string | null
          last_seen_at: string | null
          meta_integration_id: string | null
          owner_jid: string | null
          phone_e164: string | null
          phone_number_id: string | null
          product_id: string | null
          product_ids: string[]
          profile_name: string | null
          provider: string
          status: string
          updated_at: string
          waba_id: string | null
          webhook_configured_at: string | null
        }
        Insert: {
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          demo_mode?: boolean
          disconnected_at?: string | null
          display_name?: string | null
          display_phone_number?: string | null
          id?: string
          instance_name?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          meta_integration_id?: string | null
          owner_jid?: string | null
          phone_e164?: string | null
          phone_number_id?: string | null
          product_id?: string | null
          product_ids?: string[]
          profile_name?: string | null
          provider?: string
          status?: string
          updated_at?: string
          waba_id?: string | null
          webhook_configured_at?: string | null
        }
        Update: {
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          demo_mode?: boolean
          disconnected_at?: string | null
          display_name?: string | null
          display_phone_number?: string | null
          id?: string
          instance_name?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          meta_integration_id?: string | null
          owner_jid?: string | null
          phone_e164?: string | null
          phone_number_id?: string | null
          product_id?: string | null
          product_ids?: string[]
          profile_name?: string | null
          provider?: string
          status?: string
          updated_at?: string
          waba_id?: string | null
          webhook_configured_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_meta_integration_id_fkey"
            columns: ["meta_integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_accounts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          account_id: string | null
          archived_at: string | null
          assignee_id: string | null
          contact_name: string | null
          contact_phone: string
          created_at: string
          customer_id: string | null
          id: string
          is_demo: boolean
          last_inbound_at: string | null
          last_message_at: string | null
          last_synced_at: string | null
          pinned_at: string | null
          product_id: string | null
          profile_picture_url: string | null
          referral: Json
          remote_jid: string | null
          status: string
          tags: string[]
          unread_count: number
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          contact_name?: string | null
          contact_phone: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_demo?: boolean
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_synced_at?: string | null
          pinned_at?: string | null
          product_id?: string | null
          profile_picture_url?: string | null
          referral?: Json
          remote_jid?: string | null
          status?: string
          tags?: string[]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          contact_name?: string | null
          contact_phone?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_demo?: boolean
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_synced_at?: string | null
          pinned_at?: string | null
          product_id?: string | null
          profile_picture_url?: string | null
          referral?: Json
          remote_jid?: string | null
          status?: string
          tags?: string[]
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          account_id: string | null
          body: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: string
          error: string | null
          failed_at: string | null
          from_me: boolean
          id: string
          idempotency_key: string | null
          is_demo: boolean
          is_favorite: boolean
          is_internal_note: boolean
          media_meta: Json
          media_url: string | null
          message_type: string
          mime_type: string | null
          participant_jid: string | null
          provider_message_id: string | null
          provider_timestamp: string | null
          quoted_message_id: string | null
          read_at: string | null
          referral: Json
          remote_jid: string | null
          sender_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error?: string | null
          failed_at?: string | null
          from_me?: boolean
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          is_favorite?: boolean
          is_internal_note?: boolean
          media_meta?: Json
          media_url?: string | null
          message_type?: string
          mime_type?: string | null
          participant_jid?: string | null
          provider_message_id?: string | null
          provider_timestamp?: string | null
          quoted_message_id?: string | null
          read_at?: string | null
          referral?: Json
          remote_jid?: string | null
          sender_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error?: string | null
          failed_at?: string | null
          from_me?: boolean
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          is_favorite?: boolean
          is_internal_note?: boolean
          media_meta?: Json
          media_url?: string | null
          message_type?: string
          mime_type?: string | null
          participant_jid?: string | null
          provider_message_id?: string | null
          provider_timestamp?: string | null
          quoted_message_id?: string | null
          read_at?: string | null
          referral?: Json
          remote_jid?: string | null
          sender_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_rate_limits: {
        Row: {
          bucket_key: string
          hits: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          account_id: string | null
          created_at: string
          event: string
          event_key: string
          id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          event: string
          event_key: string
          id?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          event?: string
          event_key?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_webhook_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      division_orders_public: {
        Row: {
          amount_paid: number | null
          amount_receivable: number | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          bonus_amount: number | null
          bonus_percent: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          carrier: string | null
          catalog_id: string | null
          catalog_slug: string | null
          commission_enabled: boolean | null
          commission_total: number | null
          created_at: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          customer_id: string | null
          customer_resolution: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery: Json | null
          delivery_deadline: string | null
          delivery_issue: string | null
          delivery_recipient_document: string | null
          delivery_recipient_name: string | null
          delivery_token: string | null
          discount: number | null
          exchange_rate: number | null
          exchange_rate_locked_at: string | null
          exchange_rate_source: string | null
          exchange_rates_snapshot: Json | null
          financial_closed_at: string | null
          financial_closed_by: string | null
          fulfillment_status: string | null
          grace_days: number | null
          id: string | null
          integration_external_id: string | null
          integration_source: string | null
          is_demo: boolean | null
          kind: string | null
          notes: string | null
          number: number | null
          order_date: string | null
          origin: string | null
          payment_installments: string | null
          payment_method: string | null
          payment_status: string | null
          previous_order_id: string | null
          product_id: string | null
          quote_id: string | null
          replacement_for_order_id: string | null
          return_warehouse_id: string | null
          review_outcome: string | null
          revision_no: number | null
          root_order_id: string | null
          seller_id: string | null
          share_token: string | null
          shipping_address: string | null
          shipping_address_number: string | null
          shipping_cep: string | null
          shipping_city: string | null
          shipping_cost: number | null
          shipping_country: string | null
          shipping_fee: number | null
          shipping_percentage: number | null
          shipping_state: string | null
          source_month: string | null
          source_payload: Json | null
          source_reference: string | null
          status: string | null
          stock_consumed_at: string | null
          stock_state: string | null
          superseded_at: string | null
          superseded_by: string | null
          superseded_by_order_id: string | null
          supplier_id: string | null
          total: number | null
          tracking_code: string | null
          tracking_enabled: boolean | null
          tracking_location: string | null
          tracking_status: string | null
          tracking_url: string | null
          updated_at: string | null
          warehouse_id: string | null
          whatsapp: string | null
          workflow_stage: string | null
        }
        Insert: {
          amount_paid?: number | null
          amount_receivable?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bonus_amount?: number | null
          bonus_percent?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          carrier?: string | null
          catalog_id?: string | null
          catalog_slug?: string | null
          commission_enabled?: boolean | null
          commission_total?: number | null
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          customer_id?: string | null
          customer_resolution?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery?: Json | null
          delivery_deadline?: string | null
          delivery_issue?: string | null
          delivery_recipient_document?: string | null
          delivery_recipient_name?: string | null
          delivery_token?: string | null
          discount?: number | null
          exchange_rate?: number | null
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          financial_closed_at?: string | null
          financial_closed_by?: string | null
          fulfillment_status?: string | null
          grace_days?: number | null
          id?: string | null
          integration_external_id?: string | null
          integration_source?: string | null
          is_demo?: boolean | null
          kind?: string | null
          notes?: string | null
          number?: number | null
          order_date?: string | null
          origin?: string | null
          payment_installments?: string | null
          payment_method?: string | null
          payment_status?: string | null
          previous_order_id?: string | null
          product_id?: string | null
          quote_id?: string | null
          replacement_for_order_id?: string | null
          return_warehouse_id?: string | null
          review_outcome?: string | null
          revision_no?: number | null
          root_order_id?: string | null
          seller_id?: string | null
          share_token?: string | null
          shipping_address?: string | null
          shipping_address_number?: string | null
          shipping_cep?: string | null
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_country?: string | null
          shipping_fee?: number | null
          shipping_percentage?: number | null
          shipping_state?: string | null
          source_month?: string | null
          source_payload?: never
          source_reference?: string | null
          status?: string | null
          stock_consumed_at?: string | null
          stock_state?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_order_id?: string | null
          supplier_id?: string | null
          total?: number | null
          tracking_code?: string | null
          tracking_enabled?: boolean | null
          tracking_location?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
          whatsapp?: string | null
          workflow_stage?: string | null
        }
        Update: {
          amount_paid?: number | null
          amount_receivable?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bonus_amount?: number | null
          bonus_percent?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          carrier?: string | null
          catalog_id?: string | null
          catalog_slug?: string | null
          commission_enabled?: boolean | null
          commission_total?: number | null
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          customer_id?: string | null
          customer_resolution?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery?: Json | null
          delivery_deadline?: string | null
          delivery_issue?: string | null
          delivery_recipient_document?: string | null
          delivery_recipient_name?: string | null
          delivery_token?: string | null
          discount?: number | null
          exchange_rate?: number | null
          exchange_rate_locked_at?: string | null
          exchange_rate_source?: string | null
          exchange_rates_snapshot?: Json | null
          financial_closed_at?: string | null
          financial_closed_by?: string | null
          fulfillment_status?: string | null
          grace_days?: number | null
          id?: string | null
          integration_external_id?: string | null
          integration_source?: string | null
          is_demo?: boolean | null
          kind?: string | null
          notes?: string | null
          number?: number | null
          order_date?: string | null
          origin?: string | null
          payment_installments?: string | null
          payment_method?: string | null
          payment_status?: string | null
          previous_order_id?: string | null
          product_id?: string | null
          quote_id?: string | null
          replacement_for_order_id?: string | null
          return_warehouse_id?: string | null
          review_outcome?: string | null
          revision_no?: number | null
          root_order_id?: string | null
          seller_id?: string | null
          share_token?: string | null
          shipping_address?: string | null
          shipping_address_number?: string | null
          shipping_cep?: string | null
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_country?: string | null
          shipping_fee?: number | null
          shipping_percentage?: number | null
          shipping_state?: string | null
          source_month?: string | null
          source_payload?: never
          source_reference?: string | null
          status?: string | null
          stock_consumed_at?: string | null
          stock_state?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_by_order_id?: string | null
          supplier_id?: string | null
          total?: number | null
          tracking_code?: string | null
          tracking_enabled?: boolean | null
          tracking_location?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
          whatsapp?: string | null
          workflow_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "digital_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_financial_closed_by_fkey"
            columns: ["financial_closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_previous_order_id_fkey"
            columns: ["previous_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_previous_order_id_fkey"
            columns: ["previous_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_replacement_for_order_id_fkey"
            columns: ["replacement_for_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_replacement_for_order_id_fkey"
            columns: ["replacement_for_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_return_warehouse_id_fkey"
            columns: ["return_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_root_order_id_fkey"
            columns: ["root_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_root_order_id_fkey"
            columns: ["root_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_superseded_by_order_id_fkey"
            columns: ["superseded_by_order_id"]
            isOneToOne: false
            referencedRelation: "division_orders_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_superseded_by_order_id_fkey"
            columns: ["superseded_by_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acknowledge_my_notifications: { Args: never; Returns: undefined }
      active_promotions_for_me: {
        Args: never
        Returns: {
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          ends_at: string
          id: string
          item_id: string
          item_name: string
          origin_label: string
          original_sale_price: number
          promotional_sale_price: number
          starts_at: string
          title: string
        }[]
      }
      admin_set_seller_catalog_access: {
        Args: {
          p_category_ids: string[]
          p_item_ids: string[]
          p_macro_ids: string[]
          p_user_id: string
        }
        Returns: undefined
      }
      app_has_cap: { Args: { _cap: string; _uid: string }; Returns: boolean }
      authenticity_create_batch: {
        Args: {
          p_actor: string
          p_codes: Json
          p_expiry: string
          p_item: string
          p_lot: string
          p_manufacture: string
        }
        Returns: string
      }
      authenticity_ensure_product_qr: {
        Args: { p_actor: string; p_item: string }
        Returns: Json
      }
      authenticity_validate: {
        Args: { p_batch: string; p_bucket: string; p_hash: string }
        Returns: Json
      }
      authenticity_validate_product: {
        Args: {
          p_batch?: string
          p_bucket: string
          p_hash: string
          p_item: string
        }
        Returns: Json
      }
      campaigns_audience: {
        Args: {
          p_channels: string[]
          p_filters: Json
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          blocked_reason: string
          channels: string[]
          city: string
          customer_id: string
          email: string
          name: string
          phone: string
          product_name: string
          seller_name: string
        }[]
      }
      campaigns_can_manage: { Args: { _user_id: string }; Returns: boolean }
      campaigns_claim_jobs: {
        Args: { p_campaign_id: string; p_limit: number; p_worker: string }
        Returns: {
          attempts: number
          body: string
          campaign_id: string
          channel: string
          created_at: string
          delivered_at: string | null
          error: string | null
          id: string
          idempotency_key: string
          lease_until: string | null
          locked_by: string | null
          media_mime: string | null
          media_path: string | null
          media_url: string | null
          next_attempt_at: string | null
          provider: string | null
          provider_message_id: string | null
          read_at: string | null
          recipient_id: string | null
          replied_at: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          step_id: string | null
          step_no: number
          subject: string | null
          template_lang: string | null
          template_name: string | null
          template_vars: Json
          to_address: string
          updated_at: string
          whatsapp_account_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "message_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      campaigns_create: { Args: { p: Json }; Returns: Json }
      campaigns_finish_job: {
        Args: {
          p_error: string
          p_job_id: string
          p_max_attempts?: number
          p_message_id: string
          p_ok: boolean
          p_provider: string
        }
        Returns: undefined
      }
      campaigns_norm_email: { Args: { _v: string }; Returns: string }
      campaigns_norm_phone: { Args: { _v: string }; Returns: string }
      campaigns_scope: {
        Args: { _product_id: string; _user_id: string }
        Returns: boolean
      }
      campaigns_set_status: {
        Args: { p_campaign_id: string; p_reason?: string; p_status: string }
        Returns: Json
      }
      can_manage_catalog: { Args: { _user_id: string }; Returns: boolean }
      can_use_company_access: {
        Args: { p_access_id: string; p_action?: string }
        Returns: boolean
      }
      catalog_create_preorder: {
        Args: {
          p_customer: Json
          p_delivery: Json
          p_idempotency_key: string
          p_items: Json
          p_notes: string
          p_slug: string
        }
        Returns: Json
      }
      catalog_scope_products: {
        Args: { p_user_id: string }
        Returns: {
          id: string
          is_active: boolean
          name: string
        }[]
      }
      catalog_scope_products_v2: {
        Args: { p_user_id: string }
        Returns: {
          id: string
          is_active: boolean
          name: string
        }[]
      }
      customer_credit_apply: {
        Args: { p_amount: number; p_order_id: string }
        Returns: Json
      }
      customer_credit_balance: {
        Args: { p_customer_id: string }
        Returns: {
          balance: number
          currency: Database["public"]["Enums"]["currency_code"]
        }[]
      }
      customer_credit_create_order: {
        Args: { p_args: Json; p_credit_amount: number }
        Returns: Json
      }
      customer_credit_issue: {
        Args: {
          p_amount: number
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_id: string
          p_kind: string
          p_note: string
          p_order_item_id?: string
          p_short_quantity?: number
        }
        Returns: number
      }
      customer_credit_post: {
        Args: {
          p_amount: number
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_id: string
          p_kind: string
          p_note: string
          p_order_id?: string
          p_order_item_id?: string
          p_payment_id?: string
          p_reverses_entry_id?: string
          p_short_quantity?: number
        }
        Returns: number
      }
      customer_credit_receive_overpayment: {
        Args: {
          p_exchange?: Json
          p_method: string
          p_order_id: string
          p_proof_id: string
          p_received_amount: number
        }
        Returns: Json
      }
      customer_credit_refund: {
        Args: {
          p_amount: number
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_id: string
          p_method: string
          p_note: string
        }
        Returns: number
      }
      customer_credit_resolve_order: {
        Args: {
          p_note?: string
          p_order_id: string
          p_refund_method?: string
          p_resolution: string
        }
        Returns: Json
      }
      customer_credit_reverse: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: number
      }
      customer_hub_detail: {
        Args: { p_customer_id: string; p_user_id?: string }
        Returns: Json
      }
      customer_hub_list: { Args: { p_user_id?: string }; Returns: Json }
      delete_company_access: {
        Args: { p_access_id: string }
        Returns: undefined
      }
      delivery_confirm_by_qr: { Args: { p_token: string }; Returns: Json }
      delivery_is_assigned: {
        Args: { _order_id: string; _uid: string }
        Returns: boolean
      }
      delivery_mark_delivered: {
        Args: { p_order_id: string; p_source?: string }
        Returns: Json
      }
      delivery_qr_detail: { Args: { p_token: string }; Returns: Json }
      division_commission_breakdown: {
        Args: { p_order: string }
        Returns: Json
      }
      division_order_context: { Args: { p_order_id: string }; Returns: Json }
      division_order_detail: { Args: { p_order_id: string }; Returns: Json }
      division_order_history: { Args: { p_order_id: string }; Returns: Json }
      division_redact_order_payload: { Args: { payload: Json }; Returns: Json }
      estadual_order_ids_for_product: {
        Args: { p_product_id: string }
        Returns: {
          id: string
        }[]
      }
      estadual_seller_create_customer: {
        Args: { p_email?: string; p_name: string; p_phone?: string }
        Returns: string
      }
      estadual_seller_create_order: {
        Args: {
          p_customer_id?: string
          p_expected_quote: Json
          p_request: Json
          p_request_id: string
        }
        Returns: Json
      }
      estadual_seller_crm_create: { Args: { p_request: Json }; Returns: string }
      estadual_seller_crm_data: { Args: never; Returns: Json }
      estadual_seller_crm_move: {
        Args: { p_card_id: string; p_stage_id: string }
        Returns: undefined
      }
      estadual_seller_customers: { Args: never; Returns: Json }
      estadual_seller_warehouse_stock: { Args: never; Returns: Json }
      finance_confirm_seller_payment: {
        Args: { p_payment_id: string }
        Returns: Json
      }
      finance_withdraw_member_earnings: {
        Args: {
          p_amount: number
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_notes: string
          p_paid_at: string
          p_product_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: string
      }
      financial_rate_at: {
        Args: {
          p_at: string
          p_base: Database["public"]["Enums"]["currency_code"]
          p_quote: Database["public"]["Enums"]["currency_code"]
        }
        Returns: {
          captured_at: string
          rate: number
          source: string
        }[]
      }
      get_my_capabilities: { Args: never; Returns: string[] }
      has_product_access: {
        Args: { _product_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      imports_apply_list: { Args: { p: Json }; Returns: Json }
      imports_can_manage: { Args: { _uid: string }; Returns: boolean }
      imports_undo_batch: { Args: { p_batch_id: string }; Returns: Json }
      integral_approval_summary: { Args: never; Returns: Json }
      integral_approval_workspace_access: { Args: never; Returns: Json }
      integral_can_access: {
        Args: {
          p_municipality_ibge_id?: number
          p_product_id?: string
          p_state?: string
          p_system_code: string
          p_write?: boolean
        }
        Returns: boolean
      }
      integral_can_access_record: {
        Args: {
          p_municipality_ibge_id?: number
          p_product_id?: string
          p_record_owner_id?: string
          p_state?: string
          p_system_code: string
          p_write?: boolean
        }
        Returns: boolean
      }
      integral_chat: {
        Args: { p_action: string; p_payload?: Json }
        Returns: Json
      }
      integral_claim_member_provisioning: {
        Args: { p_hash: string }
        Returns: boolean
      }
      integral_company_observer: { Args: never; Returns: boolean }
      integral_company_read: {
        Args: { p_limit?: number; p_offset?: number; p_section: string }
        Returns: Json
      }
      integral_configure_new_member: {
        Args: { p_actor: string; p_payload: Json; p_user: string }
        Returns: Json
      }
      integral_connection_ping: {
        Args: { p_code: string; p_token: string }
        Returns: boolean
      }
      integral_dashboard_stock: { Args: never; Returns: Json }
      integral_decide_order: {
        Args: {
          p_commission_amount?: number
          p_commission_mode?: string
          p_decision: string
          p_expected_updated_at?: string
          p_order: string
          p_reason: string
        }
        Returns: Json
      }
      integral_delivery_filter_metadata: {
        Args: { p_order_ids: string[] }
        Returns: Json
      }
      integral_division_orders: {
        Args: { p_limit?: number; p_system_code: string }
        Returns: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          number: number
          order_date: string
          payment_status: string
          seller_id: string
          shipping_state: string
          total: number
          workflow_stage: string
        }[]
      }
      integral_financial_reviewer_access: { Args: never; Returns: boolean }
      integral_initial_member_password: { Args: never; Returns: string }
      integral_is_system_active: { Args: { p_code: string }; Returns: boolean }
      integral_logistics_orders: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      integral_mark_identity_connected: {
        Args: { p_system_code: string }
        Returns: undefined
      }
      integral_member_create_catalog: {
        Args: {
          p_currency?: string
          p_description?: string
          p_item_ids: string[]
          p_layout: string
          p_publish?: boolean
          p_request_id: string
          p_shared?: boolean
          p_title: string
          p_whatsapp?: string
        }
        Returns: Json
      }
      integral_my_general_access: { Args: never; Returns: boolean }
      integral_my_operational_access: { Args: never; Returns: Json }
      integral_my_operations: { Args: never; Returns: string[] }
      integral_operational_limited: { Args: never; Returns: boolean }
      integral_order_context: { Args: { p_order_id: string }; Returns: Json }
      integral_order_credit_context: {
        Args: { p_order_id: string }
        Returns: Json
      }
      integral_order_decision_history: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      integral_order_matches_access: {
        Args: { p_order_id: string; p_system_code: string; p_write?: boolean }
        Returns: boolean
      }
      integral_order_reviewer_access: { Args: never; Returns: boolean }
      integral_order_tracking: {
        Args: {
          p_carrier?: string
          p_code?: string
          p_order_id: string
          p_save?: boolean
        }
        Returns: Json
      }
      integral_payment_decision_history: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      integral_pending_payment_orders: { Args: never; Returns: Json }
      integral_pending_payment_receipts: {
        Args: { p_limit?: number; p_offset?: number; p_product_id?: string }
        Returns: Json
      }
      integral_preview_order_commission: {
        Args: {
          p_exchange: Json
          p_items: Json
          p_order_id?: string
          p_seller_id: string
        }
        Returns: Json
      }
      integral_public_member_catalog_items: {
        Args: { p_catalog_id: string }
        Returns: string[]
      }
      integral_ranking_summary: {
        Args: { p_from?: string; p_product_id?: string }
        Returns: Json
      }
      integral_record_transport_cost: {
        Args: {
          p_amount: number
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_note: string
          p_order: string
        }
        Returns: Json
      }
      integral_region_of_uf: { Args: { p_uf: string }; Returns: string }
      integral_register_payment: {
        Args: { p_order_id: string; p_payment: Json; p_request_id: string }
        Returns: Json
      }
      integral_request_customer_credit: {
        Args: {
          p_amount: number
          p_note?: string
          p_order_id: string
          p_request_id: string
        }
        Returns: Json
      }
      integral_review_order_change: {
        Args: { p_approve: boolean; p_id: string; p_note: string }
        Returns: Json
      }
      integral_review_payment: {
        Args: {
          p_amount?: number
          p_decision: string
          p_expected_amount?: number
          p_method?: string
          p_paid_at?: string
          p_payment: string
          p_reason: string
        }
        Returns: Json
      }
      integral_rotate_connection_token: {
        Args: { p_code: string }
        Returns: string
      }
      integral_sales_catalog: { Args: { p_user_id?: string }; Returns: Json }
      integral_seller_approval_summary: {
        Args: { p_seller_id?: string }
        Returns: Json
      }
      integral_seller_create_customer: {
        Args: { p_email?: string; p_name: string; p_phone?: string }
        Returns: string
      }
      integral_seller_create_order: {
        Args: {
          p_customer_id?: string
          p_expected_quote: Json
          p_request: Json
          p_request_id: string
        }
        Returns: Json
      }
      integral_seller_create_pdv_customer: {
        Args: { p_customer: Json }
        Returns: Json
      }
      integral_seller_create_pdv_order: {
        Args: {
          p_args: Json
          p_estadual?: boolean
          p_exchange: Json
          p_followup: Json
          p_request_id: string
        }
        Returns: Json
      }
      integral_seller_stock_availability: { Args: never; Returns: Json }
      integral_sos_inventory: { Args: { p_user_id: string }; Returns: Json }
      integral_submit_order_edit: {
        Args: {
          p_args: Json
          p_exchange: Json
          p_followup: Json
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      integral_update_dispatch: {
        Args: {
          p_carrier: string
          p_event: string
          p_note: string
          p_order: string
          p_tracking: string
        }
        Returns: Json
      }
      integral_update_member_grants: {
        Args: { p_payload: Json; p_user: string }
        Returns: Json
      }
      integral_update_my_profile: { Args: { p_profile: Json }; Returns: Json }
      inv_can_manage_item: {
        Args: { _item_id: string; _uid: string }
        Returns: boolean
      }
      inv_can_write_product: {
        Args: { _product_id: string; _uid: string }
        Returns: boolean
      }
      inv_in_scope: {
        Args: { _item_id: string; _uid: string }
        Returns: boolean
      }
      inventory_receive_principal: {
        Args: {
          p_item_id: string
          p_quantity: number
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      inventory_replenish: {
        Args: {
          p_bonus_quantity?: number
          p_currency?: Database["public"]["Enums"]["currency_code"]
          p_freight_cost?: number
          p_item_id: string
          p_location?: string
          p_min_quantity?: number
          p_payment_status?: string
          p_quantity: number
          p_source_warehouse_id?: string
          p_target_warehouse_id: string
          p_unit_cost?: number
          p_variable_cost?: number
        }
        Returns: Json
      }
      inventory_sales_orders: {
        Args: never
        Returns: {
          created_at: string
          customer_name: string
          fulfillment_status: string
          item_count: number
          number: number
          order_id: string
          shipping_address: string
          shipping_city: string
          shipping_state: string
          total_quantity: number
          warehouse_city: string
          warehouse_id: string
          warehouse_name: string
          warehouse_state: string
          workflow_stage: string
        }[]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_conversation_member: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      my_deliveries: {
        Args: never
        Returns: {
          address: string
          address_number: string
          cep: string
          city: string
          deadline: string
          delivered_at: string
          delivery_token: string
          fulfillment_status: string
          instructions: string
          number: number
          order_id: string
          phone: string
          recipient: string
          recipient_document: string
          revision_no: number
          state: string
          status: string
          tracking_enabled: boolean
          tracking_status: string
          warehouse_address: string
          warehouse_city: string
          warehouse_name: string
          warehouse_state: string
          workflow_stage: string
        }[]
      }
      order_item_has_stock_lot: {
        Args: { p_item: string; p_order: string }
        Returns: boolean
      }
      order_item_stock_lot_quantity: {
        Args: { p_item: string; p_order: string }
        Returns: number
      }
      promotion_cancel: { Args: { p_id: string }; Returns: undefined }
      promotion_management_items: {
        Args: never
        Returns: {
          category_id: string
          category_name: string
          cost: number
          currency: Database["public"]["Enums"]["currency_code"]
          freight_other_brazil_percent: number
          freight_py_percent: number
          freight_sp_percent: number
          id: string
          name: string
          product_id: string
          product_name: string
          sale_price: number
          supplier_id: string
          supplier_name: string
        }[]
      }
      promotion_save: {
        Args: {
          p_description: string
          p_destination_scope: string
          p_ends_at: string
          p_id: string
          p_item_id: string
          p_promotional_cost?: number
          p_promotional_freight_percent?: number
          p_promotional_sale_price?: number
          p_starts_at: string
          p_title: string
        }
        Returns: string
      }
      promotions_for_management: {
        Args: never
        Returns: {
          created_at: string
          creator_name: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          destination_scope: string
          ends_at: string
          id: string
          item_id: string
          item_name: string
          origin_type: string
          original_cost: number
          original_freight_percent: number
          original_sale_price: number
          promotional_cost: number
          promotional_freight_percent: number
          promotional_sale_price: number
          starts_at: string
          status: string
          title: string
        }[]
      }
      public_order_by_share_token: { Args: { p_token: string }; Returns: Json }
      public_payment_receipt: { Args: { p_token: string }; Returns: Json }
      purchase_create: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_due_date: string
          p_freight_cost?: number
          p_items: Json
          p_notes?: string
          p_purchase_date: string
          p_supplier_id: string
          p_variable_cost?: number
          p_warehouse_id: string
        }
        Returns: Json
      }
      purchase_from_supplier_lots: {
        Args: {
          p_actor: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_due: string
          p_freight: number
          p_items: Json
          p_notes: string
          p_purchase: string
          p_supplier: string
          p_variable: number
          p_warehouse: string
        }
        Returns: Json
      }
      purchase_management_options: { Args: never; Returns: Json }
      purchase_register_payment: {
        Args: {
          p_amount: number
          p_method: string
          p_notes?: string
          p_paid_at: string
          p_purchase_order_id: string
          p_reference?: string
        }
        Returns: Json
      }
      purchase_sync_from_sales_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      purchase_sync_sales_payment: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      purchases_for_management: { Args: never; Returns: Json }
      ranking_championship_standings: { Args: { p_id: string }; Returns: Json }
      record_market_rate_snapshot: {
        Args: { p_markup?: number; p_pairs: Json }
        Returns: boolean
      }
      remuneration_adjust_pending_order: {
        Args: { p_changes: Json; p_order: string; p_reason: string }
        Returns: Json
      }
      remuneration_adjust_reviewed_order: {
        Args: {
          p_changes: Json
          p_expected_updated_at: string
          p_order: string
          p_reason: string
        }
        Returns: Json
      }
      remuneration_approval_queue: { Args: { p_order?: string }; Returns: Json }
      remuneration_approve_period_accrual: {
        Args: {
          p_accrual: string
          p_expected_updated_at: string
          p_reason: string
        }
        Returns: Json
      }
      remuneration_attach_member_receipt: {
        Args: { p_entry: string; p_path: string; p_signed: boolean }
        Returns: Json
      }
      remuneration_can_access_member_receipt: {
        Args: { p_folder: string }
        Returns: boolean
      }
      remuneration_close_order: {
        Args: { p_order: string; p_reason: string }
        Returns: Json
      }
      remuneration_commission_breakdown: {
        Args: { p_order: string }
        Returns: Json
      }
      remuneration_create_order: {
        Args: {
          p_args: Json
          p_exchange: Json
          p_followup: Json
          p_request_id: string
        }
        Returns: Json
      }
      remuneration_duplicate_lost_order: {
        Args: { p_order: string }
        Returns: Json
      }
      remuneration_member_receipts: { Args: never; Returns: Json }
      remuneration_pending_cancellations: { Args: never; Returns: Json }
      remuneration_pending_closures: { Args: never; Returns: Json }
      remuneration_period_proposals: { Args: never; Returns: Json }
      remuneration_refresh_member_periods: {
        Args: { p_member: string }
        Returns: Json
      }
      remuneration_request_cancellation: {
        Args: { p_order: string; p_reason: string; p_warehouse?: string }
        Returns: Json
      }
      remuneration_review_cancellation: {
        Args: {
          p_approve: boolean
          p_disposition: string
          p_expected_updated_at: string
          p_reason: string
          p_request: string
        }
        Returns: Json
      }
      remuneration_review_order: {
        Args: {
          p_approve: boolean
          p_commission_amount?: number
          p_commission_mode?: string
          p_expected_updated_at?: string
          p_order: string
          p_reason: string
        }
        Returns: Json
      }
      remuneration_sales_workflow_enabled: { Args: never; Returns: boolean }
      remuneration_save_policy: {
        Args: { p_payload: Json; p_previous: string; p_reason: string }
        Returns: string
      }
      remuneration_workflow_status: { Args: never; Returns: Json }
      reveal_company_access_secret: {
        Args: { p_access_id: string }
        Returns: string
      }
      sales_apply_order_commissions: {
        Args: { p_items: Json; p_order_id: string }
        Returns: undefined
      }
      sales_apply_stock: {
        Args: { p_action: string; p_order_id: string; p_user_id: string }
        Returns: undefined
      }
      sales_assign_order_seller: {
        Args: { p_order_id: string; p_seller_id: string }
        Returns: undefined
      }
      sales_calculate_shipping: {
        Args: { p_items: Json; p_state: string }
        Returns: Json
      }
      sales_can_assign_seller: {
        Args: { _seller_id: string; _user_id: string }
        Returns: boolean
      }
      sales_can_manage: {
        Args: { _seller_id: string; _user_id: string }
        Returns: boolean
      }
      sales_can_see_order: { Args: { _order_id: string }; Returns: boolean }
      sales_can_see_quote: { Args: { _quote_id: string }; Returns: boolean }
      sales_can_view_customer: {
        Args: { _created_by?: string; _customer_id: string }
        Returns: boolean
      }
      sales_cancel_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
      sales_cancel_order_payment: {
        Args: { p_order_id: string; p_payment_id: string; p_reason: string }
        Returns: Json
      }
      sales_cancel_quote: {
        Args: { p_quote_id: string; p_reason: string }
        Returns: Json
      }
      sales_confirm_order: { Args: { p_order_id: string }; Returns: Json }
      sales_convert_quote: {
        Args: { p_kind: string; p_payments: Json; p_quote_id: string }
        Returns: Json
      }
      sales_create_document: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_id: string
          p_discount: number
          p_items: Json
          p_kind: string
          p_notes: string
          p_origin: string
          p_payment_installments: string
          p_payment_method: string
          p_payments: Json
          p_product_id: string
          p_valid_until: string
          p_whatsapp: string
        }
        Returns: Json
      }
      sales_create_document_v2: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_id: string
          p_discount: number
          p_items: Json
          p_kind: string
          p_notes: string
          p_origin: string
          p_payment_installments: string
          p_payment_method: string
          p_payments: Json
          p_product_id: string
          p_shipping_cost: number
          p_shipping_percentage: number
          p_valid_until: string
          p_whatsapp: string
        }
        Returns: Json
      }
      sales_create_document_v2_without_cash_receipt: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_id: string
          p_discount: number
          p_items: Json
          p_kind: string
          p_notes: string
          p_origin: string
          p_payment_installments: string
          p_payment_method: string
          p_payments: Json
          p_product_id: string
          p_shipping_cost: number
          p_shipping_percentage: number
          p_valid_until: string
          p_whatsapp: string
        }
        Returns: Json
      }
      sales_delete_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
      sales_edit_order_payment: {
        Args: {
          p_amount: number
          p_method: string
          p_order_id: string
          p_payment_id: string
          p_proof_id: string
          p_reason: string
        }
        Returns: Json
      }
      sales_finalize_order_edit_audit: {
        Args: { p_audit_id: string; p_order_id: string }
        Returns: undefined
      }
      sales_get_order_item_costs: {
        Args: { p_order_ids: string[] }
        Returns: {
          is_manual: boolean
          order_item_id: string
          unit_cost: number
        }[]
      }
      sales_invoice_preorder: {
        Args: { p_order_id: string; p_payments: Json }
        Returns: Json
      }
      sales_items_for_sale: {
        Args: { _product_id?: string }
        Returns: {
          available: number
          barcode: string
          brand: string
          category_id: string
          commission_percent: number
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          max_discount_percent: number
          name: string
          price: number
          product_id: string
          promotion_ends_at: string
          promotion_id: string
          promotion_starts_at: string
          promotion_title: string
          promotional_price: number
          sku: string
          unit: string
          variation: string
        }[]
      }
      sales_mark_order_lost: { Args: { p_order_id: string }; Returns: Json }
      sales_next_number: { Args: { p_scope: string }; Returns: number }
      sales_order_detail: { Args: { p_order_id: string }; Returns: Json }
      sales_order_history: {
        Args: { p_order_id: string }
        Returns: {
          action: string
          changed_by: string
          changed_by_name: string
          created_at: string
          id: string
          new_order_id: string
          new_snapshot: Json
          note: string
          order_id: string
          previous_snapshot: Json
          revision_no: number
        }[]
      }
      sales_order_share_token: { Args: { p_order_id: string }; Returns: string }
      sales_order_snapshot: { Args: { p_order_id: string }; Returns: Json }
      sales_payment_received: {
        Args: { p_args: Json; p_edit?: boolean }
        Returns: Json
      }
      sales_payment_received_manual: {
        Args: { p_args: Json; p_exchange: Json }
        Returns: Json
      }
      sales_preserve_revision_number: {
        Args: { p_order_id: string }
        Returns: Json
      }
      sales_recalculate_order_cost: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      sales_register_payment: {
        Args: {
          p_amount: number
          p_method: string
          p_order_id: string
          p_proof_id: string
        }
        Returns: Json
      }
      sales_register_revision: {
        Args: {
          p_new_order_id: string
          p_note?: string
          p_previous_order_id: string
        }
        Returns: Json
      }
      sales_replace_items: {
        Args: {
          p_discount: number
          p_doc_id: string
          p_doc_type: string
          p_items: Json
        }
        Returns: Json
      }
      sales_replace_order_version: {
        Args: {
          p_carrier: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_id: string
          p_delivery_deadline: string
          p_discount: number
          p_items: Json
          p_notes: string
          p_previous_order_id: string
          p_product_id: string
          p_revision_note: string
          p_shipping_address: string
          p_shipping_city: string
          p_shipping_cost: number
          p_shipping_percentage: number
          p_shipping_state: string
          p_tracking_code: string
          p_warehouse_id: string
          p_whatsapp: string
        }
        Returns: Json
      }
      sales_replace_order_version_internal: {
        Args: {
          p_carrier: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_id: string
          p_delivery_deadline: string
          p_discount: number
          p_items: Json
          p_notes: string
          p_previous_order_id: string
          p_product_id: string
          p_revision_note: string
          p_shipping_address: string
          p_shipping_city: string
          p_shipping_cost: number
          p_shipping_percentage: number
          p_shipping_state: string
          p_tracking_code: string
          p_warehouse_id: string
          p_whatsapp: string
        }
        Returns: Json
      }
      sales_save_order_edit: {
        Args: { p_args: Json; p_exchange?: Json; p_followup: Json }
        Returns: Json
      }
      sales_sees_all: { Args: { _user_id: string }; Returns: boolean }
      sales_seller_options: {
        Args: never
        Returns: {
          full_name: string
          id: string
          teams: string
        }[]
      }
      sales_set_cancel_return_warehouse: {
        Args: { p_order_id: string; p_warehouse_id: string }
        Returns: undefined
      }
      sales_set_order_item_costs: {
        Args: { p_costs: Json; p_order_id: string }
        Returns: undefined
      }
      sales_set_stage: {
        Args: { p_order_id: string; p_stage: string }
        Returns: Json
      }
      sales_update_order_address_number: {
        Args: { p_number: string; p_order_id: string }
        Returns: undefined
      }
      sales_update_order_dates: {
        Args: {
          p_delivered_at: string
          p_delivery_deadline: string
          p_order_date: string
          p_order_id: string
          p_shipping_country: string
        }
        Returns: Json
      }
      sales_update_order_delivery: {
        Args: {
          p_carrier: string
          p_deadline: string
          p_order_id: string
          p_tracking_code: string
        }
        Returns: Json
      }
      sales_update_order_logistics: {
        Args: {
          p_address: string
          p_city: string
          p_order_id: string
          p_state: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      sales_update_payment_date: {
        Args: { p_order_id: string; p_paid_at: string; p_payment_id: string }
        Returns: Json
      }
      sales_validate_items: {
        Args: { p_items: Json; p_product_id: string; p_user_id: string }
        Returns: undefined
      }
      sales_visible_customer_ownership: {
        Args: never
        Returns: {
          customer_id: string
          seller_id: string
          team_id: string
        }[]
      }
      sales_warehouses: {
        Args: never
        Returns: {
          city: string
          country: string
          id: string
          latitude: number
          level: string
          longitude: number
          name: string
          parent_id: string
          state: string
        }[]
      }
      sales_with_order_exchange: {
        Args: { p_args: Json; p_exchange: Json; p_rpc: string }
        Returns: Json
      }
      save_company_access: {
        Args: {
          p_category: string
          p_id: string
          p_notes: string
          p_page_url: string
          p_secret: string
          p_team_id: string
          p_title: string
          p_username: string
          p_viewers_can_edit: boolean
          p_viewers_can_reveal: boolean
          p_visibility_scope: string
        }
        Returns: string
      }
      seller_portal_create_sale: {
        Args: {
          p_expected_quote: Json
          p_payment: Json
          p_request: Json
          p_request_id: string
        }
        Returns: Json
      }
      seller_portal_data: { Args: { p_user_id?: string }; Returns: Json }
      seller_portal_quote: { Args: { p_request: Json }; Returns: Json }
      seller_portal_register_payment: {
        Args: { p_order_id: string; p_payment: Json; p_request_id: string }
        Returns: Json
      }
      set_team_client_visibility: {
        Args: { _enabled: boolean; _team_id: string }
        Returns: undefined
      }
      stock_can_read_order: {
        Args: { _order_id: string; _uid: string }
        Returns: boolean
      }
      stock_user_warehouse_scope: {
        Args: { _uid: string; _warehouse_id: string }
        Returns: boolean
      }
      supplier_portal_data: { Args: { p_supplier_id?: string }; Returns: Json }
      supplier_save_bonus_policy: {
        Args: {
          p_item_id: string
          p_mode: string
          p_supplier_id: string
          p_value: number
        }
        Returns: string
      }
      supplier_set_user: {
        Args: { p_supplier_id: string; p_user_id: string }
        Returns: undefined
      }
      supplier_stock_lot_create: {
        Args: {
          p_actor: string
          p_codes: Json
          p_cost: number
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_expiry: string
          p_item: string
          p_lot: string
          p_manufacture: string
          p_purchase: string
          p_supplier: string
        }
        Returns: string
      }
      task_can_receive_request: { Args: { _uid: string }; Returns: boolean }
      task_initial_reviewer: {
        Args: { _team_id: string; _uid: string }
        Returns: string
      }
      task_request_recipients: {
        Args: never
        Returns: {
          area_name: string
          full_name: string
          id: string
          role_name: string
        }[]
      }
      tracking_close_view: {
        Args: { _reason?: string; _view_id: string }
        Returns: undefined
      }
      tracking_expire_sessions: { Args: never; Returns: undefined }
      tracking_ingest_point: {
        Args: {
          _accuracy: number
          _dedupe: string
          _device_time: string
          _external_device_id: string
          _heading: number
          _lat: number
          _lng: number
          _provider: string
          _speed: number
        }
        Returns: Json
      }
      tracking_log_view: {
        Args: { _action: string; _order_id: string }
        Returns: undefined
      }
      tracking_open_view: {
        Args: { _order_id: string; _session_id: string }
        Returns: Json
      }
      tracking_purge_points: { Args: { _days?: number }; Returns: number }
      tracking_push_point: {
        Args: {
          _accuracy?: number
          _device_time?: string
          _heading?: number
          _lat: number
          _lng: number
          _session_id: string
          _speed?: number
        }
        Returns: Json
      }
      tracking_rate_hit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      tracking_read_positions: {
        Args: { _limit?: number; _session_id: string; _view_id: string }
        Returns: {
          accuracy_m: number
          device_time: string
          heading_deg: number
          id: string
          latitude: number
          longitude: number
          received_at: string
          source: string
          speed_kmh: number
        }[]
      }
      tracking_session_action: {
        Args: { _action: string; _reason?: string; _session_id: string }
        Returns: Json
      }
      update_product_authenticity_theme: {
        Args: {
          p_accent_color: string
          p_actor: string
          p_background_color: string
          p_description: string
          p_item: string
          p_logo_url: string
          p_primary_color: string
          p_show_code_validator: boolean
          p_show_expiry: boolean
          p_show_lot: boolean
          p_show_manufacture: boolean
          p_title: string
          p_website_url: string
        }
        Returns: undefined
      }
      warehouse_has_cap: {
        Args: { _cap: string; _uid: string }
        Returns: boolean
      }
      whatsapp_account_visible: {
        Args: { _account_id: string }
        Returns: boolean
      }
      whatsapp_assign_conversation: {
        Args: { _assignee: string; _conversation_id: string }
        Returns: undefined
      }
      whatsapp_can_manage: { Args: never; Returns: boolean }
      whatsapp_conversation_visible: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      whatsapp_mark_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      whatsapp_purge_webhook_events: {
        Args: { _days?: number }
        Returns: number
      }
      whatsapp_rate_hit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      whatsapp_team_assignees: {
        Args: { _conversation_id: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
        }[]
      }
      whatsapp_upsert_contact:
        | {
            Args: {
              _account_id: string
              _name: string
              _phone: string
              _product_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _account_id: string
              _name: string
              _phone: string
              _product_id: string
              _referral?: Json
            }
            Returns: string
          }
        | {
            Args: {
              _account_id: string
              _name: string
              _owner_id?: string
              _phone: string
              _product_id: string
              _referral?: Json
            }
            Returns: string
          }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin"
        | "gestor"
        | "vendedor"
        | "financeiro"
        | "estoque"
        | "fornecedor"
        | "entregador"
      currency_code: "BRL" | "USD" | "PYG"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "superadmin",
        "admin",
        "gestor",
        "vendedor",
        "financeiro",
        "estoque",
        "fornecedor",
        "entregador",
      ],
      currency_code: ["BRL", "USD", "PYG"],
    },
  },
} as const

