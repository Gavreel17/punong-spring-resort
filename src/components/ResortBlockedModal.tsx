import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, CalendarX } from "lucide-react";

export interface ResortBlockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  onChooseAnotherDate?: () => void;
}

export function formatBlockDateRange(startDateStr?: string | null, endDateStr?: string | null): string {
  if (!startDateStr) return "Unavailable Dates";
  const start = new Date(startDateStr + "T00:00:00");
  const end = endDateStr ? new Date(endDateStr + "T00:00:00") : start;

  if (isNaN(start.getTime())) return `${startDateStr} – ${endDateStr || startDateStr}`;

  const startMonth = start.toLocaleDateString("en-US", { month: "long" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long" });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  if (startDateStr === endDateStr) {
    return `${startMonth} ${startDay}, ${startYear}`;
  }
  if (startYear === endYear && startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${startYear}`;
  }
  if (startYear === endYear) {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${startYear}`;
  }
  return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
}

export function ResortBlockedModal({
  isOpen,
  onClose,
  reason,
  startDate,
  endDate,
  onChooseAnotherDate,
}: ResortBlockedModalProps) {
  const displayReason = reason && reason.trim() ? reason.trim() : "The resort is temporarily unavailable for the selected dates.";
  const formattedDates = formatBlockDateRange(startDate, endDate);

  const handleAction = () => {
    if (onChooseAnotherDate) {
      onChooseAnotherDate();
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl p-6 border-red-200 dark:border-red-900 bg-white dark:bg-[#151F2E] shadow-2xl">
        <DialogHeader className="text-center sm:text-center pb-2">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 ring-8 ring-red-50 dark:ring-red-950/30">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl font-extrabold uppercase tracking-tight text-red-600 dark:text-red-400">
            Resort Temporarily Unavailable
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            The resort is currently unavailable for reservations during the selected dates.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 p-4 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 space-y-2.5 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">Reason:</span>
            <span className="font-extrabold text-red-700 dark:text-red-300 text-right break-words">
              {displayReason}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3 border-t border-red-200/60 dark:border-red-900/40 pt-2.5">
            <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">Blocked Dates:</span>
            <span className="font-extrabold text-slate-900 dark:text-white text-right">
              {formattedDates}
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mb-4">
          Please select another available date.
        </p>

        <DialogFooter className="sm:justify-center">
          <Button
            type="button"
            onClick={handleAction}
            className="w-full sm:w-auto px-8 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl h-11 flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            <CalendarX className="w-4 h-4" /> Choose Another Date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
