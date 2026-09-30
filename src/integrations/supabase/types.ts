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
    PostgrestVersion: "14.5"
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
      accounts_payable: {
        Row: {
          amount: number
          category: string | null
          cost_center: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          due_date: string
          id: string
          installment_number: number | null
          installments_total: number | null
          is_demo: boolean
          paid_at: string | null
          product_id: string | null
          recurrence: string
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
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          is_demo?: boolean
          paid_at?: string | null
          product_id?: string | null
          recurrence?: string
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
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          is_demo?: boolean
          paid_at?: string | null
          product_id?: string | null
          recurrence?: string
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
          id: string
          installment_number: number | null
          installments_total: number | null
          is_demo: boolean
          order_id: string | null
          paid_at: string | null
          product_id: string | null
          recurrence: string
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
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          is_demo?: boolean
          order_id?: string | null
          paid_at?: string | null
          product_id?: string | null
          recurrence?: string
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
          id?: string
          installment_number?: number | null
          installments_total?: number | null
          is_demo?: boolean
          order_id?: string | null
          paid_at?: string | null
          product_id?: string | null
          recurrence?: string
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
      bonus_awards: {
        Row: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          id: string
          is_demo: boolean
          period_end: string | null
          period_start: string | null
          product_id: string | null
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
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
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
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
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
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_events: {
        Row: {
          created_at: string
          created_by: string | null
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
          logo_url: string | null
          offer_item_ids: string[]
          orders_enabled: boolean
          payment_methods: string[]
          pickup_address: string | null
          pickup_enabled: boolean
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
          whatsapp: string | null
        }
        Insert: {
          about?: string | null
          accent_color?: string | null
          banner_url?: string | null
          brands?: string[]
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
          logo_url?: string | null
          offer_item_ids?: string[]
          orders_enabled?: boolean
          payment_methods?: string[]
          pickup_address?: string | null
          pickup_enabled?: boolean
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
          whatsapp?: string | null
        }
        Update: {
          about?: string | null
          accent_color?: string | null
          banner_url?: string | null
          brands?: string[]
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
          logo_url?: string | null
          offer_item_ids?: string[]
          orders_enabled?: boolean
          payment_methods?: string[]
          pickup_address?: string | null
          pickup_enabled?: boolean
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
          state: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          redirect_uri: string
          state: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          state?: string
          used_at?: string | null
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
        }
        Insert: {
          created_at?: string
          item_id: string
          location?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          item_id?: string
          location?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_locations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          barcode: string | null
          brand: string | null
          category_id: string | null
          commission_percent: number
          cost: number | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          extra_cost: number
          id: string
          image_url: string | null
          is_active: boolean
          is_demo: boolean
          location: string | null
          markup_percent: number
          min_quantity: number
          name: string
          price: number | null
          product_id: string | null
          quantity: number
          reserved: number
          size: string | null
          sku: string | null
          supplier_id: string | null
          tax_percent: number
          unit: string | null
          updated_at: string
          variation: string | null
          volume: string | null
          weight: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          commission_percent?: number
          cost?: number | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          extra_cost?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_demo?: boolean
          location?: string | null
          markup_percent?: number
          min_quantity?: number
          name: string
          price?: number | null
          product_id?: string | null
          quantity?: number
          reserved?: number
          size?: string | null
          sku?: string | null
          supplier_id?: string | null
          tax_percent?: number
          unit?: string | null
          updated_at?: string
          variation?: string | null
          volume?: string | null
          weight?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          commission_percent?: number
          cost?: number | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          extra_cost?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_demo?: boolean
          location?: string | null
          markup_percent?: number
          min_quantity?: number
          name?: string
          price?: number | null
          product_id?: string | null
          quantity?: number
          reserved?: number
          size?: string | null
          sku?: string | null
          supplier_id?: string | null
          tax_percent?: number
          unit?: string | null
          updated_at?: string
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
          created_at: string
          document_id: string | null
          document_number: number | null
          document_type: string | null
          id: string
          item_id: string
          movement_type: string
          quantity: number
          reason: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          document_number?: number | null
          document_type?: string | null
          id?: string
          item_id: string
          movement_type: string
          quantity: number
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          document_number?: number | null
          document_type?: string | null
          id?: string
          item_id?: string
          movement_type?: string
          quantity?: number
          reason?: string | null
          user_id?: string | null
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
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          barcode: string | null
          created_at: string
          description: string
          discount: number
          id: string
          item_id: string | null
          order_id: string
          quantity: number
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
          order_id: string
          quantity?: number
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
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          carrier: string | null
          catalog_id: string | null
          catalog_slug: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string | null
          delivered_at: string | null
          delivery: Json | null
          delivery_deadline: string | null
          discount: number
          exchange_rate: number | null
          grace_days: number
          id: string
          idempotency_key: string | null
          is_demo: boolean
          kind: string
          notes: string | null
          number: number
          order_date: string
          origin: string | null
          payment_installments: string | null
          payment_method: string | null
          product_id: string | null
          quote_id: string | null
          seller_id: string | null
          shipping_cost: number
          shipping_fee: number
          status: string
          stock_state: string
          supplier_id: string | null
          total: number
          tracking_code: string | null
          tracking_enabled: boolean
          tracking_location: string | null
          tracking_status: string | null
          tracking_url: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          carrier?: string | null
          catalog_id?: string | null
          catalog_slug?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          delivered_at?: string | null
          delivery?: Json | null
          delivery_deadline?: string | null
          discount?: number
          exchange_rate?: number | null
          grace_days?: number
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          kind?: string
          notes?: string | null
          number?: number
          order_date?: string
          origin?: string | null
          payment_installments?: string | null
          payment_method?: string | null
          product_id?: string | null
          quote_id?: string | null
          seller_id?: string | null
          shipping_cost?: number
          shipping_fee?: number
          status?: string
          stock_state?: string
          supplier_id?: string | null
          total?: number
          tracking_code?: string | null
          tracking_enabled?: boolean
          tracking_location?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          carrier?: string | null
          catalog_id?: string | null
          catalog_slug?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string | null
          delivered_at?: string | null
          delivery?: Json | null
          delivery_deadline?: string | null
          discount?: number
          exchange_rate?: number | null
          grace_days?: number
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          kind?: string
          notes?: string | null
          number?: number
          order_date?: string
          origin?: string | null
          payment_installments?: string | null
          payment_method?: string | null
          product_id?: string | null
          quote_id?: string | null
          seller_id?: string | null
          shipping_cost?: number
          shipping_fee?: number
          status?: string
          stock_state?: string
          supplier_id?: string | null
          total?: number
          tracking_code?: string | null
          tracking_enabled?: boolean
          tracking_location?: string | null
          tracking_status?: string | null
          tracking_url?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
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
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          id: string
          installment: number | null
          method: string | null
          order_id: string | null
          paid_at: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date?: string | null
          id?: string
          installment?: number | null
          method?: string | null
          order_id?: string | null
          paid_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date?: string | null
          id?: string
          installment?: number | null
          method?: string | null
          order_id?: string | null
          paid_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          id: string
          is_demo: boolean
          paid_at: string | null
          payable_id: string | null
          period_end: string | null
          period_start: string | null
          product_id: string | null
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
          id?: string
          is_demo?: boolean
          paid_at?: string | null
          payable_id?: string | null
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
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
          id?: string
          is_demo?: boolean
          paid_at?: string | null
          payable_id?: string | null
          period_end?: string | null
          period_start?: string | null
          product_id?: string | null
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
            foreignKeyName: "payroll_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_demo: boolean
          name: string
          position: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
          name: string
          position?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_demo?: boolean
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
          title: string
          updated_at: string
          video_url: string | null
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
          title: string
          updated_at?: string
          video_url?: string | null
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
          title?: string
          updated_at?: string
          video_url?: string | null
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
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          manager_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          manager_id?: string | null
          name?: string
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
      warehouse_user_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          product_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          product_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_user_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      [_ in never]: never
    }
    Functions: {
      app_has_cap: { Args: { _cap: string; _uid: string }; Returns: boolean }
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
      delivery_is_assigned: {
        Args: { _order_id: string; _uid: string }
        Returns: boolean
      }
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
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_conversation_member: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      my_deliveries: {
        Args: never
        Returns: {
          address: string
          deadline: string
          delivered_at: string
          instructions: string
          number: number
          order_id: string
          phone: string
          recipient: string
          status: string
          tracking_status: string
        }[]
      }
      sales_apply_stock: {
        Args: { p_action: string; p_order_id: string; p_user_id: string }
        Returns: undefined
      }
      sales_can_manage: {
        Args: { _seller_id: string; _user_id: string }
        Returns: boolean
      }
      sales_can_see_order: { Args: { _order_id: string }; Returns: boolean }
      sales_can_see_quote: { Args: { _quote_id: string }; Returns: boolean }
      sales_cancel_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
      sales_cancel_quote: {
        Args: { p_quote_id: string; p_reason: string }
        Returns: Json
      }
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
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          name: string
          price: number
          product_id: string
          sku: string
          unit: string
          variation: string
        }[]
      }
      sales_next_number: { Args: { p_scope: string }; Returns: number }
      sales_replace_items: {
        Args: {
          p_discount: number
          p_doc_id: string
          p_doc_type: string
          p_items: Json
        }
        Returns: Json
      }
      sales_sees_all: { Args: { _user_id: string }; Returns: boolean }
      sales_validate_items: {
        Args: { p_items: Json; p_product_id: string; p_user_id: string }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
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
