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
      blog_posts: {
        Row: {
          content_markdown: string | null
          cover_photo_url: string | null
          created_at: string
          error_message: string | null
          id: string
          itinerary: Json | null
          published_at: string | null
          selected_photo_urls: string[]
          status: string
          title: string | null
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_markdown?: string | null
          cover_photo_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          itinerary?: Json | null
          published_at?: string | null
          selected_photo_urls?: string[]
          status?: string
          title?: string | null
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_markdown?: string | null
          cover_photo_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          itinerary?: Json | null
          published_at?: string | null
          selected_photo_urls?: string[]
          status?: string
          title?: string | null
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          captured_at: string
          category: string | null
          city: string | null
          content: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          location_source: string | null
          occurred_at: string | null
          offline_id: string
          photo_urls: string[]
          place_name: string | null
          rating: number | null
          tagging_status: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          category?: string | null
          city?: string | null
          content: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_source?: string | null
          occurred_at?: string | null
          offline_id: string
          photo_urls?: string[]
          place_name?: string | null
          rating?: number | null
          tagging_status?: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          captured_at?: string
          category?: string | null
          city?: string | null
          content?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_source?: string | null
          occurred_at?: string | null
          offline_id?: string
          photo_urls?: string[]
          place_name?: string | null
          rating?: number | null
          tagging_status?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          contribute_to_community: boolean
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          contribute_to_community?: boolean
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          contribute_to_community?: boolean
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      public_place_contributions: {
        Row: {
          category: string | null
          created_at: string
          id: string
          note_id: string
          public_place_id: string
          rating: number | null
          trip_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          note_id: string
          public_place_id: string
          rating?: number | null
          trip_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          note_id?: string
          public_place_id?: string
          rating?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_place_contributions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: true
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_place_contributions_public_place_id_fkey"
            columns: ["public_place_id"]
            isOneToOne: false
            referencedRelation: "public_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_place_contributions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      public_places: {
        Row: {
          category_counts: Json
          city: string | null
          coord_count: number
          created_at: string
          dominant_category: string | null
          id: string
          lat: number | null
          lng: number | null
          place_key: string
          place_name: string
          rating_count: number
          rating_sum: number
          updated_at: string
          visit_count: number
        }
        Insert: {
          category_counts?: Json
          city?: string | null
          coord_count?: number
          created_at?: string
          dominant_category?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          place_key: string
          place_name: string
          rating_count?: number
          rating_sum?: number
          updated_at?: string
          visit_count?: number
        }
        Update: {
          category_counts?: Json
          city?: string | null
          coord_count?: number
          created_at?: string
          dominant_category?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          place_key?: string
          place_name?: string
          rating_count?: number
          rating_sum?: number
          updated_at?: string
          visit_count?: number
        }
        Relationships: []
      }
      trips: {
        Row: {
          cover_photo_url: string | null
          created_at: string
          destinations: string[]
          end_date: string | null
          id: string
          name: string
          note_count: number
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_photo_url?: string | null
          created_at?: string
          destinations?: string[]
          end_date?: string | null
          id?: string
          name: string
          note_count?: number
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_photo_url?: string | null
          created_at?: string
          destinations?: string[]
          end_date?: string | null
          id?: string
          name?: string
          note_count?: number
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_destinations: {
        Row: {
          categories: string[] | null
          city: string | null
          place_count: number | null
          total_visits: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aggregate_trip_for_community: {
        Args: { p_trip_id: string }
        Returns: undefined
      }
      build_place_key: {
        Args: { city: string; place_name: string }
        Returns: string
      }
      normalize_place_text: { Args: { t: string }; Returns: string }
      pick_dominant_category: {
        Args: { category_counts: Json }
        Returns: string
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
