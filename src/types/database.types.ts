export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      abastecimento_parcelas: {
        Row: {
          abastecimento_id: string
          created_at: string
          id: string
          parcela_num: number
          transaction_id: string
          user_id: string
        }
        Insert: {
          abastecimento_id: string
          created_at?: string
          id?: string
          parcela_num: number
          transaction_id: string
          user_id: string
        }
        Update: {
          abastecimento_id?: string
          created_at?: string
          id?: string
          parcela_num?: number
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abastecimento_parcelas_abastecimento_id_fkey"
            columns: ["abastecimento_id"]
            isOneToOne: false
            referencedRelation: "abastecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_parcelas_abastecimento_id_fkey"
            columns: ["abastecimento_id"]
            isOneToOne: false
            referencedRelation: "v_abastecimento_consumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_parcelas_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      abastecimentos: {
        Row: {
          amount_cents: number | null
          carro_id: string
          combustivel: string | null
          created_at: string
          id: string
          litros: number
          note: string | null
          occurred_on: string
          odometro_km: number
          parcelas_total: number | null
          tanque_cheio: boolean
          transaction_id: string | null
          user_id: string
          valor_total_cents: number | null
        }
        Insert: {
          amount_cents?: number | null
          carro_id: string
          combustivel?: string | null
          created_at?: string
          id?: string
          litros: number
          note?: string | null
          occurred_on: string
          odometro_km: number
          parcelas_total?: number | null
          tanque_cheio: boolean
          transaction_id?: string | null
          user_id: string
          valor_total_cents?: number | null
        }
        Update: {
          amount_cents?: number | null
          carro_id?: string
          combustivel?: string | null
          created_at?: string
          id?: string
          litros?: number
          note?: string | null
          occurred_on?: string
          odometro_km?: number
          parcelas_total?: number | null
          tanque_cheio?: boolean
          transaction_id?: string | null
          user_id?: string
          valor_total_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "abastecimentos_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "v_carro_resumo"
            referencedColumns: ["carro_id"]
          },
          {
            foreignKeyName: "abastecimentos_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          created_at: string
          key_secret_id: string
          model: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          key_secret_id: string
          model: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          key_secret_id?: string
          model?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_targets: {
        Row: {
          category_id: string
          created_at: string
          direction: string
          id: string
          percent_bp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          direction: string
          id?: string
          percent_bp: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          direction?: string
          id?: string
          percent_bp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_targets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      carros: {
        Row: {
          ano: number | null
          apelido: string
          combustivel_padrao: string | null
          created_at: string
          id: string
          is_archived: boolean
          modelo: string | null
          placa: string | null
          user_id: string
        }
        Insert: {
          ano?: number | null
          apelido: string
          combustivel_padrao?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          modelo?: string | null
          placa?: string | null
          user_id: string
        }
        Update: {
          ano?: number | null
          apelido?: string
          combustivel_padrao?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          modelo?: string | null
          placa?: string | null
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_archived: boolean
          is_reserva: boolean
          kind: string
          name: string
          sort: number
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          is_reserva?: boolean
          kind: string
          name: string
          sort?: number
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          is_reserva?: boolean
          kind?: string
          name?: string
          sort?: number
          user_id?: string
        }
        Relationships: []
      }
      category_keywords: {
        Row: {
          category_id: string
          created_at: string
          id: string
          keyword: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          keyword: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          keyword?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_keywords_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      csv_import_profiles: {
        Row: {
          created_at: string
          header_signature: string
          id: string
          mapping: Json
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          header_signature: string
          id?: string
          mapping: Json
          name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          header_signature?: string
          id?: string
          mapping?: Json
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      income_occurrences: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          month_key: string
          occurred_on: string
          source: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          month_key: string
          occurred_on: string
          source: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          month_key?: string
          occurred_on?: string
          source?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_occurrences_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "income_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      income_templates: {
        Row: {
          amount_cents: number
          created_at: string
          day_of_month: number
          id: string
          is_active: boolean
          source: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          day_of_month: number
          id?: string
          is_active?: boolean
          source: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          day_of_month?: number
          id?: string
          is_active?: boolean
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      mei_invoices: {
        Row: {
          activity_type: string
          amount_cents: number
          created_at: string
          descricao: string
          id: string
          issued_on: string
          tomador: string
          user_id: string
        }
        Insert: {
          activity_type: string
          amount_cents: number
          created_at?: string
          descricao?: string
          id?: string
          issued_on: string
          tomador: string
          user_id: string
        }
        Update: {
          activity_type?: string
          amount_cents?: number
          created_at?: string
          descricao?: string
          id?: string
          issued_on?: string
          tomador?: string
          user_id?: string
        }
        Relationships: []
      }
      mei_settings: {
        Row: {
          created_at: string
          id: string
          mei_start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mei_start_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mei_start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      mei_year_flags: {
        Row: {
          created_at: string
          has_employee: boolean
          id: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          has_employee?: boolean
          id?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          has_employee?: boolean
          id?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      merchant_patterns: {
        Row: {
          category_id: string
          created_at: string
          descriptor_norm: string
          hit_count: number
          id: string
          last_used_at: string | null
          reserva_id: string | null
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          descriptor_norm: string
          hit_count?: number
          id?: string
          last_used_at?: string | null
          reserva_id?: string | null
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          descriptor_norm?: string
          hit_count?: number
          id?: string
          last_used_at?: string | null
          reserva_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_patterns_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_patterns_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_patterns_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "v_reserva_balance"
            referencedColumns: ["reserva_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      reserva_ledger: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          kind: string
          note: string
          occurred_on: string
          reserva_id: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          kind: string
          note?: string
          occurred_on: string
          reserva_id: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          kind?: string
          note?: string
          occurred_on?: string
          reserva_id?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_ledger_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_ledger_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "v_reserva_balance"
            referencedColumns: ["reserva_id"]
          },
          {
            foreignKeyName: "reserva_ledger_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas: {
        Row: {
          alvo_cents: number | null
          created_at: string
          id: string
          is_archived: boolean
          nome: string
          user_id: string
        }
        Insert: {
          alvo_cents?: number | null
          created_at?: string
          id?: string
          is_archived?: boolean
          nome: string
          user_id: string
        }
        Update: {
          alvo_cents?: number | null
          created_at?: string
          id?: string
          is_archived?: boolean
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      statements: {
        Row: {
          content_hash: string
          created_at: string
          format: string
          id: string
          original_filename: string
          parsed_rows: Json | null
          period_end: string | null
          period_start: string | null
          status: string
          storage_path: string
          summary: Json | null
          tx_count: number
          user_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          format: string
          id?: string
          original_filename?: string
          parsed_rows?: Json | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          storage_path: string
          summary?: Json | null
          tx_count?: number
          user_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          format?: string
          id?: string
          original_filename?: string
          parsed_rows?: Json | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          storage_path?: string
          summary?: Json | null
          tx_count?: number
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_cents: number
          carro_id: string | null
          category_id: string | null
          classification_source: string | null
          created_at: string
          dedupe_key: string | null
          description: string
          descriptor_norm: string | null
          id: string
          is_recurring: boolean
          kind: string
          occurred_on: string
          statement_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          carro_id?: string | null
          category_id?: string | null
          classification_source?: string | null
          created_at?: string
          dedupe_key?: string | null
          description?: string
          descriptor_norm?: string | null
          id?: string
          is_recurring?: boolean
          kind?: string
          occurred_on: string
          statement_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          carro_id?: string | null
          category_id?: string | null
          classification_source?: string | null
          created_at?: string
          dedupe_key?: string | null
          description?: string
          descriptor_norm?: string | null
          id?: string
          is_recurring?: boolean
          kind?: string
          occurred_on?: string
          statement_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "v_carro_resumo"
            referencedColumns: ["carro_id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_abastecimento_consumo: {
        Row: {
          carro_id: string | null
          custo_intervalo_cents: number | null
          id: string | null
          km_por_litro: number | null
          km_rodados: number | null
          litros_intervalo: number | null
          occurred_on: string | null
          odometro_km: number | null
          reais_por_km: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abastecimentos_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "v_carro_resumo"
            referencedColumns: ["carro_id"]
          },
        ]
      }
      v_adherence_month: {
        Row: {
          adherence_bp: number | null
          category_id: string | null
          category_name: string | null
          direction: string | null
          income_cents: number | null
          kind: string | null
          meta_cents: number | null
          month_key: string | null
          percent_bp: number | null
          realized_cents: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_targets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_adherence_ytd: {
        Row: {
          adherence_bp: number | null
          category_id: string | null
          category_name: string | null
          direction: string | null
          income_cents: number | null
          kind: string | null
          meta_cents: number | null
          percent_bp: number | null
          realized_cents: number | null
          user_id: string | null
          year: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_targets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_carro_resumo: {
        Row: {
          carro_id: string | null
          gasto_mes_corrente_cents: number | null
          gasto_total_cents: number | null
          km_por_litro_medio: number | null
          preco_litro_medio_cents: number | null
          reais_por_km_medio: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_category_totals: {
        Row: {
          category_id: string | null
          month_key: string | null
          total_cents: number | null
          tx_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_income_month: {
        Row: {
          month_key: string | null
          total_cents: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_mei_year_summary: {
        Row: {
          applicable_limit_cents: number | null
          band_ceiling_cents: number | null
          comercio_cents: number | null
          gross_cents: number | null
          has_employee: boolean | null
          ratio_bp: number | null
          servicos_cents: number | null
          user_id: string | null
          year: number | null
        }
        Relationships: []
      }
      v_recurring_descriptors: {
        Row: {
          descriptor_norm: string | null
          month_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_reserva_balance: {
        Row: {
          alvo_cents: number | null
          nome: string | null
          reserva_id: string | null
          saldo_cents: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_ai_api_key: { Args: never; Returns: string }
      reassign_and_delete_category: {
        Args: { dst: string; src: string }
        Returns: undefined
      }
      register_reserva_saida: {
        Args: {
          p_amount_cents: number
          p_note?: string
          p_occurred_on: string
          p_reserva_id: string
        }
        Returns: string
      }
      remove_ai_api_key: { Args: never; Returns: undefined }
      save_ai_api_key: {
        Args: { p_key: string; p_model: string; p_provider: string }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

