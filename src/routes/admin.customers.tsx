import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  Mail,
  Phone,
  Calendar,
  AlertTriangle,
  Trash2,
  Users,
  MapPin,
  User,
  Hash,
  Eye,
  CalendarCheck,
  ExternalLink,
  Sparkles,
  BedDouble,
} from "lucide-react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { cn } from "@/lib/utils";

const MySwal = withReactContent(Swal);

export const Route = createFileRoute("/admin/customers")({
  component: CustomersTab,
});

// Helper to extract Age, Address, and Extra Beds from special_requests string
function parseGuestDetails(specialRequests?: string | null) {
  if (!specialRequests) {
    return { age: null, address: null, extras: [] };
  }

  const ageMatch = specialRequests.match(/Age:\s*([^\s|]+)/i);
  const addressMatch = specialRequests.match(/Address:\s*([^|]+)/i);

  // Remaining extras (e.g. extra persons, beds)
  const parts = specialRequests.split("|").map((p) => p.trim());
  const extras = parts.filter(
    (p) => !p.toLowerCase().startsWith("age:") && !p.toLowerCase().startsWith("address:")
  );

  return {
    age: ageMatch ? ageMatch[1].trim() : null,
    address: addressMatch ? addressMatch[1].trim() : null,
    extras,
  };
}

