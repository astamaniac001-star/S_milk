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
  public: {
    Tables: {
      adjustments: {
        Row: {
          amount: number | null
          applied: boolean | null
          bill_id: string | null
          created_at: string | null
          customer_id: string | null
          date: string | null
          id: string
          reason: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          applied?: boolean | null
          bill_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          date?: string | null
          id?: string
          reason?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          applied?: boolean | null
          bill_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          date?: string | null
          id?: string
          reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adjustments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount: number | null
          amount_paid: number | null
          created_at: string | null
          customer_id: string | null
          id: string
          locked: boolean | null
          month: string
          status: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          amount?: number | null
          amount_paid?: number | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          locked?: boolean | null
          month: string
          status?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          amount?: number | null
          amount_paid?: number | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          locked?: boolean | null
          month?: string
          status?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount: number | null
          applied: boolean | null
          applied_to_bill_id: string | null
          bill_id: string | null
          created_at: string | null
          customer_id: string | null
          date: string | null
          id: string
          reason: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          applied?: boolean | null
          applied_to_bill_id?: string | null
          bill_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          date?: string | null
          id?: string
          reason?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          applied?: boolean | null
          applied_to_bill_id?: string | null
          bill_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          date?: string | null
          id?: string
          reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_applied_to_bill_id_fkey"
            columns: ["applied_to_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          balance: number | null
          created_at: string | null
          daily_qty: number | null
          delivery_address: string | null
          delivery_days: Json | null
          id: string
          name: string
          phone: string | null
          product: string | null
          status: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          daily_qty?: number | null
          delivery_address?: string | null
          delivery_days?: Json | null
          id?: string
          name: string
          phone?: string | null
          product?: string | null
          status?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          daily_qty?: number | null
          delivery_address?: string | null
          delivery_days?: Json | null
          id?: string
          name?: string
          phone?: string | null
          product?: string | null
          status?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          created_at: string | null
          customer_id: string | null
          date: string
          delivered: boolean | null
          id: string
          note: string | null
          product: string | null
          qty: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          date: string
          delivered?: boolean | null
          id?: string
          note?: string | null
          product?: string | null
          qty?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          date?: string
          delivered?: boolean | null
          id?: string
          note?: string | null
          product?: string | null
          qty?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      milk_brands: {
        Row: {
          brand_name: string
          created_at: string | null
          default_milk_type: string | null
          id: string
          rate_per_liter: number | null
          status: string | null
          supplier_name: string | null
          supplier_phone: string | null
        }
        Insert: {
          brand_name: string
          created_at?: string | null
          default_milk_type?: string | null
          id?: string
          rate_per_liter?: number | null
          status?: string | null
          supplier_name?: string | null
          supplier_phone?: string | null
        }
        Update: {
          brand_name?: string
          created_at?: string | null
          default_milk_type?: string | null
          id?: string
          rate_per_liter?: number | null
          status?: string | null
          supplier_name?: string | null
          supplier_phone?: string | null
        }
        Relationships: []
      }
      milk_imports: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          created_at: string | null
          date: string
          id: string
          invoice_number: string | null
          milk_type: string | null
          quantity: number | null
          rate_per_liter: number | null
          status: string | null
          supplier_name: string | null
          total_cost: number | null
          version: number | null
        }
        Insert: {
          brand_id?: string | null
          brand_name?: string | null
          created_at?: string | null
          date: string
          id?: string
          invoice_number?: string | null
          milk_type?: string | null
          quantity?: number | null
          rate_per_liter?: number | null
          status?: string | null
          supplier_name?: string | null
          total_cost?: number | null
          version?: number | null
        }
        Update: {
          brand_id?: string | null
          brand_name?: string | null
          created_at?: string | null
          date?: string
          id?: string
          invoice_number?: string | null
          milk_type?: string | null
          quantity?: number | null
          rate_per_liter?: number | null
          status?: string | null
          supplier_name?: string | null
          total_cost?: number | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "milk_imports_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "milk_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      pause_periods: {
        Row: {
          created_at: string | null
          customer_id: string | null
          end_date: string | null
          id: string
          reason: string | null
          start_date: string
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          end_date?: string | null
          id?: string
          reason?: string | null
          start_date: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          end_date?: string | null
          id?: string
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "pause_periods_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bill_id: string
          created_at: string | null
          customer_id: string
          id: string
          idempotency_key: string | null
          note: string | null
          payment_date: string
          payment_mode: string | null
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string | null
          customer_id: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          payment_date: string
          payment_mode?: string | null
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string | null
          customer_id?: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          payment_date?: string
          payment_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string | null
          customer_id: string | null
          delivery_days: Json | null
          id: string
          is_active: boolean | null
          milk_type: string | null
          qty: number | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          delivery_days?: Json | null
          id?: string
          is_active?: boolean | null
          milk_type?: string | null
          qty?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          delivery_days?: Json | null
          id?: string
          is_active?: boolean | null
          milk_type?: string | null
          qty?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_adjustment_rpc:
        | {
            Args: { p_adjustment_id: string; p_bill_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_adjustment_id: string
              p_bill_id: string
              p_version: number
            }
            Returns: Json
          }
      generate_month_bill_rpc: {
        Args: { p_customer_id: string; p_month: string }
        Returns: Json
      }
      is_operator: { Args: never; Returns: boolean }
      record_payment: {
        Args: {
          p_amount: number
          p_bill_id: string
          p_date?: string
          p_mode?: string
          p_note?: string
        }
        Returns: Json
      }
      record_payment_rpc:
        | {
            Args: {
              p_amount: number
              p_bill_id: string
              p_date: string
              p_idempotency_key: string
              p_mode: string
              p_note: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_bill_id: string
              p_idempotency_key: string
              p_mode: string
              p_note: string
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
  public: {
    Enums: {},
  },
} as const
