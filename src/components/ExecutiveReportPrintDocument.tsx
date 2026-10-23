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

/**
 * Format date range into an executive reporting period string:
 * e.g., "October 1–23, 2026" or "October 1 – November 15, 2026"
 */
function formatReportingPeriod(startStr?: string, endStr?: string): string {
  if (!startStr || !endStr) return "All Recorded Dates";
  try {
    const s = parseISO(startStr);
    const e = parseISO(endStr);
    const sMonth = format(s, "MMMM");
    const eMonth = format(e, "MMMM");
    const sYear = format(s, "yyyy");
    const eYear = format(e, "yyyy");
    const sDay = format(s, "d");
    const eDay = format(e, "d");

    if (sYear === eYear) {
      if (sMonth === eMonth) {
        return `${sMonth} ${sDay}–${eDay}, ${sYear}`;
      }
      return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${sYear}`;
    }
    return `${format(s, "MMMM d, yyyy")} – ${format(e, "MMMM d, yyyy")}`;
  } catch {
    return `${startStr} – ${endStr}`;
  }
}

/**
 * Generates exact dynamic date and time in Philippine Time (PHT, Asia/Manila, UTC+08:00)
 */
function getPhilippineGeneratedOn(): string {
  const now = new Date();
  const datePart = now.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timePart = now.toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart} PHT`;
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

  const reportingPeriodText = formatReportingPeriod(startDate, endDate);
  const generatedTimestamp = getPhilippineGeneratedOn();
  const reportRefCode = format(new Date(), "yyyyMMdd-HHmm");

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
      <table className="w-full border-none border-collapse">
        {/* Repeating header for multi-page print compatibility */}
        <thead className="print-running-header" style={{ display: "table-header-group" }}>
          <tr>
            <th className="font-normal text-left p-0 pb-4 border-none">
              {/* ========================================================
                  1. FORMAL RESORT EXECUTIVE REPORT HEADER
                 ======================================================== */}
              <div className="executive-report-header border-b-2 border-slate-900 pb-4 mb-4">
                <div className="flex items-start justify-between gap-6">
                  {/* Left Brand Identity */}
                  <div className="flex items-center gap-4">
                    <img
                      src="/logo.png"
                      alt="Punong Spring Resort"
                      className="h-16 w-16 object-contain rounded-full border border-slate-300 p-0.5 shadow-xs"
                      onError={(e: any) => {
                        e.target.style.display = "none";
                      }}
                    />
                    <div>
                      <h1 className="text-2xl font-black tracking-wider uppercase font-serif text-[#0B192C] leading-none">
                        {settings.resort_name || "PUNONG SPRING RESORT"}
                      </h1>
                      <h2 className="text-sm font-extrabold tracking-widest uppercase text-slate-800 font-sans mt-1">
                        EXECUTIVE MANAGEMENT REPORT
                      </h2>
                      <div className="h-0.5 w-28 bg-[#D4AF37] my-1.5"></div>
                      <div className="text-xs text-slate-700 space-y-0.5 font-medium leading-tight">
                        <p>
                          <span className="font-bold text-slate-900">Reporting Period:</span> {reportingPeriodText}
                        </p>
                        <p>
                          <span className="font-bold text-slate-900">Generated On:</span> {generatedTimestamp}
                        </p>
                        <p>
                          <span className="font-bold text-slate-900">Time Zone:</span> Asia/Manila (Philippine Time, UTC+08:00)
                        </p>
                        <p>
                          <span className="font-bold text-slate-900">Prepared By:</span> {adminName || "Resort Administration"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right Document Metadata */}
                  <div className="text-right flex flex-col items-end">
                    <span className="inline-block px-3 py-1 bg-[#0B192C] text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xs shadow-xs">
                      Official Management Report
                    </span>
                    <p className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider mt-1.5">
                      Ref: PSR-RPT-{reportRefCode}
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 font-bold text-[10px] uppercase tracking-wider rounded-xs">
                      Classification: Management Audit
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">
                      {settings.address || "Brgy. Guba, Cebu City, Philippines"}
                    </p>
                  </div>
                </div>
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td className="p-0 border-none">
              {/* ========================================================
                  2. EXECUTIVE PERFORMANCE SUMMARY (Organized A, B, C)
                 ======================================================== */}
              <section className="mb-6 avoid-page-break">
                <div className="flex items-center justify-between border-b-2 border-slate-800 pb-1.5 mb-3.5">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-[#0B192C] inline-block"></span>
                    1. Executive Performance Summary
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">Audited Performance Figures</span>
                </div>

                {/* Sub-section A: Booking Performance (5 Cards) */}
                <div className="mb-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
                      A. Booking Performance
                    </h3>
                    <span className="text-[10px] text-slate-500">Guest reservation volume & fulfillment status</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {/* Total Bookings (Navy Blue) */}
                    <div className="p-2.5 border-2 border-blue-900/30 bg-blue-50/40 rounded-xs">
                      <span className="text-[10px] uppercase font-extrabold text-blue-900 block tracking-wider mb-0.5">
                        Total Bookings
                      </span>
                      <span className="text-xl font-black text-blue-950 font-mono block">
                        {stats.total}
                      </span>
                      <span className="text-[10px] text-blue-800 font-medium">All submissions</span>
                    </div>

                    {/* Confirmed Stays (Green) */}
                    <div className="p-2.5 border-2 border-emerald-400 bg-emerald-50/60 rounded-xs">
                      <span className="text-[10px] uppercase font-extrabold text-emerald-800 block tracking-wider mb-0.5">
                        Confirmed Stays
                      </span>
                      <span className="text-xl font-black text-emerald-900 font-mono block">
                        {stats.confirmed}
                      </span>
                      <span className="text-[10px] text-emerald-800 font-medium">Approved guests</span>
                    </div>

                    {/* Completed Stays (Teal) */}
                    <div className="p-2.5 border-2 border-teal-400 bg-teal-50/60 rounded-xs">
                      <span className="text-[10px] uppercase font-extrabold text-teal-800 block tracking-wider mb-0.5">
                        Completed Stays
                      </span>
                      <span className="text-xl font-black text-teal-900 font-mono block">
                        {stats.completed}
                      </span>
                      <span className="text-[10px] text-teal-800 font-medium">Concluded visits</span>
                    </div>

                    {/* Cancelled / Rejected (Red) */}
                    <div className="p-2.5 border-2 border-rose-400 bg-rose-50/60 rounded-xs">
                      <span className="text-[10px] uppercase font-extrabold text-rose-800 block tracking-wider mb-0.5">
                        Cancelled / Rejected
                      </span>
                      <span className="text-xl font-black text-rose-900 font-mono block">
                        {stats.cancelled}
                      </span>
                      <span className="text-[10px] text-rose-800 font-medium">Void / rejected</span>
                    </div>

                    {/* No-Show Guests (Dark Red) */}
                    <div className="p-2.5 border-2 border-red-400 bg-red-50/70 rounded-xs">
                      <span className="text-[10px] uppercase font-extrabold text-red-900 block tracking-wider mb-0.5">
                        No-Show Guests
                      </span>
                      <span className="text-xl font-black text-red-950 font-mono block">
                        {stats.noShow}
                      </span>
                      <span className="text-[10px] text-red-800 font-medium">Failed arrivals</span>
                    </div>
                  </div>
                </div>

                {/* Sub-section B: Payment and Verification (4 Cards) */}
                <div className="mb-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600 inline-block"></span>
                      B. Payment and Verification
                    </h3>
                    <span className="text-[10px] text-slate-500">Payment workflow & proof auditing status</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {/* Verified Payments (Green) */}
                    <div className="p-2.5 border-2 border-emerald-400 bg-emerald-50/50 rounded-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-extrabold text-emerald-800 block tracking-wider">
                          Verified Payments
                        </span>
                        <span className="text-base font-black text-emerald-900 font-mono">
                          {stats.verifiedPayments}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                        Remittances audited & confirmed
                      </span>
                    </div>

                    {/* Awaiting Verification (Amber/Orange) */}
                    <div className="p-2.5 border-2 border-amber-400 bg-amber-50/60 rounded-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-extrabold text-amber-800 block tracking-wider">
                          Awaiting Verification
                        </span>
                        <span className="text-base font-black text-amber-900 font-mono">
                          {stats.pendingPayments}
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-700 font-medium block mt-0.5">
                        Payment proofs awaiting staff review
                      </span>
                    </div>

                    {/* Pay at Resort / Front Desk (Blue) */}
                    <div className="p-2.5 border-2 border-blue-400 bg-blue-50/50 rounded-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-extrabold text-blue-800 block tracking-wider">
                          Pay at Resort
                        </span>
                        <span className="text-base font-black text-blue-900 font-mono">
                          {stats.resortCount}
                        </span>
                      </div>
                      <span className="text-[10px] text-blue-700 font-medium block mt-0.5">
                        Front desk on-site settlement
                      </span>
                    </div>

                    {/* Pending Reservations (Yellow/Amber) */}
                    <div className="p-2.5 border-2 border-yellow-400 bg-yellow-50/60 rounded-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-extrabold text-yellow-900 block tracking-wider">
                          Pending Reservations
                        </span>
                        <span className="text-base font-black text-yellow-950 font-mono">
                          {stats.pending}
                        </span>
                      </div>
                      <span className="text-[10px] text-yellow-800 font-medium block mt-0.5">
                        Bookings awaiting payment or confirmation
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sub-section C: Financial Performance (Banner + Metric) */}
                <div className="mb-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] inline-block"></span>
                      C. Financial Performance
                    </h3>
                    <span className="text-[10px] text-slate-500">Realized income aggregated for date range</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 p-3 bg-gradient-to-r from-slate-900 via-[#0B192C] to-slate-900 text-white rounded-xs border-2 border-[#D4AF37] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-extrabold text-amber-300 tracking-wider block">
                          Total Period Gross Revenue
                        </span>
                        <span className="text-[10px] text-slate-300">
                          Aggregated from confirmed and completed guest stays
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-[#D4AF37] font-mono tracking-tight">
                          {fmtCurrency(stats.revenue)}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-300 rounded-xs flex flex-col justify-center">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">
                        Average Value per Stay
                      </span>
                      <span className="text-base font-bold text-slate-900 font-mono mt-0.5">
                        {stats.confirmed + stats.completed > 0
                          ? fmtCurrency(stats.revenue / (stats.confirmed + stats.completed))
                          : "₱0.00"}
                      </span>
                      <span className="text-[10px] text-slate-500">Based on fulfilled bookings</span>
                    </div>
                  </div>
                </div>

                {/* Detailed KPI Breakdown Table */}
                <div className="border border-slate-300 rounded-xs overflow-hidden mb-2">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2 px-3 border-r border-slate-300">Key Performance Metric</th>
                        <th className="py-2 px-3 border-r border-slate-300 text-right">Value / Metric</th>
                        <th className="py-2 px-3 border-r border-slate-300 text-right">Share of Total</th>
                        <th className="py-2 px-3">Operational Summary & Business Definition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {/* Total Bookings */}
                      <tr className="bg-blue-50/20">
                        <td className="py-2 px-3 font-semibold text-blue-950 border-r border-slate-200 text-xs">
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-600 mr-1.5"></span>
                          Total Bookings & Reservations
                        </td>
                        <td className="py-2 px-3 text-right font-black text-blue-950 border-r border-slate-200 text-xs font-mono">
                          {stats.total}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs font-mono">
                          100.0%
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-xs">
                          All guest reservations recorded during the selected reporting period.
                        </td>
                      </tr>

                      {/* Confirmed Stays */}
                      <tr className="bg-emerald-50/30">
                        <td className="py-2 px-3 font-semibold text-emerald-900 border-r border-slate-200 text-xs">
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-600 mr-1.5"></span>
                          Confirmed Stays (Approved)
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-800 border-r border-slate-200 text-xs font-mono">
                          {stats.confirmed}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs font-mono">
                          {stats.total > 0 ? ((stats.confirmed / stats.total) * 100).toFixed(1) : "0.0"}%
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-xs">
                          Approved guest reservations with confirmed accommodation dates.
                        </td>
                      </tr>

                      {/* Completed Stays */}
                      <tr className="bg-teal-50/20">
                        <td className="py-2 px-3 font-semibold text-teal-900 border-r border-slate-200 text-xs">
                          <span className="inline-block w-2 h-2 rounded-full bg-teal-600 mr-1.5"></span>
                          Completed Stays
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-teal-800 border-r border-slate-200 text-xs font-mono">
                          {stats.completed}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs font-mono">
                          {stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : "0.0"}%
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-xs">
                          Concluded guest visits with completed check-out audits.
                        </td>
                      </tr>


                      {/* Awaiting Verification (Payment Proofs) */}
                      <tr className="bg-amber-50/30">
                        <td className="py-2 px-3 font-semibold text-amber-950 border-r border-slate-200 text-xs">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5"></span>
                          Awaiting Verification (Payment Proofs)
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-amber-800 border-r border-slate-200 text-xs font-mono">
                          {stats.pendingPayments}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs font-mono">
                          {stats.total > 0 ? ((stats.pendingPayments / stats.total) * 100).toFixed(1) : "0.0"}%
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-xs">
                          Payment proofs awaiting staff review and verification.
                        </td>
                      </tr>

                      {/* Cancelled / Rejected */}
                      <tr className="bg-rose-50/20">
                        <td className="py-2 px-3 font-semibold text-rose-950 border-r border-slate-200 text-xs">
                          <span className="inline-block w-2 h-2 rounded-full bg-rose-600 mr-1.5"></span>
                          Cancelled / Rejected Bookings
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-rose-800 border-r border-slate-200 text-xs font-mono">
                          {stats.cancelled}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs font-mono">
                          {stats.total > 0 ? ((stats.cancelled / stats.total) * 100).toFixed(1) : "0.0"}%
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-xs">
                          Cancelled reservations or rejected booking requests.
                        </td>
                      </tr>

                      {/* No-Show Guests */}
                      <tr className="bg-red-50/20">
                        <td className="py-2 px-3 font-semibold text-red-950 border-r border-slate-200 text-xs">
                          <span className="inline-block w-2 h-2 rounded-full bg-red-700 mr-1.5"></span>
                          No-Show Guests
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-red-900 border-r border-slate-200 text-xs font-mono">
                          {stats.noShow}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs font-mono">
                          {stats.total > 0 ? ((stats.noShow / stats.total) * 100).toFixed(1) : "0.0"}%
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-xs">
                          Guests who failed to arrive according to check-in policy hours.
                        </td>
                      </tr>

                      {/* Total Period Gross Revenue */}
                      <tr className="bg-[#0B192C] text-white font-bold border-t-2 border-[#D4AF37]">
                        <td className="py-2.5 px-3 border-r border-slate-700 uppercase tracking-wider text-xs text-amber-300">
                          Total Period Gross Revenue
                        </td>
                        <td className="py-2.5 px-3 text-right text-sm font-black text-[#D4AF37] border-r border-slate-700 font-mono">
                          {fmtCurrency(stats.revenue)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300 border-r border-slate-700 text-xs font-mono">
                          100.0%
                        </td>
                        <td className="py-2.5 px-3 text-slate-200 text-xs">
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
              <section className="mb-7">
                <div className="flex items-center justify-between border-b-2 border-slate-800 pb-1.5 mb-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-[#0B192C] inline-block"></span>
                    2. Detailed Reservation & Guest Audit Register
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">
                    {bookings.length} Record{bookings.length === 1 ? "" : "s"} In Period
                  </span>
                </div>

                <div className="border border-slate-300 rounded-xs overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2 px-2 text-center w-8 border-r border-slate-300">#</th>
                        <th className="py-2 px-2.5 border-r border-slate-300">Reference</th>
                        <th className="py-2 px-2.5 border-r border-slate-300">Guest & Contact</th>
                        <th className="py-2 px-2.5 border-r border-slate-300">Accommodation</th>
                        <th className="py-2 px-2.5 border-r border-slate-300">Stay Dates</th>
                        <th className="py-2 px-2 text-center border-r border-slate-300">Guests</th>
                        <th className="py-2 px-2.5 border-r border-slate-300">Payment & Status</th>
                        <th className="py-2 px-3 text-right">Amount (PHP)</th>
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

                          const isApproved = b.status === "approved";
                          const isCompleted = b.status === "completed";
                          const isPending = b.status === "pending";
                          const isCancelled = b.status === "cancelled" || b.status === "rejected";
                          const isNoShow = b.status === "no-show";

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
                                <div className="text-slate-500 text-[11px]">{b.guest_phone || b.guest_email || "—"}</div>
                              </td>
                              <td className="py-2 px-2.5 border-r border-slate-200">
                                <span className="font-semibold text-slate-800 block text-xs">
                                  {b.room?.name || "Unassigned"}
                                </span>
                                <span className="text-[10px] uppercase font-bold text-slate-500">
                                  {b.room?.type === "villa" ? "Function Hall" : b.room?.type || "Room"}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 border-r border-slate-200 whitespace-nowrap text-xs">
                                <div className="font-medium text-slate-800">{b.check_in}</div>
                                <div className="text-slate-500 text-[11px]">to {b.check_out}</div>
                              </td>
                              <td className="py-2 px-2 text-center font-semibold text-slate-700 border-r border-slate-200 text-xs">
                                {b.guests || 1}
                              </td>
                              <td className="py-2 px-2.5 border-r border-slate-200 text-xs">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider ${
                                      isApproved
                                        ? "bg-emerald-50 text-emerald-900 border border-emerald-400"
                                        : isCompleted
                                        ? "bg-teal-50 text-teal-900 border border-teal-400"
                                        : isPending
                                        ? "bg-amber-50 text-amber-900 border border-amber-400"
                                        : isNoShow
                                        ? "bg-red-50 text-red-950 border border-red-500"
                                        : "bg-rose-50 text-rose-900 border border-rose-400"
                                    }`}
                                  >
                                    {statusFormatted}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-600 flex items-center gap-1">
                                  <span>{method}</span>
                                  <span>•</span>
                                  <span
                                    className={`uppercase font-bold text-[10px] ${
                                      p?.status === "verified"
                                        ? "text-emerald-700"
                                        : p?.status === "pending"
                                        ? "text-amber-700"
                                        : "text-slate-500"
                                    }`}
                                  >
                                    {p?.status === "verified"
                                      ? "Paid / Verified"
                                      : p?.status === "pending"
                                      ? "Awaiting Verification"
                                      : p?.status || "Unpaid"}
                                  </span>
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
                        <td colSpan={5} className="py-2.5 px-3 text-left uppercase tracking-wider text-[11px]">
                          Summary: {bookings.length} reservations ({stats.confirmed + stats.completed} confirmed/completed stays)
                        </td>
                        <td colSpan={2} className="py-2.5 px-3 text-right text-slate-800 text-xs font-bold">
                          Realized Revenue (Confirmed Stays):
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sm font-black text-slate-900 whitespace-nowrap">
                          {fmtCurrency(stats.revenue)}
                        </td>
                      </tr>
                      {totalListedAmount !== stats.revenue && (
                        <tr className="bg-slate-50 text-xs text-slate-600 border-t border-slate-300">
                          <td colSpan={5} className="py-1 px-3 text-left italic text-[11px]">
                            * Total gross value of all listed bookings including pending/cancelled:
                          </td>
                          <td colSpan={3} className="py-1 px-3 text-right font-mono font-semibold text-xs">
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
              <section className="mb-7 avoid-page-break">
                <div className="flex items-center justify-between border-b-2 border-slate-800 pb-1.5 mb-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-[#0B192C] inline-block"></span>
                    3. Accommodation Performance & Inventory Yield
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">Room & Cottage Utilization</span>
                </div>

                <div className="border border-slate-300 rounded-xs overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[11px]">
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
                              <td className="py-2 px-3 uppercase text-[11px] font-bold text-slate-500 border-r border-slate-200">
                                {r.type === "villa" ? "Function Hall" : r.type}
                              </td>
                              <td className="py-2 px-3 text-center font-bold text-slate-800 border-r border-slate-200 text-xs">
                                {r.timesBooked}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200 text-xs font-mono">
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
                <section className="mb-7 avoid-page-break">
                  <div className="flex items-center justify-between border-b-2 border-slate-800 pb-1.5 mb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-[#0B192C] inline-block"></span>
                      4. Cancellation & Booking Attrition Analysis
                    </h2>
                    <span className="text-xs text-rose-700 font-bold">
                      {stats.cancelled} Total Cancellation{stats.cancelled === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="border border-slate-300 rounded-xs overflow-hidden">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[11px]">
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
                <section className="mb-7 avoid-page-break">
                  <div className="flex items-center justify-between border-b-2 border-slate-800 pb-1.5 mb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-[#0B192C] inline-block"></span>
                      5. Top Guest Accounts by Value
                    </h2>
                    <span className="text-xs text-slate-500 font-medium">Guest Loyalty & Retention</span>
                  </div>

                  <div className="border border-slate-300 rounded-xs overflow-hidden">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase tracking-wider text-[11px]">
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
                            <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200 text-xs">
                              {c.name}
                            </td>
                            <td className="py-2 px-3 text-slate-600 border-r border-slate-200 font-mono text-[11px]">
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
              <section className="pt-5 border-t border-slate-300 avoid-page-break">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-5">
                  6. Administrative Verification & Sign-Off
                </h3>

                <div className="grid grid-cols-2 gap-10 text-xs">
                  <div>
                    <p className="text-[11px] uppercase font-bold text-slate-500 mb-7">
                      Prepared & Certified By:
                    </p>
                    <div className="border-b border-slate-800 pb-1 w-60 mb-1">
                      <span className="font-bold text-slate-900 text-xs">{adminName || "Resort Administration"}</span>
                    </div>
                    <p className="text-xs text-slate-600">Operations & Financial Administrator</p>
                    <p className="text-[11px] text-slate-400 mt-1">Date: {format(new Date(), "MMMM dd, yyyy")}</p>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase font-bold text-slate-500 mb-7">
                      Approved & Acknowledged By:
                    </p>
                    <div className="border-b border-slate-800 pb-1 w-60 mb-1">
                      <span className="font-bold text-slate-400 italic text-xs">Signature over printed name</span>
                    </div>
                    <p className="text-xs text-slate-600">Executive Management / Resort Auditor</p>
                    <p className="text-[11px] text-slate-400 mt-1">Date: ________________________</p>
                  </div>
                </div>

                {/* Confidentiality Notice */}
                <div className="mt-7 pt-3 border-t border-slate-200 text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    CONFIDENTIALITY NOTICE: This document contains proprietary operational and financial intelligence of Punong Spring Resort.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Strictly for internal resort management, auditing, and official recordkeeping. Unauthorized reproduction is strictly prohibited.
                  </p>
                </div>
              </section>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
