import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
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
    price: 0,
    capacity: "1",
    image_url: "",
    is_available: true,
    status: "available",
    maintenance_start: "",
    maintenance_end: "",
  };
  const [form, setForm] = useState<any>(blank);

  const { data: rooms = [] } = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  function openNew() {
    setEdit(null);
    setForm(blank);
    setOpen(true);
  }
  function openEdit(r: any) {
    setEdit(r);
    setForm({ ...blank, ...r });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (Number(form.price) <= 0) {
      MySwal.fire({
        title: "Invalid Price!",
        text: "Price must be greater than 0. Please enter a valid price.",
        icon: "error",
        confirmButtonText: "OK",
      }).then(() => {
        setForm({ ...form, price: "" as any });
        setTimeout(() => document.getElementById("room-price-input")?.focus(), 100);
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

    const payload = {
      ...form,
      price: Number(form.price),
      capacity: form.capacity,
      maintenance_start:
        form.status === "maintenance" && form.maintenance_start ? form.maintenance_start : null,
      maintenance_end:
        form.status === "maintenance" && form.maintenance_end ? form.maintenance_end : null,
    };
    try {
      const { error } = edit
        ? await supabase.from("rooms").update(payload).eq("id", edit.id)
        : await supabase.from("rooms").insert(payload);

      setSaving(false);
      if (error) {
        return MySwal.fire("Error!", error.message, "error");
      }

      MySwal.fire(
        "Success!",
        edit ? "Room updated successfully." : "Room added successfully.",
        "success",
      );
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["admin-availability-calendar"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
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
    const result = await MySwal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });

    if (!result.isConfirmed) return;

    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) return MySwal.fire("Error!", error.message, "error");

    MySwal.fire("Deleted!", "Room has been deleted.", "success");
    qc.invalidateQueries({ queryKey: ["admin-rooms"] });
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
              Resort Inventory
            </span>
            <span className="text-xs text-slate-400 font-medium">({rooms.length} Accommodations)</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Rooms & Cottages Portfolio
          </h2>
          <p className="text-sm text-slate-500">Manage accommodation listings, pricing, guest capacities, and maintenance schedules.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === "grid" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <LayoutGrid className="w-4 h-4" /> Grid
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
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
                className="group relative rounded-2xl bg-white border border-slate-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_35px_rgba(0,0,0,0.08)] transition-all duration-300 overflow-hidden flex flex-col"
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
                      ? "bg-amber-500/90 text-white border border-amber-300"
                      : "bg-emerald-600/90 text-white border border-emerald-300"
                  )}>
                    {isMaintenance ? "Maintenance" : "Available"}
                  </span>

                  {/* Price Tag Overlay */}
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white font-display drop-shadow-md">{r.name}</h3>
                      <p className="text-xs text-slate-300 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        {String(r.capacity).toLowerCase().includes("unlimited") ? "Unlimited Guests" : `Max ${r.capacity} Guests`}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-300 font-medium block">Nightly Rate</span>
                      <span className="text-xl font-extrabold text-amber-300 font-display">₱{Number(r.price).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Card Content & Description */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {r.description || "Luxurious resort accommodation equipped with premium amenities and relaxing ambiance."}
                  </p>

                  {isMaintenance && r.maintenance_start && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Closed: <strong>{r.maintenance_start}</strong> to <strong>{r.maintenance_end}</strong></span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => openEdit(r)}
                      className="flex-1 h-9 rounded-xl border-slate-200 text-xs font-semibold hover:bg-slate-50"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1.5 text-slate-600" /> Edit Details
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => remove(r.id)}
                      className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
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
        <div className="overflow-hidden rounded-xl border border-slate-200/80 shadow-sm bg-white">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-b border-slate-200/80">
                <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Accommodation</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Type</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Rate (₱ / night)</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Capacity</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Status</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4 text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={r.image_url || "/room-1.jpg"}
                        alt={r.name}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-sm shrink-0"
                        onError={(e: any) => {
                          e.target.src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80";
                        }}
                      />
                      <div>
                        <div className="font-bold text-slate-900 text-sm font-display">{r.name}</div>
                        <div className="text-xs text-slate-400 line-clamp-1">{r.description}</div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                      {r.type === 'villa' ? 'Function Hall' : r.type}
                    </span>
                  </TableCell>

                  <TableCell className="py-4">
                    <span className="font-display font-extrabold text-[#B38728] text-base">
                      ₱{Number(r.price).toLocaleString()}
                    </span>
                  </TableCell>

                  <TableCell className="py-4 text-slate-700 text-xs font-semibold">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {r.capacity} Guests
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <Badge variant="outline" className={cn(
                      "capitalize font-semibold text-[11px] px-2.5 py-0.5",
                      r.status === "maintenance" 
                        ? "bg-amber-50 text-amber-800 border-amber-300"
                        : "bg-emerald-50 text-emerald-800 border-emerald-300"
                    )}>
                      {r.status || "Available"}
                    </Badge>
                    {r.status === "maintenance" && r.maintenance_start && (
                      <div className="text-[10px] text-amber-700 mt-1 font-medium">
                        {r.maintenance_start} → {r.maintenance_end}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="py-4 text-right pr-6 space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)} className="h-8 text-xs font-semibold rounded-lg">
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(r.id)} className="h-8 text-xs font-semibold rounded-lg">
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-display flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#D4AF37]" />
              {edit ? "Edit Accommodation" : "Add New Accommodation"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4 py-2">
            <div>
              <Label className="text-slate-700 font-semibold text-xs uppercase tracking-wider">Name</Label>
              <Input
                required
                placeholder="e.g. Deluxe Garden Villa 1"
                className="mt-1 rounded-xl border-slate-200 focus-visible:ring-[#D4AF37]"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700 font-semibold text-xs uppercase tracking-wider">Accommodation Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="mt-1 rounded-xl border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="room">Room</SelectItem>
                    <SelectItem value="cottage">Cottage</SelectItem>
                    <SelectItem value="villa">Function Hall</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="room-capacity-input" className="text-slate-700 font-semibold text-xs uppercase tracking-wider">Guest Capacity</Label>
                <Input
                  id="room-capacity-input"
                  required
                  placeholder={form.type === "cottage" ? "e.g. 4 or Unlimited" : "e.g. 4"}
                  className="mt-1 rounded-xl border-slate-200 focus-visible:ring-[#D4AF37]"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="room-price-input" className="text-slate-700 font-semibold text-xs uppercase tracking-wider">Nightly Rate (₱ PHP)</Label>
              <Input
                id="room-price-input"
                type="number"
                step="0.01"
                required
                placeholder="e.g. 3500"
                className="mt-1 rounded-xl border-slate-200 focus-visible:ring-[#D4AF37]"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
              <Label className="mb-2 block font-semibold text-xs text-slate-800 uppercase tracking-wider">Room Status & Maintenance</Label>
              <Select
                value={form.status || "available"}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="mb-3 bg-white rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available for Guest Booking</SelectItem>
                  <SelectItem value="maintenance">Under Maintenance / Closed</SelectItem>
                </SelectContent>
              </Select>

              {form.status === "maintenance" && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label className="text-xs text-slate-600">Maintenance Start</Label>
                    <Input
                      type="date"
                      required
                      className="bg-white rounded-xl text-xs mt-1"
                      value={form.maintenance_start || ""}
                      onChange={(e) => setForm({ ...form, maintenance_start: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">Maintenance End</Label>
                    <Input
                      type="date"
                      required
                      className="bg-white rounded-xl text-xs mt-1"
                      value={form.maintenance_end || ""}
                      onChange={(e) => setForm({ ...form, maintenance_end: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-slate-700 font-semibold text-xs uppercase tracking-wider">Cover Image</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="cursor-pointer mt-1 rounded-xl border-slate-200"
              />
              {form.image_url && (
                <div className="mt-3 relative">
                  <img
                    src={form.image_url}
                    alt="Room preview"
                    className="h-28 w-44 object-cover rounded-xl border shadow-sm"
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-slate-700 font-semibold text-xs uppercase tracking-wider">Description</Label>
              <Textarea
                required
                rows={3}
                placeholder="Write a brief luxury description of the room..."
                className="mt-1 rounded-xl border-slate-200 focus-visible:ring-[#D4AF37]"
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

