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
      ai_conversations: {
        Row: {
          clerk_user_id: string
          created_at: string
          id: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          clerk_user_id: string
          created_at?: string
          id?: string
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: number
          role: string
          tenant_id: string
          tool_calls: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: never
          role: string
          tenant_id: string
          tool_calls?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: never
          role?: string
          tenant_id?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_tenant_id_fkey"
            columns: ["conversation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      application_stage_events: {
        Row: {
          application_id: string
          changed_at: string
          changed_by: string | null
          from_stage_kind: Database["public"]["Enums"]["stage_kind"] | null
          id: number
          note: string | null
          tenant_id: string
          to_stage_kind: Database["public"]["Enums"]["stage_kind"]
        }
        Insert: {
          application_id: string
          changed_at?: string
          changed_by?: string | null
          from_stage_kind?: Database["public"]["Enums"]["stage_kind"] | null
          id?: never
          note?: string | null
          tenant_id: string
          to_stage_kind: Database["public"]["Enums"]["stage_kind"]
        }
        Update: {
          application_id?: string
          changed_at?: string
          changed_by?: string | null
          from_stage_kind?: Database["public"]["Enums"]["stage_kind"] | null
          id?: never
          note?: string | null
          tenant_id?: string
          to_stage_kind?: Database["public"]["Enums"]["stage_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "application_stage_events_application_id_tenant_id_fkey"
            columns: ["application_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "application_stage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string
          candidate_id: string
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          owner_user_id: string | null
          rejected_reason: string | null
          stage_entered_at: string
          stage_id: string
          stage_kind: Database["public"]["Enums"]["stage_kind"]
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          applied_at?: string
          candidate_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          owner_user_id?: string | null
          rejected_reason?: string | null
          stage_entered_at?: string
          stage_id: string
          stage_kind: Database["public"]["Enums"]["stage_kind"]
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          applied_at?: string
          candidate_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          owner_user_id?: string | null
          rejected_reason?: string | null
          stage_entered_at?: string
          stage_id?: string
          stage_kind?: Database["public"]["Enums"]["stage_kind"]
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_tenant_id_fkey"
            columns: ["candidate_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "applications_job_id_tenant_id_fkey"
            columns: ["job_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "applications_stage_id_tenant_id_stage_kind_fkey"
            columns: ["stage_id", "tenant_id", "stage_kind"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id", "tenant_id", "kind"]
          },
          {
            foreignKeyName: "applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_embeddings: {
        Row: {
          candidate_id: string
          content_hash: string
          embedding: string
          model: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          content_hash: string
          embedding: string
          model: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          content_hash?: string
          embedding?: string
          model?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_embeddings_candidate_id_tenant_id_fkey"
            columns: ["candidate_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "candidate_embeddings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string | null
          current_company: string | null
          current_title: string | null
          delete_after: string | null
          email: string | null
          full_name: string
          gdpr_consent_at: string | null
          headline: string | null
          id: string
          location: string | null
          owner_user_id: string | null
          phone: string | null
          resume_path: string | null
          resume_text: string | null
          salary_expectation: number | null
          skills: string[]
          source: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          current_company?: string | null
          current_title?: string | null
          delete_after?: string | null
          email?: string | null
          full_name: string
          gdpr_consent_at?: string | null
          headline?: string | null
          id?: string
          location?: string | null
          owner_user_id?: string | null
          phone?: string | null
          resume_path?: string | null
          resume_text?: string | null
          salary_expectation?: number | null
          skills?: string[]
          source?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          current_company?: string | null
          current_title?: string | null
          delete_after?: string | null
          email?: string | null
          full_name?: string
          gdpr_consent_at?: string | null
          headline?: string | null
          id?: string
          location?: string | null
          owner_user_id?: string | null
          phone?: string | null
          resume_path?: string | null
          resume_text?: string | null
          salary_expectation?: number | null
          skills?: string[]
          source?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          phone: string | null
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_tenant_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "client_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          owner_user_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          owner_user_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_participants: {
        Row: {
          clerk_user_id: string | null
          client_contact_id: string | null
          created_at: string
          external_email: string | null
          external_name: string | null
          id: string
          interview_id: string
          is_organizer: boolean
          participant_type: string
          tenant_id: string
        }
        Insert: {
          clerk_user_id?: string | null
          client_contact_id?: string | null
          created_at?: string
          external_email?: string | null
          external_name?: string | null
          id?: string
          interview_id: string
          is_organizer?: boolean
          participant_type: string
          tenant_id: string
        }
        Update: {
          clerk_user_id?: string | null
          client_contact_id?: string | null
          created_at?: string
          external_email?: string | null
          external_name?: string | null
          id?: string
          interview_id?: string
          is_organizer?: boolean
          participant_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_participants_client_contact_id_tenant_id_fkey"
            columns: ["client_contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "interview_participants_interview_id_tenant_id_fkey"
            columns: ["interview_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "interview_participants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          feedback: string | null
          id: string
          location_or_link: string | null
          mode: string
          outcome: string | null
          rating: number | null
          round: number
          scheduled_at: string
          status: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          feedback?: string | null
          id?: string
          location_or_link?: string | null
          mode?: string
          outcome?: string | null
          rating?: number | null
          round?: number
          scheduled_at: string
          status?: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          feedback?: string | null
          id?: string
          location_or_link?: string | null
          mode?: string
          outcome?: string | null
          rating?: number | null
          round?: number
          scheduled_at?: string
          status?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_tenant_id_fkey"
            columns: ["application_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "interviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_embeddings: {
        Row: {
          content_hash: string
          embedding: string
          job_id: string
          model: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          content_hash: string
          embedding: string
          job_id: string
          model: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          embedding?: string
          job_id?: string
          model?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_embeddings_job_id_tenant_id_fkey"
            columns: ["job_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "job_embeddings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          employment_type: string | null
          id: string
          location: string | null
          openings: number
          owner_user_id: string | null
          remote_type: string | null
          salary_max: number | null
          salary_min: number | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          employment_type?: string | null
          id?: string
          location?: string | null
          openings?: number
          owner_user_id?: string | null
          remote_type?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          employment_type?: string | null
          id?: string
          location?: string | null
          openings?: number
          owner_user_id?: string | null
          remote_type?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_tenant_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          clerk_user_id: string
          created_at: string
          email: string | null
          full_name: string | null
          role: string
          source_updated_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          clerk_user_id: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          role?: string
          source_updated_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          role?: string
          source_updated_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          application_id: string
          approved_by: string | null
          bonus: number | null
          created_at: string
          created_by: string | null
          currency: string
          equity: string | null
          expires_at: string | null
          id: string
          notes: string | null
          responded_at: string | null
          salary: number
          sent_at: string | null
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          application_id: string
          approved_by?: string | null
          bonus?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          equity?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          responded_at?: string | null
          salary: number
          sent_at?: string | null
          start_date?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          approved_by?: string | null
          bonus?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          equity?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          responded_at?: string | null
          salary?: number
          sent_at?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_application_id_tenant_id_fkey"
            columns: ["application_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "offers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string
          id: string
          is_terminal: boolean
          kind: Database["public"]["Enums"]["stage_kind"]
          label: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_terminal?: boolean
          kind: Database["public"]["Enums"]["stage_kind"]
          label: string
          position: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_terminal?: boolean
          kind?: Database["public"]["Enums"]["stage_kind"]
          label?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_tombstones: {
        Row: {
          deleted_at: string
          tenant_id: string
        }
        Insert: {
          deleted_at?: string
          tenant_id: string
        }
        Update: {
          deleted_at?: string
          tenant_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          created_at: string
          grace_period_ends_at: string | null
          id: string
          name: string
          plan: string
          plan_source_updated_at: string
          seats_purchased: number | null
          slug: string | null
          source_updated_at: string
          subscription_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grace_period_ends_at?: string | null
          id: string
          name: string
          plan?: string
          plan_source_updated_at?: string
          seats_purchased?: number | null
          slug?: string | null
          source_updated_at?: string
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grace_period_ends_at?: string | null
          id?: string
          name?: string
          plan?: string
          plan_source_updated_at?: string
          seats_purchased?: number | null
          slug?: string | null
          source_updated_at?: string
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_type: string
          received_at: string
          svix_id: string
        }
        Insert: {
          event_type: string
          received_at?: string
          svix_id: string
        }
        Update: {
          event_type?: string
          received_at?: string
          svix_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clerk_sync_membership: {
        Args: {
          p_email: string
          p_event_type: string
          p_full_name: string
          p_org_id: string
          p_role: string
          p_svix_id: string
          p_updated_at: string
          p_user_id: string
        }
        Returns: string
      }
      clerk_sync_organization: {
        Args: {
          p_event_type: string
          p_name: string
          p_org_id: string
          p_slug: string
          p_svix_id: string
          p_updated_at: string
        }
        Returns: string
      }
      clerk_sync_subscription: {
        Args: {
          p_event_type: string
          p_grace_until: string
          p_org_id: string
          p_plan: string
          p_seats: number
          p_status: string
          p_svix_id: string
          p_updated_at: string
        }
        Returns: string
      }
      match_candidates_for_job: {
        Args: { p_job_id: string; p_limit?: number; p_min_similarity?: number }
        Returns: {
          candidate_id: string
          similarity: number
        }[]
      }
      match_jobs_for_candidate: {
        Args: {
          p_candidate_id: string
          p_limit?: number
          p_min_similarity?: number
        }
        Returns: {
          job_id: string
          similarity: number
        }[]
      }
      search_candidates_by_embedding: {
        Args: { p_embedding: string; p_limit?: number }
        Returns: {
          candidate_id: string
          similarity: number
        }[]
      }
      seed_default_pipeline_stages: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
    }
    Enums: {
      stage_kind:
        | "source"
        | "screening"
        | "interviewing"
        | "offer"
        | "placed"
        | "withdrawn"
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
      stage_kind: [
        "source",
        "screening",
        "interviewing",
        "offer",
        "placed",
        "withdrawn",
      ],
    },
  },
} as const
