import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Trash2,
  RefreshCcw,
  Search,
  CalendarCheck,
  BedDouble,
  Mail,
  Users,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  Filter,
  CheckCircle2,
} from "lucide-react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { trashService, TrashItem, TrashEntityType } from "@/lib/recently-deleted";

const MySwal = withReactContent(Swal);

export const Route = createFileRoute("/admin/trash")({
  component: AdminTrashPage,
});

export function AdminTrashPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: trashItems = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-trash-all"],
    queryFn: async () => {
      return await trashService.getAllDeleted();
    },
    refetchInterval: 10000,
  });

  // Filtered items
  const filteredItems = useMemo(() => {
    return trashItems.filter((item) => {
      const matchesType = selectedType === "all" || item.type === selectedType;
      if (!matchesType) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchSubtitle = item.subtitle?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchId = item.id?.toLowerCase().includes(q);

      return matchTitle || matchSubtitle || matchDesc || matchId;
    });
  }, [trashItems, selectedType, search]);

  // Counts by type
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: trashItems.length,
      booking: 0,
      room: 0,
      inquiry: 0,
      customer: 0,
      feedback: 0,
    };
    trashItems.forEach((i) => {
      if (c[i.type] !== undefined) {
        c[i.type]++;
      }
    });
    return c;
  }, [trashItems]);

  // Restore single item
  async function handleRestore(item: TrashItem) {
    setProcessingId(item.id);
    try {
      const res = await trashService.restore(item);
      if (!res.success) {
        throw new Error(res.message || "Failed to restore record.");
      }

      toast.success(`${item.title} has been restored!`);
      // Invalidate relevant queries
      qc.invalidateQueries({ queryKey: ["admin-trash-all"] });
      qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
      qc.invalidateQueries({ queryKey: ["reports-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["admin-rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-and-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-unread-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-customers-unified"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to restore record.");
    } finally {
      setProcessingId(null);
    }
  }

  // Permanently delete single item
  async function handlePermanentDelete(item: TrashItem) {
    const result = await MySwal.fire({
      title: "Permanently Delete?",
      text: `Are you sure you want to permanently delete "${item.title}"? This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, permanently delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    setProcessingId(item.id);
    try {
      const res = await trashService.deletePermanently(item);
      if (!res.success) {
        MySwal.fire("Note", res.message || "Could not permanently delete item.", "info");
        return;
      }

      toast.success(`${item.title} has been permanently deleted.`);
      qc.invalidateQueries({ queryKey: ["admin-trash-all"] });
      qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
      qc.invalidateQueries({ queryKey: ["reports-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["admin-rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-and-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-customers-unified"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to permanently delete item.");
    } finally {
      setProcessingId(null);
    }
  }

  // Empty all currently visible or all items in trash
  async function handleEmptyTrash() {
    if (trashItems.length === 0) return;

    const result = await MySwal.fire({
      title: "Empty Recently Deleted?",
      text: `This will permanently delete all ${trashItems.length} record(s) currently in Recently Deleted. This action is irreversible!`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, empty trash",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    const { successCount, failCount } = await trashService.emptyAll(trashItems);
    if (failCount > 0) {
      toast.info(`Purged ${successCount} record(s). ${failCount} record(s) could not be removed due to database constraints.`);
    } else {
      toast.success("Recently Deleted has been emptied successfully.");
    }

    qc.invalidateQueries({ queryKey: ["admin-trash-all"] });
    qc.invalidateQueries({ queryKey: ["admin-bookings-unified"] });
    qc.invalidateQueries({ queryKey: ["reports-bookings-all"] });
    qc.invalidateQueries({ queryKey: ["admin-rooms"] });
    qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
    qc.invalidateQueries({ queryKey: ["admin-customers-unified"] });
  }

  function getTypeBadge(type: TrashEntityType) {
    switch (type) {
      case "booking":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold gap-1">
            <CalendarCheck className="w-3 h-3 text-amber-600" /> Booking
          </Badge>
        );
      case "room":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold gap-1">
            <BedDouble className="w-3 h-3 text-emerald-600" /> Accommodation
          </Badge>
        );
      case "inquiry":
        return (
          <Badge className="bg-sky-100 text-sky-800 border-sky-300 font-semibold gap-1">
            <Mail className="w-3 h-3 text-sky-600" /> Message
          </Badge>
        );
      case "customer":
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-300 font-semibold gap-1">
            <Users className="w-3 h-3 text-purple-600" /> Customer
          </Badge>
        );
      case "feedback":
        return (
          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300 font-semibold gap-1">
            <MessageSquare className="w-3 h-3 text-indigo-600" /> Feedback
          </Badge>
        );
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  }

  function formatDeletedDate(dateStr: string) {
    try {
      const d = parseISO(dateStr);
      return {
        date: format(d, "MMM d, yyyy"),
        time: format(d, "h:mm a"),
      };
    } catch {
      return { date: dateStr || "Recent", time: "" };
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] uppercase tracking-wider border border-rose-200 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> System Trash
            </span>
            <span className="text-xs text-slate-400 font-medium">
              ({trashItems.length} Deleted Record{trashItems.length === 1 ? "" : "s"})
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight mt-1 flex items-center gap-2">
            Recently Deleted
          </h2>
          <p className="text-sm text-slate-500">
            View, restore, or permanently delete removed bookings, accommodations, messages, customer records, and reviews.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="rounded-xl border-slate-200 hover:bg-slate-100"
          >
            <RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>

          {trashItems.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEmptyTrash}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Empty Trash
            </Button>
          )}
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card
          onClick={() => setSelectedType("all")}
          className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
            selectedType === "all"
              ? "border-[#D4AF37] bg-amber-50/50 shadow-sm ring-1 ring-[#D4AF37]/50"
              : "border-slate-200/80 hover:border-slate-300 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">All Items</span>
            <Trash2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{counts.all}</div>
        </Card>

        <Card
          onClick={() => setSelectedType("booking")}
          className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
            selectedType === "booking"
              ? "border-[#D4AF37] bg-amber-50/50 shadow-sm ring-1 ring-[#D4AF37]/50"
              : "border-slate-200/80 hover:border-slate-300 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">Bookings</span>
            <CalendarCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{counts.booking}</div>
        </Card>

        <Card
          onClick={() => setSelectedType("room")}
          className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
            selectedType === "room"
              ? "border-emerald-500 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500/50"
              : "border-slate-200/80 hover:border-slate-300 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">Accommodations</span>
            <BedDouble className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{counts.room}</div>
        </Card>

        <Card
          onClick={() => setSelectedType("inquiry")}
          className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
            selectedType === "inquiry"
              ? "border-sky-500 bg-sky-50/50 shadow-sm ring-1 ring-sky-500/50"
              : "border-slate-200/80 hover:border-slate-300 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-sky-700">Messages</span>
            <Mail className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{counts.inquiry}</div>
        </Card>

        <Card
          onClick={() => setSelectedType("customer")}
          className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
            selectedType === "customer"
              ? "border-purple-500 bg-purple-50/50 shadow-sm ring-1 ring-purple-500/50"
              : "border-slate-200/80 hover:border-slate-300 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-700">Customers</span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{counts.customer}</div>
        </Card>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, ID, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 border-slate-200 rounded-lg text-sm bg-slate-50/50"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "All Items", count: counts.all },
            { id: "booking", label: "Bookings", count: counts.booking },
            { id: "room", label: "Rooms", count: counts.room },
            { id: "inquiry", label: "Messages", count: counts.inquiry },
            { id: "customer", label: "Customers", count: counts.customer },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedType(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                selectedType === cat.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedType === cat.id
                    ? "bg-slate-800 text-amber-300"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">
        <Table>
          <TableHeader className="bg-slate-50/90">
            <TableRow className="border-b border-slate-200">
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Type
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Record Details
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Dates / Value
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5">
                Deleted When
              </TableHead>
              <TableHead className="font-bold text-slate-700 uppercase tracking-wider text-[11px] py-3.5 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <Trash2 className="w-6 h-6 stroke-[1.5]" />
                    </div>
                    <div className="text-base font-semibold text-slate-700">Trash is empty</div>
                    <p className="text-xs text-slate-400 max-w-sm">
                      {search || selectedType !== "all"
                        ? "No deleted records match your active search or category filters."
                        : "There are no recently deleted bookings, rooms, messages, or customer records."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const { date, time } = formatDeletedDate(item.deleted_at);
                const isBusy = processingId === item.id;

                return (
                  <TableRow
                    key={`${item.type}-${item.id}`}
                    className="hover:bg-slate-50/80 transition-colors border-b border-slate-100"
                  >
                    {/* Category Type */}
                    <TableCell className="py-4 align-top w-36">
                      {getTypeBadge(item.type)}
                    </TableCell>

                    {/* Record Details */}
                    <TableCell className="py-4 align-top">
                      <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                        {item.title}
                        {item.id && (
                          <span className="text-[10px] font-mono text-slate-400 font-normal">
                            #{item.id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <div className="text-xs font-medium text-slate-600 mt-0.5">
                          {item.subtitle}
                        </div>
                      )}
                      {item.description && (
                        <div className="text-xs text-slate-500 mt-1 line-clamp-2 max-w-md">
                          {item.description}
                        </div>
                      )}
                    </TableCell>

                    {/* Dates / Value */}
                    <TableCell className="py-4 align-top text-xs text-slate-600 whitespace-nowrap">
                      {item.dates && <div className="font-medium text-slate-800">{item.dates}</div>}
                      {item.amount !== undefined && item.amount > 0 && (
                        <div className="text-xs font-bold text-amber-700 mt-0.5">
                          ₱{Number(item.amount).toLocaleString()}
                        </div>
                      )}
                    </TableCell>

                    {/* Deleted When */}
                    <TableCell className="py-4 align-top whitespace-nowrap">
                      <div className="text-xs font-medium text-slate-700">{date}</div>
                      <div className="text-[11px] text-slate-400">{time}</div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-4 align-top text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleRestore(item)}
                          className="h-8 text-xs font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          Restore
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handlePermanentDelete(item)}
                          className="h-8 text-xs font-semibold text-rose-700 border-rose-200 hover:bg-rose-50 hover:text-rose-800 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-600" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
