export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          target_id: string;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          target_id?: string;
          target_type?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          attribution: string;
          blog_id: string | null;
          capability_id: string | null;
          caption: string;
          claim_id: string | null;
          created_at: string;
          design_id: string | null;
          id: string;
          kind: string;
          license_note: string;
          mime: string;
          path: string;
          source_id: string | null;
          url: string;
        };
        Insert: {
          attribution?: string;
          blog_id?: string | null;
          capability_id?: string | null;
          caption?: string;
          claim_id?: string | null;
          created_at?: string;
          design_id?: string | null;
          id?: string;
          kind?: string;
          license_note?: string;
          mime?: string;
          path?: string;
          source_id?: string | null;
          url?: string;
        };
        Update: {
          attribution?: string;
          blog_id?: string | null;
          capability_id?: string | null;
          caption?: string;
          claim_id?: string | null;
          created_at?: string;
          design_id?: string | null;
          id?: string;
          kind?: string;
          license_note?: string;
          mime?: string;
          path?: string;
          source_id?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assets_blog_id_fkey";
            columns: ["blog_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      blog_sources: {
        Row: {
          blog_id: string;
          label: string;
          position: number;
          source_id: string;
        };
        Insert: {
          blog_id: string;
          label: string;
          position?: number;
          source_id: string;
        };
        Update: {
          blog_id?: string;
          label?: string;
          position?: number;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blog_sources_blog_id_fkey";
            columns: ["blog_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blog_sources_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      blogs: {
        Row: {
          body_md: string;
          created_at: string;
          id: string;
          slug: string;
          status: string;
          summary: string;
          title: string;
          topic_slug: string | null;
          updated_at: string;
          validation_confidence: number | null;
          version: number;
          active: boolean;
          content_hash: string;
          depth_levels: number[];
          document: Json;
          ready_to_share: boolean;
          supersedes_id: string | null;
          tags: string[];
        };
        Insert: {
          body_md?: string;
          created_at?: string;
          id?: string;
          slug: string;
          status?: string;
          summary?: string;
          title: string;
          topic_slug?: string | null;
          updated_at?: string;
          validation_confidence?: number | null;
          version?: number;
          active?: boolean;
          content_hash?: string;
          depth_levels?: number[];
          document?: Json;
          ready_to_share?: boolean;
          supersedes_id?: string | null;
          tags?: string[];
        };
        Update: {
          body_md?: string;
          created_at?: string;
          id?: string;
          slug?: string;
          status?: string;
          summary?: string;
          title?: string;
          topic_slug?: string | null;
          updated_at?: string;
          validation_confidence?: number | null;
          version?: number;
          active?: boolean;
          content_hash?: string;
          depth_levels?: number[];
          document?: Json;
          ready_to_share?: boolean;
          supersedes_id?: string | null;
          tags?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "blogs_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "blogs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blogs_topic_slug_fkey";
            columns: ["topic_slug"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["slug"];
          },
        ];
      };
      capabilities: {
        Row: {
          accent: string;
          created_at: string;
          description: string;
          id: string;
          name: string;
        };
        Insert: {
          accent?: string;
          created_at?: string;
          description?: string;
          id: string;
          name: string;
        };
        Update: {
          accent?: string;
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      claimevents: {
        Row: {
          action: string;
          actioned_at: string;
          capability_id: string;
          claim_id: string | null;
          id: string;
          new_status: string;
          prev_status: string;
          text_snippet: string;
        };
        Insert: {
          action?: string;
          actioned_at?: string;
          capability_id?: string;
          claim_id?: string | null;
          id?: string;
          new_status?: string;
          prev_status?: string;
          text_snippet?: string;
        };
        Update: {
          action?: string;
          actioned_at?: string;
          capability_id?: string;
          claim_id?: string | null;
          id?: string;
          new_status?: string;
          prev_status?: string;
          text_snippet?: string;
        };
        Relationships: [
          {
            foreignKeyName: "claimevents_claim_id_fkey";
            columns: ["claim_id"];
            isOneToOne: false;
            referencedRelation: "claims";
            referencedColumns: ["id"];
          },
        ];
      };
      claims: {
        Row: {
          active: boolean;
          capability_id: string;
          confidence: number;
          created_at: string;
          depth: number;
          id: string;
          source_id: string;
          status: string;
          supersedes_id: string | null;
          tags: string[];
          text: string;
          type: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          capability_id: string;
          confidence?: number;
          created_at?: string;
          depth: number;
          id?: string;
          source_id: string;
          status?: string;
          supersedes_id?: string | null;
          tags?: string[];
          text: string;
          type?: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          capability_id?: string;
          confidence?: number;
          created_at?: string;
          depth?: number;
          id?: string;
          source_id?: string;
          status?: string;
          supersedes_id?: string | null;
          tags?: string[];
          text?: string;
          type?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "claims_capability_id_fkey";
            columns: ["capability_id"];
            isOneToOne: false;
            referencedRelation: "capabilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claims_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "claims";
            referencedColumns: ["id"];
          },
        ];
      };
      design_sources: {
        Row: {
          design_id: string;
          label: string;
          position: number;
          source_id: string;
        };
        Insert: {
          design_id: string;
          label: string;
          position?: number;
          source_id: string;
        };
        Update: {
          design_id?: string;
          label?: string;
          position?: number;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "design_sources_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "design_sources_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      designs: {
        Row: {
          body_md: string;
          confidence: number | null;
          constraints: Json;
          content_hash: string;
          created_at: string;
          document: Json;
          id: string;
          ready_to_share: boolean;
          scenario: string;
          slug: string;
          status: string;
          summary: string | null;
          tags: string[];
          title: string;
          updated_at: string;
        };
        Insert: {
          body_md?: string;
          confidence?: number | null;
          constraints?: Json;
          content_hash?: string;
          created_at?: string;
          document?: Json;
          id?: string;
          ready_to_share?: boolean;
          scenario?: string;
          slug: string;
          status?: string;
          summary?: string | null;
          tags?: string[];
          title: string;
          updated_at?: string;
        };
        Update: {
          body_md?: string;
          confidence?: number | null;
          constraints?: Json;
          content_hash?: string;
          created_at?: string;
          document?: Json;
          id?: string;
          ready_to_share?: boolean;
          scenario?: string;
          slug?: string;
          status?: string;
          summary?: string | null;
          tags?: string[];
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      diagrams: {
        Row: {
          caption: string;
          created_at: string;
          kind: string;
          path: string;
          slug: string;
          topic_slug: string | null;
        };
        Insert: {
          caption?: string;
          created_at?: string;
          kind?: string;
          path: string;
          slug: string;
          topic_slug?: string | null;
        };
        Update: {
          caption?: string;
          created_at?: string;
          kind?: string;
          path?: string;
          slug?: string;
          topic_slug?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "diagrams_topic_slug_fkey";
            columns: ["topic_slug"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["slug"];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          item_key: string;
          item_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          item_key: string;
          item_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          item_key?: string;
          item_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      help_docs: {
        Row: {
          body_md: string;
          created_at: string;
          slug: string;
          sort_order: number;
          title: string;
        };
        Insert: {
          body_md: string;
          created_at?: string;
          slug: string;
          sort_order?: number;
          title: string;
        };
        Update: {
          body_md?: string;
          created_at?: string;
          slug?: string;
          sort_order?: number;
          title?: string;
        };
        Relationships: [];
      };
      issues: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          severity: string;
          validation_run_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          severity?: string;
          validation_run_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          severity?: string;
          validation_run_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "issues_validation_run_id_fkey";
            columns: ["validation_run_id"];
            isOneToOne: false;
            referencedRelation: "validation_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      lessons: {
        Row: {
          body_md: string;
          capability_id: string | null;
          created_at: string;
          depth: string;
          id: string;
          slug: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body_md?: string;
          capability_id?: string | null;
          created_at?: string;
          depth?: string;
          id?: string;
          slug: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body_md?: string;
          capability_id?: string | null;
          created_at?: string;
          depth?: string;
          id?: string;
          slug?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_capability_id_fkey";
            columns: ["capability_id"];
            isOneToOne: false;
            referencedRelation: "capabilities";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      queue_items: {
        Row: {
          claimed_at: string | null;
          created_at: string;
          error: string;
          id: string;
          kind: string;
          note: string | null;
          notes: string;
          result_source_id: string | null;
          scheduled_at: string | null;
          status: string;
          submitted_by: string | null;
          tags: string[];
          target_slug: string | null;
          tier: number;
          title: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          claimed_at?: string | null;
          created_at?: string;
          error?: string;
          id?: string;
          kind?: string;
          note?: string | null;
          notes?: string;
          result_source_id?: string | null;
          scheduled_at?: string | null;
          status?: string;
          submitted_by?: string | null;
          tags?: string[];
          target_slug?: string | null;
          tier?: number;
          title?: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          claimed_at?: string | null;
          created_at?: string;
          error?: string;
          id?: string;
          kind?: string;
          note?: string | null;
          notes?: string;
          result_source_id?: string | null;
          scheduled_at?: string | null;
          status?: string;
          submitted_by?: string | null;
          tags?: string[];
          target_slug?: string | null;
          tier?: number;
          title?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "queue_items_result_source_id_fkey";
            columns: ["result_source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          active: boolean;
          audience: string;
          content_hash: string;
          created_at: string;
          document: Json;
          id: string;
          slug: string;
          summary: string;
          tags: string[];
          takeaways: string[];
          tier: number;
          title: string;
          url: string;
          version: number;
          why_it_matters: string;
        };
        Insert: {
          active?: boolean;
          audience?: string;
          content_hash?: string;
          created_at?: string;
          document?: Json;
          id?: string;
          slug: string;
          summary?: string;
          tags?: string[];
          takeaways?: string[];
          tier: number;
          title: string;
          url: string;
          version?: number;
          why_it_matters?: string;
        };
        Update: {
          active?: boolean;
          audience?: string;
          content_hash?: string;
          created_at?: string;
          document?: Json;
          id?: string;
          slug?: string;
          summary?: string;
          tags?: string[];
          takeaways?: string[];
          tier?: number;
          title?: string;
          url?: string;
          version?: number;
          why_it_matters?: string;
        };
        Relationships: [];
      };
      topic_capabilities: {
        Row: {
          capability_id: string;
          topic_slug: string;
        };
        Insert: {
          capability_id: string;
          topic_slug: string;
        };
        Update: {
          capability_id?: string;
          topic_slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "topic_capabilities_capability_id_fkey";
            columns: ["capability_id"];
            isOneToOne: false;
            referencedRelation: "capabilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "topic_capabilities_topic_slug_fkey";
            columns: ["topic_slug"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["slug"];
          },
        ];
      };
      topics: {
        Row: {
          active: boolean;
          created_at: string;
          description: string;
          name: string;
          parent_slug: string | null;
          slug: string;
          sort_order: number;
          tags: string[];
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string;
          name: string;
          parent_slug?: string | null;
          slug: string;
          sort_order?: number;
          tags?: string[];
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string;
          name?: string;
          parent_slug?: string | null;
          slug?: string;
          sort_order?: number;
          tags?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "topics_parent_slug_fkey";
            columns: ["parent_slug"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["slug"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      validation_runs: {
        Row: {
          design_id: string;
          id: string;
          ran_at: string;
          score: number | null;
        };
        Insert: {
          design_id: string;
          id?: string;
          ran_at?: string;
          score?: number | null;
        };
        Update: {
          design_id?: string;
          id?: string;
          ran_at?: string;
          score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "validation_runs_design_id_fkey";
            columns: ["design_id"];
            isOneToOne: false;
            referencedRelation: "designs";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "editor" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "editor", "user"],
    },
  },
} as const;
