import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/cancellations")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      window.location.replace("/admin/bookings?status=cancelled");
    }
    throw redirect({
      to: "/admin/bookings",
    });
  },
  component: () => null,
});
