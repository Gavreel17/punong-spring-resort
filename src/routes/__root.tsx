import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useAutoBookingStatus } from "@/hooks/use-auto-booking-status";
import { useSystemSettings } from "@/hooks/use-system-settings";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: any; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    console.error("Root Error Boundary caught:", error);
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-lg w-full text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-xl space-y-4">
        <h1 className="text-xl font-bold font-display text-slate-900">This page didn't load</h1>
        <p className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-200 font-mono text-left break-words overflow-x-auto">
          {error?.message || "An unexpected error occurred."}
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 shadow-md cursor-pointer"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Punong Spring Resort — Relax, Reserve, and Enjoy Your Stay" },
      {
        name: "description",
        content:
          "Beachfront resort in BUBURAY, DIMATALING, ZAMBOANGA DEL SUR. Book rooms, cottages and function halls online.",
      },
      { property: "og:title", content: "Punong Spring Resort" },
      { property: "og:description", content: "Tropical paradise reservations made simple." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var isAdmin = window.location.pathname.indexOf('/admin') === 0;
                  var isDark = false;
                  if (isAdmin) {
                    var adminTheme = localStorage.getItem('punong-admin-theme');
                    if (!adminTheme) {
                      var cached = localStorage.getItem('punong-system-settings');
                      if (cached) {
                        var parsed = JSON.parse(cached);
                        if (parsed && parsed.theme) adminTheme = parsed.theme;
                      }
                    }
                    if (adminTheme === 'dark') {
                      isDark = true;
                    } else if (adminTheme === 'light') {
                      isDark = false;
                    } else {
                      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    }
                  } else {
                    var customerTheme = localStorage.getItem('punong-customer-theme');
                    isDark = customerTheme === 'dark';
                  }

                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function GlobalThemeSync() {
  const { settings } = useSystemSettings();
  const location = useLocation();

  useEffect(() => {
    function applyAdminTheme(themeValue: string) {
      const root = document.documentElement;
      let shouldBeDark = false;
      if (themeValue === "dark") {
        shouldBeDark = true;
      } else if (themeValue === "light") {
        shouldBeDark = false;
      } else {
        shouldBeDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      }

      if (shouldBeDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    function applyCustomerTheme(themeValue: string) {
      const root = document.documentElement;
      if (themeValue === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    function syncTheme() {
      if (location.pathname.startsWith("/admin")) {
        const adminTheme =
          localStorage.getItem("punong-admin-theme") || settings.theme || "system";
        applyAdminTheme(adminTheme);
      } else {
        const customerTheme =
          localStorage.getItem("punong-customer-theme") || "light";
        applyCustomerTheme(customerTheme);
      }
    }

    // Run theme sync on current route
    syncTheme();

    const handleCustomerChange = () => {
      if (!location.pathname.startsWith("/admin")) {
        const customerTheme =
          localStorage.getItem("punong-customer-theme") || "light";
        applyCustomerTheme(customerTheme);
      }
    };

    const handleAdminChange = () => {
      if (location.pathname.startsWith("/admin")) {
        const adminTheme =
          localStorage.getItem("punong-admin-theme") || settings.theme || "system";
        applyAdminTheme(adminTheme);
      }
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (location.pathname.startsWith("/admin")) {
        const adminTheme =
          localStorage.getItem("punong-admin-theme") || settings.theme || "system";
        if (adminTheme === "system") {
          applyAdminTheme("system");
        }
      }
    };

    window.addEventListener("customer-theme-changed", handleCustomerChange);
    window.addEventListener("admin-theme-changed", handleAdminChange);
    window.addEventListener("storage", syncTheme);
    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      window.removeEventListener("customer-theme-changed", handleCustomerChange);
      window.removeEventListener("admin-theme-changed", handleAdminChange);
      window.removeEventListener("storage", syncTheme);
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, [location.pathname, settings.theme]);

  return null;
}

function AutoStatusWatcher() {
  useAutoBookingStatus();
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GlobalThemeSync />
        <AutoStatusWatcher />
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
