import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Search, Info, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/admin/cancellations")({
  component: CancellationsTab,
});

function CancellationsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-cancellations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, room:rooms(name, type), profile:profiles!bookings_user_id_fkey(fullname,email), payments(id, amount, status, notes, receipt_url)")
        .eq("status", "cancelled")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredBookings = useMemo(() => {
    return bookings.filter((b: any) => {
      let notes: any = {};
      const p = b.payments?.[0];
      try { if (p?.notes) notes = JSON.parse(p.notes); } catch(e){}

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const guestMatch = b.guest_name?.toLowerCase().includes(term);
        const idMatch = b.id?.toLowerCase().includes(term);
        const reasonMatch = notes.cancellation_reason?.toLowerCase().includes(term);
        if (!guestMatch && !idMatch && !reasonMatch) return false;
      }

      return true;
    });
  }, [bookings, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] uppercase tracking-wider border border-rose-200">
              Audit Panel
            </span>
            <span className="text-xs text-slate-400 font-medium">({filteredBookings.length} Record{filteredBookings.length === 1 ? '' : 's'})</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Cancelled Bookings Log
          </h2>
          <p className="text-sm text-slate-500">Track guest cancellations, stated reasons, and historical booking details.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search Customer, ID, or Reason..."
              className="pl-9 h-10 border-slate-200 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] bg-slate-50/50 rounded-xl transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      {/* Table Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 shadow-sm bg-white">
        <Table>
          <TableHeader className="bg-slate-50/80">
            <TableRow className="border-b border-slate-200/80">
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Customer & Booking</TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Room & Stay Dates</TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-4">Cancellation Reason & Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-40 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <XCircle className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium">No cancelled reservations found matching your search query.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredBookings.map((b: any) => {
              const p = b.payments?.[0];
              let notes: any = {};
              try { if (p?.notes) notes = JSON.parse(p.notes); } catch (e) {}

              const initial = b.guest_name ? b.guest_name[0].toUpperCase() : "G";

              return (
                <TableRow key={b.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0 shadow-inner">
                        {initial}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{b.guest_name}</div>
                        <div className="text-xs text-slate-400 font-mono flex items-center gap-1">
                          ID: <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-600 font-semibold">{b.id.split("-")[0]}</span>
                        </div>
                        <div className="text-xs text-slate-500">{b.guest_email}</div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                      {b.room?.name || "Unassigned Room"}
                      {b.room?.type && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {b.room.type}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="font-medium text-slate-700">{b.check_in}</span> 
                      <span className="text-slate-300">→</span> 
                      <span className="font-medium text-slate-700">{b.check_out}</span>
                    </div>
                  </TableCell>

                  <TableCell className="py-4">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                        <Info className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        {notes.cancellation_reason || "No Reason Specified"}
                      </div>
                      <div className="text-[11px] text-slate-400 pl-1">
                        Cancelled on: {notes.cancellation_date ? new Date(notes.cancellation_date).toLocaleString() : "Date unavailable"}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

