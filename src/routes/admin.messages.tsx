import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search,
  Mail,
  MailOpen,
  Reply,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  MessageSquare,
  Send,
  Loader2,
  Copy,
  Check,
  Calendar,
  User,
  Filter,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export const Route = createFileRoute("/admin/messages")({
  component: AdminMessagesPage,
});

interface InquiryMessage {
  id: string;
  inquiry_id: string;
  sender_id: string | null;
  sender_role: "customer" | "admin";
  message: string;
  created_at: string;
  read_at: string | null;
}

interface Inquiry {
  id: string;
  customer_id?: string | null;
  name: string;
  email: string;
  message: string;
  status: "unread" | "read" | "replied" | "waiting_reply" | string;
  admin_reply?: string | null;
  replied_at?: string | null;
  created_at: string;
  updated_at?: string;
  inquiry_messages?: InquiryMessage[];
}

function formatDateTime(isoString: string) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminMessagesPage() {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog states
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Fetch all inquiries including full message thread
  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ["admin-inquiries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("*, inquiry_messages(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Inquiry[];
    },
    refetchInterval: 15000,
  });

  // Calculate statistics
  const stats = useMemo(() => {
    const total = inquiries.length;
    const unread = inquiries.filter(
      (i) => i.status === "unread" || i.status === "waiting_reply"
    ).length;
    const read = inquiries.filter((i) => i.status === "read").length;
    const replied = inquiries.filter((i) => i.status === "replied").length;
    return { total, unread, read, replied };
  }, [inquiries]);

