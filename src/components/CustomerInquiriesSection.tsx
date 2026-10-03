import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MessageSquare,
  MessageSquareQuote,
  Send,
  Loader2,
  Clock,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCheck,
  User,
  ShieldCheck,
  AlertCircle,
  Calendar,
} from "lucide-react";

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
  customer_id: string | null;
  name: string;
  email: string;
  message: string;
  status: string;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
  inquiry_messages?: InquiryMessage[];
}

interface CustomerInquiriesSectionProps {
  user: any;
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

function getLatestTime(inq: Inquiry): number {
  let t = new Date(inq.created_at).getTime();
  if (inq.updated_at) {
    const ut = new Date(inq.updated_at).getTime();
    if (ut > t) t = ut;
  }
  if (inq.replied_at) {
    const rt = new Date(inq.replied_at).getTime();
    if (rt > t) t = rt;
  }
  if (inq.inquiry_messages && inq.inquiry_messages.length > 0) {
    for (const m of inq.inquiry_messages) {
      const mt = new Date(m.created_at).getTime();
      if (mt > t) t = mt;
    }
  }
  return t;
}

export function CustomerInquiriesSection({ user }: CustomerInquiriesSectionProps) {
  const qc = useQueryClient();
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [showMobileList, setShowMobileList] = useState(false);

  // Fetch inquiries belonging to this customer
  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ["customer-inquiries", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("*, inquiry_messages(*)")
        .or(`customer_id.eq.${user.id},email.eq.${user.email}`);

      if (error) throw error;
      return (data || []) as Inquiry[];
    },
    refetchInterval: 10000,
  });

  // Sort inquiries: newest message / recent activity first
  const sortedInquiries = useMemo(() => {
    return [...inquiries].sort((a, b) => getLatestTime(b) - getLatestTime(a));
  }, [inquiries]);

  // Requirement 4: Automatically select the most recent conversation on load
  useEffect(() => {
    if (sortedInquiries.length > 0) {
      if (!selectedInquiryId || !sortedInquiries.some((i) => i.id === selectedInquiryId)) {
        setSelectedInquiryId(sortedInquiries[0].id);
      }
    }
  }, [sortedInquiries, selectedInquiryId]);

  // Active selected inquiry
  const activeInquiry = useMemo(() => {
    if (!sortedInquiries.length) return null;
    return (
      sortedInquiries.find((i) => i.id === selectedInquiryId) || sortedInquiries[0]
    );
  }, [sortedInquiries, selectedInquiryId]);

  // Build chronological messages thread for the active inquiry
  const activeMessages = useMemo(() => {
    if (!activeInquiry) return [];
    const msgs = [...(activeInquiry.inquiry_messages || [])];
    msgs.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Fallback if legacy record had no inquiry_messages row
    if (msgs.length === 0 && activeInquiry.message) {
      msgs.push({
        id: `cust-${activeInquiry.id}`,
        inquiry_id: activeInquiry.id,
        sender_id: activeInquiry.customer_id,
        sender_role: "customer",
        message: activeInquiry.message,
        created_at: activeInquiry.created_at,
        read_at: activeInquiry.created_at,
      });
      if (activeInquiry.admin_reply) {
        msgs.push({
          id: `admin-${activeInquiry.id}`,
          inquiry_id: activeInquiry.id,
          sender_id: null,
          sender_role: "admin",
          message: activeInquiry.admin_reply,
          created_at: activeInquiry.replied_at || activeInquiry.updated_at,
          read_at:
            activeInquiry.status === "read" ? activeInquiry.updated_at : null,
        });
      }
    }

    return msgs;
  }, [activeInquiry]);

  // Status calculation helper
  function getCustomerStatus(inquiry: Inquiry): {
    label: "Unread" | "Read" | "Replied" | "Waiting for Reply";
    variant: "unread" | "read" | "replied" | "waiting";
  } {
    const msgs = inquiry.inquiry_messages || [];
    const hasAdminMsg =
      msgs.some((m) => m.sender_role === "admin") || !!inquiry.admin_reply;

    if (!hasAdminMsg) {
      return { label: "Waiting for Reply", variant: "waiting" };
    }

    const unreadAdminMsgs = msgs.filter(
      (m) => m.sender_role === "admin" && !m.read_at
    );

    if (unreadAdminMsgs.length > 0 || inquiry.status === "unread") {
      return { label: "Unread", variant: "unread" };
    }

    if (inquiry.status === "waiting_reply") {
      return { label: "Waiting for Reply", variant: "waiting" };
    }

    if (inquiry.status === "read") {
      return { label: "Read", variant: "read" };
    }

    return { label: "Replied", variant: "replied" };
  }

  // Auto-mark unread admin messages as read when active conversation is viewed
  useEffect(() => {
    if (!activeInquiry) return;
    const msgs = activeInquiry.inquiry_messages || [];
    const hasUnreadAdmin = msgs.some(
      (m) => m.sender_role === "admin" && !m.read_at
    );

    if (
      hasUnreadAdmin ||
      activeInquiry.status === "replied" ||
      activeInquiry.status === "unread"
    ) {
      supabase
        .rpc("mark_inquiry_messages_read", {
          p_inquiry_id: activeInquiry.id,
        })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["customer-unread-inquiries"] });
          qc.invalidateQueries({ queryKey: ["customer-inquiries"] });
        })
        .catch((err: any) => {
          console.warn("Could not auto-mark messages read:", err);
        });
    }
  }, [activeInquiry?.id]);

  // Handle sending customer follow-up message
  async function handleSendFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!activeInquiry || !followUpText.trim()) return;

    setSendingFollowUp(true);
    const content = followUpText.trim();

    try {
      const { data, error } = await supabase.rpc("customer_send_message", {
        p_inquiry_id: activeInquiry.id,
        p_message: content,
      });

      if (error) {
        throw new Error(error.message || "Failed to send message.");
      }

      toast.success("Follow-up message sent to Punong Spring Resort.");
      setFollowUpText("");

      // Refresh inquiries query and badge counters
      await qc.invalidateQueries({ queryKey: ["customer-inquiries"] });
      await qc.invalidateQueries({ queryKey: ["customer-unread-inquiries"] });
      await qc.invalidateQueries({ queryKey: ["admin-unread-inquiries"] });
      await qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
    } catch (err: any) {
      console.error("Failed to send customer follow-up:", err);
      toast.error(err.message || "Failed to send message. Please try again.");
    } finally {
      setSendingFollowUp(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-16 text-center border border-slate-200 rounded-3xl bg-white shadow-sm flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-[#D4AF37]" />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Loading your conversations...
        </span>
      </div>
    );
  }

  // Empty state if customer has no inquiries
  if (sortedInquiries.length === 0) {
    return (
      <div className="p-12 sm:p-16 text-center border border-slate-200/90 rounded-3xl bg-white shadow-sm space-y-5 max-w-2xl mx-auto">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-[#D4AF37] flex items-center justify-center mx-auto border border-[#D4AF37]/30 shadow-inner">
          <MessageSquareQuote className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-xl font-bold text-slate-900 font-display">
            No Messages or Inquiries Yet
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            You haven't sent any inquiries to Punong Spring Resort. Have a question
            about our villas, pool amenities, or special getaway packages?
          </p>
        </div>
        <Button
          asChild
          className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold h-11 px-6 rounded-xl shadow-md"
        >
          <Link to="/contact">
            Contact the Resort <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900 font-display">
            Messages & Inquiries
          </h2>
          <p className="text-xs text-slate-500">
            Communicate directly with resort administration and view replies in real time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile toggle button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowMobileList(!showMobileList)}
            className="md:hidden rounded-xl border-slate-200 text-xs"
          >
            {showMobileList ? (
              <>View Conversation Thread</>
            ) : (
              <>
                <MessageSquare className="w-3.5 h-3.5 mr-1 text-[#D4AF37]" />
                All Conversations ({sortedInquiries.length})
              </>
            )}
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-xl border-slate-200 text-xs hover:border-[#D4AF37]"
          >
            <Link to="/contact">
              <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-accent" /> New Inquiry
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Container: Split Layout (Conversations List + Active Conversation View) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Side: Conversation Threads List */}
        <div
          className={`md:col-span-4 space-y-3 ${
            showMobileList ? "block" : "hidden md:block"
          }`}
        >
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Conversations ({sortedInquiries.length})</span>
            <span className="text-[10px] text-slate-400 font-normal">Newest first</span>
          </div>

          <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
            {sortedInquiries.map((inquiry) => {
              const isSelected = activeInquiry?.id === inquiry.id;
              const statusInfo = getCustomerStatus(inquiry);
              const msgs = inquiry.inquiry_messages || [];
              const latestMsg =
                msgs.length > 0
                  ? msgs[msgs.length - 1]
                  : { message: inquiry.admin_reply || inquiry.message, created_at: inquiry.replied_at || inquiry.created_at };

              return (
                <div
                  key={inquiry.id}
                  onClick={() => {
                    setSelectedInquiryId(inquiry.id);
                    setShowMobileList(false);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer text-left ${
                    isSelected
                      ? "bg-amber-50/40 border-[#D4AF37] ring-1 ring-[#D4AF37]/40 shadow-sm"
                      : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-bold text-xs text-slate-900 font-display truncate">
                      Inquiry #{inquiry.id.slice(0, 8)}
                    </span>
                    <div>
                      {statusInfo.variant === "unread" && (
                        <Badge className="bg-rose-500 hover:bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 animate-pulse">
                          Unread Reply
                        </Badge>
                      )}
                      {statusInfo.variant === "waiting" && (
                        <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-900 border-amber-200 text-[10px] font-semibold px-2 py-0.5">
                          Waiting for Reply
                        </Badge>
                      )}
                      {statusInfo.variant === "replied" && (
                        <Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-semibold px-2 py-0.5">
                          Replied
                        </Badge>
                      )}
                      {statusInfo.variant === "read" && (
                        <Badge className="bg-blue-100 hover:bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-semibold px-2 py-0.5">
                          Read
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-2 italic">
                    "{latestMsg?.message || inquiry.message}"
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-300" />
                      {formatDateTime(latestMsg?.created_at || inquiry.created_at)}
                    </span>
                    <span className="font-medium text-slate-500">
                      {msgs.length > 0 ? `${msgs.length} msg${msgs.length === 1 ? "" : "s"}` : "1 msg"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Active Conversation Thread (Automatically displayed!) */}
        <div
          className={`md:col-span-8 ${
            showMobileList ? "hidden md:block" : "block"
          }`}
        >
          {activeInquiry ? (
            <Card className="bg-white border-slate-200/90 rounded-3xl shadow-sm overflow-hidden flex flex-col min-h-[600px] max-h-[750px]">
              {/* Active Conversation Header */}
              <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-amber-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B38728] font-bold text-[10px] uppercase tracking-wider border border-[#D4AF37]/30">
                      Active Conversation
                    </span>
                    <Badge variant="outline" className="text-xs font-semibold">
                      {getCustomerStatus(activeInquiry).label}
                    </Badge>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold font-display text-slate-900">
                    Booking Inquiry #{activeInquiry.id.slice(0, 8)}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>Started {formatDateTime(activeInquiry.created_at)}</span>
                    <span>•</span>
                    <span className="text-slate-600">{activeInquiry.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMobileList(true)}
                    className="md:hidden text-xs text-slate-500 h-8 px-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    Switch
                  </Button>
                </div>
              </div>

              {/* Chat Messages Body */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-slate-50/40">
                {activeMessages.map((msg, index) => {
                  const isAdmin = msg.sender_role === "admin";
                  return (
                    <div
                      key={msg.id || index}
                      className={`flex flex-col ${
                        isAdmin ? "items-start" : "items-end"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 space-y-1.5 shadow-sm transition-all ${
                          isAdmin
                            ? "bg-amber-50/50 border border-[#D4AF37]/40 text-slate-900 rounded-tl-sm"
                            : "bg-slate-900 text-white rounded-tr-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <span
                            className={`text-[11px] font-bold tracking-wide uppercase ${
                              isAdmin
                                ? "text-[#B38728] flex items-center gap-1"
                                : "text-amber-300"
                            }`}
                          >
                            {isAdmin ? (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                                Punong Spring Resort – Administrator
                              </>
                            ) : (
                              "You (Customer)"
                            )}
                          </span>
                          <span
                            className={`text-[10px] ${
                              isAdmin ? "text-slate-400" : "text-slate-300/80"
                            }`}
                          >
                            {formatDateTime(msg.created_at)}
                          </span>
                        </div>

                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {msg.message}
                        </p>

                        {/* Read status tag */}
                        <div className="flex items-center justify-end pt-1">
                          {isAdmin ? (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-[#D4AF37]" /> Official Resort Reply
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <CheckCheck className="w-3 h-3 text-emerald-400" /> Delivered
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Waiting Notice if no admin reply yet */}
                {!activeMessages.some((m) => m.sender_role === "admin") && (
                  <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-center space-y-1 my-2">
                    <div className="inline-flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                      <Clock className="w-4 h-4 text-amber-600" />
                      Waiting for reply from Punong Spring Resort
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed max-w-md mx-auto">
                      Our resort administration reviews inquiries promptly. When a reply is
                      posted, it will appear here and a notification will be delivered to your email.
                    </p>
                  </div>
                )}
              </div>

              {/* Message Composer (Always accessible to send follow-ups) */}
              <form
                onSubmit={handleSendFollowUp}
                className="p-4 sm:p-5 bg-white border-t border-slate-100 space-y-3"
              >
                <div className="relative">
                  <Textarea
                    rows={3}
                    required
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                    placeholder="Type your message or follow-up to the resort administrators..."
                    className="border-slate-200 focus-visible:ring-[#D4AF37] resize-none text-sm pr-24 rounded-2xl"
                  />
                  <Button
                    type="submit"
                    disabled={sendingFollowUp || !followUpText.trim()}
                    className="absolute bottom-2.5 right-2.5 bg-[#0C1C24] hover:bg-[#071216] text-[#D4AF37] border border-[#D4AF37]/30 h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    {sendingFollowUp ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Send
                      </>
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span>
                    Your reply is permanently saved to this conversation thread.
                  </span>
                  <span className="font-mono text-[10px]">
                    #{activeInquiry.id.slice(0, 8)}
                  </span>
                </div>
              </form>
            </Card>
          ) : (
            <div className="p-12 text-center border border-slate-200 rounded-3xl bg-white text-slate-400 text-sm">
              Select a conversation to view the message history.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
