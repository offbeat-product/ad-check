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
          check_type: string
          client_name: string
          comparison_round: number
          created_at: string | null
          detected_case: string | null
          id: string
          input_data: Json | null
          input_text: string | null
          input_type: string
          ng_count: number | null
          ok_count: number | null
          overall_status: string | null
          parent_check_result_id: string | null
          process_type: string
          product_code: string
          product_name: string
          raw_response: Json | null
          resolved_items: Json | null
          status: string | null
          total_checks: number | null
          updated_at: string | null
          user_id: string
          warning_count: number | null
        }
        Insert: {
          check_items?: Json | null
          check_type?: string
          client_name: string
          comparison_round?: number
          created_at?: string | null
          detected_case?: string | null
          id?: string
          input_data?: Json | null
          input_text?: string | null
          input_type: string
          ng_count?: number | null
          ok_count?: number | null
          overall_status?: string | null
          parent_check_result_id?: string | null
          process_type: string
          product_code: string
          product_name: string
          raw_response?: Json | null
          resolved_items?: Json | null
          status?: string | null
          total_checks?: number | null
          updated_at?: string | null
          user_id: string
          warning_count?: number | null
        }
        Update: {
          check_items?: Json | null
          check_type?: string
          client_name?: string
          comparison_round?: number
          created_at?: string | null
          detected_case?: string | null
          id?: string
          input_data?: Json | null
          input_text?: string | null
          input_type?: string
          ng_count?: number | null
          ok_count?: number | null
          overall_status?: string | null
          parent_check_result_id?: string | null
          process_type?: string
          product_code?: string
          product_name?: string
          raw_response?: Json | null
          resolved_items?: Json | null
          status?: string | null
          total_checks?: number | null
          updated_at?: string | null
          user_id?: string
          warning_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "check_results_parent_check_result_id_fkey"
            columns: ["parent_check_result_id"]
            isOneToOne: false
            referencedRelation: "check_results"
            referencedColumns: ["id"]
          },
        ]
      }
      check_feedback: {
        Row: {
          ai_judgment: string
          check_result_id: string | null
          created_at: string
          created_by: string | null
          feedback_type: string
          human_judgment: string
          id: string
          is_active: boolean
          item_description: string
          process_type: string
          product_id: string
          project_id: string | null
          reason: string | null
          rule_pattern_id: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          ai_judgment: string
          check_result_id?: string | null
          created_at?: string
          created_by?: string | null
          feedback_type?: string
          human_judgment: string
          id?: string
          is_active?: boolean
          item_description: string
          process_type: string
          product_id: string
          project_id?: string | null
          reason?: string | null
          rule_pattern_id?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          ai_judgment?: string
          check_result_id?: string | null
          created_at?: string
          created_by?: string | null
          feedback_type?: string
          human_judgment?: string
          id?: string
          is_active?: boolean
          item_description?: string
          process_type?: string
          product_id?: string
          project_id?: string | null
          reason?: string | null
          rule_pattern_id?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      check_rules: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          is_active: boolean | null
          is_auto_generated: boolean | null
          process_type: string
          product_id: string
          rule_id: string
          severity: string
          sort_order: number | null
          source_correction_count: number | null
          source_correction_id: string | null
          source_material_id: string | null
          source_type: string | null
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          process_type: string
          product_id: string
          rule_id: string
          severity?: string
          sort_order?: number | null
          source_correction_count?: number | null
          source_correction_id?: string | null
          source_material_id?: string | null
          source_type?: string | null
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          process_type?: string
          product_id?: string
          rule_id?: string
          severity?: string
          sort_order?: number | null
          source_correction_count?: number | null
          source_correction_id?: string | null
          source_material_id?: string | null
          source_type?: string | null
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
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
          media_timestamp: number | null
          mentions: string[] | null
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
          media_timestamp?: number | null
          mentions?: string[] | null
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
          media_timestamp?: number | null
          mentions?: string[] | null
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
      correction_logs: {
        Row: {
          ai_extracted_rule: string | null
          ai_process_types: string[] | null
          ai_scope: string | null
          ai_severity: string | null
          approved_at: string | null
          approved_by: string | null
          approved_rule_id: string | null
          check_result_id: string | null
          comment_id: string | null
          correction_category: string | null
          correction_text: string
          created_at: string | null
          created_by: string | null
          file_id: string | null
          id: string
          pattern_id: string | null
          process_type: string
          product_id: string
          project_id: string | null
          rule_status: string | null
          similarity_hash: string | null
        }
        Insert: {
          ai_extracted_rule?: string | null
          ai_process_types?: string[] | null
          ai_scope?: string | null
          ai_severity?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_rule_id?: string | null
          check_result_id?: string | null
          comment_id?: string | null
          correction_category?: string | null
          correction_text: string
          created_at?: string | null
          created_by?: string | null
          file_id?: string | null
          id?: string
          pattern_id?: string | null
          process_type: string
          product_id: string
          project_id?: string | null
          rule_status?: string | null
          similarity_hash?: string | null
        }
        Update: {
          ai_extracted_rule?: string | null
          ai_process_types?: string[] | null
          ai_scope?: string | null
          ai_severity?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_rule_id?: string | null
          check_result_id?: string | null
          comment_id?: string | null
          correction_category?: string | null
          correction_text?: string
          created_at?: string | null
          created_by?: string | null
          file_id?: string | null
          id?: string
          pattern_id?: string | null
          process_type?: string
          product_id?: string
          project_id?: string | null
          rule_status?: string | null
          similarity_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "correction_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          display_name: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          status?: string
          token?: string
        }
        Relationships: []
      }
      kpi_targets: {
        Row: {
          id: string
          key: string
          label: string
          target_value: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          key: string
          label: string
          target_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          key?: string
          label?: string
          target_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      patterns: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          project_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          project_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          project_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patterns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      process_types: {
        Row: {
          code: string
          creative_type: string
          is_active: boolean
          name: string
          sort_order: number
          used_by_check: boolean
        }
        Insert: {
          code: string
          creative_type: string
          is_active?: boolean
          name: string
          sort_order?: number
          used_by_check?: boolean
        }
        Update: {
          code?: string
          creative_type?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          used_by_check?: boolean
        }
        Relationships: []
      }
      products: {
        Row: {
          client_id: string | null
          code: string
          color: string | null
          created_at: string | null
          external_product_id: string | null
          id: string
          info_lines: string[] | null
          label: string
          meta: string | null
          name: string
          rules_desc: string | null
          sample_text: string | null
          sf_enabled: boolean | null
          sort_order: number | null
          warning: string | null
          webhook_paths: Json | null
        }
        Insert: {
          client_id?: string | null
          code: string
          color?: string | null
          created_at?: string | null
          external_product_id?: string | null
          id?: string
          info_lines?: string[] | null
          label: string
          meta?: string | null
          name: string
          rules_desc?: string | null
          sample_text?: string | null
          sf_enabled?: boolean | null
          sort_order?: number | null
          warning?: string | null
          webhook_paths?: Json | null
        }
        Update: {
          client_id?: string | null
          code?: string
          color?: string | null
          created_at?: string | null
          external_product_id?: string | null
          id?: string
          info_lines?: string[] | null
          label?: string
          meta?: string | null
          name?: string
          rules_desc?: string | null
          sample_text?: string | null
          sf_enabled?: boolean | null
          sort_order?: number | null
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
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          last_login_at: string | null
          notify_check_complete: boolean
          notify_comment: boolean
          notify_invitation: boolean
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          notify_check_complete?: boolean
          notify_comment?: boolean
          notify_invitation?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          notify_check_complete?: boolean
          notify_comment?: boolean
          notify_invitation?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          check_result_id: string | null
          checking_by: string | null
          checking_started_at: string | null
          created_at: string | null
          created_by: string | null
          file_data: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: string
          fixed_at: string | null
          fixed_by: string | null
          id: string
          parent_file_id: string | null
          pattern_id: string | null
          process_type: string
          project_id: string | null
          status: string | null
          submission_type: string
          updated_at: string | null
          version_number: number | null
        }
        Insert: {
          check_result_id?: string | null
          checking_by?: string | null
          checking_started_at?: string | null
          created_at?: string | null
          created_by?: string | null
          file_data?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type: string
          fixed_at?: string | null
          fixed_by?: string | null
          id?: string
          parent_file_id?: string | null
          pattern_id?: string | null
          process_type: string
          project_id?: string | null
          status?: string | null
          submission_type?: string
          updated_at?: string | null
          version_number?: number | null
        }
        Update: {
          check_result_id?: string | null
          checking_by?: string | null
          checking_started_at?: string | null
          created_at?: string | null
          created_by?: string | null
          file_data?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          fixed_at?: string | null
          fixed_by?: string | null
          id?: string
          parent_file_id?: string | null
          pattern_id?: string | null
          process_type?: string
          project_id?: string | null
          status?: string | null
          submission_type?: string
          updated_at?: string | null
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_files_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id"]
          },
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
          client_deadline: string | null
          created_at: string
          deadline: string | null
          id: string
          is_active: boolean
          is_common: boolean
          process_key: string
          process_label: string
          project_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          client_deadline?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          is_active?: boolean
          is_common?: boolean
          process_key: string
          process_label: string
          project_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          client_deadline?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          is_active?: boolean
          is_common?: boolean
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
          creative_type: string
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
          creative_type?: string
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
          creative_type?: string
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
      rule_candidates: {
        Row: {
          admin_notes: string | null
          approved_rule_id: string | null
          category: string | null
          created_at: string | null
          id: string
          process_type: string
          product_id: string
          project_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_text: string
          rule_title: string | null
          scope: string
          severity: string | null
          similar_existing_rule_id: string | null
          similarity_score: number | null
          source_correction_ids: string[] | null
          source_count: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          approved_rule_id?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          process_type: string
          product_id: string
          project_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_text: string
          rule_title?: string | null
          scope?: string
          severity?: string | null
          similar_existing_rule_id?: string | null
          similarity_score?: number | null
          source_correction_ids?: string[] | null
          source_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          approved_rule_id?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          process_type?: string
          product_id?: string
          project_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_text?: string
          rule_title?: string | null
          scope?: string
          severity?: string | null
          similar_existing_rule_id?: string | null
          similarity_score?: number | null
          source_correction_ids?: string[] | null
          source_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_candidates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      submission_logs: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          file_id: string
          id: string
          pattern_id: string | null
          process_type: string
          product_id: string | null
          project_id: string | null
          version_number: number
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by?: string | null
          file_id: string
          id?: string
          pattern_id?: string | null
          process_type: string
          product_id?: string | null
          project_id?: string | null
          version_number?: number
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          file_id?: string
          id?: string
          pattern_id?: string | null
          process_type?: string
          product_id?: string | null
          project_id?: string | null
          version_number?: number
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
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
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      accept_invitation: {
        Args: { p_token: string; p_user_id: string }
        Returns: boolean
      }
      delete_project_cascade: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      ensure_profile:
        | { Args: { p_email: string; p_user_id: string }; Returns: undefined }
        | { Args: { p_email: string; p_user_id: string }; Returns: undefined }
      get_invitation_by_token: {
        Args: { p_token: string }
        Returns: {
          display_name: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          inviter_name: string
          role: string
          status: string
        }[]
      }
      get_profiles_by_ids: {
        Args: { p_ids: string[] }
        Returns: {
          display_name: string
          email: string
          id: string
        }[]
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
          check_type: string
          client_name: string
          comparison_round: number
          created_at: string | null
          detected_case: string | null
          id: string
          input_data: Json | null
          input_text: string | null
          input_type: string
          ng_count: number | null
          ok_count: number | null
          overall_status: string | null
          parent_check_result_id: string | null
          process_type: string
          product_code: string
          product_name: string
          raw_response: Json | null
          resolved_items: Json | null
          status: string | null
          total_checks: number | null
          updated_at: string | null
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
      get_shared_comments: {
        Args: { p_check_result_id: string; p_share_token: string }
        Returns: {
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
          media_timestamp: number | null
          mentions: string[] | null
          parent_id: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      get_workspace_role: { Args: { _user_id: string }; Returns: string }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_project_member: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      is_workspace_member_accepted: {
        Args: { _user_id: string }
        Returns: boolean
      }
      lookup_profile_by_email: {
        Args: { p_email: string }
        Returns: {
          display_name: string
          id: string
        }[]
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
