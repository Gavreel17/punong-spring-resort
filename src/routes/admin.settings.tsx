import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { SYSTEM_SETTINGS_STORAGE_KEY } from "@/hooks/use-system-settings";
import {
  User,
  Bell,
  Sliders,
  Palette,
  ShieldCheck,
  Database,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Monitor,
  Download,
  RefreshCw,
  Trash2,
  LogOut,
  KeyRound,
  Sparkles,
  Upload,
  Building2,
  FileSpreadsheet,
  FileCode,
  Shield,
  Phone,
  Mail,
  MapPin,
  Clock,
  ExternalLink,
} from "lucide-react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
});

interface SystemSettingsState {
  resort_name: string;
  contact_number: string;
  contact_email: string;
  address: string;
  business_hours: string;
  default_booking_status: string;
  default_payment_status: string;
  theme: "light" | "dark" | "system";
  logo_url: string;
  notify_new_booking: boolean;
  notify_inquiry: boolean;
  notify_message: boolean;
  notify_payment: boolean;
  notify_cancellation: boolean;
}

const DEFAULT_SETTINGS: SystemSettingsState = {
  resort_name: "Punong Spring Resort",
  contact_number: "+63 917 123 4567",
  contact_email: "punongspringresort@gmail.com",
  address: "Brgy. Guba, Cebu City, Philippines",
  business_hours: "8:00 AM - 6:00 PM (Daily)",
  default_booking_status: "pending",
  default_payment_status: "pending",
  theme: "system",
  logo_url: "/logo.png",
  notify_new_booking: true,
  notify_inquiry: true,
  notify_message: true,
  notify_payment: true,
  notify_cancellation: true,
};

function AdminSettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "account" | "notifications" | "system" | "appearance" | "security" | "data"
  >("account");

  // Form states
  const [settings, setSettings] = useState<SystemSettingsState>(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  // Account profile states
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Security password states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);

  // Data management states
  const [syncingData, setSyncingData] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  // Initialize admin profile fields from session
  useEffect(() => {
    if (user) {
      setAdminName(
        user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Administrator"
      );
      setAdminEmail(user.email || "");
    }
  }, [user]);

  // Load system settings from database via RPC
  const { data: dbSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_system_settings");
      if (error) {
        console.warn("Failed to fetch settings from RPC:", error);
        // Fallback to table select
        const { data: tableData } = await (supabase as any)
          .from("system_settings")
          .select("*")
          .eq("id", "default")
          .maybeSingle();
        return tableData || DEFAULT_SETTINGS;
      }
      return data || DEFAULT_SETTINGS;
    },
  });

  // Sync loaded settings into local state
  useEffect(() => {
    if (dbSettings) {
      setSettings({
        resort_name: dbSettings.resort_name || DEFAULT_SETTINGS.resort_name,
        contact_number: dbSettings.contact_number || DEFAULT_SETTINGS.contact_number,
        contact_email: dbSettings.contact_email || DEFAULT_SETTINGS.contact_email,
        address: dbSettings.address || DEFAULT_SETTINGS.address,
        business_hours: dbSettings.business_hours || DEFAULT_SETTINGS.business_hours,
        default_booking_status:
          dbSettings.default_booking_status || DEFAULT_SETTINGS.default_booking_status,
        default_payment_status:
          dbSettings.default_payment_status || DEFAULT_SETTINGS.default_payment_status,
        theme: dbSettings.theme || DEFAULT_SETTINGS.theme,
        logo_url: dbSettings.logo_url || DEFAULT_SETTINGS.logo_url,
        notify_new_booking:
          dbSettings.notify_new_booking !== undefined
            ? dbSettings.notify_new_booking
            : true,
        notify_inquiry:
          dbSettings.notify_inquiry !== undefined ? dbSettings.notify_inquiry : true,
        notify_message:
          dbSettings.notify_message !== undefined ? dbSettings.notify_message : true,
        notify_payment:
          dbSettings.notify_payment !== undefined ? dbSettings.notify_payment : true,
        notify_cancellation:
          dbSettings.notify_cancellation !== undefined
            ? dbSettings.notify_cancellation
            : true,
      });

      // Apply theme to document
      applyTheme(dbSettings.theme || "system");
    }
  }, [dbSettings]);

  // Apply theme to document element
  function applyTheme(theme: "light" | "dark" | "system") {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
    localStorage.setItem("punong-theme", theme);
  }

  // 1. Save Account Profile
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!adminName.trim()) {
      toast.error("Administrator name cannot be empty.");
      return;
    }

    setSavingProfile(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          full_name: adminName.trim(),
          name: adminName.trim(),
        },
      });

      if (error) throw error;

      toast.success("Administrator profile updated successfully.");
      qc.invalidateQueries({ queryKey: ["user"] });
    } catch (err: any) {
      console.error("Failed to update admin profile:", err);
      toast.error(err.message || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  // 2. Save Persistent System Settings (for Notifications, System, Appearance)
  async function handleSaveSettings(sectionName: string) {
    setSavingSettings(true);
    try {
      let savedSuccessfully = false;
      // 1. Direct atomic database RPC call
      try {
        const { data, error } = await supabase.rpc("save_system_settings", {
          p_settings: settings,
        });
        if (!error) {
          savedSuccessfully = true;
        } else {
          console.warn("RPC save_system_settings returned error, trying fallback:", error);
        }
      } catch (e) {
        console.warn("RPC call threw exception:", e);
      }

      if (!savedSuccessfully) {
        // Fallback: direct table update
        const { error: tableError } = await (supabase as any)
          .from("system_settings")
          .upsert({
            id: "default",
            ...settings,
            updated_at: new Date().toISOString(),
          });
        if (tableError) {
          console.warn("Table fallback also returned error:", tableError);
        }
      }

      // Always persist to local cache and broadcast instantly to all open windows/tabs/components
      if (typeof window !== "undefined") {
        localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        window.dispatchEvent(new CustomEvent("punong-settings-updated", { detail: settings }));
      }

      applyTheme(settings.theme);
      qc.setQueryData(["system-settings"], settings);
      qc.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success(`${sectionName} saved successfully.`);
    } catch (err: any) {
      console.error("Failed to save settings:", err);
      toast.error(err.message || "Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  // 3. Save Security Password Change
  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();

    if (!currentPassword) {
      toast.error("Please enter your current password.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match. Please verify.");
      return;
    }

    setSavingPassword(true);
    try {
      // Step 1: Verify current password
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });

      if (signInErr) {
        throw new Error("Current password verification failed. Please try again.");
      }

      // Step 2: Update password in Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) throw updateErr;

      toast.success("Administrator password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("Password change error:", err);
      toast.error(err.message || "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  // 4. Logout from other sessions
  async function handleLogoutOtherSessions() {
    const result = await MySwal.fire({
      title: "Logout other sessions?",
      text: "This will terminate all other active browser logins except for this current window.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#0D1C24",
      cancelButtonColor: "#94a3b8",
      confirmButtonText: "Yes, logout others",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    setLoggingOutOthers(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast.success("Successfully logged out from all other active sessions.");
    } catch (err: any) {
      console.error("Session termination error:", err);
      toast.error(err.message || "Failed to logout other sessions.");
    } finally {
      setLoggingOutOthers(false);
    }
  }

  // 5. Data & System: Refresh and Sync All System Data
  async function handleSyncAllData() {
    setSyncingData(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-bookings"] }),
        qc.invalidateQueries({ queryKey: ["admin-inquiries"] }),
        qc.invalidateQueries({ queryKey: ["admin-unread-inquiries"] }),
        qc.invalidateQueries({ queryKey: ["pending-payments-count"] }),
        qc.invalidateQueries({ queryKey: ["admin-customers"] }),
        qc.invalidateQueries({ queryKey: ["rooms"] }),
        qc.invalidateQueries({ queryKey: ["system-settings"] }),
      ]);
      toast.success("All system data caches refreshed and synchronized.");
    } catch (err: any) {
      toast.error("Failed to sync system data.");
    } finally {
      setSyncingData(false);
    }
  }

  // 6. Data & System: Clear Temporary / Cache Data
  async function handleClearCache() {
    const result = await MySwal.fire({
      title: "Clear temporary cache?",
      text: "This will clear client-side stored session cache and temporary search data. You will remain logged in.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#D4AF37",
      cancelButtonColor: "#94a3b8",
      confirmButtonText: "Clear Cache",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      sessionStorage.clear();
      qc.clear();
      qc.invalidateQueries();
      toast.success("Temporary client cache and query caches cleared.");
    } catch (e) {
      toast.error("Failed to clear local cache.");
    }
  }

  // 7. Data & System: Export System Data (JSON / CSV)
  async function handleExportSystemData(format: "json" | "csv") {
    setExportingData(true);
    try {
      const [bookingsRes, inquiriesRes, roomsRes, paymentsRes] = await Promise.all([
        supabase.from("bookings").select("*"),
        supabase.from("inquiries").select("*"),
        supabase.from("rooms").select("*"),
        supabase.from("payments").select("*"),
      ]);

      const timestamp = new Date().toISOString().slice(0, 10);

      if (format === "json") {
        const exportPayload = {
          export_date: new Date().toISOString(),
          resort: settings.resort_name,
          bookings: bookingsRes.data || [],
          inquiries: inquiriesRes.data || [],
          rooms: roomsRes.data || [],
          payments: paymentsRes.data || [],
        };

        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `punong-system-data-${timestamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("System data exported successfully (JSON format).");
      } else {
        // CSV format for Bookings Ledger
        const bookings = bookingsRes.data || [];
        if (bookings.length === 0) {
          toast.info("No booking records available to export.");
          return;
        }

        const headers = [
          "ID",
          "Guest Name",
          "Email",
          "Phone",
          "Check In",
          "Check Out",
          "Total Amount",
          "Status",
          "Created At",
        ];
        const rows = bookings.map((b: any) => [
          b.id,
          `"${(b.guest_name || "").replace(/"/g, '""')}"`,
          `"${(b.guest_email || "").replace(/"/g, '""')}"`,
          `"${(b.guest_phone || "").replace(/"/g, '""')}"`,
          b.check_in,
          b.check_out,
          b.total_amount,
          b.status,
          b.created_at,
        ]);

        const csvContent = [headers.join(","), ...rows.map((r: any) => r.join(","))].join(
          "\n"
        );
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `punong-bookings-ledger-${timestamp}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Bookings ledger exported successfully (CSV format).");
      }
    } catch (err: any) {
      console.error("Export error:", err);
      toast.error("Failed to export system data.");
    } finally {
      setExportingData(false);
    }
  }

  // 8. Data & System: Backup Database Snapshot
  async function handleBackupDatabase() {
    const result = await MySwal.fire({
      title: "Generate Database Backup?",
      text: "This compiles a complete operational snapshot of rooms, bookings, payments, inquiries, and settings.",
      icon: "info",
      showCancelButton: true,
      confirmButtonColor: "#0D1C24",
      cancelButtonColor: "#94a3b8",
      confirmButtonText: "Download Backup",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    setBackingUp(true);
    try {
      const [bookings, rooms, payments, inquiries, messages, sysSettings] =
        await Promise.all([
          supabase.from("bookings").select("*"),
          supabase.from("rooms").select("*"),
          supabase.from("payments").select("*"),
          supabase.from("inquiries").select("*"),
          supabase.from("inquiry_messages").select("*"),
          supabase.from("system_settings").select("*"),
        ]);

      const backupData = {
        meta: {
          system: "Punong Spring Resort Online Booking System",
          backup_timestamp: new Date().toISOString(),
          version: "2.0.0",
          created_by: user?.email || "Admin",
        },
        database_snapshot: {
          rooms: rooms.data || [],
          bookings: bookings.data || [],
          payments: payments.data || [],
          inquiries: inquiries.data || [],
          inquiry_messages: messages.data || [],
          system_settings: sysSettings.data || [],
        },
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `punong-database-backup-${new Date().toISOString().slice(0, 19).replace(/[:]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Database backup archive generated and downloaded.");
    } catch (err: any) {
      console.error("Backup error:", err);
      toast.error("Failed to generate database backup.");
    } finally {
      setBackingUp(false);
    }
  }

  if (loadingSettings) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
        <span className="text-xs uppercase tracking-widest font-semibold">
          Loading System Preferences...
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50/60 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-display">
            System & Administrator Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Configure system defaults, notifications, security credentials, branding, and data backups.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-[#D4AF37]/40 bg-amber-50/60 text-[#B38728] font-bold text-xs px-3 py-1 flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
            Administrator Access Active
          </Badge>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200/80">
        <button
          type="button"
          onClick={() => setActiveTab("account")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === "account"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <User className="w-4 h-4 text-[#D4AF37]" />
          Account Settings
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("notifications")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === "notifications"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <Bell className="w-4 h-4 text-[#D4AF37]" />
          Notification Settings
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("system")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === "system"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <Sliders className="w-4 h-4 text-[#D4AF37]" />
          System Settings
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("appearance")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === "appearance"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <Palette className="w-4 h-4 text-[#D4AF37]" />
          Appearance
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === "security"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <Shield className="w-4 h-4 text-[#D4AF37]" />
          Security
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("data")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === "data"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          <Database className="w-4 h-4 text-[#D4AF37]" />
          Data & System Management
        </button>
      </div>

      {/* ============================================================ */}
      {/* 1. ACCOUNT SETTINGS */}
      {/* ============================================================ */}
      {activeTab === "account" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 bg-white border-slate-200/90 rounded-2xl shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#081216] to-[#0D1C24] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] font-bold text-xl font-display shadow-md">
                  {adminName ? adminName.charAt(0).toUpperCase() : "A"}
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-slate-900">
                    Administrator Profile
                  </h3>
                  <p className="text-xs text-slate-500">
                    Your personal administrative credentials for Punong Spring Resort.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold text-xs px-3 py-1">
                  Super Admin
                </Badge>
                <Badge variant="outline" className="text-slate-400 font-mono text-[11px]">
                  ID: {user?.id.slice(0, 8)}...
                </Badge>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Administrator Name
                  </Label>
                  <Input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="e.g. Resort Manager"
                    className="rounded-xl border-slate-200 focus-visible:ring-[#D4AF37] h-10"
                  />
                  <p className="text-[11px] text-slate-400">
                    Displayed on admin reply messages and system logs.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Email Address
                  </Label>
                  <Input
                    type="email"
                    disabled
                    value={adminEmail}
                    className="rounded-xl border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed h-10"
                  />
                  <p className="text-[11px] text-slate-400">
                    Primary login email managed by Supabase Authentication.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("security")}
                  className="rounded-xl text-xs font-semibold text-slate-600 border-slate-200 hover:border-[#D4AF37] h-9 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 mr-1.5 text-[#D4AF37]" />
                  Change Password in Security Settings
                </Button>

                <Button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 hover:brightness-105 font-bold h-10 px-6 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
                >
                  {savingProfile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. NOTIFICATION SETTINGS */}
      {/* ============================================================ */}
      {activeTab === "notifications" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 bg-white border-slate-200/90 rounded-2xl shadow-sm space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold font-display text-slate-900">
                System Notification Preferences
              </h3>
              <p className="text-xs text-slate-500">
                Enable or disable automated system triggers and admin alert indicators.
              </p>
            </div>

            <div className="space-y-4">
              {/* Option 1: New Bookings */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      New Booking Notifications
                    </span>
                    <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-[10px] font-semibold">
                      Reservations
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Display alert badges and trigger automated logs whenever a guest submits a new reservation.
                  </p>
                </div>
                <Switch
                  checked={settings.notify_new_booking}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, notify_new_booking: checked }))
                  }
                />
              </div>

              {/* Option 2: Customer Inquiries */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      New Customer Inquiry Notifications
                    </span>
                    <Badge className="bg-blue-100 text-blue-900 border-blue-200 text-[10px] font-semibold">
                      Contact Us
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Increment unread inquiry counters on the sidebar when guests contact via the Contact Us form.
                  </p>
                </div>
                <Switch
                  checked={settings.notify_inquiry}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, notify_inquiry: checked }))
                  }
                />
              </div>

              {/* Option 3: Customer Message / Follow-up */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      Customer Follow-up / Reply Notifications
                    </span>
                    <Badge className="bg-purple-100 text-purple-900 border-purple-200 text-[10px] font-semibold">
                      Conversations
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Flag inquiries with status "Waiting for Reply" and alert when customers reply in existing threads.
                  </p>
                </div>
                <Switch
                  checked={settings.notify_message}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, notify_message: checked }))
                  }
                />
              </div>

              {/* Option 4: Payment Verification */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      Payment Verification Notifications
                    </span>
                    <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-semibold">
                      Payments
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Notify administrators when a customer uploads or re-uploads a GCash payment receipt proof.
                  </p>
                </div>
                <Switch
                  checked={settings.notify_payment}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, notify_payment: checked }))
                  }
                />
              </div>

              {/* Option 5: Cancellation Requests */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      Cancellation Notifications
                    </span>
                    <Badge className="bg-rose-100 text-rose-900 border-rose-200 text-[10px] font-semibold">
                      Cancelled
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Send alert when a reservation cancellation is initiated by a guest from their portal.
                  </p>
                </div>
                <Switch
                  checked={settings.notify_cancellation}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      notify_cancellation: checked,
                    }))
                  }
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <Button
                type="button"
                onClick={() => handleSaveSettings("Notification settings")}
                disabled={savingSettings}
                className="bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 hover:brightness-105 font-bold h-10 px-6 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
              >
                {savingSettings ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Changes
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. SYSTEM SETTINGS */}
      {/* ============================================================ */}
      {activeTab === "system" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 bg-white border-slate-200/90 rounded-2xl shadow-sm space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold font-display text-slate-900">
                Resort & General System Settings
              </h3>
              <p className="text-xs text-slate-500">
                Configure official resort contact details, operating hours, and booking defaults.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Resort Name */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" /> Resort / System Name
                </Label>
                <Input
                  type="text"
                  required
                  value={settings.resort_name}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, resort_name: e.target.value }))
                  }
                  className="rounded-xl border-slate-200 focus-visible:ring-[#D4AF37] h-10"
                />
              </div>

              {/* Contact Number */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#D4AF37]" /> Resort Contact Number
                </Label>
                <Input
                  type="text"
                  required
                  value={settings.contact_number}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      contact_number: e.target.value,
                    }))
                  }
                  className="rounded-xl border-slate-200 focus-visible:ring-[#D4AF37] h-10"
                />
              </div>

              {/* Official Email */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#D4AF37]" /> Official Resort Email
                </Label>
                <Input
                  type="email"
                  required
                  value={settings.contact_email}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      contact_email: e.target.value,
                    }))
                  }
                  className="rounded-xl border-slate-200 focus-visible:ring-[#D4AF37] h-10"
                />
              </div>

              {/* Business Hours */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#D4AF37]" /> Business Hours
                </Label>
                <Input
                  type="text"
                  required
                  value={settings.business_hours}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      business_hours: e.target.value,
                    }))
                  }
                  className="rounded-xl border-slate-200 focus-visible:ring-[#D4AF37] h-10"
                />
              </div>

              {/* Physical Address */}
              <div className="md:col-span-2 space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" /> Resort Physical Address
                </Label>
                <Input
                  type="text"
                  required
                  value={settings.address}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className="rounded-xl border-slate-200 focus-visible:ring-[#D4AF37] h-10"
                />
              </div>

              {/* Default Booking Status */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Default New Booking Status
                </Label>
                <Select
                  value={settings.default_booking_status}
                  onValueChange={(val) =>
                    setSettings((prev) => ({
                      ...prev,
                      default_booking_status: val,
                    }))
                  }
                >
                  <SelectTrigger className="rounded-xl border-slate-200 h-10">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending (Review Required)</SelectItem>
                    <SelectItem value="approved">Approved (Instant Auto-Confirm)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-400">
                  Status automatically assigned when a customer submits a room booking.
                </p>
              </div>

              {/* Default Payment Status */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Default Payment Status
                </Label>
                <Select
                  value={settings.default_payment_status}
                  onValueChange={(val) =>
                    setSettings((prev) => ({
                      ...prev,
                      default_payment_status: val,
                    }))
                  }
                >
                  <SelectTrigger className="rounded-xl border-slate-200 h-10">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending Verification</SelectItem>
                    <SelectItem value="unpaid">Unpaid (Resort Payment)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-400">
                  Default ledger state before administrator verification.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <Button
                type="button"
                onClick={() => handleSaveSettings("System settings")}
                disabled={savingSettings}
                className="bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 hover:brightness-105 font-bold h-10 px-6 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
              >
                {savingSettings ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Changes
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. APPEARANCE */}
      {/* ============================================================ */}
      {activeTab === "appearance" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 bg-white border-slate-200/90 rounded-2xl shadow-sm space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold font-display text-slate-900">
                Appearance & Branding
              </h3>
              <p className="text-xs text-slate-500">
                Manage theme color modes, logo branding, and visual presentation.
              </p>
            </div>

            {/* Theme Mode Selector */}
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Color Theme Mode
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Light Mode */}
                <div
                  onClick={() => {
                    setSettings((prev) => ({ ...prev, theme: "light" }));
                    applyTheme("light");
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 text-center ${
                    settings.theme === "light"
                      ? "border-[#D4AF37] bg-amber-50/40 shadow-sm"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-slate-900 block">
                      Light Mode
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Classic clean luxury resort palette
                    </span>
                  </div>
                </div>

                {/* Dark Mode */}
                <div
                  onClick={() => {
                    setSettings((prev) => ({ ...prev, theme: "dark" }));
                    applyTheme("dark");
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 text-center ${
                    settings.theme === "dark"
                      ? "border-[#D4AF37] bg-amber-50/40 shadow-sm"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-[#D4AF37] flex items-center justify-center mx-auto">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-slate-900 block">
                      Dark Mode
                    </span>
                    <span className="text-[11px] text-slate-500">
                      High contrast midnight luxury aesthetic
                    </span>
                  </div>
                </div>

                {/* System Default */}
                <div
                  onClick={() => {
                    setSettings((prev) => ({ ...prev, theme: "system" }));
                    applyTheme("system");
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 text-center ${
                    settings.theme === "system"
                      ? "border-[#D4AF37] bg-amber-50/40 shadow-sm"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-slate-900 block">
                      System Default
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Sync with OS dark/light mode preference
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Logo Settings */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Resort Logo & Branding Asset
              </Label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50 shrink-0">
                  <img
                    src={settings.logo_url || "/logo.png"}
                    alt="Resort Logo"
                    className="h-16 w-16 object-contain rounded-xl"
                  />
                </div>
                <div className="space-y-2 flex-1 w-full">
                  <Label className="text-xs text-slate-600 font-semibold">
                    Logo Image URL or Local Asset Path
                  </Label>
                  <Input
                    type="text"
                    value={settings.logo_url}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, logo_url: e.target.value }))
                    }
                    placeholder="/logo.png or https://..."
                    className="rounded-xl border-slate-200 focus-visible:ring-[#D4AF37] h-10 text-xs"
                  />
                  <p className="text-[11px] text-slate-400">
                    Displayed in the navbar, sidebar branding, email notifications, and printable invoices.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <Button
                type="button"
                onClick={() => handleSaveSettings("Appearance settings")}
                disabled={savingSettings}
                className="bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 hover:brightness-105 font-bold h-10 px-6 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
              >
                {savingSettings ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Changes
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. SECURITY */}
      {/* ============================================================ */}
      {activeTab === "security" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="p-6 bg-white border-slate-200/90 rounded-2xl shadow-sm space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold font-display text-slate-900">
                Security & Authentication Credentials
              </h3>
              <p className="text-xs text-slate-500">
                Update your administrator password and manage concurrent login sessions.
              </p>
            </div>

            {/* Change Password Form */}
            <form onSubmit={handleSavePassword} className="space-y-4 max-w-xl">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Current Password
                </Label>
                <div className="relative">
                  <Input
                    type={showCurrentPassword ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="rounded-xl border-slate-200 pr-10 h-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="rounded-xl border-slate-200 pr-10 h-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    className="rounded-xl border-slate-200 pr-10 h-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={savingPassword}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-10 px-6 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
                >
                  {savingPassword ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4 text-[#D4AF37]" />
                  )}
                  Update Password
                </Button>
              </div>
            </form>

            {/* Session Management */}
            <div className="pt-6 border-t border-slate-100 space-y-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Active Sessions & Browser Authentication
                </h4>
                <p className="text-xs text-slate-500">
                  Terminate concurrent logins on other devices or browsers to safeguard administrator privileges.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleLogoutOtherSessions}
                disabled={loggingOutOthers}
                className="border-rose-200 text-rose-600 hover:bg-rose-50 h-9 px-4 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-2"
              >
                {loggingOutOthers ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" />
                )}
                Logout From All Other Sessions
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. DATA & SYSTEM MANAGEMENT */}
      {/* ============================================================ */}
      {activeTab === "data" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Action 1: Refresh / Sync Data */}
            <Card className="p-6 bg-white border-slate-200/90 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold font-display text-slate-900">
                  Refresh & Synchronize System Data
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Purge stale query caches and fetch live database records for all reservations, customer inquiries, room availability, and payments.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleSyncAllData}
                disabled={syncingData}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-10 rounded-xl shadow-sm cursor-pointer flex items-center gap-2"
              >
                {syncingData ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-[#D4AF37]" />
                )}
                Sync System Data Now
              </Button>
            </Card>

            {/* Action 2: Clear Temporary / Cache Data */}
            <Card className="p-6 bg-white border-slate-200/90 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-[#B38728] border border-[#D4AF37]/30 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold font-display text-slate-900">
                  Clear Temporary & Client Cache
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Clear browser storage caches and temporary session filters. Useful when debugging UI display updates without signing out.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleClearCache}
                className="border-slate-200 hover:bg-slate-50 text-slate-700 font-bold h-10 rounded-xl shadow-sm cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4 text-amber-600" />
                Clear Temporary Cache
              </Button>
            </Card>

            {/* Action 3: Export System Data */}
            <Card className="p-6 bg-white border-slate-200/90 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center">
                  <Download className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold font-display text-slate-900">
                  Export System Records
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Export operational system records including guest reservations, customer inquiries, and room catalogs to CSV or JSON.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleExportSystemData("csv")}
                  disabled={exportingData}
                  className="flex-1 border-slate-200 hover:border-emerald-400 text-xs font-bold h-10 rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Export CSV Ledger
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleExportSystemData("json")}
                  disabled={exportingData}
                  className="flex-1 border-slate-200 hover:border-blue-400 text-xs font-bold h-10 rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FileCode className="w-4 h-4 text-blue-600" />
                  Export JSON
                </Button>
              </div>
            </Card>

            {/* Action 4: Backup Database */}
            <Card className="p-6 bg-white border-slate-200/90 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200/60 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold font-display text-slate-900">
                  Full Database Snapshot Backup
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Generate a complete, timestamped JSON archive of all tables: rooms, bookings, payments, inquiries, inquiry messages, and system settings.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleBackupDatabase}
                disabled={backingUp}
                className="bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 hover:brightness-105 font-bold h-10 rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                {backingUp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Backup Database Archive
              </Button>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
