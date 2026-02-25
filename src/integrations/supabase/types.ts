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
  public: {
    Tables: {
      check_results: {
        Row: {
          check_items: Json | null
          client_name: string
          created_at: string | null
          detected_case: string | null
          id: string
          input_data: Json | null
          input_text: string | null
          input_type: string
          ng_count: number | null
          ok_count: number | null
          overall_status: string | null
          process_type: string
          product_code: string
          product_name: string
          raw_response: Json | null
          status: string | null
          total_checks: number | null
          user_id: string
          warning_count: number | null
        }
        Insert: {
          check_items?: Json | null
          client_name: string
          created_at?: string | null
          detected_case?: string | null
          id?: string
          input_data?: Json | null
          input_text?: string | null
          input_type: string
          ng_count?: number | null
          ok_count?: number | null
          overall_status?: string | null
          process_type: string
          product_code: string
          product_name: string
          raw_response?: Json | null
          status?: string | null
          total_checks?: number | null
          user_id: string
          warning_count?: number | null
        }
        Update: {
          check_items?: Json | null
          client_name?: string
          created_at?: string | null
          detected_case?: string | null
          id?: string
          input_data?: Json | null
          input_text?: string | null
          input_type?: string
          ng_count?: number | null
          ok_count?: number | null
          overall_status?: string | null
          process_type?: string
          product_code?: string
          product_name?: string
          raw_response?: Json | null
          status?: string | null
          total_checks?: number | null
          user_id?: string
          warning_count?: number | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          annotation_data: Json | null
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          author_email: string
          author_name: string
          check_item_id: string | null
          check_result_id: string
          content: string
          created_at: string
          id: string
          parent_id: string | null
          status: string
        }
        Insert: {
          annotation_data?: Json | null
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          author_email: string
          author_name: string
          check_item_id?: string | null
          check_result_id: string
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          status?: string
        }
        Update: {
          annotation_data?: Json | null
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          author_email?: string
          author_name?: string
          check_item_id?: string | null
          check_result_id?: string
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_check_result_id_fkey"
            columns: ["check_result_id"]
            isOneToOne: false
            referencedRelation: "check_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_patterns: {
        Row: {
          auto_apply: boolean | null
          category: string | null
          corrected_content: string
          created_at: string | null
          frequency: number | null
          id: string
          original_content: string
          product_code: string
          rule_id: string
          rule_title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_apply?: boolean | null
          category?: string | null
          corrected_content: string
          created_at?: string | null
          frequency?: number | null
          id?: string
          original_content: string
          product_code: string
          rule_id: string
          rule_title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_apply?: boolean | null
          category?: string | null
          corrected_content?: string
          created_at?: string | null
          frequency?: number | null
          id?: string
          original_content?: string
          product_code?: string
          rule_id?: string
          rule_title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      file_versions: {
        Row: {
          check_result_id: string
          content_text: string | null
          created_at: string
          file_type: string
          id: string
          image_url: string | null
          version_number: number
        }
        Insert: {
          check_result_id: string
          content_text?: string | null
          created_at?: string
          file_type: string
          id?: string
          image_url?: string | null
          version_number?: number
        }
        Update: {
          check_result_id?: string
          content_text?: string | null
          created_at?: string
          file_type?: string
          id?: string
          image_url?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_check_result_id_fkey"
            columns: ["check_result_id"]
            isOneToOne: false
            referencedRelation: "check_results"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          allow_comment_read: boolean | null
          allow_comment_write: boolean | null
          allow_download: boolean | null
          check_result_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          password_hash: string | null
          token: string
        }
        Insert: {
          allow_comment_read?: boolean | null
          allow_comment_write?: boolean | null
          allow_download?: boolean | null
          check_result_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          password_hash?: string | null
          token?: string
        }
        Update: {
          allow_comment_read?: boolean | null
          allow_comment_write?: boolean | null
          allow_download?: boolean | null
          check_result_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          password_hash?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_check_result_id_fkey"
            columns: ["check_result_id"]
            isOneToOne: false
            referencedRelation: "check_results"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