export function CustomersTab() {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  // Query both profiles and all bookings so we have complete guest data
  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers-unified"],
    queryFn: async () => {
      const [profilesRes, bookingsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase
          .from("bookings")
          .select("*, room:rooms(name, type)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
      ]);

      const profiles = profilesRes.data || [];
      const bookings = bookingsRes.data || [];

      return { profiles, bookings };
    },
  });

  const profiles = data?.profiles || [];
  const bookings = data?.bookings || [];

  // Consolidate customer records from profiles and bookings
  const consolidatedCustomers = useMemo(() => {
    const customerMap = new Map<string, any>();

    // 1. Seed from registered profiles
    profiles.forEach((p: any) => {
      const userBookings = bookings.filter(
        (b: any) =>
          b.user_id === p.id ||
          (p.email && b.guest_email?.toLowerCase() === p.email.toLowerCase())
      );

      // Extract latest age & address from user's bookings if available
      let age: string | null = null;
      let address: string | null = null;
      let latestGuests: number = 0;

      for (const b of userBookings) {
        const parsed = parseGuestDetails(b.special_requests);
        if (!age && parsed.age) age = parsed.age;
        if (!address && parsed.address) address = parsed.address;
        if (!latestGuests && b.guests) latestGuests = b.guests;
      }

      customerMap.set(p.email ? p.email.toLowerCase() : p.id, {
        id: p.id,
        profileId: p.id,
        isRegistered: true,
        fullname: p.fullname || "Unnamed Guest",
        email: p.email || "No email",
        phone: p.phone || userBookings[0]?.guest_phone || null,
        age: age,
        address: address,
        guests: latestGuests || userBookings[0]?.guests || 1,
        created_at: p.created_at,
        bookings: userBookings,
      });
    });

    // 2. Add guest bookings that don't have a registered profile account
    bookings.forEach((b: any) => {
      const key = b.guest_email ? b.guest_email.toLowerCase() : `guest-${b.id}`;
      if (!customerMap.has(key)) {
        const parsed = parseGuestDetails(b.special_requests);

        customerMap.set(key, {
          id: b.user_id || b.id,
          profileId: null,
          isRegistered: false,
          fullname: b.guest_name || "Guest",
          email: b.guest_email || "N/A",
          phone: b.guest_phone || null,
          age: parsed.age,
          address: parsed.address,
          guests: b.guests || 1,
          created_at: b.created_at,
          bookings: [b],
        });
      } else {
        // If profile exists, check if age or address was missing and fill from this booking
        const existing = customerMap.get(key);
        const parsed = parseGuestDetails(b.special_requests);
        if (!existing.age && parsed.age) existing.age = parsed.age;
        if (!existing.address && parsed.address) existing.address = parsed.address;
        if (!existing.phone && b.guest_phone) existing.phone = b.guest_phone;
      }
    });

    return Array.from(customerMap.values());
  }, [profiles, bookings]);

  // Filter customers by search term (Name, Email, Phone, Age, Address)
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return consolidatedCustomers;
    const q = searchQuery.toLowerCase();
    return consolidatedCustomers.filter((c: any) => {
      return (
        (c.fullname || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q) ||
        String(c.age || "").includes(q) ||
        String(c.guests || "").includes(q)
      );
    });
  }, [consolidatedCustomers, searchQuery]);

  // Delete customer profile
  async function deleteCustomer(customer: any) {
    const result = await MySwal.fire({
      title: "Delete Customer Record?",
      text: `Are you sure you want to delete ${customer.fullname}? If they have an account, it will be removed.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, delete",
    });

    if (!result.isConfirmed) return;

    if (customer.profileId) {
      const { error } = await supabase.from("profiles").delete().eq("id", customer.profileId);
      if (error) return MySwal.fire("Error!", error.message, "error");
    }

    MySwal.fire("Deleted!", "Customer record has been removed.", "success");
    qc.invalidateQueries({ queryKey: ["admin-customers-unified"] });
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Guest Directory
            </span>
            <span className="text-xs text-slate-400 font-medium">
              ({filteredCustomers.length} Profile{filteredCustomers.length === 1 ? "" : "s"})
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Registered Customers & CRM
          </h2>
          <p className="text-sm text-slate-500">
            Complete guest profiles with Full Name, Email, Phone, Age, Address, and Guest Party Records.
          </p>
        </div>

        <div className="relative w-full md:w-88">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Search by name, email, phone, age, address..."
            className="pl-9 h-10 border-slate-200 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] bg-slate-50/60 rounded-xl text-xs transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/90 shadow-sm bg-white">
        <Table className="min-w-[950px]">
          <TableHeader className="bg-slate-50/90">
            <TableRow className="border-b border-slate-200">
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Guest Name
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Contact Details
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Age
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Address
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Guests
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Bookings & Stays
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5 text-right pr-6">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-44 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Users className="h-9 w-9 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">
                      No guest profiles found matching your search.
                    </p>
                    <p className="text-xs text-slate-400">
                      Try searching with a different name, email, phone number, or address.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((c: any) => {
                const initial = c.fullname ? c.fullname[0].toUpperCase() : "U";
                const noShowCount =
                  c.bookings?.filter((b: any) => b.status === "no-show").length || 0;
                const totalBookingsCount = c.bookings?.length || 0;

                return (
                  <TableRow
                    key={c.email || c.id}
                    className="hover:bg-slate-50/60 transition-colors border-b border-slate-100"
                  >
                    {/* Guest Name & Avatar */}
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-900 to-slate-800 text-[#D4AF37] flex items-center justify-center font-bold text-sm shrink-0 ring-2 ring-[#D4AF37]/30 shadow-xs">
                          {initial}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm font-display flex items-center gap-1.5">
                            {c.fullname}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-slate-400">
                            <span>
                              {c.isRegistered ? "Registered Member" : "Guest Reservation"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Email & Phone */}
                    <TableCell className="py-3.5">
                      <div className="space-y-1">
                        <div className="text-xs text-slate-700 flex items-center gap-1.5 font-medium">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{c.email}</span>
                        </div>
                        {c.phone ? (
                          <div className="text-xs text-slate-500 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {c.phone}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">No phone</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Age */}
                    <TableCell className="py-3.5">
                      {c.age ? (
                        <Badge
                          variant="outline"
                          className="font-bold text-xs bg-slate-50 border-slate-300 text-slate-800 px-2.5 py-0.5"
                        >
                          {c.age} yrs
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400 italic">—</span>
                      )}
                    </TableCell>

                    {/* Address */}
                    <TableCell className="py-3.5 max-w-[220px]">
                      {c.address ? (
                        <div className="flex items-start gap-1.5 text-xs text-slate-700" title={c.address}>
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span className="truncate font-medium">{c.address}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not provided</span>
                      )}
                    </TableCell>

                    {/* Number of Guests */}
                    <TableCell className="py-3.5">
                      <Badge
                        className="bg-emerald-50 text-emerald-800 border-emerald-200 font-bold text-xs"
                      >
                        <Users className="w-3 h-3 mr-1" />
                        {c.guests} Guest{c.guests === 1 ? "" : "s"}
                      </Badge>
                    </TableCell>

                    {/* Bookings & Stays */}
                    <TableCell className="py-3.5">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <CalendarCheck className="w-3.5 h-3.5 text-[#B38728] shrink-0" />
                          {totalBookingsCount} Stay{totalBookingsCount === 1 ? "" : "s"}
                        </div>
                        {noShowCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold text-[10px]">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            {noShowCount} No-Show{noShowCount > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-semibold block">
                            ✓ Good Record
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3.5 text-right pr-6">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedCustomer(c)}
                          className="h-8 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#B38728]" /> View Details
                        </Button>

                        {c.profileId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteCustomer(c)}
                            className="h-8 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Delete customer account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Guest Details Modal */}
      <Dialog
        open={!!selectedCustomer}
        onOpenChange={(open) => !open && setSelectedCustomer(null)}
      >
        <DialogContent className="rounded-2xl max-w-lg p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-display flex items-center gap-2">
              <User className="w-5 h-5 text-[#B38728]" /> Complete Guest Details
            </DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-5 py-2">
              {/* Profile Card Header */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-slate-900 to-slate-800 text-[#D4AF37] flex items-center justify-center font-bold text-lg ring-2 ring-[#D4AF37]/40 shadow-sm shrink-0">
                  {selectedCustomer.fullname ? selectedCustomer.fullname[0].toUpperCase() : "G"}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate font-display">
                    {selectedCustomer.fullname}
                  </h3>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span>
                      {selectedCustomer.isRegistered ? "Registered Customer" : "Direct Guest"}
                    </span>
                    <span>•</span>
                    <span>
                      Member since{" "}
                      {new Date(selectedCustomer.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Guest Details Fields Grid */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Information & Identification
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs">
                  {/* Full Name */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Full Name
                    </span>
                    <span className="font-bold text-slate-900 text-sm">
                      {selectedCustomer.fullname}
                    </span>
                  </div>

                  {/* Email */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Email Address
                    </span>
                    <span className="font-semibold text-slate-800 break-all">
                      {selectedCustomer.email}
                    </span>
                  </div>

                  {/* Phone */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Phone Number
                    </span>
                    <span className="font-semibold text-slate-800">
                      {selectedCustomer.phone || "None provided"}
                    </span>
                  </div>

                  {/* Age */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Age
                    </span>
                    <span className="font-bold text-slate-900">
                      {selectedCustomer.age ? `${selectedCustomer.age} years old` : "Not specified"}
                    </span>
                  </div>

                  {/* Complete Address */}
                  <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Address
                    </span>
                    <div className="flex items-start gap-1.5 font-medium text-slate-800">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                      <span>{selectedCustomer.address || "No address recorded on file"}</span>
                    </div>
                  </div>

                  {/* Number of Guests */}
                  <div className="sm:col-span-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Typical Number of Guests
                    </span>
                    <Badge className="bg-emerald-600 text-white font-bold">
                      {selectedCustomer.guests} Person{selectedCustomer.guests === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Reservation Records */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Booking & Stay History ({selectedCustomer.bookings.length})
                  </h4>
                  <Link
                    to="/admin/bookings"
                    className="text-xs font-bold text-[#B38728] hover:underline flex items-center gap-1"
                  >
                    View All in Ledger <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {selectedCustomer.bookings.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl">
                    No bookings found for this customer profile.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedCustomer.bookings.map((b: any) => (
                      <div
                        key={b.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <span className="font-bold text-slate-900 block">
                            {b.room?.name || "Accommodation"}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {b.check_in} → {b.check_out} ({b.guests} Guests)
                          </span>
                          {b.special_requests && (
                            <span className="text-[10px] text-slate-400 block truncate max-w-xs mt-0.5">
                              {b.special_requests}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize text-[10px] font-bold mb-1",
                              b.status === "approved"
                                ? "border-emerald-500 text-emerald-800 bg-emerald-50"
                                : b.status === "completed"
                                ? "border-blue-500 text-blue-800 bg-blue-50"
                                : "border-slate-300 text-slate-700"
                            )}
                          >
                            {b.status}
                          </Badge>
                          <div className="font-black text-[#B38728] text-xs">
                            ₱{Number(b.total_amount).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
