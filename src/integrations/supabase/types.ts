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
      blog_sources: {
        Row: {
          blog_id: string
          label: string
          position: number
          source_id: string
        }
        Insert: {
          blog_id: string
          label: string
          position?: number
          source_id: string
        }
        Update: {
          blog_id?: string
          label?: string
          position?: number
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_sources_blog_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      blogs: {
        Row: {
          body_md: string
          created_at: string
          id: string
          slug: string
          status: string
          summary: string
          title: string
          topic_slug: string | null
          updated_at: string
          validation_confidence: number | null
          version: number
        }
        Insert: {
          body_md?: string
          created_at?: string
          id?: string
          slug: string
          status?: string
          summary?: string
          title: string
          topic_slug?: string | null
          updated_at?: string
          validation_confidence?: number | null
          version?: number
        }
        Update: {
          body_md?: string
          created_at?: string
          id?: string
          slug?: string
          status?: string
          summary?: string
          title?: string
          topic_slug?: string | null
          updated_at?: string
          validation_confidence?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "blogs_topic_slug_fkey"
            columns: ["topic_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      capabilities: {
        Row: {
          accent: string
          created_at: string
          description: string
          id: string
          name: string
        }
        Insert: {
          accent?: string
          created_at?: string
          description?: string
          id: string
          name: string
        }
        Update: {
          accent?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          active: boolean
          capability_id: string
          created_at: string
          depth: number
          id: string
          source_id: string
          status: string
          supersedes_id: string | null
          tags: string[]
          text: string
          type: string
          version: number
        }
        Insert: {
          active?: boolean
          capability_id: string
          created_at?: string
          depth: number
          id?: string
          source_id: string
          status?: string
          supersedes_id?: string | null
          tags?: string[]
          text: string
          type?: string
          version?: number
        }
        Update: {
          active?: boolean
          capability_id?: string
          created_at?: string
          depth?: number
          id?: string
          source_id?: string
          status?: string
          supersedes_id?: string | null
          tags?: string[]
          text?: string
          type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "claims_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      diagrams: {
        Row: {
          caption: string
          created_at: string
          kind: string
          path: string
          slug: string
          topic_slug: string | null
        }
        Insert: {
          caption?: string
          created_at?: string
          kind?: string
          path: string
          slug: string
          topic_slug?: string | null
        }
        Update: {
          caption?: string
          created_at?: string
          kind?: string
          path?: string
          slug?: string
          topic_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagrams_topic_slug_fkey"
            columns: ["topic_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          item_key: string
          item_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_key: string
          item_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          item_key?: string
          item_type?: string
          user_id?: string
        }
        Relationships: []
      }
      help_docs: {
        Row: {
          body_md: string
          created_at: string
          slug: string
          sort_order: number
          title: string
        }
        Insert: {
          body_md: string
          created_at?: string
          slug: string
          sort_order?: number
          title: string
        }
        Update: {
          body_md?: string
          created_at?: string
          slug?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          created_at: string
          id: string
          slug: string
          summary: string
          tags: string[]
          tier: number
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
          summary?: string
          tags?: string[]
          tier: number
          title: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
          summary?: string
          tags?: string[]
          tier?: number
          title?: string
          url?: string
        }
        Relationships: []
      }
      topic_capabilities: {
        Row: {
          capability_id: string
          topic_slug: string
        }
        Insert: {
          capability_id: string
          topic_slug: string
        }
        Update: {
          capability_id?: string
          topic_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_capabilities_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_capabilities_topic_slug_fkey"
            columns: ["topic_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          description: string
          name: string
          parent_slug: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string
          name: string
          parent_slug?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string
          name?: string
          parent_slug?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "topics_parent_slug_fkey"
            columns: ["parent_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "user"
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
    Enums: {
      app_role: ["admin", "editor", "user"],
    },
  },
} as const