function getInquiryLatestTime(item: Inquiry): number {
  let t = new Date(item.created_at).getTime();
  if (item.updated_at) {
    const ut = new Date(item.updated_at).getTime();
    if (ut > t) t = ut;
  }
  if (item.replied_at) {
    const rt = new Date(item.replied_at).getTime();
    if (rt > t) t = rt;
  }
  if (item.inquiry_messages && item.inquiry_messages.length > 0) {
    for (const m of item.inquiry_messages) {
      const mt = new Date(m.created_at).getTime();
      if (mt > t) t = mt;
    }
  }
  return t;
}

  // Filter and sort inquiries based on search query and status filter
  const filteredInquiries = useMemo(() => {
    const list = inquiries.filter((item) => {
      let matchesStatus = true;
      if (statusFilter === "unread") {
        matchesStatus = item.status === "unread" || item.status === "waiting_reply";
      } else if (statusFilter !== "all") {
        matchesStatus = item.status === statusFilter;
      }

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (item.name || "").toLowerCase().includes(q) ||
        (item.email || "").toLowerCase().includes(q) ||
        (item.message || "").toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });

    return list.sort((a, b) => getInquiryLatestTime(b) - getInquiryLatestTime(a));
  }, [inquiries, searchQuery, statusFilter]);

  // Compute sorted message history for selected inquiry
  const threadMessages = useMemo(() => {
    if (!selectedInquiry) return [];
    const msgs = [...(selectedInquiry.inquiry_messages || [])];
    msgs.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Fallback if inquiry_messages was empty for an older record
    if (msgs.length === 0 && selectedInquiry.message) {
      msgs.push({
        id: `cust-${selectedInquiry.id}`,
        inquiry_id: selectedInquiry.id,
        sender_id: selectedInquiry.customer_id || null,
        sender_role: "customer",
        message: selectedInquiry.message,
        created_at: selectedInquiry.created_at,
        read_at: selectedInquiry.created_at,
      });
      if (selectedInquiry.admin_reply) {
        msgs.push({
          id: `admin-${selectedInquiry.id}`,
          inquiry_id: selectedInquiry.id,
          sender_id: null,
          sender_role: "admin",
          message: selectedInquiry.admin_reply,
          created_at: selectedInquiry.replied_at || selectedInquiry.updated_at || "",
          read_at: null,
        });
      }
    }

    return msgs;
  }, [selectedInquiry]);

  // Open View/Conversation Modal and auto-mark unread inquiry as read if needed
  async function handleOpenView(inquiry: Inquiry) {
    setSelectedInquiry(inquiry);
    setReplySubject(`Inquiry Response – Punong Spring Resort`);
    setReplyText("");
    setIsViewOpen(true);

    if (inquiry.status === "unread") {
      try {
        const { error } = await supabase
          .from("inquiries")
          .update({
            status: "read",
            updated_at: new Date().toISOString(),
          })
          .eq("id", inquiry.id);

        if (!error) {
          setSelectedInquiry((prev) =>
            prev ? { ...prev, status: "read" } : null
          );
          qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
          qc.invalidateQueries({ queryKey: ["admin-unread-inquiries"] });
        }
      } catch (err) {
        console.error("Failed to auto-mark inquiry as read:", err);
      }
    }
  }

  // Toggle status between read and unread
  async function handleToggleStatus(
    inquiry: Inquiry,
    targetStatus: "unread" | "read"
  ) {
    try {
      const { error } = await supabase
        .from("inquiries")
        .update({
          status: targetStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inquiry.id);

      if (error) throw error;

      toast.success(
        targetStatus === "read"
          ? "Message marked as read"
          : "Message marked as unread"
      );

      if (selectedInquiry?.id === inquiry.id) {
        setSelectedInquiry((prev) =>
          prev ? { ...prev, status: targetStatus } : null
        );
      }

      qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-unread-inquiries"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update message status");
    }
  }

  // Submit Reply directly inside conversation thread
  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInquiry || !replyText.trim()) {
      toast.error("Please enter a reply message.");
      return;
    }

    setSendingReply(true);
    const content = replyText.trim();
    const subject = replySubject.trim() || "New Message from Punong Spring Resort";

    try {
      // 1. Direct atomic database RPC to save admin reply permanently
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "reply_to_inquiry",
        {
          p_inquiry_id: selectedInquiry.id,
          p_message: content,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message || "Database insert failed");
      }

      toast.success("Reply saved and sent successfully.");
      setReplyText("");

      // 2. Immediately reflect in active conversation thread
      const { data: updated } = await supabase
        .from("inquiries")
        .select("*, inquiry_messages(*)")
        .eq("id", selectedInquiry.id)
        .single();

      if (updated) {
        setSelectedInquiry(updated as Inquiry);
      }

      await qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
      await qc.invalidateQueries({ queryKey: ["admin-unread-inquiries"] });

      // 3. Asynchronously trigger transactional email without blocking UI or DB
      try {
        supabase.functions
          .invoke("booking-emails", {
            body: {
              emailType: "inquiry_reply",
              replyData: {
                recipientEmail: selectedInquiry.email,
                recipientName: selectedInquiry.name,
                subject: subject,
                message: content,
                originalMessage: selectedInquiry.message,
              },
            },
          })
          .catch((emailErr: unknown) => {
            console.warn("[Background Email Notice]:", emailErr);
          });
      } catch (e) {
        console.warn("[Background Email Trigger Exception]:", e);
      }
    } catch (err: any) {
      console.error("Reply error:", err);
      toast.error(err.message || "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  }

  // Delete message with confirmation
  async function handleDeleteInquiry(inquiry: Inquiry) {
    const result = await MySwal.fire({
      title: "Are you sure?",
      text: "Are you sure you want to delete this message? This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, delete message",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const { error } = await supabase
        .from("inquiries")
        .delete()
        .eq("id", inquiry.id);

      if (error) throw error;

      MySwal.fire({
        title: "Deleted!",
        text: "The inquiry thread has been removed.",
        icon: "success",
        confirmButtonColor: "#D4AF37",
      });

      if (selectedInquiry?.id === inquiry.id) {
        setIsViewOpen(false);
      }

      qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-unread-inquiries"] });
    } catch (err: any) {
      MySwal.fire("Error!", err.message || "Failed to delete inquiry.", "error");
    }
  }

  // Copy email helper
  function handleCopyEmail(email: string) {
    navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    toast.success("Email copied to clipboard");
    setTimeout(() => setCopiedEmail(false), 2000);
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
              Customer Communications
            </span>
            {stats.unread > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-bold text-[10px] uppercase tracking-wider animate-pulse">
                {stats.unread} Needs Reply
              </span>
            )}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight mt-1">
            Messages & Inquiries Control Panel
          </h2>
          <p className="text-sm text-slate-500">
            View and manage customer messages, inquiries, and two-way conversations.
          </p>
        </div>

        {/* Search and Status Filter */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Search by name, email, or message..."
              className="pl-9 h-10 border-slate-200 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] bg-slate-50/50 rounded-xl transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="w-full sm:w-48">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 border-slate-200 rounded-xl bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <SelectValue placeholder="All Statuses" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="unread">Needs Reply / Unread</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-white to-slate-50 border-slate-200/80 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Inquiries
            </span>
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-display">
              {stats.total}
            </span>
            <span className="text-xs text-slate-400 font-medium">threads</span>
          </div>
        </Card>

        <Card
          className={`p-4 border-slate-200/80 shadow-sm rounded-xl transition-all ${
            stats.unread > 0
              ? "bg-gradient-to-br from-rose-50/50 via-white to-white ring-1 ring-rose-200"
              : "bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
              Needs Reply
              {stats.unread > 0 && (
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
              )}
            </span>
            <div className="p-2 rounded-lg bg-rose-100/80 text-rose-700">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600 font-display">
              {stats.unread}
            </span>
            <span className="text-xs text-slate-400 font-medium">pending reply</span>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-white to-slate-50 border-slate-200/80 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">
              Read
            </span>
            <div className="p-2 rounded-lg bg-blue-100/80 text-blue-700">
              <MailOpen className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800 font-display">
              {stats.read}
            </span>
            <span className="text-xs text-slate-400 font-medium">viewed</span>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-white to-emerald-50/30 border-slate-200/80 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
              Replied
            </span>
            <div className="p-2 rounded-lg bg-emerald-100/80 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700 font-display">
              {stats.replied}
            </span>
            <span className="text-xs text-slate-400 font-medium">resolved</span>
          </div>
        </Card>
      </div>

      {/* Main Table Container */}
      <Card className="border border-slate-200/80 shadow-sm rounded-2xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80 border-b border-slate-200/80">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-slate-700 py-3.5 px-4 text-xs tracking-wider uppercase">
                  Customer
                </TableHead>
                <TableHead className="font-semibold text-slate-700 py-3.5 px-4 text-xs tracking-wider uppercase">
                  Email
                </TableHead>
                <TableHead className="font-semibold text-slate-700 py-3.5 px-4 text-xs tracking-wider uppercase">
                  Message Preview
                </TableHead>
                <TableHead className="font-semibold text-slate-700 py-3.5 px-4 text-xs tracking-wider uppercase">
                  Date & Time
                </TableHead>
                <TableHead className="font-semibold text-slate-700 py-3.5 px-4 text-xs tracking-wider uppercase text-center">
                  Status
                </TableHead>
                <TableHead className="font-semibold text-slate-700 py-3.5 px-4 text-xs tracking-wider uppercase text-right">
                  Quick Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin text-[#D4AF37]" />
                      <span className="text-sm font-medium">Loading inquiries...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredInquiries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Mail className="h-8 w-8 text-slate-300" />
                      <span className="font-semibold text-slate-700">No inquiries found</span>
                      <p className="text-xs text-slate-500 max-w-sm">
                        {searchQuery || statusFilter !== "all"
                          ? "Try adjusting your search query or status filter."
                          : "Customer messages submitted through the Contact Us form will appear here."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredInquiries.map((inquiry) => {
                  const isNeedsReply =
                    inquiry.status === "unread" || inquiry.status === "waiting_reply";
                  const isReplied = inquiry.status === "replied";

                  // Latest message in thread
                  const msgs = inquiry.inquiry_messages || [];
                  const latestMsg = msgs[msgs.length - 1]?.message || inquiry.message;

                  return (
                    <TableRow
                      key={inquiry.id}
                      className={`group hover:bg-amber-50/20 transition-colors border-b border-slate-100 ${
                        isNeedsReply ? "bg-amber-50/30 font-medium" : ""
                      }`}
                    >
                      {/* Customer Name */}
                      <TableCell className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isNeedsReply
                                ? "bg-rose-100 text-rose-700 ring-2 ring-rose-300"
                                : isReplied
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {inquiry.name ? inquiry.name.charAt(0).toUpperCase() : "G"}
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-slate-900 block">
                              {inquiry.name || "Guest"}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              #{inquiry.id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Customer Email */}
                      <TableCell className="py-3.5 px-4">
                        <a
                          href={`mailto:${inquiry.email}`}
                          className="text-sm text-slate-600 hover:text-accent flex items-center gap-1.5 transition-colors group-hover:underline"
                        >
                          <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{inquiry.email}</span>
                        </a>
                      </TableCell>

                      {/* Message Preview */}
                      <TableCell className="py-3.5 px-4 max-w-xs">
                        <p
                          onClick={() => handleOpenView(inquiry)}
                          className="text-sm text-slate-600 truncate cursor-pointer hover:text-slate-900 hover:underline"
                          title={latestMsg}
                        >
                          {latestMsg}
                        </p>
                      </TableCell>

                      {/* Date & Time */}
                      <TableCell className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>{formatDateTime(inquiry.created_at)}</span>
                        </div>
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell className="py-3.5 px-4 text-center whitespace-nowrap">
                        {inquiry.status === "waiting_reply" && (
                          <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-900 border-amber-200 text-xs px-2.5 py-0.5 font-bold">
                            Waiting Reply
                          </Badge>
                        )}
                        {inquiry.status === "unread" && (
                          <Badge className="bg-rose-100 hover:bg-rose-100 text-rose-800 border-rose-200 text-xs px-2.5 py-0.5 font-semibold">
                            Unread
                          </Badge>
                        )}
                        {inquiry.status === "read" && (
                          <Badge className="bg-blue-100 hover:bg-blue-100 text-blue-800 border-blue-200 text-xs px-2.5 py-0.5 font-semibold">
                            Read
                          </Badge>
                        )}
                        {inquiry.status === "replied" && (
                          <Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-800 border-emerald-200 text-xs px-2.5 py-0.5 font-semibold">
                            Replied
                          </Badge>
                        )}
                      </TableCell>

                      {/* Quick Actions */}
                      <TableCell className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View & Reply Thread Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center gap-1.5"
                            title="Open Conversation Thread"
                            onClick={() => handleOpenView(inquiry)}
                          >
                            <Eye className="h-3.5 w-3.5 text-[#D4AF37]" />
                            <span>Conversation</span>
                          </Button>

                          {/* Toggle Read/Unread Button */}
                          {inquiry.status === "unread" || inquiry.status === "waiting_reply" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg border-blue-200"
                              title="Mark as Read"
                              onClick={() => handleToggleStatus(inquiry, "read")}
                            >
                              <MailOpen className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                              title="Mark as Unread"
                              onClick={() => handleToggleStatus(inquiry, "unread")}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Delete Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg border-rose-200"
                            title="Delete Message"
                            onClick={() => handleDeleteInquiry(inquiry)}
                          >
                            <Trash2 className="h-4 w-4" />
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
      </Card>

      {/* FULL CONVERSATION & REPLY THREAD MODAL */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-3xl bg-white border-slate-200 p-6 rounded-3xl max-h-[90vh] flex flex-col">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
                  Guest Conversation Thread
                </span>
                {selectedInquiry?.status === "waiting_reply" && (
                  <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-xs font-bold">
                    Waiting Reply
                  </Badge>
                )}
                {selectedInquiry?.status === "unread" && (
                  <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-xs">
                    Unread
                  </Badge>
                )}
                {selectedInquiry?.status === "read" && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                    Read
                  </Badge>
                )}
                {selectedInquiry?.status === "replied" && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                    Replied
                  </Badge>
                )}
              </div>
              <span className="text-xs text-slate-400 font-mono">
                ID: {selectedInquiry?.id}
              </span>
            </div>
            <DialogTitle className="text-xl font-bold font-display text-slate-900 mt-1">
              Conversation with {selectedInquiry?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedInquiry && (
            <div className="flex flex-col flex-1 overflow-hidden space-y-4 pt-2">
              {/* Customer Info Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Customer Name
                    </span>
                    <p className="font-semibold text-slate-800">
                      {selectedInquiry.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Customer Email
                      </span>
                      <a
                        href={`mailto:${selectedInquiry.email}`}
                        className="font-semibold text-accent hover:underline block truncate max-w-[200px]"
                      >
                        {selectedInquiry.email}
                      </a>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                    title="Copy Email"
                    onClick={() => handleCopyEmail(selectedInquiry.email)}
                  >
                    {copiedEmail ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Complete Message Thread History */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 max-h-[350px]">
                {threadMessages.map((msg, idx) => {
                  const isAdmin = msg.sender_role === "admin";
                  return (
                    <div
                      key={msg.id || idx}
                      className={`flex flex-col ${isAdmin ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl p-3.5 space-y-1 text-sm shadow-sm ${
                          isAdmin
                            ? "bg-amber-50/50 border border-[#D4AF37]/35 text-slate-900 rounded-tr-sm"
                            : "bg-slate-100 border border-slate-200/80 text-slate-900 rounded-tl-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <span
                            className={`text-[11px] font-bold tracking-wide uppercase ${
                              isAdmin
                                ? "text-[#B38728] flex items-center gap-1"
                                : "text-slate-700"
                            }`}
                          >
                            {isAdmin ? (
                              <>
                                <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                                Punong Spring Resort – Administrator
                              </>
                            ) : (
                              `Customer (${selectedInquiry.name})`
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDateTime(msg.created_at)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                          {msg.message}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Administrator Direct Reply Composer */}
              <form
                onSubmit={handleSendReply}
                className="pt-3 border-t border-slate-100 space-y-3 bg-slate-50/50 p-3 rounded-2xl border"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-800">
                    <Reply className="h-4 w-4 text-[#D4AF37]" />
                    Compose Reply to {selectedInquiry.name}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Will send notification to {selectedInquiry.email}
                  </span>
                </div>

                <Textarea
                  rows={3}
                  required
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply to the customer here..."
                  className="bg-white border-slate-200 focus-visible:ring-[#D4AF37] text-xs resize-none"
                />

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    {selectedInquiry.status === "read" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(selectedInquiry, "unread")}
                        className="text-slate-600 text-xs h-8"
                      >
                        <Mail className="h-3.5 w-3.5 mr-1" /> Mark Unread
                      </Button>
                    )}
                    {selectedInquiry.status === "unread" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(selectedInquiry, "read")}
                        className="text-blue-600 text-xs h-8"
                      >
                        <MailOpen className="h-3.5 w-3.5 mr-1" /> Mark Read
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteInquiry(selectedInquiry)}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs h-8"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Thread
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setIsViewOpen(false)}
                    >
                      Close
                    </Button>
                    <Button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 h-8 px-4 text-xs font-bold flex items-center gap-1.5"
                    >
                      {sendingReply ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          Send Reply
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
