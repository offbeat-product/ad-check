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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ambiguous_words: {
        Row: {
          category: string
          created_at: string
          id: number
          notes: string | null
          severity: string
          updated_at: string
          word: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: number
          notes?: string | null
          severity?: string
          updated_at?: string
          word: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: number
          notes?: string | null
          severity?: string
          updated_at?: string
          word?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      brief_share_link_access_logs: {
        Row: {
          id: string
          ip_address: string | null
          password_attempted: boolean
          password_correct: boolean | null
          share_link_id: string
          user_agent: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          password_attempted?: boolean
          password_correct?: boolean | null
          share_link_id: string
          user_agent?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          password_attempted?: boolean
          password_correct?: boolean | null
          share_link_id?: string
          user_agent?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brief_share_link_access_logs_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "brief_share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_share_links: {
        Row: {
          allow_download: boolean
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          is_active: boolean
          last_viewed_at: string | null
          note: string | null
          password_hash: string | null
          project_id: string
          requires_password: boolean | null
          title: string | null
          token: string
          view_count: number
        }
        Insert: {
          allow_download?: boolean
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          note?: string | null
          password_hash?: string | null
          project_id: string
          requires_password?: boolean | null
          title?: string | null
          token?: string
          view_count?: number
        }
        Update: {
          allow_download?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          note?: string | null
          password_hash?: string | null
          project_id?: string
          requires_password?: boolean | null
          title?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "brief_share_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_composition_batches: {
        Row: {
          appeal_axes_snapshot: Json | null
          completed_at: string | null
          completed_count: number | null
          created_at: string | null
          created_by: string | null
          duration_seconds: number | null
          failed_count: number | null
          id: string
          na_script_job_ids: string[]
          project_id: string
          spot_job_ids: string[] | null
          status: string | null
          storyboard_job_ids: string[]
          total_count: number
          updated_at: string | null
          with_na_script: boolean
          with_storyboard_images: boolean
        }
        Insert: {
          appeal_axes_snapshot?: Json | null
          completed_at?: string | null
          completed_count?: number | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds?: number | null
          failed_count?: number | null
          id?: string
          na_script_job_ids?: string[]
          project_id: string
          spot_job_ids?: string[] | null
          status?: string | null
          storyboard_job_ids?: string[]
          total_count: number
          updated_at?: string | null
          with_na_script?: boolean
          with_storyboard_images?: boolean
        }
        Update: {
          appeal_axes_snapshot?: Json | null
          completed_at?: string | null
          completed_count?: number | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds?: number | null
          failed_count?: number | null
          id?: string
          na_script_job_ids?: string[]
          project_id?: string
          spot_job_ids?: string[] | null
          status?: string | null
          storyboard_job_ids?: string[]
          total_count?: number
          updated_at?: string | null
          with_na_script?: boolean
          with_storyboard_images?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bulk_composition_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          matched_rule_uuid: string | null
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
          matched_rule_uuid?: string | null
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
          matched_rule_uuid?: string | null
          process_type?: string
          product_id?: string
          project_id?: string | null
          reason?: string | null
          rule_pattern_id?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_feedback_check_result_id_fkey"
            columns: ["check_result_id"]
            isOneToOne: false
            referencedRelation: "check_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_feedback_matched_rule_uuid_fkey"
            columns: ["matched_rule_uuid"]
            isOneToOne: false
            referencedRelation: "check_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_feedback_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_feedback_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
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
      check_rules: {
        Row: {
          auto_deactivated_at: string | null
          category: string
          client_id: string | null
          created_at: string | null
          created_by: string | null
          description: string
          embedding: string | null
          embedding_generated_at: string | null
          embedding_model: string | null
          embedding_source_text: string | null
          false_positive_count: number | null
          id: string
          improved_description: string | null
          is_active: boolean | null
          is_auto_generated: boolean | null
          is_quality_ok: boolean
          last_used_at: string | null
          process_type: string
          product_id: string
          project_id: string | null
          quality_checked_at: string | null
          quality_issues: Json
          quality_reason: string | null
          quality_score: number | null
          quality_score_at: string | null
          quality_status: string | null
          rule_id: string
          scope: string
          severity: string
          severity_sort: number | null
          sort_order: number | null
          source_correction_count: number | null
          source_correction_id: string | null
          source_material_id: string | null
          source_material_type: string | null
          source_reference_id: string | null
          source_type: string | null
          title: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          auto_deactivated_at?: string | null
          category: string
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          embedding?: string | null
          embedding_generated_at?: string | null
          embedding_model?: string | null
          embedding_source_text?: string | null
          false_positive_count?: number | null
          id?: string
          improved_description?: string | null
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          is_quality_ok?: boolean
          last_used_at?: string | null
          process_type: string
          product_id: string
          project_id?: string | null
          quality_checked_at?: string | null
          quality_issues?: Json
          quality_reason?: string | null
          quality_score?: number | null
          quality_score_at?: string | null
          quality_status?: string | null
          rule_id: string
          scope?: string
          severity?: string
          severity_sort?: number | null
          sort_order?: number | null
          source_correction_count?: number | null
          source_correction_id?: string | null
          source_material_id?: string | null
          source_material_type?: string | null
          source_reference_id?: string | null
          source_type?: string | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          auto_deactivated_at?: string | null
          category?: string
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          embedding?: string | null
          embedding_generated_at?: string | null
          embedding_model?: string | null
          embedding_source_text?: string | null
          false_positive_count?: number | null
          id?: string
          improved_description?: string | null
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          is_quality_ok?: boolean
          last_used_at?: string | null
          process_type?: string
          product_id?: string
          project_id?: string | null
          quality_checked_at?: string | null
          quality_issues?: Json
          quality_reason?: string | null
          quality_score?: number | null
          quality_score_at?: string | null
          quality_status?: string | null
          rule_id?: string
          scope?: string
          severity?: string
          severity_sort?: number | null
          sort_order?: number | null
          source_correction_count?: number | null
          source_correction_id?: string | null
          source_material_id?: string | null
          source_material_type?: string | null
          source_reference_id?: string | null
          source_type?: string | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assets: {
        Row: {
          asset_type: string
          client_id: string
          content_text: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          file_path: string | null
          file_size: number | null
          file_url: string | null
          id: string
          metadata: Json
          mime_type: string | null
          name: string
          source_url: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          asset_type?: string
          client_id: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          asset_type?: string
          client_id?: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name?: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          ai_extracted_at: string | null
          ai_extracted_count: number | null
          ai_extraction_meta: Json | null
          client_id: string
          contract_kind: string
          contracted_at: string | null
          created_at: string | null
          effective_until: string | null
          file_name: string
          file_path: string | null
          file_size_bytes: number | null
          id: string
          is_active: boolean | null
          mime_type: string | null
          updated_at: string | null
        }
        Insert: {
          ai_extracted_at?: string | null
          ai_extracted_count?: number | null
          ai_extraction_meta?: Json | null
          client_id: string
          contract_kind?: string
          contracted_at?: string | null
          created_at?: string | null
          effective_until?: string | null
          file_name: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          is_active?: boolean | null
          mime_type?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_extracted_at?: string | null
          ai_extracted_count?: number | null
          ai_extraction_meta?: Json | null
          client_id?: string
          contract_kind?: string
          contracted_at?: string | null
          created_at?: string | null
          effective_until?: string | null
          file_name?: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          is_active?: boolean | null
          mime_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_persons: {
        Row: {
          client_id: string
          created_at: string | null
          department: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          name_kana: string | null
          phone: string | null
          role: string
          role_memo: string | null
          sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          name_kana?: string | null
          phone?: string | null
          role?: string
          role_memo?: string | null
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_kana?: string | null
          phone?: string | null
          role?: string
          role_memo?: string | null
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_persons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_terms: {
        Row: {
          a1_publication: string | null
          a2_portfolio_display: string | null
          a3_credit_required: string | null
          a3_credit_text: string | null
          a4_sns_post: string | null
          a5_award_apply: string | null
          a6_publication_timing: string | null
          b1_copyright_owner: string | null
          b2_moral_rights: string | null
          b3_secondary_use: string | null
          b4_generic_assets: string | null
          b5_third_party_assets: string | null
          b6_ip_warranty: string | null
          c1_nda_status: string | null
          c2_client_name_disclosure: string | null
          c3_data_retention: string | null
          c4_personal_info: string | null
          client_id: string
          created_at: string | null
          d1_billing_timing: string | null
          d2_payment_term: string | null
          d3_inspection_days: number | null
          d4_inspection_implicit: string | null
          d5_revision_limit: string | null
          d6_late_fee: string | null
          e1_media_operation: string | null
          e2_legal_check: string | null
          e3_emergency_response: string | null
          e4_subcontract: string | null
          e5_warranty_period: string | null
          f1_contract_form: string | null
          f2_contract_renewal: string | null
          f3_termination_clause: string | null
          f3_termination_notice_months: number | null
          f4_anti_social: string | null
          f5_liability_cap: string | null
          g1_competitor_detail: string | null
          g1_competitor_exclusion: string | null
          g2_applicable_laws: Json | null
          g3_stealth_marketing: string | null
          g4_jurisdiction: string | null
          h1_special_terms: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          a1_publication?: string | null
          a2_portfolio_display?: string | null
          a3_credit_required?: string | null
          a3_credit_text?: string | null
          a4_sns_post?: string | null
          a5_award_apply?: string | null
          a6_publication_timing?: string | null
          b1_copyright_owner?: string | null
          b2_moral_rights?: string | null
          b3_secondary_use?: string | null
          b4_generic_assets?: string | null
          b5_third_party_assets?: string | null
          b6_ip_warranty?: string | null
          c1_nda_status?: string | null
          c2_client_name_disclosure?: string | null
          c3_data_retention?: string | null
          c4_personal_info?: string | null
          client_id: string
          created_at?: string | null
          d1_billing_timing?: string | null
          d2_payment_term?: string | null
          d3_inspection_days?: number | null
          d4_inspection_implicit?: string | null
          d5_revision_limit?: string | null
          d6_late_fee?: string | null
          e1_media_operation?: string | null
          e2_legal_check?: string | null
          e3_emergency_response?: string | null
          e4_subcontract?: string | null
          e5_warranty_period?: string | null
          f1_contract_form?: string | null
          f2_contract_renewal?: string | null
          f3_termination_clause?: string | null
          f3_termination_notice_months?: number | null
          f4_anti_social?: string | null
          f5_liability_cap?: string | null
          g1_competitor_detail?: string | null
          g1_competitor_exclusion?: string | null
          g2_applicable_laws?: Json | null
          g3_stealth_marketing?: string | null
          g4_jurisdiction?: string | null
          h1_special_terms?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          a1_publication?: string | null
          a2_portfolio_display?: string | null
          a3_credit_required?: string | null
          a3_credit_text?: string | null
          a4_sns_post?: string | null
          a5_award_apply?: string | null
          a6_publication_timing?: string | null
          b1_copyright_owner?: string | null
          b2_moral_rights?: string | null
          b3_secondary_use?: string | null
          b4_generic_assets?: string | null
          b5_third_party_assets?: string | null
          b6_ip_warranty?: string | null
          c1_nda_status?: string | null
          c2_client_name_disclosure?: string | null
          c3_data_retention?: string | null
          c4_personal_info?: string | null
          client_id?: string
          created_at?: string | null
          d1_billing_timing?: string | null
          d2_payment_term?: string | null
          d3_inspection_days?: number | null
          d4_inspection_implicit?: string | null
          d5_revision_limit?: string | null
          d6_late_fee?: string | null
          e1_media_operation?: string | null
          e2_legal_check?: string | null
          e3_emergency_response?: string | null
          e4_subcontract?: string | null
          e5_warranty_period?: string | null
          f1_contract_form?: string | null
          f2_contract_renewal?: string | null
          f3_termination_clause?: string | null
          f3_termination_notice_months?: number | null
          f4_anti_social?: string | null
          f5_liability_cap?: string | null
          g1_competitor_detail?: string | null
          g1_competitor_exclusion?: string | null
          g2_applicable_laws?: Json | null
          g3_stealth_marketing?: string | null
          g4_jurisdiction?: string | null
          h1_special_terms?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_terms_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          ai_scan_metadata: Json | null
          ai_scanned_at: string | null
          am_profile_id: string | null
          am_user_id: string | null
          business_description: string | null
          business_segments: Json | null
          business_subcategory: string | null
          business_summary: string | null
          capital_yen: number | null
          company_size: string | null
          competitors: Json | null
          contact_email: string | null
          contact_person: string | null
          corporate_form: string | null
          corporate_number: string | null
          created_at: string | null
          decision_maker_dept: string | null
          decision_maker_email: string | null
          decision_maker_name: string | null
          decision_maker_role: string | null
          employees_count: number | null
          executives: Json | null
          founded_at: string | null
          group_companies: Json | null
          hq_address: string | null
          hq_phone: string | null
          hq_postal_code: string | null
          id: string
          industry: string | null
          industry_middle: string | null
          legal_name: string | null
          licenses: Json | null
          listing_code: string | null
          listing_status: string | null
          logo_url: string | null
          name: string
          name_en: string | null
          name_kana: string | null
          name_short: string | null
          notes: string | null
          offices: Json | null
          official_url: string | null
          parent_company: string | null
          payment_terms: string | null
          press_release_summary: string | null
          representative_name: string | null
          representative_title: string | null
          revenue_recent_label: string | null
          revenue_recent_yen: number | null
          short_name: string | null
          social_media: Json | null
          sort_order: number | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          ai_scan_metadata?: Json | null
          ai_scanned_at?: string | null
          am_profile_id?: string | null
          am_user_id?: string | null
          business_description?: string | null
          business_segments?: Json | null
          business_subcategory?: string | null
          business_summary?: string | null
          capital_yen?: number | null
          company_size?: string | null
          competitors?: Json | null
          contact_email?: string | null
          contact_person?: string | null
          corporate_form?: string | null
          corporate_number?: string | null
          created_at?: string | null
          decision_maker_dept?: string | null
          decision_maker_email?: string | null
          decision_maker_name?: string | null
          decision_maker_role?: string | null
          employees_count?: number | null
          executives?: Json | null
          founded_at?: string | null
          group_companies?: Json | null
          hq_address?: string | null
          hq_phone?: string | null
          hq_postal_code?: string | null
          id?: string
          industry?: string | null
          industry_middle?: string | null
          legal_name?: string | null
          licenses?: Json | null
          listing_code?: string | null
          listing_status?: string | null
          logo_url?: string | null
          name: string
          name_en?: string | null
          name_kana?: string | null
          name_short?: string | null
          notes?: string | null
          offices?: Json | null
          official_url?: string | null
          parent_company?: string | null
          payment_terms?: string | null
          press_release_summary?: string | null
          representative_name?: string | null
          representative_title?: string | null
          revenue_recent_label?: string | null
          revenue_recent_yen?: number | null
          short_name?: string | null
          social_media?: Json | null
          sort_order?: number | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          ai_scan_metadata?: Json | null
          ai_scanned_at?: string | null
          am_profile_id?: string | null
          am_user_id?: string | null
          business_description?: string | null
          business_segments?: Json | null
          business_subcategory?: string | null
          business_summary?: string | null
          capital_yen?: number | null
          company_size?: string | null
          competitors?: Json | null
          contact_email?: string | null
          contact_person?: string | null
          corporate_form?: string | null
          corporate_number?: string | null
          created_at?: string | null
          decision_maker_dept?: string | null
          decision_maker_email?: string | null
          decision_maker_name?: string | null
          decision_maker_role?: string | null
          employees_count?: number | null
          executives?: Json | null
          founded_at?: string | null
          group_companies?: Json | null
          hq_address?: string | null
          hq_phone?: string | null
          hq_postal_code?: string | null
          id?: string
          industry?: string | null
          industry_middle?: string | null
          legal_name?: string | null
          licenses?: Json | null
          listing_code?: string | null
          listing_status?: string | null
          logo_url?: string | null
          name?: string
          name_en?: string | null
          name_kana?: string | null
          name_short?: string | null
          notes?: string | null
          offices?: Json | null
          official_url?: string | null
          parent_company?: string | null
          payment_terms?: string | null
          press_release_summary?: string | null
          representative_name?: string | null
          representative_title?: string | null
          revenue_recent_label?: string | null
          revenue_recent_yen?: number | null
          short_name?: string | null
          social_media?: Json | null
          sort_order?: number | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_am_profile_id_fkey"
            columns: ["am_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "correction_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
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
          product_id: string | null
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
          product_id?: string | null
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
          product_id?: string | null
          rule_id?: string
          rule_title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_patterns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_patterns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_orient_documents: {
        Row: {
          created_at: string | null
          generated_at: string | null
          generated_by: string | null
          generated_content: Json
          id: string
          is_current: boolean | null
          last_sent_at: string | null
          notion_url: string | null
          pdf_url: string | null
          project_id: string
          sent_to_creators: string[] | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          generated_at?: string | null
          generated_by?: string | null
          generated_content?: Json
          id?: string
          is_current?: boolean | null
          last_sent_at?: string | null
          notion_url?: string | null
          pdf_url?: string | null
          project_id: string
          sent_to_creators?: string[] | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          generated_at?: string | null
          generated_by?: string | null
          generated_content?: Json
          id?: string
          is_current?: boolean | null
          last_sent_at?: string | null
          notion_url?: string | null
          pdf_url?: string | null
          project_id?: string
          sent_to_creators?: string[] | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_orient_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      creators: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          id: string
          is_active: boolean | null
          last_active_at: string | null
          name: string
          notes: string | null
          slack_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          last_active_at?: string | null
          name: string
          notes?: string | null
          slack_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_active_at?: string | null
          name?: string
          notes?: string | null
          slack_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_notification_queue: {
        Row: {
          attempt_count: number | null
          body_data: Json
          created_at: string | null
          error_message: string | null
          id: string
          notification_type: string
          recipient_email: string
          recipient_name: string | null
          related_comment_ids: string[] | null
          related_creator_id: string | null
          related_project_id: string | null
          scheduled_for: string
          sent_at: string | null
          share_token: string | null
          status: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          attempt_count?: number | null
          body_data?: Json
          created_at?: string | null
          error_message?: string | null
          id?: string
          notification_type: string
          recipient_email: string
          recipient_name?: string | null
          related_comment_ids?: string[] | null
          related_creator_id?: string | null
          related_project_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          share_token?: string | null
          status?: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          attempt_count?: number | null
          body_data?: Json
          created_at?: string | null
          error_message?: string | null
          id?: string
          notification_type?: string
          recipient_email?: string
          recipient_name?: string | null
          related_comment_ids?: string[] | null
          related_creator_id?: string | null
          related_project_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          share_token?: string | null
          status?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_notification_queue_related_creator_id_fkey"
            columns: ["related_creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_notification_queue_related_project_id_fkey"
            columns: ["related_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      error_reports: {
        Row: {
          assigned_to: string | null
          category: string
          context_data: Json | null
          created_at: string
          description: string
          id: string
          page_url: string | null
          product: string
          reporter_email: string | null
          reporter_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          screenshot_url: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          assigned_to?: string | null
          category: string
          context_data?: Json | null
          created_at?: string
          description: string
          id?: string
          page_url?: string | null
          product: string
          reporter_email?: string | null
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          screenshot_url?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          context_data?: Json | null
          created_at?: string
          description?: string
          id?: string
          page_url?: string | null
          product?: string
          reporter_email?: string | null
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          screenshot_url?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      gen_favorites: {
        Row: {
          created_at: string | null
          id: string
          project_id: string
          sort_order: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gen_favorites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      gen_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          creative_type: string
          duration_seconds: number | null
          generation_mode: string | null
          id: string
          num_appeal_axes: number | null
          num_copies: number | null
          num_tonmana: number | null
          production_pattern: string | null
          project_id: string | null
          reference_creative_ids: string[] | null
          settings: Json | null
          started_at: string | null
          status: string | null
          total_patterns: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          creative_type: string
          duration_seconds?: number | null
          generation_mode?: string | null
          id?: string
          num_appeal_axes?: number | null
          num_copies?: number | null
          num_tonmana?: number | null
          production_pattern?: string | null
          project_id?: string | null
          reference_creative_ids?: string[] | null
          settings?: Json | null
          started_at?: string | null
          status?: string | null
          total_patterns?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          creative_type?: string
          duration_seconds?: number | null
          generation_mode?: string | null
          id?: string
          num_appeal_axes?: number | null
          num_copies?: number | null
          num_tonmana?: number | null
          production_pattern?: string | null
          project_id?: string | null
          reference_creative_ids?: string[] | null
          settings?: Json | null
          started_at?: string | null
          status?: string | null
          total_patterns?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gen_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      gen_patterns: {
        Row: {
          appeal_axis_index: number | null
          appeal_axis_text: string | null
          bgm_source: string | null
          bgm_url: string | null
          composition: Json | null
          copy_index: number | null
          copy_text: string | null
          created_at: string | null
          id: string
          job_id: string | null
          narration_audio_url: string | null
          narration_audio_url_b: string | null
          narration_script: string | null
          pattern_id: string
          selected_voice: string | null
          status: string | null
          tonmana_index: number | null
          tonmana_name: string | null
        }
        Insert: {
          appeal_axis_index?: number | null
          appeal_axis_text?: string | null
          bgm_source?: string | null
          bgm_url?: string | null
          composition?: Json | null
          copy_index?: number | null
          copy_text?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          narration_audio_url?: string | null
          narration_audio_url_b?: string | null
          narration_script?: string | null
          pattern_id: string
          selected_voice?: string | null
          status?: string | null
          tonmana_index?: number | null
          tonmana_name?: string | null
        }
        Update: {
          appeal_axis_index?: number | null
          appeal_axis_text?: string | null
          bgm_source?: string | null
          bgm_url?: string | null
          composition?: Json | null
          copy_index?: number | null
          copy_text?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          narration_audio_url?: string | null
          narration_audio_url_b?: string | null
          narration_script?: string | null
          pattern_id?: string
          selected_voice?: string | null
          status?: string | null
          tonmana_index?: number | null
          tonmana_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gen_patterns_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "gen_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      gen_share_links: {
        Row: {
          allow_comment: boolean | null
          allow_download: boolean | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          job_id: string | null
          last_viewed_at: string | null
          note: string | null
          password_hash: string | null
          title: string | null
          token: string
          view_count: number | null
        }
        Insert: {
          allow_comment?: boolean | null
          allow_download?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string | null
          last_viewed_at?: string | null
          note?: string | null
          password_hash?: string | null
          title?: string | null
          token: string
          view_count?: number | null
        }
        Update: {
          allow_comment?: boolean | null
          allow_download?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string | null
          last_viewed_at?: string | null
          note?: string | null
          password_hash?: string | null
          title?: string | null
          token?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gen_share_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "gen_spot_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      gen_spot_assets: {
        Row: {
          asset_type: string
          created_at: string | null
          edit_instruction: string | null
          file_name: string | null
          file_size_bytes: number | null
          file_url: string
          id: string
          is_selected: boolean | null
          job_id: string
          metadata: Json | null
          parent_asset_id: string | null
          sort_order: number | null
          version: number | null
        }
        Insert: {
          asset_type: string
          created_at?: string | null
          edit_instruction?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url: string
          id?: string
          is_selected?: boolean | null
          job_id: string
          metadata?: Json | null
          parent_asset_id?: string | null
          sort_order?: number | null
          version?: number | null
        }
        Update: {
          asset_type?: string
          created_at?: string | null
          edit_instruction?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          is_selected?: boolean | null
          job_id?: string
          metadata?: Json | null
          parent_asset_id?: string | null
          sort_order?: number | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gen_spot_assets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "gen_spot_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gen_spot_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "gen_spot_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      gen_spot_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          input_data: Json | null
          n8n_execution_id: string | null
          output_data: Json | null
          output_file_url: string | null
          project_id: string
          started_at: string | null
          status: string | null
          tool_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          n8n_execution_id?: string | null
          output_data?: Json | null
          output_file_url?: string | null
          project_id: string
          started_at?: string | null
          status?: string | null
          tool_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          n8n_execution_id?: string | null
          output_data?: Json | null
          output_file_url?: string | null
          project_id?: string
          started_at?: string | null
          status?: string | null
          tool_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gen_spot_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      gen_steps: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          job_id: string | null
          result: Json | null
          started_at: string | null
          status: string | null
          step_key: string
          step_label: string
          step_number: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          step_key: string
          step_label: string
          step_number: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          step_key?: string
          step_label?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "gen_steps_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "gen_jobs"
            referencedColumns: ["id"]
          },
        ]
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
      knowledge_items: {
        Row: {
          ai_extracted_count: number
          ai_model: string | null
          client_id: string
          content_text: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_ai_rule_enabled: boolean
          knowledge_type: string
          legacy_asset_id: string | null
          legacy_contract_id: string | null
          legacy_reference_id: string | null
          product_id: string | null
          project_id: string | null
          scope: string
          sort_order: number
          source_file_id: string | null
          status: string
          structured_at: string | null
          structured_data: Json | null
          structured_version: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_extracted_count?: number
          ai_model?: string | null
          client_id: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_ai_rule_enabled?: boolean
          knowledge_type: string
          legacy_asset_id?: string | null
          legacy_contract_id?: string | null
          legacy_reference_id?: string | null
          product_id?: string | null
          project_id?: string | null
          scope: string
          sort_order?: number
          source_file_id?: string | null
          status?: string
          structured_at?: string | null
          structured_data?: Json | null
          structured_version?: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_extracted_count?: number
          ai_model?: string | null
          client_id?: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_ai_rule_enabled?: boolean
          knowledge_type?: string
          legacy_asset_id?: string | null
          legacy_contract_id?: string | null
          legacy_reference_id?: string | null
          product_id?: string | null
          project_id?: string | null
          scope?: string
          sort_order?: number
          source_file_id?: string | null
          status?: string
          structured_at?: string | null
          structured_data?: Json | null
          structured_version?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_items_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "storage_files"
            referencedColumns: ["id"]
          },
        ]
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
      ops_integrations: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          integration_type: string
          project_id: string
          result_data: Json | null
          result_url: string | null
          status: string
          triggered_at: string | null
          triggered_by: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_type: string
          project_id: string
          result_data?: Json | null
          result_url?: string | null
          status?: string
          triggered_at?: string | null
          triggered_by?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_type?: string
          project_id?: string
          result_data?: Json | null
          result_url?: string | null
          status?: string
          triggered_at?: string | null
          triggered_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_integrations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string
          creative_type: string
          description: string | null
          is_active: boolean
          name: string
          sort_order: number
          used_by_brain: boolean
          used_by_check: boolean
          used_by_gen: boolean
        }
        Insert: {
          code: string
          created_at?: string
          creative_type: string
          description?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          used_by_brain?: boolean
          used_by_check?: boolean
          used_by_gen?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          creative_type?: string
          description?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          used_by_brain?: boolean
          used_by_check?: boolean
          used_by_gen?: boolean
        }
        Relationships: []
      }
      product_approval_flows: {
        Row: {
          common_revisions: string | null
          created_at: string
          flow_data: Json
          id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          common_revisions?: string | null
          created_at?: string
          flow_data?: Json
          id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          common_revisions?: string | null
          created_at?: string
          flow_data?: Json
          id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_approval_flows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_approval_flows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assets: {
        Row: {
          asset_type: string
          content_text: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          file_path: string | null
          file_size: number | null
          file_url: string | null
          id: string
          metadata: Json
          mime_type: string | null
          name: string
          product_id: string
          source_url: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          asset_type?: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name: string
          product_id: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          asset_type?: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name?: string
          product_id?: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      product_check_settings: {
        Row: {
          created_at: string | null
          default_size_specs: Json | null
          id: string
          info_lines: string[] | null
          meta: string | null
          product_id: string
          rules_desc: string | null
          sample_text: string | null
          sf_enabled: boolean | null
          updated_at: string | null
          warning: string | null
          webhook_paths: Json | null
        }
        Insert: {
          created_at?: string | null
          default_size_specs?: Json | null
          id?: string
          info_lines?: string[] | null
          meta?: string | null
          product_id: string
          rules_desc?: string | null
          sample_text?: string | null
          sf_enabled?: boolean | null
          updated_at?: string | null
          warning?: string | null
          webhook_paths?: Json | null
        }
        Update: {
          created_at?: string | null
          default_size_specs?: Json | null
          id?: string
          info_lines?: string[] | null
          meta?: string | null
          product_id?: string
          rules_desc?: string | null
          sample_text?: string | null
          sf_enabled?: boolean | null
          updated_at?: string | null
          warning?: string | null
          webhook_paths?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "product_check_settings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_check_settings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      product_creatives: {
        Row: {
          ai_analysis: Json | null
          completion_rate: number | null
          cpa: number | null
          created_at: string | null
          created_by: string | null
          creative_type: string | null
          ctr: number | null
          cvr: number | null
          file_name: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          is_active: boolean | null
          memo: string | null
          mime_type: string | null
          name: string
          period: string | null
          product_id: string
          rating: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          completion_rate?: number | null
          cpa?: number | null
          created_at?: string | null
          created_by?: string | null
          creative_type?: string | null
          ctr?: number | null
          cvr?: number | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          memo?: string | null
          mime_type?: string | null
          name: string
          period?: string | null
          product_id: string
          rating: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          completion_rate?: number | null
          cpa?: number | null
          created_at?: string | null
          created_by?: string | null
          creative_type?: string | null
          ctr?: number | null
          cvr?: number | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          memo?: string | null
          mime_type?: string | null
          name?: string
          period?: string | null
          product_id?: string
          rating?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_creatives_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_creatives_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ng_instructions: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          frequency: string
          id: string
          instruction: string
          is_active: boolean | null
          product_id: string
          sort_order: number | null
          source_meta: Json | null
          source_type: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          frequency: string
          id?: string
          instruction: string
          is_active?: boolean | null
          product_id: string
          sort_order?: number | null
          source_meta?: Json | null
          source_type?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          frequency?: string
          id?: string
          instruction?: string
          is_active?: boolean | null
          product_id?: string
          sort_order?: number | null
          source_meta?: Json | null
          source_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_ng_instructions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ng_instructions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      production_patterns: {
        Row: {
          created_at: string | null
          default_business_days: number | null
          description: string | null
          id: string
          is_active: boolean | null
          pattern_code: string
          pattern_name: string
          product_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_business_days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          pattern_code: string
          pattern_name: string
          product_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_business_days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          pattern_code?: string
          pattern_name?: string
          product_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_patterns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_patterns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          abbreviation: string | null
          actual_advertiser_name: string | null
          ai_scan_metadata: Json | null
          ai_scanned_at: string | null
          applicable_laws: Json | null
          approval_common_revisions: string | null
          approval_flow: Json | null
          assigned_person_ids: Json | null
          business_subcategory: string | null
          client_id: string | null
          code: string
          color: string | null
          competitors: Json | null
          created_at: string | null
          default_bg_color: string | null
          default_display_sec: number | null
          default_switch_sec: number | null
          default_transition: string | null
          description: string | null
          external_product_id: string | null
          frame_image_url: string | null
          genre: string | null
          id: string
          industry_category: string | null
          kpi: string | null
          label: string
          logo_image_url: string | null
          lp_url: string | null
          name: string
          ng_words: string[] | null
          price: string | null
          price_range: string | null
          product_status: string | null
          short_name: string | null
          sort_order: number | null
          target: string | null
          target_audience: string | null
          transaction_form: string | null
          transaction_started_at: string | null
          updated_at: string | null
          usp: string | null
        }
        Insert: {
          abbreviation?: string | null
          actual_advertiser_name?: string | null
          ai_scan_metadata?: Json | null
          ai_scanned_at?: string | null
          applicable_laws?: Json | null
          approval_common_revisions?: string | null
          approval_flow?: Json | null
          assigned_person_ids?: Json | null
          business_subcategory?: string | null
          client_id?: string | null
          code: string
          color?: string | null
          competitors?: Json | null
          created_at?: string | null
          default_bg_color?: string | null
          default_display_sec?: number | null
          default_switch_sec?: number | null
          default_transition?: string | null
          description?: string | null
          external_product_id?: string | null
          frame_image_url?: string | null
          genre?: string | null
          id?: string
          industry_category?: string | null
          kpi?: string | null
          label: string
          logo_image_url?: string | null
          lp_url?: string | null
          name: string
          ng_words?: string[] | null
          price?: string | null
          price_range?: string | null
          product_status?: string | null
          short_name?: string | null
          sort_order?: number | null
          target?: string | null
          target_audience?: string | null
          transaction_form?: string | null
          transaction_started_at?: string | null
          updated_at?: string | null
          usp?: string | null
        }
        Update: {
          abbreviation?: string | null
          actual_advertiser_name?: string | null
          ai_scan_metadata?: Json | null
          ai_scanned_at?: string | null
          applicable_laws?: Json | null
          approval_common_revisions?: string | null
          approval_flow?: Json | null
          assigned_person_ids?: Json | null
          business_subcategory?: string | null
          client_id?: string | null
          code?: string
          color?: string | null
          competitors?: Json | null
          created_at?: string | null
          default_bg_color?: string | null
          default_display_sec?: number | null
          default_switch_sec?: number | null
          default_transition?: string | null
          description?: string | null
          external_product_id?: string | null
          frame_image_url?: string | null
          genre?: string | null
          id?: string
          industry_category?: string | null
          kpi?: string | null
          label?: string
          logo_image_url?: string | null
          lp_url?: string | null
          name?: string
          ng_words?: string[] | null
          price?: string | null
          price_range?: string | null
          product_status?: string | null
          short_name?: string | null
          sort_order?: number | null
          target?: string | null
          target_audience?: string | null
          transaction_form?: string | null
          transaction_started_at?: string | null
          updated_at?: string | null
          usp?: string | null
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
      project_assets: {
        Row: {
          asset_type: string
          content_text: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          file_path: string | null
          file_size: number | null
          file_url: string | null
          id: string
          metadata: Json
          mime_type: string | null
          name: string
          project_id: string
          source_url: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          asset_type?: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name: string
          project_id: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          asset_type?: string
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name?: string
          project_id?: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_audit_log: {
        Row: {
          action: string
          created_at: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          project_id: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_briefs: {
        Row: {
          ad_objective: string | null
          created_at: string
          created_by: string | null
          differentiation: string | null
          hint: string | null
          id: string
          is_current: boolean
          lp_summary: string | null
          lp_url: string | null
          ng_words: string[] | null
          note: string | null
          project_id: string
          reference_banner_urls: string[] | null
          reference_creatives: string | null
          source: string
          target_audience: string | null
          target_insight: string | null
          tone_preset: string | null
        }
        Insert: {
          ad_objective?: string | null
          created_at?: string
          created_by?: string | null
          differentiation?: string | null
          hint?: string | null
          id?: string
          is_current?: boolean
          lp_summary?: string | null
          lp_url?: string | null
          ng_words?: string[] | null
          note?: string | null
          project_id: string
          reference_banner_urls?: string[] | null
          reference_creatives?: string | null
          source?: string
          target_audience?: string | null
          target_insight?: string | null
          tone_preset?: string | null
        }
        Update: {
          ad_objective?: string | null
          created_at?: string
          created_by?: string | null
          differentiation?: string | null
          hint?: string | null
          id?: string
          is_current?: boolean
          lp_summary?: string | null
          lp_url?: string | null
          ng_words?: string[] | null
          note?: string | null
          project_id?: string
          reference_banner_urls?: string[] | null
          reference_creatives?: string | null
          source?: string
          target_audience?: string | null
          target_insight?: string | null
          tone_preset?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_briefs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_collaborators: {
        Row: {
          creator_id: string
          expires_at: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean | null
          last_accessed_at: string | null
          notification_enabled: boolean | null
          project_id: string
          share_token: string
        }
        Insert: {
          creator_id: string
          expires_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          last_accessed_at?: string | null
          notification_enabled?: boolean | null
          project_id: string
          share_token?: string
        }
        Update: {
          creator_id?: string
          expires_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          last_accessed_at?: string | null
          notification_enabled?: boolean | null
          project_id?: string
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_distribution_media: {
        Row: {
          applied_to_adcheck: boolean | null
          applied_to_adgen: boolean | null
          created_at: string | null
          id: string
          is_active: boolean | null
          media_category: string | null
          media_name: string
          media_regulation_id: string | null
          project_id: string
          regulation_snapshot: Json | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          applied_to_adcheck?: boolean | null
          applied_to_adgen?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          media_category?: string | null
          media_name: string
          media_regulation_id?: string | null
          project_id: string
          regulation_snapshot?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          applied_to_adcheck?: boolean | null
          applied_to_adgen?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          media_category?: string | null
          media_name?: string
          media_regulation_id?: string | null
          project_id?: string
          regulation_snapshot?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_distribution_media_media_regulation_id_fkey"
            columns: ["media_regulation_id"]
            isOneToOne: false
            referencedRelation: "reference_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_distribution_media_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          gdrive_synced_at: string | null
          gdrive_url: string | null
          id: string
          parent_file_id: string | null
          pattern_id: string | null
          process_type: string
          project_id: string | null
          status: string | null
          submission_type: string
          updated_at: string | null
          uploaded_by_creator_id: string | null
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
          gdrive_synced_at?: string | null
          gdrive_url?: string | null
          id?: string
          parent_file_id?: string | null
          pattern_id?: string | null
          process_type: string
          project_id?: string | null
          status?: string | null
          submission_type?: string
          updated_at?: string | null
          uploaded_by_creator_id?: string | null
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
          gdrive_synced_at?: string | null
          gdrive_url?: string | null
          id?: string
          parent_file_id?: string | null
          pattern_id?: string | null
          process_type?: string
          project_id?: string | null
          status?: string | null
          submission_type?: string
          updated_at?: string | null
          uploaded_by_creator_id?: string | null
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
          {
            foreignKeyName: "project_files_uploaded_by_creator_id_fkey"
            columns: ["uploaded_by_creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      project_knowledge_context: {
        Row: {
          client_layer: Json | null
          created_at: string | null
          effective_rules: Json | null
          generated_at: string | null
          id: string
          knowledge_version: number | null
          last_updated_source: string | null
          media_regulations: Json | null
          product_layer: Json | null
          project_id: string
          project_layer: Json | null
          stats: Json | null
          updated_at: string | null
        }
        Insert: {
          client_layer?: Json | null
          created_at?: string | null
          effective_rules?: Json | null
          generated_at?: string | null
          id?: string
          knowledge_version?: number | null
          last_updated_source?: string | null
          media_regulations?: Json | null
          product_layer?: Json | null
          project_id: string
          project_layer?: Json | null
          stats?: Json | null
          updated_at?: string | null
        }
        Update: {
          client_layer?: Json | null
          created_at?: string | null
          effective_rules?: Json | null
          generated_at?: string | null
          id?: string
          knowledge_version?: number | null
          last_updated_source?: string | null
          media_regulations?: Json | null
          product_layer?: Json | null
          project_id?: string
          project_layer?: Json | null
          stats?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_knowledge_context_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_materials: {
        Row: {
          ai_extracted_at: string | null
          ai_extracted_data: Json | null
          ai_extraction_status: string | null
          available_for_creator: boolean | null
          category: string
          created_at: string | null
          description: string | null
          external_source_type: string | null
          external_url: string | null
          file_name: string | null
          file_size_bytes: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          material_type: string | null
          project_id: string
          scope_type: string
          sort_order: number | null
          title: string | null
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          ai_extracted_at?: string | null
          ai_extracted_data?: Json | null
          ai_extraction_status?: string | null
          available_for_creator?: boolean | null
          category: string
          created_at?: string | null
          description?: string | null
          external_source_type?: string | null
          external_url?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          material_type?: string | null
          project_id: string
          scope_type?: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          ai_extracted_at?: string | null
          ai_extracted_data?: Json | null
          ai_extraction_status?: string | null
          available_for_creator?: boolean | null
          category?: string
          created_at?: string | null
          description?: string | null
          external_source_type?: string | null
          external_url?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          material_type?: string | null
          project_id?: string
          scope_type?: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_materials_project_id_fkey"
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
          expected_height: number | null
          expected_width: number | null
          id: string
          is_active: boolean
          is_common: boolean
          process_key: string
          process_label: string
          project_id: string
          skip_size_check: boolean
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          client_deadline?: string | null
          created_at?: string
          deadline?: string | null
          expected_height?: number | null
          expected_width?: number | null
          id?: string
          is_active?: boolean
          is_common?: boolean
          process_key: string
          process_label: string
          project_id: string
          skip_size_check?: boolean
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          client_deadline?: string | null
          created_at?: string
          deadline?: string | null
          expected_height?: number | null
          expected_width?: number | null
          id?: string
          is_active?: boolean
          is_common?: boolean
          process_key?: string
          process_label?: string
          project_id?: string
          skip_size_check?: boolean
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
          ad_objective: string | null
          ad_purpose_note: string | null
          ad_purposes: string[] | null
          appeal_requests: Json | null
          author: string | null
          available_assets: string | null
          banner_designs_count: number | null
          banner_sizes: Json | null
          bgm_settings: Json | null
          business_days: number | null
          catchcopy_required: boolean | null
          client_contact: string | null
          client_person_id: string | null
          compositions_count: number | null
          copyright_text: string | null
          created_at: string | null
          created_by: string | null
          creative_type: string | null
          deadline: string | null
          delivery_date: string | null
          delivery_start_date: string | null
          description: string | null
          distribution_start_date: string | null
          duration_seconds: number | null
          endcard_spec: Json | null
          frame_count: number | null
          frame_texts: Json | null
          gen_ai_policy: string | null
          genai_policy: Json | null
          google_drive_url: string | null
          id: string
          lp_info: Json | null
          lp_message: string | null
          lp_summary: string | null
          lp_url: string | null
          manga_settings: Json | null
          memo: string | null
          name: string
          narration_config: Json | null
          narration_enabled: boolean | null
          narration_required: boolean | null
          ng_words: string[] | null
          ob_am: string | null
          ob_pm: string | null
          ob_qm: string | null
          overall_deadline: string | null
          product_id: string | null
          production_drive_url: string | null
          production_pattern: string | null
          project_code: string | null
          publisher: string | null
          reference_banner_urls: string[] | null
          reference_banners: Json | null
          reference_creatives: string | null
          reference_videos: Json | null
          registration_mode: string | null
          resize_sizes: Json | null
          schedule_business_days: number | null
          scope: string | null
          scope_type: string | null
          sort_order: number | null
          status: string | null
          target_audience: string | null
          tone_manner_requests: Json | null
          tone_manners_count: number | null
          total_banner_count: number | null
          total_video_count: number | null
          updated_at: string | null
          video_duration_seconds: number | null
          work_title: string | null
        }
        Insert: {
          ad_objective?: string | null
          ad_purpose_note?: string | null
          ad_purposes?: string[] | null
          appeal_requests?: Json | null
          author?: string | null
          available_assets?: string | null
          banner_designs_count?: number | null
          banner_sizes?: Json | null
          bgm_settings?: Json | null
          business_days?: number | null
          catchcopy_required?: boolean | null
          client_contact?: string | null
          client_person_id?: string | null
          compositions_count?: number | null
          copyright_text?: string | null
          created_at?: string | null
          created_by?: string | null
          creative_type?: string | null
          deadline?: string | null
          delivery_date?: string | null
          delivery_start_date?: string | null
          description?: string | null
          distribution_start_date?: string | null
          duration_seconds?: number | null
          endcard_spec?: Json | null
          frame_count?: number | null
          frame_texts?: Json | null
          gen_ai_policy?: string | null
          genai_policy?: Json | null
          google_drive_url?: string | null
          id?: string
          lp_info?: Json | null
          lp_message?: string | null
          lp_summary?: string | null
          lp_url?: string | null
          manga_settings?: Json | null
          memo?: string | null
          name: string
          narration_config?: Json | null
          narration_enabled?: boolean | null
          narration_required?: boolean | null
          ng_words?: string[] | null
          ob_am?: string | null
          ob_pm?: string | null
          ob_qm?: string | null
          overall_deadline?: string | null
          product_id?: string | null
          production_drive_url?: string | null
          production_pattern?: string | null
          project_code?: string | null
          publisher?: string | null
          reference_banner_urls?: string[] | null
          reference_banners?: Json | null
          reference_creatives?: string | null
          reference_videos?: Json | null
          registration_mode?: string | null
          resize_sizes?: Json | null
          schedule_business_days?: number | null
          scope?: string | null
          scope_type?: string | null
          sort_order?: number | null
          status?: string | null
          target_audience?: string | null
          tone_manner_requests?: Json | null
          tone_manners_count?: number | null
          total_banner_count?: number | null
          total_video_count?: number | null
          updated_at?: string | null
          video_duration_seconds?: number | null
          work_title?: string | null
        }
        Update: {
          ad_objective?: string | null
          ad_purpose_note?: string | null
          ad_purposes?: string[] | null
          appeal_requests?: Json | null
          author?: string | null
          available_assets?: string | null
          banner_designs_count?: number | null
          banner_sizes?: Json | null
          bgm_settings?: Json | null
          business_days?: number | null
          catchcopy_required?: boolean | null
          client_contact?: string | null
          client_person_id?: string | null
          compositions_count?: number | null
          copyright_text?: string | null
          created_at?: string | null
          created_by?: string | null
          creative_type?: string | null
          deadline?: string | null
          delivery_date?: string | null
          delivery_start_date?: string | null
          description?: string | null
          distribution_start_date?: string | null
          duration_seconds?: number | null
          endcard_spec?: Json | null
          frame_count?: number | null
          frame_texts?: Json | null
          gen_ai_policy?: string | null
          genai_policy?: Json | null
          google_drive_url?: string | null
          id?: string
          lp_info?: Json | null
          lp_message?: string | null
          lp_summary?: string | null
          lp_url?: string | null
          manga_settings?: Json | null
          memo?: string | null
          name?: string
          narration_config?: Json | null
          narration_enabled?: boolean | null
          narration_required?: boolean | null
          ng_words?: string[] | null
          ob_am?: string | null
          ob_pm?: string | null
          ob_qm?: string | null
          overall_deadline?: string | null
          product_id?: string | null
          production_drive_url?: string | null
          production_pattern?: string | null
          project_code?: string | null
          publisher?: string | null
          reference_banner_urls?: string[] | null
          reference_banners?: Json | null
          reference_creatives?: string | null
          reference_videos?: Json | null
          registration_mode?: string | null
          resize_sizes?: Json | null
          schedule_business_days?: number | null
          scope?: string | null
          scope_type?: string | null
          sort_order?: number | null
          status?: string | null
          target_audience?: string | null
          tone_manner_requests?: Json | null
          tone_manners_count?: number | null
          total_banner_count?: number | null
          total_video_count?: number | null
          updated_at?: string | null
          video_duration_seconds?: number | null
          work_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_person_id_fkey"
            columns: ["client_person_id"]
            isOneToOne: false
            referencedRelation: "client_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_materials: {
        Row: {
          ai_rule_enabled: boolean
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
          ai_rule_enabled?: boolean
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
          ai_rule_enabled?: boolean
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
      regulation_master_laws: {
        Row: {
          applicable_industries: Json | null
          category: string | null
          code: string
          created_at: string | null
          default_content: string | null
          full_name: string | null
          is_active: boolean | null
          name: string
          reference_url: string | null
          short_description: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          applicable_industries?: Json | null
          category?: string | null
          code: string
          created_at?: string | null
          default_content?: string | null
          full_name?: string | null
          is_active?: boolean | null
          name: string
          reference_url?: string | null
          short_description?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          applicable_industries?: Json | null
          category?: string | null
          code?: string
          created_at?: string | null
          default_content?: string | null
          full_name?: string | null
          is_active?: boolean | null
          name?: string
          reference_url?: string | null
          short_description?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      regulation_master_media: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          default_content: string | null
          is_active: boolean | null
          name: string
          official_url: string | null
          short_description: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string | null
          default_content?: string | null
          is_active?: boolean | null
          name: string
          official_url?: string | null
          short_description?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string | null
          default_content?: string | null
          is_active?: boolean | null
          name?: string
          official_url?: string | null
          short_description?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      revision_comment_files: {
        Row: {
          comment_id: string
          created_at: string
          file_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          file_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revision_comment_files_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "revision_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_comment_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_comments: {
        Row: {
          comment_text: string
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revision_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_audit_log: {
        Row: {
          action_type: string
          ai_confidence: number | null
          ai_reasoning: string
          check_rule_id: string | null
          created_at: string
          field_changed: string | null
          id: string
          level: string
          new_value: string | null
          old_value: string | null
          product_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string
          status: string
        }
        Insert: {
          action_type: string
          ai_confidence?: number | null
          ai_reasoning: string
          check_rule_id?: string | null
          created_at?: string
          field_changed?: string | null
          id?: string
          level: string
          new_value?: string | null
          old_value?: string | null
          product_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id: string
          status?: string
        }
        Update: {
          action_type?: string
          ai_confidence?: number | null
          ai_reasoning?: string
          check_rule_id?: string | null
          created_at?: string
          field_changed?: string | null
          id?: string
          level?: string
          new_value?: string | null
          old_value?: string | null
          product_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_audit_log_check_rule_id_fkey"
            columns: ["check_rule_id"]
            isOneToOne: false
            referencedRelation: "check_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_audit_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_audit_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_candidates: {
        Row: {
          admin_notes: string | null
          approved_rule_id: string | null
          category: string | null
          client_id: string | null
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
          source_material_type: string | null
          source_reference_id: string | null
          source_type: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          approved_rule_id?: string | null
          category?: string | null
          client_id?: string | null
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
          source_material_type?: string | null
          source_reference_id?: string | null
          source_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          approved_rule_id?: string | null
          category?: string | null
          client_id?: string | null
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
          source_material_type?: string | null
          source_reference_id?: string | null
          source_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_candidates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_candidates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_candidates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
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
      rule_duplicate_groups: {
        Row: {
          active_count: number
          client_id: string | null
          detected_at: string
          detection_method: string
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          group_key: string
          id: string
          inactive_count: number
          merged_at: string | null
          merged_by: string | null
          product_id: string | null
          project_id: string | null
          representative_title: string
          rule_count: number
          rule_ids: string[]
          scope: string
          similarity_score: number | null
          status: string
          suggested_master_rule_id: string | null
          suggestion_reason: string | null
          updated_at: string
        }
        Insert: {
          active_count: number
          client_id?: string | null
          detected_at?: string
          detection_method: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          group_key: string
          id?: string
          inactive_count: number
          merged_at?: string | null
          merged_by?: string | null
          product_id?: string | null
          project_id?: string | null
          representative_title: string
          rule_count: number
          rule_ids: string[]
          scope: string
          similarity_score?: number | null
          status?: string
          suggested_master_rule_id?: string | null
          suggestion_reason?: string | null
          updated_at?: string
        }
        Update: {
          active_count?: number
          client_id?: string | null
          detected_at?: string
          detection_method?: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          group_key?: string
          id?: string
          inactive_count?: number
          merged_at?: string | null
          merged_by?: string | null
          product_id?: string | null
          project_id?: string | null
          representative_title?: string
          rule_count?: number
          rule_ids?: string[]
          scope?: string
          similarity_score?: number | null
          status?: string
          suggested_master_rule_id?: string | null
          suggestion_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_duplicate_groups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_duplicate_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_duplicate_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_check_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_duplicate_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_duplicate_groups_suggested_master_rule_id_fkey"
            columns: ["suggested_master_rule_id"]
            isOneToOne: false
            referencedRelation: "check_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_improvement_proposals: {
        Row: {
          ai_reasoning: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          current_quality_score: number | null
          current_value: Json
          expected_quality_score: number | null
          id: string
          proposal_type: string
          proposed_value: Json
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          rule_id: string
          status: string
          trigger_reason: string
          updated_at: string
        }
        Insert: {
          ai_reasoning?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          current_quality_score?: number | null
          current_value: Json
          expected_quality_score?: number | null
          id?: string
          proposal_type: string
          proposed_value: Json
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          rule_id: string
          status?: string
          trigger_reason: string
          updated_at?: string
        }
        Update: {
          ai_reasoning?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          current_quality_score?: number | null
          current_value?: Json
          expected_quality_score?: number | null
          id?: string
          proposal_type?: string
          proposed_value?: Json
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          rule_id?: string
          status?: string
          trigger_reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_improvement_proposals_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "check_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_merge_log: {
        Row: {
          action_summary: string | null
          action_type: string
          deactivated_rule_ids: string[]
          deleted_rule_ids: string[]
          duplicate_group_id: string | null
          id: string
          is_rollback_possible: boolean
          master_rule_id: string
          performed_at: string
          performed_by: string
          rolled_back_at: string | null
          rolled_back_by: string | null
        }
        Insert: {
          action_summary?: string | null
          action_type: string
          deactivated_rule_ids: string[]
          deleted_rule_ids?: string[]
          duplicate_group_id?: string | null
          id?: string
          is_rollback_possible?: boolean
          master_rule_id: string
          performed_at?: string
          performed_by: string
          rolled_back_at?: string | null
          rolled_back_by?: string | null
        }
        Update: {
          action_summary?: string | null
          action_type?: string
          deactivated_rule_ids?: string[]
          deleted_rule_ids?: string[]
          duplicate_group_id?: string | null
          id?: string
          is_rollback_possible?: boolean
          master_rule_id?: string
          performed_at?: string
          performed_by?: string
          rolled_back_at?: string | null
          rolled_back_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_merge_log_duplicate_group_id_fkey"
            columns: ["duplicate_group_id"]
            isOneToOne: false
            referencedRelation: "rule_duplicate_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_merge_log_master_rule_id_fkey"
            columns: ["master_rule_id"]
            isOneToOne: false
            referencedRelation: "check_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_quality_audit_log: {
        Row: {
          ambiguous_count: number
          ambiguous_rate: number
          audit_date: string
          created_at: string | null
          details: Json | null
          duplicate_count: number
          id: number
          invalid_process_type_count: number
          missing_title_count: number
          quality_ng_count: number
          quality_ok_count: number
          total_rules: number
        }
        Insert: {
          ambiguous_count: number
          ambiguous_rate: number
          audit_date?: string
          created_at?: string | null
          details?: Json | null
          duplicate_count: number
          id?: number
          invalid_process_type_count: number
          missing_title_count: number
          quality_ng_count: number
          quality_ok_count: number
          total_rules: number
        }
        Update: {
          ambiguous_count?: number
          ambiguous_rate?: number
          audit_date?: string
          created_at?: string | null
          details?: Json | null
          duplicate_count?: number
          id?: number
          invalid_process_type_count?: number
          missing_title_count?: number
          quality_ng_count?: number
          quality_ok_count?: number
          total_rules?: number
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
      storage_files: {
        Row: {
          bucket: string
          deleted_at: string | null
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          bucket: string
          deleted_at?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          deleted_at?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
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
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
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
      products_with_check_settings: {
        Row: {
          abbreviation: string | null
          actual_advertiser_name: string | null
          ai_scan_metadata: Json | null
          ai_scanned_at: string | null
          applicable_laws: Json | null
          approval_common_revisions: string | null
          approval_flow: Json | null
          assigned_person_ids: Json | null
          business_subcategory: string | null
          client_id: string | null
          code: string | null
          color: string | null
          competitors: Json | null
          created_at: string | null
          default_bg_color: string | null
          default_display_sec: number | null
          default_switch_sec: number | null
          default_transition: string | null
          description: string | null
          external_product_id: string | null
          frame_image_url: string | null
          genre: string | null
          id: string | null
          industry_category: string | null
          info_lines: string[] | null
          kpi: string | null
          label: string | null
          logo_image_url: string | null
          lp_url: string | null
          meta: string | null
          name: string | null
          ng_words: string[] | null
          price_range: string | null
          product_status: string | null
          rules_desc: string | null
          sample_text: string | null
          sf_enabled: boolean | null
          sort_order: number | null
          target_audience: string | null
          transaction_form: string | null
          transaction_started_at: string | null
          updated_at: string | null
          usp: string | null
          warning: string | null
          webhook_paths: Json | null
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
      rule_quality_metrics: {
        Row: {
          ambiguous_count: number | null
          ambiguous_rate_pct: number | null
          client_name: string | null
          duplicate_count: number | null
          invalid_pt_count: number | null
          missing_title_count: number | null
          process_type: string | null
          product_name: string | null
          quality_ng: number | null
          quality_ok: number | null
          quality_ok_rate_pct: number | null
          total_rules: number | null
        }
        Relationships: []
      }
      rule_quality_trend: {
        Row: {
          ambiguous_count: number | null
          ambiguous_rate: number | null
          audit_date: string | null
          duplicate_count: number | null
          invalid_process_type_count: number | null
          missing_title_count: number | null
          quality_ng_count: number | null
          quality_ok_count: number | null
          total_rules: number | null
        }
        Insert: {
          ambiguous_count?: number | null
          ambiguous_rate?: number | null
          audit_date?: string | null
          duplicate_count?: number | null
          invalid_process_type_count?: number | null
          missing_title_count?: number | null
          quality_ng_count?: number | null
          quality_ok_count?: number | null
          total_rules?: number | null
        }
        Update: {
          ambiguous_count?: number | null
          ambiguous_rate?: number | null
          audit_date?: string | null
          duplicate_count?: number | null
          invalid_process_type_count?: number | null
          missing_title_count?: number | null
          quality_ng_count?: number | null
          quality_ok_count?: number | null
          total_rules?: number | null
        }
        Relationships: []
      }
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
      apply_duplicate_resolution: {
        Args: {
          p_actor_user_id?: string
          p_archive_member_ids: string[]
          p_group_id: string
          p_master_rule_id: string
        }
        Returns: Json
      }
      apply_improvement_proposal: {
        Args: { p_proposal_id: string; p_use_proposed_value?: Json }
        Returns: Json
      }
      apply_rule_merge: {
        Args: {
          p_action_type: string
          p_duplicate_group_id: string
          p_master_rule_id: string
          p_target_rule_ids: string[]
        }
        Returns: Json
      }
      approve_rule_candidate: {
        Args: { p_candidate_id: string; p_reviewer_id?: string }
        Returns: string
      }
      approve_rule_candidates_bulk: {
        Args: { p_candidate_ids: string[]; p_reviewer_id?: string }
        Returns: {
          candidate_id: string
          new_rule_id: string
        }[]
      }
      audit_check_rules_quality: { Args: never; Returns: Json }
      build_legal_content_from_codes: {
        Args: { p_law_codes: string[] }
        Returns: string
      }
      build_legal_content_from_jsonb: {
        Args: { p_law_codes: Json }
        Returns: string
      }
      build_project_knowledge_context: {
        Args: { p_project_id: string }
        Returns: string
      }
      bulk_apply_duplicate_resolutions: {
        Args: { p_actor_user_id?: string; p_group_ids?: string[] }
        Returns: Json
      }
      bulk_apply_improvement_proposals: {
        Args: { p_filter_defect_code?: string; p_proposal_ids?: string[] }
        Returns: Json
      }
      bulk_archive_unused: { Args: never; Returns: Json }
      bulk_generate_ai_proposals: {
        Args: { p_defect_code: string }
        Returns: Json
      }
      bulk_merge_duplicates: { Args: { p_only_exact?: boolean }; Returns: Json }
      bulk_request_review_for_stale_rules: { Args: never; Returns: Json }
      calc_business_days: {
        Args: { end_date: string; start_date: string }
        Returns: number
      }
      calculate_rule_quality_score: {
        Args: { p_rule_id: string }
        Returns: number
      }
      client_terms_filled_count: {
        Args: { ct: Database["public"]["Tables"]["client_terms"]["Row"] }
        Returns: number
      }
      count_rules_pending_embedding: { Args: never; Returns: Json }
      create_bulk_revision_comment: {
        Args: {
          p_comment_text: string
          p_created_by?: string
          p_file_ids: string[]
          p_project_id: string
          p_severity?: string
        }
        Returns: string
      }
      current_user_role: { Args: never; Returns: string }
      delete_project_cascade: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      detect_rule_duplicates: {
        Args: {
          p_method?: string
          p_min_similarity?: number
          p_persist?: boolean
        }
        Returns: Json
      }
      detect_rule_duplicates_semantic: {
        Args: { p_max_pairs?: number; p_min_similarity?: number }
        Returns: Json
      }
      detect_semantic_duplicate_pairs: {
        Args: { p_limit?: number; p_min_similarity?: number }
        Returns: {
          rule_a_id: string
          rule_a_title: string
          rule_b_id: string
          rule_b_title: string
          similarity: number
        }[]
      }
      ensure_profile:
        | { Args: { p_email: string; p_user_id: string }; Returns: undefined }
        | { Args: { p_email: string; p_user_id: string }; Returns: undefined }
      find_most_similar_rule: {
        Args: {
          p_min_similarity?: number
          p_process_type?: string
          p_product_id: string
          p_query_embedding: string
        }
        Returns: {
          description: string
          id: string
          process_type: string
          rule_id: string
          similarity: number
          title: string
        }[]
      }
      find_similar_rules_by_embedding: {
        Args: {
          p_client_id?: string
          p_embedding: string
          p_exclude_inactive?: boolean
          p_exclude_rule_id?: string
          p_limit?: number
          p_min_similarity?: number
          p_product_id?: string
          p_project_id?: string
          p_scope?: string
        }
        Returns: {
          client_id: string
          description: string
          is_active: boolean
          product_id: string
          project_id: string
          quality_score: number
          rule_id: string
          scope: string
          similarity: number
          title: string
        }[]
      }
      find_similar_rules_semantic: {
        Args: {
          p_exclude_inactive?: boolean
          p_limit?: number
          p_min_similarity?: number
          p_rule_id: string
        }
        Returns: {
          client_id: string
          description: string
          is_active: boolean
          product_id: string
          project_id: string
          quality_score: number
          rule_id: string
          scope: string
          similarity: number
          title: string
        }[]
      }
      generate_share_token: { Args: never; Returns: string }
      get_actionable_duplicate_groups: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          active_count: number
          client_id: string
          detected_at: string
          detection_method: string
          group_id: string
          group_key: string
          has_ai_proposal: boolean
          impact_score: number
          inactive_count: number
          member_rule_ids: string[]
          product_id: string
          project_id: string
          representative_title: string
          rule_count: number
          scope: string
          similarity_score: number
          suggested_master_rule_id: string
          suggestion_reason: string
        }[]
      }
      get_ai_judgment_quality_stats: { Args: never; Returns: Json }
      get_ambiguous_word_rules: {
        Args: never
        Returns: {
          description: string
          id: string
          is_auto_generated: boolean
          matched_words: string[]
          process_type: string
          rule_id: string
          title: string
        }[]
      }
      get_applicable_rules: {
        Args: {
          p_min_quality_score?: number
          p_process_type?: string
          p_product_id: string
          p_project_id?: string
        }
        Returns: {
          category: string
          client_id: string
          description: string
          id: string
          is_active: boolean
          is_auto_generated: boolean
          process_type: string
          product_id: string
          project_id: string
          quality_score: number
          rule_id: string
          scope: string
          severity: string
          sort_order: number
          source_type: string
          title: string
        }[]
      }
      get_duplicate_group_detail: {
        Args: { p_group_id: string }
        Returns: Json
      }
      get_duplicate_group_with_members: {
        Args: { p_group_id: string }
        Returns: Json
      }
      get_expected_size: {
        Args: { p_process_type: string; p_project_id: string }
        Returns: {
          expected_height: number
          expected_width: number
          skip_check: boolean
        }[]
      }
      get_file_comment_counts_for_creator: {
        Args: { p_share_token: string }
        Returns: Json
      }
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
      get_knowledge_for_adcheck: {
        Args: {
          p_client_id: string
          p_process_type: string
          p_product_id?: string
          p_project_id?: string
        }
        Returns: Json
      }
      get_knowledge_for_adgen: {
        Args: {
          p_client_id: string
          p_function_name: string
          p_product_id?: string
          p_project_id?: string
        }
        Returns: Json
      }
      get_knowledge_fulfillment: { Args: never; Returns: Json }
      get_latest_merge_log_for_group: {
        Args: { p_group_id: string }
        Returns: Json
      }
      get_min_quality_score: { Args: never; Returns: number }
      get_phase2_knowledge_text: {
        Args: { p_project_id: string }
        Returns: string
      }
      get_profiles_by_ids: {
        Args: { p_ids: string[] }
        Returns: {
          display_name: string
          email: string
          id: string
        }[]
      }
      get_project_comments_for_creator: {
        Args: { p_file_id?: string; p_share_token: string }
        Returns: Json
      }
      get_project_files_for_creator: {
        Args: { p_share_token: string }
        Returns: {
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
          gdrive_synced_at: string | null
          gdrive_url: string | null
          id: string
          parent_file_id: string | null
          pattern_id: string | null
          process_type: string
          project_id: string | null
          status: string | null
          submission_type: string
          updated_at: string | null
          uploaded_by_creator_id: string | null
          version_number: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "project_files"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_project_for_creator: {
        Args: { p_share_token: string }
        Returns: Json
      }
      get_project_knowledge_context: {
        Args: { p_project_id: string; p_rebuild?: boolean }
        Returns: Json
      }
      get_project_patterns_for_creator: {
        Args: { p_share_token: string }
        Returns: Json
      }
      get_project_processes_for_creator: {
        Args: { p_share_token: string }
        Returns: Json
      }
      get_project_status_summary: { Args: never; Returns: Json }
      get_quality_gate_history: { Args: { p_limit?: number }; Returns: Json }
      get_quality_trend: { Args: { p_days?: number }; Returns: Json }
      get_regulation_master_options: { Args: never; Returns: Json }
      get_regulations_for_context: {
        Args: { p_law_codes?: string[]; p_media_codes?: string[] }
        Returns: Json
      }
      get_rule_defects: { Args: { p_rule_id: string }; Returns: Json }
      get_rule_duplicate_summary: { Args: { p_status?: string }; Returns: Json }
      get_rule_quality_overview: { Args: never; Returns: Json }
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
      get_top_false_positive_rules: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      get_workspace_role: { Args: { _user_id: string }; Returns: string }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_project_member: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      is_workspace_member_accepted: {
        Args: { _user_id: string }
        Returns: boolean
      }
      list_check_rules_page: {
        Args: {
          p_categories?: string[]
          p_client_id?: string
          p_limit: number
          p_offset: number
          p_process_types?: string[]
          p_product_id?: string
          p_quality_band?: string
          p_search?: string
          p_severities?: string[]
          p_sort_by?: string
          p_sort_order?: string
          p_source_types?: string[]
          p_status?: string
        }
        Returns: Json
      }
      list_clients_page: {
        Args: {
          p_am_profile_id?: string
          p_industry?: string
          p_limit: number
          p_offset: number
          p_search?: string
          p_sort_by?: string
          p_sort_order?: string
        }
        Returns: Json
      }
      list_duplicate_groups_page: {
        Args: {
          p_client_id?: string
          p_limit: number
          p_method?: string
          p_min_count?: number
          p_offset: number
          p_product_id?: string
          p_sort_by?: string
          p_sort_order?: string
          p_status?: string
        }
        Returns: Json
      }
      list_improvement_proposals_page: {
        Args: {
          p_limit: number
          p_min_score_diff?: number
          p_offset: number
          p_proposal_type?: string
          p_sort_by?: string
          p_sort_order?: string
          p_status?: string
          p_trigger_reason?: string
        }
        Returns: Json
      }
      list_products_catalog_page: {
        Args: {
          p_client_id?: string
          p_industry_category?: string
          p_limit: number
          p_offset: number
          p_search?: string
          p_sort_by?: string
          p_sort_order?: string
        }
        Returns: Json
      }
      list_projects_page: {
        Args: {
          p_client_id?: string
          p_creative_types?: string[]
          p_delivery_month?: string
          p_limit: number
          p_offset: number
          p_product_id?: string
          p_search?: string
          p_sort_by?: string
          p_sort_order?: string
          p_statuses?: string[]
        }
        Returns: Json
      }
      list_rules_needing_embedding: {
        Args: { p_limit?: number }
        Returns: {
          description: string
          rule_id: string
          title: string
        }[]
      }
      list_rules_with_defect: {
        Args: { p_defect_code: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      lookup_profile_by_email: {
        Args: { p_email: string }
        Returns: {
          display_name: string
          id: string
        }[]
      }
      process_email_notification_queue: { Args: never; Returns: Json }
      recalculate_all_rule_quality_scores: {
        Args: { p_only_outdated?: boolean }
        Returns: Json
      }
      recover_stuck_checking_files: {
        Args: never
        Returns: {
          file_name: string
          recovered_id: string
          stuck_minutes: number
        }[]
      }
      reject_improvement_proposal: {
        Args: { p_proposal_id: string; p_reason?: string }
        Returns: Json
      }
      reject_rule_candidate: {
        Args: {
          p_candidate_id: string
          p_notes?: string
          p_reviewer_id?: string
        }
        Returns: undefined
      }
      rollback_rule_merge: { Args: { p_merge_log_id: string }; Returns: Json }
      scenes_json_to_composition_text: {
        Args: { p_scenes: Json }
        Returns: string
      }
      search_similar_rules: {
        Args: {
          p_client_id?: string
          p_limit?: number
          p_min_similarity?: number
          p_product_id?: string
          p_project_id?: string
          p_scope: string
          p_title: string
        }
        Returns: Json
      }
      send_slack_notification:
        | { Args: { body: Json; channel_type: string }; Returns: undefined }
        | { Args: { message: string }; Returns: undefined }
      send_weekly_rule_improvement_report: { Args: never; Returns: undefined }
      set_min_quality_score: { Args: { p_value: number }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      track_creator_access: {
        Args: { p_share_token: string }
        Returns: undefined
      }
      trigger_na_script_generation: {
        Args: {
          p_client_name?: string
          p_composition_text: string
          p_duration_seconds: number
          p_product_name?: string
          p_project_id: string
          p_project_name?: string
          p_spot_job_id: string
        }
        Returns: number
      }
      trigger_storyboard_image_generation: {
        Args: {
          p_appeal_axis?: string
          p_client_name?: string
          p_copy_text?: string
          p_creative_style?: string
          p_delay_ms?: number
          p_product_name?: string
          p_project_id: string
          p_project_name?: string
          p_scenes: Json
          p_spot_job_id: string
        }
        Returns: number
      }
      upload_file_as_creator: {
        Args: {
          p_file_data: string
          p_file_name: string
          p_file_size_bytes?: number
          p_file_type: string
          p_parent_file_id?: string
          p_pattern_id?: string
          p_process_type: string
          p_share_token: string
        }
        Returns: string
      }
      validate_process_type: {
        Args: { p_process_type: string }
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
