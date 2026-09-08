import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { 
  generateAndDownloadReceiptPdf, 
  formatBookingReference 
} from "@/lib/receipt-generator";
import { toast } from "sonner";

export const Route = createFileRoute("/receipt/$bookingId")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [downloading, setDownloading] = useState(false);

  const handleBackToDashboard = () => {
    if (window.history.length > 2) {
      window.history.back();
    } else if (role === "admin") {
      navigate({ to: "/admin/bookings" });
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  const { data: booking, isLoading } = useQuery({
    queryKey: ["booking-receipt", bookingId],
    queryFn: async () => {
      const { data: bData, error: bErr } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .single();
      if (bErr || !bData) throw bErr || new Error("Booking not found");

      const [rRes, pRes] = await Promise.all([
        supabase.from("rooms").select("*").eq("id", bData.room_id).single(),
        supabase.from("payments").select("*").eq("booking_id", bData.id),
      ]);

      return {
        ...bData,
        room: rRes.data || null,
        payments: pRes.data || [],
      };
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500 font-medium">Loading receipt details...</div>;
  }

  if (!booking) {
    return <div className="p-8 text-center text-red-500">Booking not found.</div>;
  }

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await generateAndDownloadReceiptPdf(booking.id, booking);
    } catch (err) {
      console.error("Download receipt failed:", err);
      toast.error("Failed to generate receipt PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const payment = booking.payments?.[0];
  let notes: any = {};
  if (payment?.notes) {
    try { notes = JSON.parse(payment.notes); } catch (e) {}
  }

  return (
    <div className="min-h-screen bg-slate-50 py-4 sm:py-8 px-3 sm:px-4">
      <div className="max-w-2xl mx-auto">
        
        {/* Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-6">
          <Button variant="outline" onClick={handleBackToDashboard} className="cursor-pointer w-full sm:w-auto justify-center h-10">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
          <Button 
            disabled={downloading}
            onClick={handleDownload} 
            className="bg-primary text-primary-foreground font-semibold w-full sm:w-auto justify-center h-10 cursor-pointer"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> GENERATING PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" /> DOWNLOAD PDF
              </>
            )}
          </Button>
        </div>

        {/* Printable Area */}
        <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          
          <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-4 sm:pb-6 mb-6 gap-3">
            <div>
              <h1 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight">Punong Spring Resort</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Official Booking Receipt</p>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-lg sm:text-2xl font-bold text-slate-800">RECEIPT</div>
              <div className="text-xs sm:text-sm text-slate-500 mt-0.5">#{formatBookingReference(booking)}</div>
              <div className="text-xs sm:text-sm text-slate-500">{new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-6 sm:mb-8">
            <div className="bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-lg sm:rounded-none">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 sm:mb-2">Guest Details</h3>
              <p className="font-semibold text-slate-800">{booking.guest_name}</p>
              <p className="text-xs sm:text-sm text-slate-600 truncate">{booking.guest_email}</p>
              <p className="text-xs sm:text-sm text-slate-600">{booking.guest_phone}</p>
              {booking.special_requests && (
                <>
                  {booking.special_requests.split(" | ").find((s: string) => s.startsWith("Age: ")) && (
                    <p className="text-xs sm:text-sm text-slate-600">
                      {booking.special_requests.split(" | ").find((s: string) => s.startsWith("Age: "))}
                    </p>
                  )}
                  {booking.special_requests.split(" | ").find((s: string) => s.startsWith("Address: ")) && (
                    <p className="text-xs sm:text-sm text-slate-600">
                      {booking.special_requests.split(" | ").find((s: string) => s.startsWith("Address: "))}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-lg sm:rounded-none text-left sm:text-right">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 sm:mb-2">Booking Status</h3>
              <p className="font-semibold text-slate-800 capitalize">
                {booking.status === "approved" ? "Confirmed" : booking.status === "pending" ? "Reserved" : booking.status === "rejected" ? "Cancelled" : booking.status}
              </p>
              {payment?.status === "verified" ? (
                <p className="text-xs sm:text-sm text-green-600 font-semibold mt-0.5">PAID</p>
              ) : (
                <p className="text-xs sm:text-sm text-amber-600 font-semibold mt-0.5">
                  {payment?.status === "pending" ? "AWAITING PAYMENT AT RESORT" : payment?.status === "rejected" ? "DECLINED" : "UNPAID"}
                </p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto mb-6 sm:mb-8">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Description</th>
                  <th className="text-right py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-4 pr-2">
                    <p className="font-semibold text-slate-800 text-sm sm:text-base">{booking.room?.name}</p>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      Check-in: {new Date(booking.check_in).toLocaleDateString()}
                      <br />
                      Check-out: {new Date(booking.check_out).toLocaleDateString()}
                      <br />
                      Guests: {booking.guests}
                      {booking.special_requests && (
                        <>
                          <br />
                          <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded mt-1 inline-block">
                            {booking.special_requests}
                          </span>
                        </>
                      )}
                    </p>
                  </td>
                  <td className="py-4 text-right font-medium text-slate-800 align-top text-sm sm:text-base">
                    ₱{Number(booking.total_amount).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mb-6 sm:mb-8">
            <div className="w-full sm:w-64">
              <div className="flex justify-between items-center py-2 border-b border-slate-200 font-bold text-base sm:text-lg">
                <span>Total</span>
                <span className="text-primary">₱{Number(booking.total_amount).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 sm:pt-6 text-xs sm:text-sm text-slate-500 text-center">
            <p>Thank you for choosing Punong Spring Resort!</p>
            <p className="mt-1">For questions about your booking, please contact our support.</p>
          </div>

        </div>
      </div>
    </div>
  );
}
