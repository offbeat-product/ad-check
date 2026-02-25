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
      clients: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
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
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          message: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          client_id: string | null
          code: string
          color: string | null
          created_at: string | null
          id: string
          info_lines: string[] | null
          label: string
          meta: string | null
          name: string
          rules_desc: string | null
          sample_text: string | null
          sf_enabled: boolean | null
          warning: string | null
          webhook_paths: Json | null
        }
        Insert: {
          client_id?: string | null
          code: string
          color?: string | null
          created_at?: string | null
          id?: string
          info_lines?: string[] | null
          label: string
          meta?: string | null
          name: string
          rules_desc?: string | null
          sample_text?: string | null
          sf_enabled?: boolean | null
          warning?: string | null
          webhook_paths?: Json | null
        }
        Update: {
          client_id?: string | null
          code?: string
          color?: string | null
          created_at?: string | null
          id?: string
          info_lines?: string[] | null
          label?: string
          meta?: string | null
          name?: string
          rules_desc?: string | null
          sample_text?: string | null
          sf_enabled?: boolean | null
          warning?: string | null
          webhook_paths?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "products_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          notify_check_complete: boolean
          notify_comment: boolean
          notify_invitation: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          notify_check_complete?: boolean
          notify_comment?: boolean
          notify_invitation?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          notify_check_complete?: boolean
          notify_comment?: boolean
          notify_invitation?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          check_result_id: string | null
          created_at: string | null
          created_by: string | null
          file_data: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: string
          id: string
          parent_file_id: string | null
          process_type: string
          project_id: string | null
          status: string | null
          updated_at: string | null
          version_number: number | null
        }
        Insert: {
          check_result_id?: string | null
          created_at?: string | null
          created_by?: string | null
          file_data?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type: string
          id?: string
          parent_file_id?: string | null
          process_type: string
          project_id?: string | null
          status?: string | null
          updated_at?: string | null
          version_number?: number | null
        }
        Update: {
          check_result_id?: string | null
          created_at?: string | null
          created_by?: string | null
          file_data?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          id?: string
          parent_file_id?: string | null
          process_type?: string
          project_id?: string | null
          status?: string | null
          updated_at?: string | null
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          project_id: string
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          project_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          project_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_processes: {
        Row: {
          created_at: string
          deadline: string | null
          id: string
          is_active: boolean
          process_key: string
          process_label: string
          project_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          id?: string
          is_active?: boolean
          process_key: string
          process_label: string
          project_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline?: string | null
          id?: string
          is_active?: boolean
          process_key?: string
          process_label?: string
          project_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_processes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          created_by: string | null
          deadline: string | null
          description: string | null
          id: string
          name: string
          overall_deadline: string | null
          product_id: string | null
          project_code: string | null
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          name: string
          overall_deadline?: string | null
          product_id?: string | null
          project_code?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          name?: string
          overall_deadline?: string | null
          product_id?: string | null
          project_code?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_materials: {
        Row: {
          content_text: string | null
          created_at: string
          created_by: string | null
          file_data: string | null
          file_name: string | null
          id: string
          is_active: boolean
          material_type: string
          scope_id: string
          scope_type: string
          sort_order: number
          source_type: string
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          file_data?: string | null
          file_name?: string | null
          id?: string
          is_active?: boolean
          material_type: string
          scope_id: string
          scope_type: string
          sort_order?: number
          source_type?: string
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          file_data?: string | null
          file_name?: string | null
          id?: string
          is_active?: boolean
          material_type?: string
          scope_id?: string
          scope_type?: string
          sort_order?: number
          source_type?: string
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      share_links_safe: {
        Row: {
          allow_comment_read: boolean | null
          allow_comment_write: boolean | null
          allow_download: boolean | null
          check_result_id: string | null
          created_at: string | null
          expires_at: string | null
          has_password: boolean | null
          id: string | null
          token: string | null
        }
        Insert: {
          allow_comment_read?: boolean | null
          allow_comment_write?: boolean | null
          allow_download?: boolean | null
          check_result_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          has_password?: never
          id?: string | null
          token?: string | null
        }
        Update: {
          allow_comment_read?: boolean | null
          allow_comment_write?: boolean | null
          allow_download?: boolean | null
          check_result_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          has_password?: never
          id?: string | null
          token?: string | null
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
    Functions: {
      ensure_profile: {
        Args: { p_email: string; p_user_id: string }
        Returns: undefined
      }
      get_share_link_by_token: {
        Args: { token_param: string }
        Returns: {
          allow_comment_read: boolean
          allow_comment_write: boolean
          allow_download: boolean
          check_result_id: string
          created_at: string
          expires_at: string
          id: string
          password_hash: string
          token: string
        }[]
      }
      get_shared_check_result: {
        Args: { p_check_result_id: string; p_share_token: string }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "check_results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_project_member: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
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
