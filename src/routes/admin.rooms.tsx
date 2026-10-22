import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { Plus, LayoutGrid, List, Users, Sparkles, Bed, Wrench, Edit3, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getRoomRateType,
  enrichRoomWithRateType,
  attachRateTypeToAmenities,
  saveRoomRateTypeCache,
  getRateTypeDisplay,
  getAccommodationCategoryLabel,
} from "@/lib/rate-type-helper";
import { trashService } from "@/lib/recently-deleted";

const MySwal = withReactContent(Swal);

export const Route = createFileRoute("/admin/rooms")({
  component: RoomsTab,
});

function RoomsTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const blank = {
    name: "",
    type: "room",
    description: "",
    rate_type: "nightly",
    price: 0,
    capacity: "1",
    image_url: "",
    is_available: true,
    status: "available",
    maintenance_start: "",
    maintenance_end: "",
  };
  const [form, setForm] = useState<any>(blank);

  const { data: rawRooms = [] } = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(enrichRoomWithRateType);
    },
  });

  const rooms = useMemo(() => {
    return rawRooms.filter((r: any) => r.status !== "deleted");
  }, [rawRooms]);

  function openNew() {
    setEdit(null);
    setForm(blank);
    setOpen(true);
  }
  function openEdit(r: any) {
    setEdit(r);
    const resolvedRateType = getRoomRateType(r);
    setForm({
      ...blank,
      ...r,
      rate_type: resolvedRateType,
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const numericPrice = Number(form.price);
    if (form.price === "" || isNaN(numericPrice) || numericPrice <= 0) {
      MySwal.fire({
        title: "Invalid Rate!",
        text: "Rate must be a valid number greater than 0. Please enter a valid rate.",
        icon: "error",
        confirmButtonText: "OK",
      }).then(() => {
        setForm({ ...form, price: "" as any });
        setTimeout(() => document.getElementById("room-price-input")?.focus(), 100);
      });
      return;
    }

    if (!form.rate_type || (form.rate_type !== "nightly" && form.rate_type !== "day")) {
      MySwal.fire({
        title: "Rate Type Required!",
        text: "Please select a rate type (Nightly Rate or Day Rate).",
        icon: "error",
        confirmButtonText: "OK",
      });
      return;
    }

    const capacityStr = String(form.capacity).toLowerCase().trim();
    const isUnlimited = capacityStr.includes("unlimited");
    const isNumeric = !isNaN(Number(form.capacity)) && form.capacity !== "";

    if (form.type !== "cottage") {
      if (isUnlimited || !isNumeric) {
        MySwal.fire({
          title: "Invalid Capacity!",
          text: "Only Cottages can have 'Unlimited' capacity. For Rooms and Function Halls, please enter a valid number.",
          icon: "error",
          confirmButtonText: "OK",
        }).then(() => {
          setTimeout(() => document.getElementById("room-capacity-input")?.focus(), 100);
        });
        return;
      }
    }

    setSaving(true);

    const selectedRateType = form.rate_type === "day" ? "day" : "nightly";
    const updatedAmenities = attachRateTypeToAmenities(form.amenities, selectedRateType);

    const payload = {
      ...form,
      amenities: updatedAmenities,
      rate_type: selectedRateType,
      price: numericPrice,
      capacity: form.capacity,
      maintenance_start:
        form.status === "maintenance" && form.maintenance_start ? form.maintenance_start : null,
      maintenance_end:
        form.status === "maintenance" && form.maintenance_end ? form.maintenance_end : null,
    };
    try {
      let savedData: any = null;
      let { data, error } = edit
        ? await supabase.from("rooms").update(payload).eq("id", edit.id).select()
        : await supabase.from("rooms").insert(payload).select();

      savedData = data;

      // Resilient fallback: If rate_type column is not yet present on remote Supabase table,
      // save without rate_type column but with updated amenities tag (which persists in DB).
      if (error && (error.message?.includes("rate_type") || error.details?.includes("rate_type"))) {
        console.warn("Retrying room save without rate_type column (persisting via amenities tag):", error);
        const fallbackPayload = { ...payload };
        delete fallbackPayload.rate_type;
        const retryResult = edit
          ? await supabase.from("rooms").update(fallbackPayload).eq("id", edit.id).select()
          : await supabase.from("rooms").insert(fallbackPayload).select();
        error = retryResult.error;
        savedData = retryResult.data;
      }

      setSaving(false);
      if (error) {
        return MySwal.fire("Error!", error.message, "error");
      }

      // Persist in client-side room rate cache for instantaneous multi-tab sync
      const targetRoomId = edit?.id || savedData?.[0]?.id;
      if (targetRoomId) {
        saveRoomRateTypeCache(targetRoomId, selectedRateType);
      }

      const categoryLabel = getAccommodationCategoryLabel(savedData?.[0]?.type || form.type || edit?.type);
      const actionLabel = edit ? "updated" : "added";

      MySwal.fire(
        "Success!",
        `${categoryLabel} ${actionLabel} successfully.`,
        "success",
      );
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-and-bookings"] });
      qc.invalidateQueries({ queryKey: ["room"] });
      qc.invalidateQueries({ queryKey: ["admin-availability-calendar"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["reports-rooms-all"] });
    } catch (err: any) {
      setSaving(false);
      if (err.message === "Failed to fetch" || err.name === "TypeError") {
        // This usually happens when the base64 payload is too large and the server drops the connection,
        // or if there is a network issue. Clear the image so they are forced to use the new compressor.
        setForm({ ...form, image_url: "" });
        MySwal.fire(
          "Network Error",
          "The connection failed, likely because the image was too large. Please refresh the page completely (F5) and try selecting the image again.",
          "error"
        );
      } else {
        MySwal.fire("Error!", err.message || "An unexpected error occurred", "error");
      }
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 800;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        // Compress as JPEG
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        setForm((prev: any) => ({ ...prev, image_url: compressedBase64 }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  async function remove(id: string) {
    const targetRoom = rooms.find((r: any) => r.id === id);
    const categoryLabel = getAccommodationCategoryLabel(targetRoom?.type);

    const result = await MySwal.fire({
      title: "Move to Recently Deleted?",
      text: `Are you sure you want to delete ${categoryLabel.toLowerCase()} "${targetRoom?.name || ""}"? You can restore it anytime from Recently Deleted in Admin Reports.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, move to trash",
    });

    if (!result.isConfirmed) return;

    if (targetRoom) {
      await trashService.recordDeleted({
        id: id,
        type: "room",
        title: targetRoom.name,
        subtitle: `${targetRoom.type === "villa" ? "Function Hall" : targetRoom.type?.toUpperCase()} Accommodation`,
        description: `Capacity: ${targetRoom.capacity} persons • Rate: ₱${Number(targetRoom.price || 0).toLocaleString()}`,
        amount: targetRoom.price,
        dates: `Rate: ₱${Number(targetRoom.price || 0).toLocaleString()}`,
        data: targetRoom,
        deleted_by: user?.id,
        deleted_by_name: user?.user_metadata?.fullname || user?.email,
      });
    }

    const { error } = await supabase
      .from("rooms")
      .update({ status: "deleted", is_available: false })
      .eq("id", id);

    if (error) return MySwal.fire("Error!", error.message, "error");

    MySwal.fire("Moved to Trash!", `${categoryLabel} has been moved to Recently Deleted.`, "success");
    qc.invalidateQueries({ queryKey: ["admin-rooms"] });
    qc.invalidateQueries({ queryKey: ["rooms-and-bookings"] });
    qc.invalidateQueries({ queryKey: ["admin-trash-all"] });
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] dark:text-[#FACC15] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
              Resort Inventory
            </span>
            <span className="text-xs text-slate-400 font-medium">({rooms.length} Accommodations)</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-display tracking-tight mt-1">
            Rooms & Cottages Portfolio
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage accommodation listings, pricing, guest capacities, and maintenance schedules.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === "grid" 
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" 
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <LayoutGrid className="w-4 h-4" /> Grid
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === "table" 
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" 
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <List className="w-4 h-4" /> Table
            </button>
          </div>

          <Button 
            onClick={openNew} 
            className="bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 hover:brightness-105 font-bold shadow-md cursor-pointer rounded-xl h-10 px-4"
          >
            <Plus className="mr-1.5 h-4 w-4 stroke-[3]" />
            Add Accommodation
          </Button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((r: any) => {
            const isMaintenance = r.status === "maintenance";
            const typeLabel = r.type === "villa" ? "Function Hall" : r.type;

            return (
              <div 
                key={r.id} 
                className="group relative rounded-2xl bg-white dark:bg-[#151F2E] border border-slate-200/90 dark:border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_25px_rgba(0,0,0,0.4)] hover:shadow-[0_12px_35px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_12px_35px_rgba(0,0,0,0.5)] transition-all duration-300 overflow-hidden flex flex-col"
              >
                {/* Image Cover */}
                <div className="relative h-48 w-full bg-slate-900 overflow-hidden">
                  <img
                    src={r.image_url || "/room-1.jpg"}
                    alt={r.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                    onError={(e: any) => {
                      e.target.src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent"></div>

                  {/* Type Badge */}
                  <span className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md text-amber-300 border border-[#D4AF37]/30 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    {typeLabel}
                  </span>

                  {/* Status Badge */}
                  <span className={cn(
                    "absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-md",
                    isMaintenance 
                      ? "bg-amber-500/90 dark:bg-amber-600 text-white border border-amber-300 dark:border-amber-400"
                      : "bg-emerald-600/90 dark:bg-emerald-600 text-white border border-emerald-300 dark:border-emerald-400"
                  )}>
                    {isMaintenance ? "Maintenance" : "Available"}
                  </span>

                  {/* Price Tag Overlay */}
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white font-display drop-shadow-md">{r.name}</h3>
                      <p className="text-xs text-slate-200 flex items-center gap-1 font-medium">
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        {String(r.capacity).toLowerCase().includes("unlimited") ? "Unlimited Guests" : `Max ${r.capacity} Guests`}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-200 font-medium block">
                        {r.rate_type === "day" ? "Day Rate" : "Nightly Rate"}
                      </span>
                      <span className="text-xl font-extrabold text-amber-300 font-display">
                        ₱{Number(r.price).toLocaleString()}
                        <span className="text-xs font-normal text-slate-200 ml-1">
                          {r.rate_type === "day" ? "/ day" : "/ night"}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Content & Description */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    {r.description || "Luxurious resort accommodation equipped with premium amenities and relaxing ambiance."}
                  </p>

                  {isMaintenance && r.maintenance_start && (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/60 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Closed: <strong>{r.maintenance_start}</strong> to <strong>{r.maintenance_end}</strong></span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => openEdit(r)}
                      className="flex-1 h-9 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1.5 text-slate-600 dark:text-slate-300" /> Edit Details
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => remove(r.id)}
                      className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                      title="Move to Recently Deleted"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm bg-white dark:bg-[#151F2E]">
          <Table>
            <TableHeader className="bg-slate-50/80 dark:bg-slate-800/80">
              <TableRow className="border-b border-slate-200/80 dark:border-slate-700">
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Accommodation</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Type</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Rate</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Capacity</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4">Status</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] py-4 text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={r.image_url || "/room-1.jpg"}
                        alt={r.name}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-sm shrink-0"
                        onError={(e: any) => {
                          e.target.src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80";
                        }}
                      />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm font-display">{r.name}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-400 line-clamp-1">{r.description}</div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border dark:border-slate-700">
                      {r.type === 'villa' ? 'Function Hall' : r.type}
                    </span>
                  </TableCell>

                  <TableCell className="py-4">
                    <span className="font-display font-extrabold text-[#B38728] dark:text-amber-300 text-base">
                      ₱{Number(r.price).toLocaleString()}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium ml-1">
                      {r.rate_type === 'day' ? '/ day' : '/ night'}
                    </span>
                    <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-400">
                      {r.rate_type === 'day' ? 'Day Rate' : 'Nightly Rate'}
                    </span>
                  </TableCell>

                  <TableCell className="py-4 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {r.capacity} Guests
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <Badge variant="outline" className={cn(
                      "capitalize font-semibold text-[11px] px-2.5 py-0.5",
                      r.status === "maintenance" 
                        ? "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/60"
                        : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60"
                    )}>
                      {r.status || "Available"}
                    </Badge>
                    {r.status === "maintenance" && r.maintenance_start && (
                      <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 font-medium">
                        {r.maintenance_start} → {r.maintenance_end}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="py-4 text-right pr-6 space-x-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => openEdit(r)} 
                      className="h-8 text-xs font-semibold rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                    >
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={() => remove(r.id)} 
                      className="h-8 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit Dialog Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 bg-white dark:bg-[#151F2E] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-[#F8FAFC]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-display flex items-center gap-2 text-slate-900 dark:text-white">
              <Sparkles className="w-5 h-5 text-[#D4AF37]" />
              {edit ? "Edit Accommodation" : "Add New Accommodation"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4 py-2">
            <div>
              <Label className="text-slate-700 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">Name</Label>
              <Input
                required
                placeholder="e.g. Deluxe Garden Villa 1"
                className="mt-1 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus-visible:ring-[#D4AF37]"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">Accommodation Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="mt-1 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-[#1E293B] dark:border-slate-700 dark:text-white">
                    <SelectItem value="room">Room</SelectItem>
                    <SelectItem value="cottage">Cottage</SelectItem>
                    <SelectItem value="villa">Function Hall</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="room-capacity-input" className="text-slate-700 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">Guest Capacity</Label>
                <Input
                  id="room-capacity-input"
                  required
                  placeholder={form.type === "cottage" ? "e.g. 4 or Unlimited" : "e.g. 4"}
                  className="mt-1 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus-visible:ring-[#D4AF37]"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
            </div>
            {/* Rate Type & Pricing Section */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50/70 dark:bg-slate-800/40 space-y-3.5">
              <div>
                <Label className="text-slate-800 dark:text-slate-200 font-bold text-xs uppercase tracking-wider block mb-2">
                  Rate Type <span className="text-rose-500">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, rate_type: "nightly" })}
                    className={cn(
                      "flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer",
                      form.rate_type === "nightly"
                        ? "bg-[#1E293B] text-amber-300 border-[#D4AF37] shadow-sm ring-1 ring-[#D4AF37]/50"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100/70 dark:hover:bg-slate-700"
                    )}
                  >
                    <span className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                      form.rate_type === "nightly" ? "border-amber-400 bg-amber-400" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                    )}>
                      {form.rate_type === "nightly" && <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                    </span>
                    Nightly Rate
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, rate_type: "day" })}
                    className={cn(
                      "flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer",
                      form.rate_type === "day"
                        ? "bg-[#1E293B] text-amber-300 border-[#D4AF37] shadow-sm ring-1 ring-[#D4AF37]/50"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100/70 dark:hover:bg-slate-700"
                    )}
                  >
                    <span className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                      form.rate_type === "day" ? "border-amber-400 bg-amber-400" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                    )}>
                      {form.rate_type === "day" && <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                    </span>
                    Day Rate
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="room-price-input" className="text-slate-800 dark:text-slate-200 font-bold text-xs uppercase tracking-wider block mb-1">
                  Rate (₱ PHP) <span className="text-rose-500">*</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 lowercase ml-1">
                    (billed {form.rate_type === "day" ? "per day" : "per night"})
                  </span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₱</span>
                  <Input
                    id="room-price-input"
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder={form.rate_type === "day" ? "e.g. 1500" : "e.g. 2500"}
                    className="pl-8 bg-white dark:bg-slate-800 rounded-xl border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus-visible:ring-[#D4AF37] font-medium"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Preview: <strong className="text-slate-800 dark:text-slate-200">₱{Number(form.price || 0).toLocaleString()}</strong> {form.rate_type === "day" ? "/ day" : "/ night"}
                </p>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50/60 dark:bg-slate-800/40">
              <Label className="mb-2 block font-semibold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Room Status & Maintenance</Label>
              <Select
                value={form.status || "available"}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="mb-3 bg-white dark:bg-slate-800 rounded-xl border-slate-200 dark:border-slate-700 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-[#1E293B] dark:border-slate-700 dark:text-white">
                  <SelectItem value="available">Available for Guest Booking</SelectItem>
                  <SelectItem value="maintenance">Under Maintenance / Closed</SelectItem>
                </SelectContent>
              </Select>

              {form.status === "maintenance" && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label className="text-xs text-slate-600 dark:text-slate-400">Maintenance Start</Label>
                    <Input
                      type="date"
                      required
                      className="bg-white dark:bg-slate-800 rounded-xl border-slate-200 dark:border-slate-700 dark:text-white text-xs mt-1"
                      value={form.maintenance_start || ""}
                      onChange={(e) => setForm({ ...form, maintenance_start: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600 dark:text-slate-400">Maintenance End</Label>
                    <Input
                      type="date"
                      required
                      className="bg-white dark:bg-slate-800 rounded-xl border-slate-200 dark:border-slate-700 dark:text-white text-xs mt-1"
                      value={form.maintenance_end || ""}
                      onChange={(e) => setForm({ ...form, maintenance_end: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-slate-700 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">Cover Image</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="cursor-pointer mt-1 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {form.image_url && (
                <div className="mt-3 relative">
                  <img
                    src={form.image_url}
                    alt="Room preview"
                    className="h-28 w-44 object-cover rounded-xl border dark:border-slate-700 shadow-sm"
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-slate-700 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">Description</Label>
              <Textarea
                required
                rows={3}
                placeholder="Write a brief luxury description of the room..."
                className="mt-1 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus-visible:ring-[#D4AF37]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-slate-950 hover:brightness-105 font-bold mt-3 h-11 rounded-xl shadow-md cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {saving
                ? (edit ? "Saving Changes…" : "Creating…")
                : (edit ? "Save Changes" : "Create Accommodation")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

