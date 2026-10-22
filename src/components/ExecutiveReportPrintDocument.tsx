import React from "react";
import { format, parseISO } from "date-fns";

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
  const formattedStart = startDate ? format(parseISO(startDate), "MMMM dd, yyyy") : "—";
  const formattedEnd = endDate ? format(parseISO(endDate), "MMMM dd, yyyy") : "—";
  const generatedAt = format(new Date(), "MMMM dd, yyyy 'at' hh:mm a");

  // Format peso helper
  const fmtCurrency = (val: number) => `₱${Number(val || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="w-full bg-white text-slate-900 font-sans leading-normal selection:bg-slate-200">
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
              <h1 className="text-2xl font-black tracking-wider uppercase font-serif text-slate-900 leading-tight">
                Punong Spring Resort
              </h1>
              <p className="text-xs text-slate-600 font-medium tracking-wide">
                Brgy. Punong, Lucban, Quezon, Philippines • Tel: (042) 540-3321
              </p>
              <p className="text-xs text-slate-500 italic mt-0.5">
                Official Resort Financial, Reservation & Operational Intelligence Report
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-slate-900 text-white font-mono text-[10px] font-bold uppercase tracking-widest rounded-xs">
              Executive Management Report
            </span>
            <p className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider mt-1.5">
              Ref: PSR-RPT-{format(new Date(), "yyyyMMdd-HHmm")}
            </p>
          </div>
        </div>

        {/* Structured Metadata Summary Bar */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 border border-slate-300 rounded-sm text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">
              Reporting Period
            </span>
            <span className="font-semibold text-slate-900">
              {formattedStart} – {formattedEnd}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">
              Date & Time Generated
            </span>
            <span className="font-semibold text-slate-900">{generatedAt}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">
              Prepared By
            </span>
            <span className="font-semibold text-slate-900 truncate block" title={adminName}>
              {adminName}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">
              Classification
            </span>
            <span className="font-bold text-rose-700 tracking-wider">
              STRICTLY CONFIDENTIAL
            </span>
          </div>
        </div>
      </header>

      {/* ========================================================
          2. EXECUTIVE PERFORMANCE SUMMARY
         ======================================================== */}
      <section className="mb-7 avoid-page-break">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-slate-900 inline-block"></span>
            1. Executive Performance Summary
          </h2>
          <span className="text-[10px] text-slate-500 font-medium">Audited Performance Metrics</span>
        </div>

        {/* Compact Formal Summary Table */}
        <div className="border border-slate-300 rounded-sm overflow-hidden mb-3">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2 px-3 border-r border-slate-300">Key Performance Indicator</th>
                <th className="py-2 px-3 border-r border-slate-300 text-right">Value / Metric</th>
                <th className="py-2 px-3 border-r border-slate-300 text-right">Share of Total</th>
                <th className="py-2 px-3">Operational Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                  Total Bookings & Reservations
                </td>
                <td className="py-2 px-3 text-right font-bold text-slate-900 border-r border-slate-200">
                  {stats.total}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200">100.0%</td>
                <td className="py-2 px-3 text-slate-600 text-[11px]">
                  All inventory requests initiated during the selected period.
                </td>
              </tr>
              <tr className="bg-slate-50/50">
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                  Confirmed Stays (Approved)
                </td>
                <td className="py-2 px-3 text-right font-bold text-emerald-800 border-r border-slate-200">
                  {stats.confirmed}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200">
                  {stats.total > 0 ? ((stats.confirmed / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-[11px]">
                  Verified guest bookings with assigned accommodation schedules.
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                  Completed Stays
                </td>
                <td className="py-2 px-3 text-right font-bold text-blue-800 border-r border-slate-200">
                  {stats.completed}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200">
                  {stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-[11px]">
                  Fully concluded stays with verified guest check-outs.
                </td>
              </tr>
              <tr className="bg-slate-50/50">
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                  Pending Reservations (Awaiting Payment / Review)
                </td>
                <td className="py-2 px-3 text-right font-bold text-amber-700 border-r border-slate-200">
                  {stats.pending}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200">
                  {stats.total > 0 ? ((stats.pending / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-[11px]">
                  Reservations pending proof verification or guest confirmation.
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                  Cancelled / Rejected Bookings
                </td>
                <td className="py-2 px-3 text-right font-bold text-rose-700 border-r border-slate-200">
                  {stats.cancelled}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200">
                  {stats.total > 0 ? ((stats.cancelled / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-[11px]">
                  Cancelled requests or rejected submissions.
                </td>
              </tr>
              <tr className="bg-slate-50/50">
                <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                  No-Show Guests
                </td>
                <td className="py-2 px-3 text-right font-bold text-slate-700 border-r border-slate-200">
                  {stats.noShow}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200">
                  {stats.total > 0 ? ((stats.noShow / stats.total) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-2 px-3 text-slate-600 text-[11px]">
                  Confirmed guests who failed to arrive for their scheduled stay.
                </td>
              </tr>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                <td className="py-2.5 px-3 text-slate-900 border-r border-slate-300 uppercase tracking-wider text-[11px]">
                  Total Period Gross Revenue
                </td>
                <td className="py-2.5 px-3 text-right text-slate-900 text-sm font-black border-r border-slate-300">
                  {fmtCurrency(stats.revenue)}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-800 border-r border-slate-300">
                  —
                </td>
                <td className="py-2.5 px-3 text-slate-800 text-[11px]">
                  Aggregated revenue from confirmed and completed reservations.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Secondary Financial & Payment Channel Indicators */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 border border-slate-300 bg-white rounded-xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              Verified Payments
            </span>
            <span className="text-base font-bold text-slate-900">
              {stats.verifiedPayments}
            </span>
            <span className="text-[10px] text-slate-500 block">Receipts verified</span>
          </div>

          <div className="p-2.5 border border-slate-300 bg-white rounded-xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              Awaiting Verification
            </span>
            <span className="text-base font-bold text-amber-700">
              {stats.pendingPayments}
            </span>
            <span className="text-[10px] text-slate-500 block">Pending audit</span>
          </div>

          <div className="p-2.5 border border-slate-300 bg-white rounded-xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              GCash Digital Transfer
            </span>
            <span className="text-base font-bold text-blue-800">
              {stats.gcashCount}
            </span>
            <span className="text-[10px] text-slate-500 block">Electronic remittance</span>
          </div>

          <div className="p-2.5 border border-slate-300 bg-white rounded-xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              Pay at Resort (Frontdesk)
            </span>
            <span className="text-base font-bold text-slate-800">
              {stats.resortCount}
            </span>
            <span className="text-[10px] text-slate-500 block">On-site settlement</span>
          </div>
        </div>
      </section>

      {/* ========================================================
          3. DETAILED RESERVATION & GUEST AUDIT REGISTER
         ======================================================== */}
      <section className="mb-8">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-slate-900 inline-block"></span>
            2. Detailed Reservation & Guest Audit Register
          </h2>
          <span className="text-[10px] text-slate-500 font-medium">
            {bookings.length} Record{bookings.length === 1 ? "" : "s"} Displayed
          </span>
        </div>

        <div className="border border-slate-300 rounded-sm overflow-hidden">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2 px-2 border-r border-slate-300 w-8 text-center">#</th>
                <th className="py-2 px-2.5 border-r border-slate-300">Reference</th>
                <th className="py-2 px-2.5 border-r border-slate-300">Guest Name</th>
                <th className="py-2 px-2.5 border-r border-slate-300">Contact Details</th>
                <th className="py-2 px-2.5 border-r border-slate-300">Accommodation</th>
                <th className="py-2 px-2.5 border-r border-slate-300">Dates of Stay</th>
                <th className="py-2 px-2 border-r border-slate-300 text-center">Pax</th>
                <th className="py-2 px-2.5 border-r border-slate-300">Payment Channel</th>
                <th className="py-2 px-2.5 border-r border-slate-300 text-center">Status</th>
                <th className="py-2 px-3 text-right">Amount (PHP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 italic">
                    No reservations or bookings recorded for this reporting period.
                  </td>
                </tr>
              ) : (
                bookings.map((b: any, idx: number) => {
                  const p = b.payments?.[0];
                  let method = "Unknown";
                  if (p?.notes) {
                    try {
                      const parsed = typeof p.notes === "string" ? JSON.parse(p.notes) : p.notes;
                      if (parsed?.method === "gcash") method = "GCash";
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
                      <td className="py-1.5 px-2 text-center text-slate-500 border-r border-slate-200 text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono font-semibold text-slate-900 border-r border-slate-200 text-[11px] whitespace-nowrap">
                        {refCode}
                      </td>
                      <td className="py-1.5 px-2.5 font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                        {b.guest_name || "Valued Guest"}
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-600 border-r border-slate-200 text-[10px]">
                        <div>{b.guest_phone || "—"}</div>
                        <div className="text-slate-400 truncate max-w-[150px]">{b.guest_email || "—"}</div>
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200">
                        <span className="font-semibold text-slate-800 block">
                          {b.room?.name || "Unassigned"}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-500">
                          {b.room?.type || "Standard"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200 whitespace-nowrap text-[11px]">
                        <div>{b.check_in}</div>
                        <div className="text-slate-500 text-[10px]">to {b.check_out}</div>
                      </td>
                      <td className="py-1.5 px-2 text-center font-semibold text-slate-700 border-r border-slate-200 text-[11px]">
                        {b.guests || 1}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200 text-[11px]">
                        <span className="font-medium text-slate-800 block">{method}</span>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">
                          {p?.status || "Unpaid"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-center border-r border-slate-200">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider ${
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
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {fmtCurrency(Number(b.total_amount || 0))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-xs text-slate-900">
                <td colSpan={7} className="py-2.5 px-3 text-left uppercase tracking-wider text-[11px]">
                  Total Aggregated ({bookings.length} reservations in period)
                </td>
                <td colSpan={2} className="py-2.5 px-3 text-right text-slate-700 text-[11px]">
                  Confirmed & Completed Sum:
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-sm font-black text-slate-900 whitespace-nowrap">
                  {fmtCurrency(stats.revenue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ========================================================
          4. ACCOMMODATION PERFORMANCE & OCCUPANCY
         ======================================================== */}
      <section className="mb-8 avoid-page-break">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-slate-900 inline-block"></span>
            3. Accommodation Performance & Inventory Yield
          </h2>
          <span className="text-[10px] text-slate-500 font-medium">Room & Cottage Utilization</span>
        </div>

        <div className="border border-slate-300 rounded-sm overflow-hidden">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2 px-3 border-r border-slate-300">Accommodation Unit</th>
                <th className="py-2 px-3 border-r border-slate-300">Category</th>
                <th className="py-2 px-3 border-r border-slate-300 text-center">Total Stays Booked</th>
                <th className="py-2 px-3 border-r border-slate-300 text-right">Revenue Share (%)</th>
                <th className="py-2 px-3 text-right">Generated Revenue (PHP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {roomOccupancyData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500 italic">
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
                      <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                        {r.name}
                      </td>
                      <td className="py-2 px-3 uppercase text-[10px] font-bold text-slate-500 border-r border-slate-200">
                        {r.type}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-800 border-r border-slate-200">
                        {r.timesBooked}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200">
                        {share}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
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
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-slate-900 inline-block"></span>
              4. Cancellation & Booking Attrition Analysis
            </h2>
            <span className="text-[10px] text-rose-700 font-bold">
              {stats.cancelled} Total Cancellation{stats.cancelled === 1 ? "" : "s"}
            </span>
          </div>

          <div className="border border-slate-300 rounded-sm overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2 px-3 border-r border-slate-300">Stated Cancellation Reason</th>
                  <th className="py-2 px-3 border-r border-slate-300 text-center">Count</th>
                  <th className="py-2 px-3 text-right">Share of Cancellations (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stats.cancellationReasonsData.map((item, idx) => {
                  const pct = Math.round((item.value / stats.cancelled) * 100);
                  return (
                    <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                      <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                        {item.name}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-800 border-r border-slate-200">
                        {item.value}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
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
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-slate-900 inline-block"></span>
              5. Top Guest Accounts by Value
            </h2>
            <span className="text-[10px] text-slate-500 font-medium">Guest Loyalty Intelligence</span>
          </div>

          <div className="border border-slate-300 rounded-sm overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2 px-3 border-r border-slate-300">Guest Name</th>
                  <th className="py-2 px-3 border-r border-slate-300">Contact Email</th>
                  <th className="py-2 px-3 border-r border-slate-300">Phone</th>
                  <th className="py-2 px-3 border-r border-slate-300 text-center">Completed Stays</th>
                  <th className="py-2 px-3 text-right">Total Expenditure (PHP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {customerData.slice(0, 10).map((c, idx) => (
                  <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                    <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                      {c.name}
                    </td>
                    <td className="py-2 px-3 text-slate-600 border-r border-slate-200 font-mono text-[11px]">
                      {c.email}
                    </td>
                    <td className="py-2 px-3 text-slate-600 border-r border-slate-200 text-[11px]">
                      {c.phone || "—"}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-slate-800 border-r border-slate-200">
                      {c.bookingsCount}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
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
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-6">
          6. Administrative Verification & Sign-Off
        </h3>

        <div className="grid grid-cols-2 gap-12 text-xs">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-8">
              Prepared & Certified By:
            </p>
            <div className="border-b border-slate-800 pb-1 w-64 mb-1">
              <span className="font-bold text-slate-900">{adminName}</span>
            </div>
            <p className="text-[10px] text-slate-600">Operations & Financial Administrator</p>
            <p className="text-[10px] text-slate-400 mt-1">Date: {format(new Date(), "MMMM dd, yyyy")}</p>
          </div>

          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-8">
              Approved & Acknowledged By:
            </p>
            <div className="border-b border-slate-800 pb-1 w-64 mb-1">
              <span className="font-bold text-slate-400 italic">Signature over printed name</span>
            </div>
            <p className="text-[10px] text-slate-600">Executive Management / Resort Auditor</p>
            <p className="text-[10px] text-slate-400 mt-1">Date: ________________________</p>
          </div>
        </div>

        {/* Confidentiality Notice */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-center">
          <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
            CONFIDENTIALITY NOTICE: This document contains proprietary operational and financial intelligence of Punong Spring Resort.
          </p>
          <p className="text-[9px] text-slate-400 mt-0.5">
            Strictly for internal resort management, auditing, and official recordkeeping. Unauthorized reproduction is strictly prohibited.
          </p>
        </div>
      </section>
    </div>
  );
}
