import React from "react";
import { format, parseISO } from "date-fns";
import { useSystemSettings } from "@/hooks/use-system-settings";

export interface ReportStats {
  total: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  completed: number;
  noShow: number;
  revenue: number;
  verifiedPayments: number;
  pendingPayments: number;
  rejectedPayments: number;
  gcashCount: number;
  resortCount: number;
  refundPending: number;
  refunded: number;
  nonRefundable: number;
  cancellationReasonsData: { name: string; value: number }[];
}

export interface ExecutiveReportPrintDocumentProps {
  startDate: string;
  endDate: string;
  adminName: string;
  stats: ReportStats;
  bookings: any[];
  roomOccupancyData: { name: string; timesBooked: number; revenue: number; type: string }[];
  customerData: { name: string; email: string; phone: string; bookingsCount: number; totalSpent: number }[];
}

export function ExecutiveReportPrintDocument({
  startDate,
  endDate,
  adminName,
  stats,
  bookings,
  roomOccupancyData,
  customerData,
}: ExecutiveReportPrintDocumentProps) {
  const { settings } = useSystemSettings();

  const formattedStart = startDate ? format(parseISO(startDate), "MMMM dd, yyyy") : "—";
  const formattedEnd = endDate ? format(parseISO(endDate), "MMMM dd, yyyy") : "—";
  const generatedAt = format(new Date(), "MMMM dd, yyyy 'at' hh:mm a");

  // Format peso helper with exact currency representation
  const fmtCurrency = (val: number) =>
    `₱${Number(val || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Accurate table totals calculation
  const totalListedAmount = bookings.reduce(
    (sum, b) => sum + Number(b.total_amount || 0),
    0
  );

  return (
    <div className="executive-report-document w-full bg-white text-slate-900 font-sans leading-relaxed selection:bg-slate-200">
      {/* ========================================================
          1. FORMAL DOCUMENT HEADER
         ======================================================== */}
      <header className="border-b-2 border-slate-900 pb-5 mb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="Punong Spring Resort"
              className="h-16 w-16 object-contain rounded-full border border-slate-300 p-0.5"
            />
            <div>
              <h1 className="text-2xl font-black tracking-wide uppercase font-serif text-slate-900 leading-tight">
                {settings.resort_name || "Punong Spring Resort"}
              </h1>
              <p className="text-xs text-slate-600 font-medium tracking-wide">
                {settings.address || "Brgy. Guba, Cebu City, Philippines"} • Tel:{" "}
                {settings.contact_number || "(+63) 912 345 6789"}
              </p>
              <p className="text-xs text-slate-500 italic mt-0.5">
                Executive Management Report — Performance, Occupancy & Financial Audit
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-slate-900 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xs">
              Official Management Report
            </span>
            <p className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider mt-1.5">
              Ref: PSR-RPT-{format(new Date(), "yyyyMMdd-HHmm")}
            </p>
          </div>
        </div>

        {/* Structured Metadata Summary Bar */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 border border-slate-300 rounded-sm text-xs">
          <div>
            <span className="text-xs uppercase font-bold text-slate-500 block tracking-wider">
              Reporting Period
            </span>
            <span className="font-semibold text-slate-900 text-xs">
              {formattedStart} – {formattedEnd}
            </span>
          </div>
          <div>
            <span className="text-xs uppercase font-bold text-slate-500 block tracking-wider">
              Date & Time Generated
            </span>
            <span className="font-semibold text-slate-900 text-xs">{generatedAt}</span>
          </div>
          <div>
            <span className="text-xs uppercase font-bold text-slate-500 block tracking-wider">
              Prepared By
            </span>
            <span className="font-semibold text-slate-900 text-xs truncate block" title={adminName}>
              {adminName}
            </span>
          </div>
          <div>
            <span className="text-xs uppercase font-bold text-slate-500 block tracking-wider">
              Classification
            </span>
            <span className="font-bold text-rose-700 text-xs tracking-wider">
              FOR MANAGEMENT USE ONLY
            </span>
          </div>
        </div>
      </header>

      {/* ========================================================
          2. EXECUTIVE PERFORMANCE SUMMARY
         ======================================================== */}
      <section className="mb-7 avoid-page-break">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-slate-900 inline-block"></span>
            1. Executive Performance Summary
          </h2>
          <span className="text-xs text-slate-500 font-medium">Audited Performance Figures</span>
        </div>

        {/* Core Top 5 Metrics Compact Grid (Matches Dashboard Exactly) */}
        <div className="grid grid-cols-5 gap-2 mb-3 text-center">
          <div className="p-3 border border-slate-300 bg-slate-50/70 rounded-xs">
            <span className="text-xs uppercase font-bold text-blue-700 block tracking-wider mb-1">
              Total Bookings
            </span>
            <span className="text-xl font-black text-slate-900 font-mono block">
              {stats.total}
            </span>
            <span className="text-xs text-slate-500">All submissions</span>
          </div>

          <div className="p-3 border border-slate-300 bg-slate-50/70 rounded-xs">
            <span className="text-xs uppercase font-bold text-emerald-700 block tracking-wider mb-1">
              Confirmed Stays
            </span>
            <span className="text-xl font-black text-emerald-800 font-mono block">
              {stats.confirmed}
            </span>
            <span className="text-xs text-slate-500">Approved guests</span>
          </div>

          <div className="p-3 border border-slate-300 bg-slate-50/70 rounded-xs">
            <span className="text-xs uppercase font-bold text-rose-700 block tracking-wider mb-1">
              Cancelled
            </span>
            <span className="text-xl font-black text-rose-800 font-mono block">
              {stats.cancelled}
            </span>
            <span className="text-xs text-slate-500">Void / Rejected</span>
          </div>

          <div className="p-3 border border-slate-300 bg-slate-50/70 rounded-xs">
            <span className="text-xs uppercase font-bold text-amber-700 block tracking-wider mb-1">
              No-Show Guests
            </span>
            <span className="text-xl font-black text-amber-800 font-mono block">
              {stats.noShow}
            </span>
            <span className="text-xs text-slate-500">Failed arrivals</span>
          </div>

          <div className="p-3 border border-slate-900 bg-slate-900 text-white rounded-xs">
            <span className="text-xs uppercase font-bold text-amber-300 block tracking-wider mb-1">
              Total Period Revenue
            </span>
            <span className="text-xl font-black text-white font-mono block">
              {fmtCurrency(stats.revenue)}
            </span>
            <span className="text-xs text-slate-300">Realized Gross</span>
          </div>
        </div>

        {/* Secondary Payment Audit Indicators (GCash Digital Transfer REMOVED) */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
          <div className="p-2.5 border border-slate-300 bg-white rounded-xs">
            <span className="text-xs uppercase font-bold text-slate-600 block">
              Verified Payments
            </span>
            <span className="text-base font-bold text-slate-900">
              {stats.verifiedPayments}
            </span>
            <span className="text-xs text-slate-500 block">Remittance / receipts audited</span>
          </div>

          <div className="p-2.5 border border-slate-300 bg-white rounded-xs">
            <span className="text-xs uppercase font-bold text-amber-700 block">
              Awaiting Verification
            </span>
            <span className="text-base font-bold text-amber-700">
              {stats.pendingPayments}
            </span>
            <span className="text-xs text-slate-500 block">Pending frontdesk audit</span>
          </div>

          <div className="p-2.5 border border-slate-300 bg-white rounded-xs">
            <span className="text-xs uppercase font-bold text-slate-700 block">
              Pay at Resort (Frontdesk)
            </span>
            <span className="text-base font-bold text-slate-800">
              {stats.resortCount}
            </span>
            <span className="text-xs text-slate-500 block">On-site cash settlement</span>
          </div>
        </div>

        {/* Detailed KPI Breakdown Table */}
        <div className="border border-slate-300 rounded-sm overflow-hidden mb-3">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-xs">
                <th className="py-2.5 px-3 border-r border-slate-300">Key Performance Metric</th>
                <th className="py-2.5 px-3 border-r border-slate-300 text-right">Value / Metric</th>
                <th className="py-2.5 px-3 border-r border-slate-300 text-right">Share of Total</th>
                <th className="py-2.5 px-3">Operational Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                  Total Bookings & Reservations
                </td>
                <td className="py-2 px-3 text-right font-bold text-slate-900 border-r border-slate-200 text-xs">
                  {stats.total}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs">
                  100.0%
                </td>
                <td className="py-2 px-3 text-slate-600 text-xs">
                  All guest reservations initiated during the selected reporting period.
                </td>
              </tr>
              <tr className="bg-slate-50/50">
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                  Confirmed Stays (Approved)
                </td>
                <td className="py-2 px-3 text-right font-bold text-emerald-800 border-r border-slate-200 text-xs">
                  {stats.confirmed}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs">
                  {stats.total > 0 ? ((stats.confirmed / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-xs">
                  Approved guest reservations with reserved accommodation dates.
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                  Completed Stays
                </td>
                <td className="py-2 px-3 text-right font-bold text-blue-800 border-r border-slate-200 text-xs">
                  {stats.completed}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs">
                  {stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-xs">
                  Concluded guest visits with completed check-out audits.
                </td>
              </tr>
              <tr className="bg-slate-50/50">
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                  Pending Reservations (Awaiting Payment / Review)
                </td>
                <td className="py-2 px-3 text-right font-bold text-amber-700 border-r border-slate-200 text-xs">
                  {stats.pending}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs">
                  {stats.total > 0 ? ((stats.pending / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-xs">
                  Reservations pending proof verification or guest confirmation.
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                  Cancelled / Rejected Bookings
                </td>
                <td className="py-2 px-3 text-right font-bold text-rose-700 border-r border-slate-200 text-xs">
                  {stats.cancelled}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs">
                  {stats.total > 0 ? ((stats.cancelled / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-xs">
                  Cancelled reservations or rejected requests.
                </td>
              </tr>
              <tr className="bg-slate-50/50">
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                  No-Show Guests
                </td>
                <td className="py-2 px-3 text-right font-bold text-slate-700 border-r border-slate-200 text-xs">
                  {stats.noShow}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs">
                  {stats.total > 0 ? ((stats.noShow / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-xs">
                  Guests who failed to arrive on their scheduled arrival date.
                </td>
              </tr>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                <td className="py-2.5 px-3 text-slate-900 border-r border-slate-300 uppercase tracking-wider text-xs">
                  Total Period Gross Revenue
                </td>
                <td className="py-2.5 px-3 text-right text-slate-900 text-sm font-black border-r border-slate-300">
                  {fmtCurrency(stats.revenue)}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-800 border-r border-slate-300 text-xs">
                  —
                </td>
                <td className="py-2.5 px-3 text-slate-800 text-xs">
                  Realized revenue aggregated from approved and completed reservations.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================
          3. DETAILED RESERVATION & GUEST AUDIT REGISTER
         ======================================================== */}
      <section className="mb-8">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-slate-900 inline-block"></span>
            2. Detailed Reservation & Guest Audit Register
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            {bookings.length} Record{bookings.length === 1 ? "" : "s"} In Period
          </span>
        </div>

        <div className="border border-slate-300 rounded-sm overflow-hidden">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-xs">
                <th className="py-2.5 px-2 text-center w-8 border-r border-slate-300">#</th>
                <th className="py-2.5 px-2.5 border-r border-slate-300">Reference</th>
                <th className="py-2.5 px-2.5 border-r border-slate-300">Guest & Contact</th>
                <th className="py-2.5 px-2.5 border-r border-slate-300">Accommodation</th>
                <th className="py-2.5 px-2.5 border-r border-slate-300">Stay Dates</th>
                <th className="py-2.5 px-2 text-center border-r border-slate-300">Guests</th>
                <th className="py-2.5 px-2.5 border-r border-slate-300">Payment & Status</th>
                <th className="py-2.5 px-3 text-right">Amount (PHP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 italic text-xs">
                    No reservations or bookings recorded for this reporting period.
                  </td>
                </tr>
              ) : (
                bookings.map((b: any, idx: number) => {
                  const p = b.payments?.[0];
                  let method = "Unspecified";
                  if (p?.notes) {
                    try {
                      const parsed =
                        typeof p.notes === "string" ? JSON.parse(p.notes) : p.notes;
                      if (parsed?.method === "gcash") method = "Online Payment";
                      else if (parsed?.method === "resort") method = "Pay at Resort";
                    } catch (_) {}
                  }

                  const refCode = b.id ? `PSR-${b.id.split("-")[0].toUpperCase()}` : "—";
                  const statusFormatted = b.status
                    ? b.status.charAt(0).toUpperCase() + b.status.slice(1)
                    : "—";

                  return (
                    <tr
                      key={b.id || idx}
                      className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}
                      style={{ pageBreakInside: "avoid" }}
                    >
                      <td className="py-2 px-2 text-center text-slate-500 border-r border-slate-200 text-xs">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2.5 font-mono font-semibold text-slate-900 border-r border-slate-200 text-xs whitespace-nowrap">
                        {refCode}
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-200">
                        <div className="font-bold text-slate-900 text-xs">{b.guest_name || "Valued Guest"}</div>
                        <div className="text-slate-500 text-xs">{b.guest_phone || b.guest_email || "—"}</div>
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-200">
                        <span className="font-semibold text-slate-800 block text-xs">
                          {b.room?.name || "Unassigned"}
                        </span>
                        <span className="text-xs uppercase font-medium text-slate-500">
                          {b.room?.type || "Standard"}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-200 whitespace-nowrap text-xs">
                        <div className="font-medium text-slate-800">{b.check_in}</div>
                        <div className="text-slate-500 text-xs">to {b.check_out}</div>
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-slate-700 border-r border-slate-200 text-xs">
                        {b.guests || 1}
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-200 text-xs">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded-xs text-xs font-bold uppercase tracking-wider ${
                              b.status === "approved"
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                : b.status === "completed"
                                ? "bg-blue-100 text-blue-900 border border-blue-300"
                                : b.status === "pending"
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-rose-100 text-rose-900 border border-rose-300"
                            }`}
                          >
                            {statusFormatted}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          {method} • <span className="uppercase text-slate-500 font-semibold">{p?.status || "Unpaid"}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap text-xs">
                        {fmtCurrency(Number(b.total_amount || 0))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-xs text-slate-900">
                <td colSpan={5} className="py-3 px-3 text-left uppercase tracking-wider text-xs">
                  Summary: {bookings.length} reservations ({stats.confirmed + stats.completed} confirmed/completed stays)
                </td>
                <td colSpan={2} className="py-3 px-3 text-right text-slate-800 text-xs font-bold">
                  Realized Revenue (Confirmed Stays):
                </td>
                <td className="py-3 px-3 text-right font-mono text-sm font-black text-slate-900 whitespace-nowrap">
                  {fmtCurrency(stats.revenue)}
                </td>
              </tr>
              {totalListedAmount !== stats.revenue && (
                <tr className="bg-slate-50 text-xs text-slate-600 border-t border-slate-300">
                  <td colSpan={5} className="py-1.5 px-3 text-left italic">
                    * Total value of all listed bookings including pending/cancelled:
                  </td>
                  <td colSpan={3} className="py-1.5 px-3 text-right font-mono font-semibold">
                    {fmtCurrency(totalListedAmount)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </section>

      {/* ========================================================
          4. ACCOMMODATION PERFORMANCE & OCCUPANCY
         ======================================================== */}
      <section className="mb-8 avoid-page-break">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-slate-900 inline-block"></span>
            3. Accommodation Performance & Inventory Yield
          </h2>
          <span className="text-xs text-slate-500 font-medium">Room & Cottage Utilization</span>
        </div>

        <div className="border border-slate-300 rounded-sm overflow-hidden">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-xs">
                <th className="py-2.5 px-3 border-r border-slate-300">Accommodation Unit</th>
                <th className="py-2.5 px-3 border-r border-slate-300">Category</th>
                <th className="py-2.5 px-3 border-r border-slate-300 text-center">Total Stays Booked</th>
                <th className="py-2.5 px-3 border-r border-slate-300 text-right">Revenue Share (%)</th>
                <th className="py-2.5 px-3 text-right">Generated Revenue (PHP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {roomOccupancyData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500 italic text-xs">
                    No accommodation performance records available.
                  </td>
                </tr>
              ) : (
                roomOccupancyData.map((r, idx) => {
                  const share =
                    stats.revenue > 0 ? ((r.revenue / stats.revenue) * 100).toFixed(1) : "0.0";
                  return (
                    <tr
                      key={idx}
                      className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}
                      style={{ pageBreakInside: "avoid" }}
                    >
                      <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                        {r.name}
                      </td>
                      <td className="py-2 px-3 uppercase text-xs font-bold text-slate-500 border-r border-slate-200">
                        {r.type}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-800 border-r border-slate-200 text-xs">
                        {r.timesBooked}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs">
                        {share}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 text-xs">
                        {fmtCurrency(r.revenue)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================
          5. CANCELLATION & ATTRITION ANALYSIS (IF ANY)
         ======================================================== */}
      {stats.cancelled > 0 && stats.cancellationReasonsData.length > 0 && (
        <section className="mb-8 avoid-page-break">
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-slate-900 inline-block"></span>
              4. Cancellation & Booking Attrition Analysis
            </h2>
            <span className="text-xs text-rose-700 font-bold">
              {stats.cancelled} Total Cancellation{stats.cancelled === 1 ? "" : "s"}
            </span>
          </div>

          <div className="border border-slate-300 rounded-sm overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-xs">
                  <th className="py-2.5 px-3 border-r border-slate-300">Stated Cancellation Reason</th>
                  <th className="py-2.5 px-3 border-r border-slate-300 text-center">Count</th>
                  <th className="py-2.5 px-3 text-right">Share of Cancellations (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stats.cancellationReasonsData.map((item, idx) => {
                  const pct = Math.round((item.value / stats.cancelled) * 100);
                  return (
                    <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                      <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                        {item.name}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-800 border-r border-slate-200 text-xs">
                        {item.value}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700 text-xs">
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ========================================================
          6. TOP GUEST ACCOUNTS
         ======================================================== */}
      {customerData.length > 0 && (
        <section className="mb-8 avoid-page-break">
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-slate-900 inline-block"></span>
              5. Top Guest Accounts by Value
            </h2>
            <span className="text-xs text-slate-500 font-medium">Guest Loyalty Summary</span>
          </div>

          <div className="border border-slate-300 rounded-sm overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-xs">
                  <th className="py-2.5 px-3 border-r border-slate-300">Guest Name</th>
                  <th className="py-2.5 px-3 border-r border-slate-300">Contact Email</th>
                  <th className="py-2.5 px-3 border-r border-slate-300">Phone</th>
                  <th className="py-2.5 px-3 border-r border-slate-300 text-center">Completed Stays</th>
                  <th className="py-2.5 px-3 text-right">Total Expenditure (PHP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {customerData.slice(0, 10).map((c, idx) => (
                  <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                    <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                      {c.name}
                    </td>
                    <td className="py-2 px-3 text-slate-600 border-r border-slate-200 font-mono text-xs">
                      {c.email}
                    </td>
                    <td className="py-2 px-3 text-slate-600 border-r border-slate-200 text-xs">
                      {c.phone || "—"}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-slate-800 border-r border-slate-200 text-xs">
                      {c.bookingsCount}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 text-xs">
                      {fmtCurrency(c.totalSpent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ========================================================
          7. ADMINISTRATIVE SIGN-OFF & VERIFICATION
         ======================================================== */}
      <section className="pt-6 border-t border-slate-300 avoid-page-break">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-6">
          6. Administrative Verification & Sign-Off
        </h3>

        <div className="grid grid-cols-2 gap-12 text-xs">
          <div>
            <p className="text-xs uppercase font-bold text-slate-500 mb-8">
              Prepared & Certified By:
            </p>
            <div className="border-b border-slate-800 pb-1 w-64 mb-1">
              <span className="font-bold text-slate-900 text-xs">{adminName}</span>
            </div>
            <p className="text-xs text-slate-600">Operations & Financial Administrator</p>
            <p className="text-xs text-slate-400 mt-1">Date: {format(new Date(), "MMMM dd, yyyy")}</p>
          </div>

          <div>
            <p className="text-xs uppercase font-bold text-slate-500 mb-8">
              Approved & Acknowledged By:
            </p>
            <div className="border-b border-slate-800 pb-1 w-64 mb-1">
              <span className="font-bold text-slate-400 italic text-xs">Signature over printed name</span>
            </div>
            <p className="text-xs text-slate-600">Executive Management / Resort Auditor</p>
            <p className="text-xs text-slate-400 mt-1">Date: ________________________</p>
          </div>
        </div>

        {/* Confidentiality Notice */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-center">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            CONFIDENTIALITY NOTICE: This document contains proprietary operational and financial intelligence of Punong Spring Resort.
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Strictly for internal resort management, auditing, and official recordkeeping. Unauthorized reproduction is strictly prohibited.
          </p>
        </div>
      </section>
    </div>
  );
}
