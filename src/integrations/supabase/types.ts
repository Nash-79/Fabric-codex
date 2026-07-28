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
      admin_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string
          target_type?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          attribution: string
          blog_id: string | null
          capability_id: string | null
          caption: string
          claim_id: string | null
          created_at: string
          design_id: string | null
          id: string
          kind: string
          license_note: string
          mime: string
          path: string
          source_id: string | null
          url: string
        }
        Insert: {
          attribution?: string
          blog_id?: string | null
          capability_id?: string | null
          caption?: string
          claim_id?: string | null
          created_at?: string
          design_id?: string | null
          id?: string
          kind?: string
          license_note?: string
          mime?: string
          path?: string
          source_id?: string | null
          url?: string
        }
        Update: {
          attribution?: string
          blog_id?: string | null
          capability_id?: string | null
          caption?: string
          claim_id?: string | null
          created_at?: string
          design_id?: string | null
          id?: string
          kind?: string
          license_note?: string
          mime?: string
          path?: string
          source_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_blog_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_blog_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_blog_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_blog_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_sources_legacy: {
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
            referencedRelation: "blogs_legacy"
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
      blogs_legacy: {
        Row: {
          active: boolean
          body_md: string
          content_hash: string
          created_at: string
          depth_levels: number[]
          document: Json
          id: string
          ready_to_share: boolean
          slug: string
          status: string
          summary: string
          supersedes_id: string | null
          tags: string[]
          title: string
          topic_slug: string | null
          updated_at: string
          validation_confidence: number | null
          version: number
        }
        Insert: {
          active?: boolean
          body_md?: string
          content_hash?: string
          created_at?: string
          depth_levels?: number[]
          document?: Json
          id?: string
          ready_to_share?: boolean
          slug: string
          status?: string
          summary?: string
          supersedes_id?: string | null
          tags?: string[]
          title: string
          topic_slug?: string | null
          updated_at?: string
          validation_confidence?: number | null
          version?: number
        }
        Update: {
          active?: boolean
          body_md?: string
          content_hash?: string
          created_at?: string
          depth_levels?: number[]
          document?: Json
          id?: string
          ready_to_share?: boolean
          slug?: string
          status?: string
          summary?: string
          supersedes_id?: string | null
          tags?: string[]
          title?: string
          topic_slug?: string | null
          updated_at?: string
          validation_confidence?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "blogs_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "blogs_legacy"
            referencedColumns: ["id"]
          },
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
          maturity: string
          name: string
          released_at: string | null
        }
        Insert: {
          accent?: string
          created_at?: string
          description?: string
          id: string
          maturity?: string
          name: string
          released_at?: string | null
        }
        Update: {
          accent?: string
          created_at?: string
          description?: string
          id?: string
          maturity?: string
          name?: string
          released_at?: string | null
        }
        Relationships: []
      }
      claimevents: {
        Row: {
          action: string
          actioned_at: string
          capability_id: string
          claim_id: string | null
          id: string
          new_status: string
          prev_status: string
          text_snippet: string
        }
        Insert: {
          action?: string
          actioned_at?: string
          capability_id?: string
          claim_id?: string | null
          id?: string
          new_status?: string
          prev_status?: string
          text_snippet?: string
        }
        Update: {
          action?: string
          actioned_at?: string
          capability_id?: string
          claim_id?: string | null
          id?: string
          new_status?: string
          prev_status?: string
          text_snippet?: string
        }
        Relationships: [
          {
            foreignKeyName: "claimevents_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          active: boolean
          capability_id: string
          confidence: number
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
          confidence?: number
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
          confidence?: number
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
      content_feedback: {
        Row: {
          ai_analysis: Json | null
          body: string
          category: string
          content_hash: string
          content_item_id: string
          created_at: string
          id: string
          section_id: string | null
          section_title: string | null
          status: string
          submitted_by: string
          triaged_at: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          body: string
          category?: string
          content_hash: string
          content_item_id: string
          created_at?: string
          id?: string
          section_id?: string | null
          section_title?: string | null
          status?: string
          submitted_by: string
          triaged_at?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          body?: string
          category?: string
          content_hash?: string
          content_item_id?: string
          created_at?: string
          id?: string
          section_id?: string | null
          section_title?: string | null
          status?: string
          submitted_by?: string
          triaged_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      content_item_sources: {
        Row: {
          content_item_id: string
          label: string
          position: number
          source_id: string
        }
        Insert: {
          content_item_id: string
          label: string
          position?: number
          source_id: string
        }
        Update: {
          content_item_id?: string
          label?: string
          position?: number
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          active: boolean
          body_md: string
          capability_id: string | null
          confidence: number | null
          constraints: Json
          content_hash: string
          created_at: string
          depth_levels: number[]
          document: Json
          id: string
          kind: string
          lesson_meta: Json | null
          presentation_profile: Json | null
          ready_to_share: boolean
          scenario: string
          slug: string
          status: string
          summary: string
          supersedes_id: string | null
          tags: string[]
          title: string
          topic_slug: string | null
          updated_at: string
          validation_confidence: number | null
          version: number
        }
        Insert: {
          active?: boolean
          body_md?: string
          capability_id?: string | null
          confidence?: number | null
          constraints?: Json
          content_hash?: string
          created_at?: string
          depth_levels?: number[]
          document?: Json
          id?: string
          kind: string
          lesson_meta?: Json | null
          presentation_profile?: Json | null
          ready_to_share?: boolean
          scenario?: string
          slug: string
          status?: string
          summary?: string
          supersedes_id?: string | null
          tags?: string[]
          title: string
          topic_slug?: string | null
          updated_at?: string
          validation_confidence?: number | null
          version?: number
        }
        Update: {
          active?: boolean
          body_md?: string
          capability_id?: string | null
          confidence?: number | null
          constraints?: Json
          content_hash?: string
          created_at?: string
          depth_levels?: number[]
          document?: Json
          id?: string
          kind?: string
          lesson_meta?: Json | null
          presentation_profile?: Json | null
          ready_to_share?: boolean
          scenario?: string
          slug?: string
          status?: string
          summary?: string
          supersedes_id?: string | null
          tags?: string[]
          title?: string
          topic_slug?: string | null
          updated_at?: string
          validation_confidence?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_items_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_topic_slug_fkey"
            columns: ["topic_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      design_sources_legacy: {
        Row: {
          design_id: string
          label: string
          position: number
          source_id: string
        }
        Insert: {
          design_id: string
          label: string
          position?: number
          source_id: string
        }
        Update: {
          design_id?: string
          label?: string
          position?: number
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_sources_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      designs_legacy: {
        Row: {
          body_md: string
          confidence: number | null
          constraints: Json
          content_hash: string
          created_at: string
          document: Json
          id: string
          ready_to_share: boolean
          scenario: string
          slug: string
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string
          confidence?: number | null
          constraints?: Json
          content_hash?: string
          created_at?: string
          document?: Json
          id?: string
          ready_to_share?: boolean
          scenario?: string
          slug: string
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          confidence?: number | null
          constraints?: Json
          content_hash?: string
          created_at?: string
          document?: Json
          id?: string
          ready_to_share?: boolean
          scenario?: string
          slug?: string
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      diagram_nodes: {
        Row: {
          classification: string
          description: string
          diagram_slug: string
          drill_slug: string | null
          drill_type: string | null
          label: string
          node_id: string
          search_vector: unknown
          source_keys: string[]
          tags: string[]
        }
        Insert: {
          classification?: string
          description?: string
          diagram_slug: string
          drill_slug?: string | null
          drill_type?: string | null
          label: string
          node_id: string
          search_vector?: unknown
          source_keys?: string[]
          tags?: string[]
        }
        Update: {
          classification?: string
          description?: string
          diagram_slug?: string
          drill_slug?: string | null
          drill_type?: string | null
          label?: string
          node_id?: string
          search_vector?: unknown
          source_keys?: string[]
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "diagram_nodes_diagram_slug_fkey"
            columns: ["diagram_slug"]
            isOneToOne: false
            referencedRelation: "diagrams"
            referencedColumns: ["slug"]
          },
        ]
      }
      diagrams: {
        Row: {
          accessible_summary: string
          capability_id: string | null
          caption: string
          created_at: string
          interaction_version: string
          kind: string
          path: string
          qa_status: string
          reviewed_at: string | null
          slug: string
          static_hash: string
          supported_layers: string[]
          topic_slug: string | null
        }
        Insert: {
          accessible_summary?: string
          capability_id?: string | null
          caption?: string
          created_at?: string
          interaction_version?: string
          kind?: string
          path: string
          qa_status?: string
          reviewed_at?: string | null
          slug: string
          static_hash?: string
          supported_layers?: string[]
          topic_slug?: string | null
        }
        Update: {
          accessible_summary?: string
          capability_id?: string | null
          caption?: string
          created_at?: string
          interaction_version?: string
          kind?: string
          path?: string
          qa_status?: string
          reviewed_at?: string | null
          slug?: string
          static_hash?: string
          supported_layers?: string[]
          topic_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagrams_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
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
      issues: {
        Row: {
          created_at: string
          id: string
          message: string
          ref: string
          severity: string
          validation_run_id: string
          validator: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          ref?: string
          severity?: string
          validation_run_id: string
          validator?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          ref?: string
          severity?: string
          validation_run_id?: string
          validator?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_validation_run_id_fkey"
            columns: ["validation_run_id"]
            isOneToOne: false
            referencedRelation: "validation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons_legacy: {
        Row: {
          body_md: string
          capability_id: string | null
          created_at: string
          depth: string
          id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string
          capability_id?: string | null
          created_at?: string
          depth?: string
          id?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          capability_id?: string | null
          created_at?: string
          depth?: string
          id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          status: string
          suspended_at: string | null
          suspended_by: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      queue_items: {
        Row: {
          claimed_at: string | null
          created_at: string
          error: string
          id: string
          kind: string
          notes: string
          result_source_id: string | null
          scheduled_at: string | null
          status: string
          submitted_by: string | null
          tags: string[]
          target_slug: string | null
          tier: number
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          error?: string
          id?: string
          kind?: string
          notes?: string
          result_source_id?: string | null
          scheduled_at?: string | null
          status?: string
          submitted_by?: string | null
          tags?: string[]
          target_slug?: string | null
          tier?: number
          title?: string
          updated_at?: string
          url: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          error?: string
          id?: string
          kind?: string
          notes?: string
          result_source_id?: string | null
          scheduled_at?: string | null
          status?: string
          submitted_by?: string | null
          tags?: string[]
          target_slug?: string | null
          tier?: number
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_items_result_source_id_fkey"
            columns: ["result_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_items: {
        Row: {
          active: boolean
          blog_title: string | null
          blog_url: string | null
          capability_id: string | null
          categories: string[]
          created_at: string
          description_html: string
          feature_description: string | null
          feature_name: string
          first_seen_at: string
          guid: string
          id: string
          last_modified: string | null
          last_seen_at: string
          link: string
          product_id: string | null
          product_name: string
          pub_date: string | null
          raw_payload: Json
          release_date: string | null
          release_item_id: string | null
          release_status: string
          release_type: string
          status: string
          target_release: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          blog_title?: string | null
          blog_url?: string | null
          capability_id?: string | null
          categories?: string[]
          created_at?: string
          description_html?: string
          feature_description?: string | null
          feature_name?: string
          first_seen_at?: string
          guid: string
          id?: string
          last_modified?: string | null
          last_seen_at?: string
          link: string
          product_id?: string | null
          product_name?: string
          pub_date?: string | null
          raw_payload?: Json
          release_date?: string | null
          release_item_id?: string | null
          release_status?: string
          release_type?: string
          status?: string
          target_release?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          blog_title?: string | null
          blog_url?: string | null
          capability_id?: string | null
          categories?: string[]
          created_at?: string
          description_html?: string
          feature_description?: string | null
          feature_name?: string
          first_seen_at?: string
          guid?: string
          id?: string
          last_modified?: string | null
          last_seen_at?: string
          link?: string
          product_id?: string | null
          product_name?: string
          pub_date?: string | null
          raw_payload?: Json
          release_date?: string | null
          release_item_id?: string | null
          release_status?: string
          release_type?: string
          status?: string
          target_release?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_sync_state: {
        Row: {
          error_count: number
          id: boolean
          last_error: string
          last_polled_at: string | null
          updated_at: string
        }
        Insert: {
          error_count?: number
          id?: boolean
          last_error?: string
          last_polled_at?: string | null
          updated_at?: string
        }
        Update: {
          error_count?: number
          id?: boolean
          last_error?: string
          last_polled_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rss_subscriptions: {
        Row: {
          created_at: string
          created_by: string | null
          default_tags: string[]
          default_tier: number
          error_count: number
          feed_url: string
          id: string
          last_error: string
          last_polled_at: string | null
          last_seen_guid: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_tags?: string[]
          default_tier?: number
          error_count?: number
          feed_url: string
          id?: string
          last_error?: string
          last_polled_at?: string | null
          last_seen_guid?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_tags?: string[]
          default_tier?: number
          error_count?: number
          feed_url?: string
          id?: string
          last_error?: string
          last_polled_at?: string | null
          last_seen_guid?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      seed_runs: {
        Row: {
          blog_count: number
          claim_count: number
          content_signature: string | null
          diagram_count: number
          duration_ms: number | null
          error: string | null
          id: string
          ran_at: string
          skipped: boolean
          source_count: number
          topic_count: number
          trigger: string
        }
        Insert: {
          blog_count?: number
          claim_count?: number
          content_signature?: string | null
          diagram_count?: number
          duration_ms?: number | null
          error?: string | null
          id?: string
          ran_at?: string
          skipped?: boolean
          source_count?: number
          topic_count?: number
          trigger?: string
        }
        Update: {
          blog_count?: number
          claim_count?: number
          content_signature?: string | null
          diagram_count?: number
          duration_ms?: number | null
          error?: string | null
          id?: string
          ran_at?: string
          skipped?: boolean
          source_count?: number
          topic_count?: number
          trigger?: string
        }
        Relationships: []
      }
      source_watcher_items: {
        Row: {
          canonical_url: string
          content_fingerprint: string
          first_seen_at: string
          id: string
          last_queued_fingerprint: string | null
          last_seen_at: string
          source_modified_at: string | null
          stable_id: string | null
          title: string
          watcher_id: string
        }
        Insert: {
          canonical_url: string
          content_fingerprint: string
          first_seen_at?: string
          id?: string
          last_queued_fingerprint?: string | null
          last_seen_at?: string
          source_modified_at?: string | null
          stable_id?: string | null
          title?: string
          watcher_id: string
        }
        Update: {
          canonical_url?: string
          content_fingerprint?: string
          first_seen_at?: string
          id?: string
          last_queued_fingerprint?: string | null
          last_seen_at?: string
          source_modified_at?: string | null
          stable_id?: string | null
          title?: string
          watcher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_watcher_items_watcher_id_fkey"
            columns: ["watcher_id"]
            isOneToOne: false
            referencedRelation: "rss_status_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_watcher_items_watcher_id_fkey"
            columns: ["watcher_id"]
            isOneToOne: false
            referencedRelation: "source_watcher_status_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_watcher_items_watcher_id_fkey"
            columns: ["watcher_id"]
            isOneToOne: false
            referencedRelation: "source_watchers"
            referencedColumns: ["id"]
          },
        ]
      }
      source_watchers: {
        Row: {
          allowed_host: string
          allowed_path_prefix: string
          alternative_url: string | null
          created_at: string
          created_by: string | null
          default_tags: string[]
          default_tier: number
          detected_mode: string | null
          detected_url: string | null
          error_count: number
          etag: string | null
          id: string
          last_attempt_at: string | null
          last_error: string
          last_error_code: string | null
          last_error_trigger: string | null
          last_modified: string | null
          last_success_at: string | null
          legacy_last_seen_guid: string | null
          max_depth: number
          max_pages: number
          mode: string
          status: string
          suggested_url: string | null
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          allowed_host: string
          allowed_path_prefix?: string
          alternative_url?: string | null
          created_at?: string
          created_by?: string | null
          default_tags?: string[]
          default_tier?: number
          detected_mode?: string | null
          detected_url?: string | null
          error_count?: number
          etag?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string
          last_error_code?: string | null
          last_error_trigger?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          legacy_last_seen_guid?: string | null
          max_depth?: number
          max_pages?: number
          mode?: string
          status?: string
          suggested_url?: string | null
          title?: string
          updated_at?: string
          url: string
        }
        Update: {
          allowed_host?: string
          allowed_path_prefix?: string
          alternative_url?: string | null
          created_at?: string
          created_by?: string | null
          default_tags?: string[]
          default_tier?: number
          detected_mode?: string | null
          detected_url?: string | null
          error_count?: number
          etag?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string
          last_error_code?: string | null
          last_error_trigger?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          legacy_last_seen_guid?: string | null
          max_depth?: number
          max_pages?: number
          mode?: string
          status?: string
          suggested_url?: string | null
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          active: boolean
          audience: string
          content_hash: string
          created_at: string
          document: Json
          id: string
          slug: string
          summary: string
          tags: string[]
          takeaways: string[]
          tier: number
          title: string
          url: string
          version: number
          why_it_matters: string
        }
        Insert: {
          active?: boolean
          audience?: string
          content_hash?: string
          created_at?: string
          document?: Json
          id?: string
          slug: string
          summary?: string
          tags?: string[]
          takeaways?: string[]
          tier: number
          title: string
          url: string
          version?: number
          why_it_matters?: string
        }
        Update: {
          active?: boolean
          audience?: string
          content_hash?: string
          created_at?: string
          document?: Json
          id?: string
          slug?: string
          summary?: string
          tags?: string[]
          takeaways?: string[]
          tier?: number
          title?: string
          url?: string
          version?: number
          why_it_matters?: string
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
          active: boolean
          created_at: string
          description: string
          name: string
          parent_slug: string | null
          slug: string
          sort_order: number
          tags: string[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          name: string
          parent_slug?: string | null
          slug: string
          sort_order?: number
          tags?: string[]
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          name?: string
          parent_slug?: string | null
          slug?: string
          sort_order?: number
          tags?: string[]
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
      user_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          id: string
          intended_role: Database["public"]["Enums"]["app_role"]
          invited_by: string | null
          revoked_at: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          intended_role?: Database["public"]["Enums"]["app_role"]
          invited_by?: string | null
          revoked_at?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          intended_role?: Database["public"]["Enums"]["app_role"]
          invited_by?: string | null
          revoked_at?: string | null
          status?: string
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
      validation_runs: {
        Row: {
          completed_checks: Json
          confidence: number | null
          design_id: string | null
          id: string
          ran_at: string
          revision_hash: string
          score: number | null
          target_id: string | null
          target_kind: string
          validator_version: string
        }
        Insert: {
          completed_checks?: Json
          confidence?: number | null
          design_id?: string | null
          id?: string
          ran_at?: string
          revision_hash?: string
          score?: number | null
          target_id?: string | null
          target_kind?: string
          validator_version?: string
        }
        Update: {
          completed_checks?: Json
          confidence?: number | null
          design_id?: string | null
          id?: string
          ran_at?: string
          revision_hash?: string
          score?: number | null
          target_id?: string | null
          target_kind?: string
          validator_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_runs_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_runs_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_runs_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_runs_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      blog_sources: {
        Row: {
          blog_id: string | null
          label: string | null
          position: number | null
          source_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      blogs: {
        Row: {
          active: boolean | null
          body_md: string | null
          content_hash: string | null
          created_at: string | null
          depth_levels: number[] | null
          document: Json | null
          id: string | null
          ready_to_share: boolean | null
          slug: string | null
          status: string | null
          summary: string | null
          supersedes_id: string | null
          tags: string[] | null
          title: string | null
          topic_slug: string | null
          updated_at: string | null
          validation_confidence: number | null
          version: number | null
        }
        Insert: {
          active?: boolean | null
          body_md?: string | null
          content_hash?: string | null
          created_at?: string | null
          depth_levels?: number[] | null
          document?: Json | null
          id?: string | null
          ready_to_share?: boolean | null
          slug?: string | null
          status?: string | null
          summary?: string | null
          supersedes_id?: string | null
          tags?: string[] | null
          title?: string | null
          topic_slug?: string | null
          updated_at?: string | null
          validation_confidence?: number | null
          version?: number | null
        }
        Update: {
          active?: boolean | null
          body_md?: string | null
          content_hash?: string | null
          created_at?: string | null
          depth_levels?: number[] | null
          document?: Json | null
          id?: string | null
          ready_to_share?: boolean | null
          slug?: string | null
          status?: string | null
          summary?: string | null
          supersedes_id?: string | null
          tags?: string[] | null
          title?: string | null
          topic_slug?: string | null
          updated_at?: string | null
          validation_confidence?: number | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_topic_slug_fkey"
            columns: ["topic_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      design_sources: {
        Row: {
          design_id: string | null
          label: string | null
          position: number | null
          source_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_content_item_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      designs: {
        Row: {
          body_md: string | null
          confidence: number | null
          constraints: Json | null
          content_hash: string | null
          created_at: string | null
          document: Json | null
          id: string | null
          ready_to_share: boolean | null
          scenario: string | null
          slug: string | null
          status: string | null
          summary: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body_md?: string | null
          confidence?: number | null
          constraints?: Json | null
          content_hash?: string | null
          created_at?: string | null
          document?: Json | null
          id?: string | null
          ready_to_share?: boolean | null
          scenario?: string | null
          slug?: string | null
          status?: string | null
          summary?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body_md?: string | null
          confidence?: number | null
          constraints?: Json | null
          content_hash?: string | null
          created_at?: string | null
          document?: Json | null
          id?: string | null
          ready_to_share?: boolean | null
          scenario?: string | null
          slug?: string | null
          status?: string | null
          summary?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lessons: {
        Row: {
          body_md: string | null
          capability_id: string | null
          created_at: string | null
          depth: string | null
          id: string | null
          slug: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body_md?: string | null
          capability_id?: string | null
          created_at?: string | null
          depth?: never
          id?: string | null
          slug?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body_md?: string | null
          capability_id?: string | null
          created_at?: string | null
          depth?: never
          id?: string | null
          slug?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_public: {
        Row: {
          claimed_at: string | null
          created_at: string | null
          id: string | null
          kind: string | null
          notes: string | null
          scheduled_at: string | null
          status: string | null
          tags: string[] | null
          target_slug: string | null
          tier: number | null
          title: string | null
          url: string | null
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string | null
          id?: string | null
          kind?: string | null
          notes?: string | null
          scheduled_at?: string | null
          status?: string | null
          tags?: string[] | null
          target_slug?: string | null
          tier?: number | null
          title?: string | null
          url?: string | null
        }
        Update: {
          claimed_at?: string | null
          created_at?: string | null
          id?: string | null
          kind?: string | null
          notes?: string | null
          scheduled_at?: string | null
          status?: string | null
          tags?: string[] | null
          target_slug?: string | null
          tier?: number | null
          title?: string | null
          url?: string | null
        }
        Relationships: []
      }
      rss_status_public: {
        Row: {
          created_at: string | null
          default_tags: string[] | null
          default_tier: number | null
          error_count: number | null
          feed_url: string | null
          id: string | null
          last_error: string | null
          last_polled_at: string | null
          last_seen_guid: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_tags?: string[] | null
          default_tier?: number | null
          error_count?: number | null
          feed_url?: string | null
          id?: string | null
          last_error?: string | null
          last_polled_at?: string | null
          last_seen_guid?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_tags?: string[] | null
          default_tier?: number | null
          error_count?: number | null
          feed_url?: string | null
          id?: string | null
          last_error?: string | null
          last_polled_at?: string | null
          last_seen_guid?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      source_watcher_status_public: {
        Row: {
          allowed_host: string | null
          allowed_path_prefix: string | null
          alternative_url: string | null
          default_tags: string[] | null
          default_tier: number | null
          detected_mode: string | null
          detected_url: string | null
          error_count: number | null
          etag: string | null
          id: string | null
          last_attempt_at: string | null
          last_error: string | null
          last_error_code: string | null
          last_error_trigger: string | null
          last_modified: string | null
          last_success_at: string | null
          max_depth: number | null
          max_pages: number | null
          mode: string | null
          status: string | null
          suggested_url: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          allowed_host?: string | null
          allowed_path_prefix?: string | null
          alternative_url?: string | null
          default_tags?: string[] | null
          default_tier?: number | null
          detected_mode?: string | null
          detected_url?: string | null
          error_count?: number | null
          etag?: string | null
          id?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_error_trigger?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          max_depth?: number | null
          max_pages?: number | null
          mode?: string | null
          status?: string | null
          suggested_url?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          allowed_host?: string | null
          allowed_path_prefix?: string | null
          alternative_url?: string | null
          default_tags?: string[] | null
          default_tier?: number | null
          detected_mode?: string | null
          detected_url?: string | null
          error_count?: number | null
          etag?: string | null
          id?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_error_trigger?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          max_depth?: number | null
          max_pages?: number | null
          mode?: string | null
          status?: string | null
          suggested_url?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_approve_user: {
        Args: {
          _roles?: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: undefined
      }
      admin_record_event: {
        Args: {
          _action: string
          _metadata?: Json
          _target_id?: string
          _target_type?: string
        }
        Returns: string
      }
      admin_set_user_roles: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: undefined
      }
      admin_suspend_user: { Args: { _user_id: string }; Returns: undefined }
      atlas_health_counts: { Args: never; Returns: Json }
      current_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      search_atlas: {
        Args: { max_results?: number; term: string }
        Returns: {
          kind: string
          payload: Json
          rank: number
        }[]
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
