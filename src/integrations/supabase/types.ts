export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      bookings: {
        Row: {
          check_in: string;
          check_out: string;
          created_at: string;
          guest_email: string;
          guest_name: string;
          guest_phone: string;
          guests: number;
          id: string;
          room_id: string;
          special_requests: string | null;
          status: Database["public"]["Enums"]["booking_status"] | "no-show" | string;
          total_amount: number;
          updated_at: string;
          user_id: string;
          booking_status: string | null;
          reservation_color: string | null;
          deleted_at?: string | null;
        };
        Insert: {
          check_in: string;
          check_out: string;
          created_at?: string;
          guest_email: string;
          guest_name: string;
          guest_phone: string;
          guests: number;
          id?: string;
          room_id: string;
          special_requests?: string | null;
          status?: Database["public"]["Enums"]["booking_status"] | "no-show" | string;
          total_amount: number;
          updated_at?: string;
          user_id: string;
          booking_status?: string | null;
          reservation_color?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          check_in?: string;
          check_out?: string;
          created_at?: string;
          guest_email?: string;
          guest_name?: string;
          guest_phone?: string;
          guests?: number;
          id?: string;
          room_id?: string;
          special_requests?: string | null;
          status?: Database["public"]["Enums"]["booking_status"] | "no-show" | string;
          total_amount?: number;
          updated_at?: string;
          user_id?: string;
          booking_status?: string | null;
          reservation_color?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          booking_id: string;
          created_at: string;
          id: string;
          notes: string | null;
          receipt_url: string | null;
          status: Database["public"]["Enums"]["payment_status"] | "unpaid" | string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          booking_id: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          receipt_url?: string | null;
          status?: Database["public"]["Enums"]["payment_status"] | "unpaid" | string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          booking_id?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          receipt_url?: string | null;
          status?: Database["public"]["Enums"]["payment_status"] | "unpaid" | string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          fullname: string;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          fullname: string;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          fullname?: string;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          amenities: string[] | null;
          capacity: string;
          created_at: string;
          description: string;
          id: string;
          image_url: string | null;
          is_available: boolean;
          name: string;
          price: number;
          type: Database["public"]["Enums"]["room_type"];
          updated_at: string;
          status: string | null;
          maintenance_start: string | null;
          maintenance_end: string | null;
        };
        Insert: {
          amenities?: string[] | null;
          capacity: string;
          created_at?: string;
          description: string;
          id?: string;
          image_url?: string | null;
          is_available?: boolean;
          name: string;
          price: number;
          type?: Database["public"]["Enums"]["room_type"];
          updated_at?: string;
          status?: string | null;
          maintenance_start?: string | null;
          maintenance_end?: string | null;
        };
        Update: {
          amenities?: string[] | null;
          capacity?: string;
          created_at?: string;
          description?: string;
          id?: string;
          image_url?: string | null;
          is_available?: boolean;
          name?: string;
          price?: number;
          type?: Database["public"]["Enums"]["room_type"];
          updated_at?: string;
          status?: string | null;
          maintenance_start?: string | null;
          maintenance_end?: string | null;
        };
        Relationships: [];
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
      feedbacks: {
        Row: {
          id: string;
          booking_id: string;
          user_id: string;
          guest_name: string | null;
          rating: number;
          comment: string | null;
          is_approved: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          user_id: string;
          guest_name?: string | null;
          rating: number;
          comment?: string | null;
          is_approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          user_id?: string;
          guest_name?: string | null;
          rating?: number;
          comment?: string | null;
          is_approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_audit_logs: {
        Row: {
          id: string;
          payment_id: string | null;
          booking_id: string | null;
          admin_id: string | null;
          admin_name: string | null;
          action: string | null;
          performed_by: string | null;
          previous_status: string | null;
          new_status: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id?: string | null;
          booking_id?: string | null;
          admin_id?: string | null;
          admin_name?: string | null;
          action?: string | null;
          performed_by?: string | null;
          previous_status?: string | null;
          new_status?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          payment_id?: string | null;
          booking_id?: string | null;
          admin_id?: string | null;
          admin_name?: string | null;
          action?: string | null;
          performed_by?: string | null;
          previous_status?: string | null;
          new_status?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      resort_blocks: {
        Row: {
          id: string;
          start_date: string;
          end_date: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          start_date: string;
          end_date: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          start_date?: string;
          end_date?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      inquiries: {
        Row: {
          id: string;
          customer_id: string | null;
          name: string;
          email: string;
          message: string;
          status: "unread" | "read" | "replied" | "waiting_reply" | string;
          admin_reply: string | null;
          replied_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          name: string;
          email: string;
          message: string;
          status?: "unread" | "read" | "replied" | "waiting_reply" | string;
          admin_reply?: string | null;
          replied_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          name?: string;
          email?: string;
          message?: string;
          status?: "unread" | "read" | "replied" | "waiting_reply" | string;
          admin_reply?: string | null;
          replied_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inquiry_messages: {
        Row: {
          id: string;
          inquiry_id: string;
          sender_id: string | null;
          sender_role: "customer" | "admin";
          message: string;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          inquiry_id: string;
          sender_id?: string | null;
          sender_role: "customer" | "admin";
          message: string;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          inquiry_id?: string;
          sender_id?: string | null;
          sender_role?: "customer" | "admin";
          message?: string;
          created_at?: string;
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inquiry_messages_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "inquiries";
            referencedColumns: ["id"];
          }
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
      get_approved_feedbacks: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          rating: number;
          comment: string | null;
          guest_name: string;
          created_at: string;
        }[];
      };
    };
    Enums: {
      app_role: "admin" | "customer";
      booking_status: "pending" | "approved" | "rejected" | "cancelled" | "completed" | "no-show";
      payment_status: "pending" | "verified" | "rejected" | "unpaid";
      room_type: "room" | "cottage" | "villa";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Database;

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

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "customer"],
      booking_status: ["pending", "approved", "rejected", "cancelled", "completed", "no-show"],
      payment_status: ["pending", "verified", "rejected", "unpaid"],
      room_type: ["room", "cottage", "villa"],
    },
  },
} as const;
