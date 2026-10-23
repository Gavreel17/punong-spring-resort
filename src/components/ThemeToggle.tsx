import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Hook to manage customer theme preference independently from admin theme.
 */
export function useCustomerTheme() {
  const [theme, setThemeState] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("punong-customer-theme");
    if (saved === "dark" || saved === "light") {
      setThemeState(saved);
    } else {
      // Default for customer experience is light mode
      setThemeState("light");
    }

    const handleThemeChange = () => {
      const current = localStorage.getItem("punong-customer-theme");
      if (current === "dark" || current === "light") {
        setThemeState(current);
      }
    };

    window.addEventListener("customer-theme-changed", handleThemeChange);
    window.addEventListener("storage", handleThemeChange);
    return () => {
      window.removeEventListener("customer-theme-changed", handleThemeChange);
      window.removeEventListener("storage", handleThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setThemeState(nextTheme);
    localStorage.setItem("punong-customer-theme", nextTheme);

    // Only apply class directly if currently viewing customer pages
    if (!window.location.pathname.startsWith("/admin")) {
      const root = document.documentElement;
      if (nextTheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    window.dispatchEvent(new Event("customer-theme-changed"));
  };

  const setTheme = (newTheme: "light" | "dark") => {
    setThemeState(newTheme);
    localStorage.setItem("punong-customer-theme", newTheme);

    if (!window.location.pathname.startsWith("/admin")) {
      const root = document.documentElement;
      if (newTheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    window.dispatchEvent(new Event("customer-theme-changed"));
  };

  return {
    theme,
    toggleTheme,
    setTheme,
    isDark: theme === "dark",
    mounted,
  };
}

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const { isDark, toggleTheme, mounted } = useCustomerTheme();

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("w-9 h-9 rounded-xl opacity-0", className)}
        aria-hidden="true"
      >
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size={showLabel ? "sm" : "icon"}
      onClick={toggleTheme}
      className={cn(
        "relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-300 shadow-xs cursor-pointer",
        showLabel ? "h-10 px-3 flex items-center gap-2" : "w-9 h-9 flex items-center justify-center",
        className
      )}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      <div className="relative w-4 h-4 flex items-center justify-center">
        <Sun
          className={cn(
            "h-4 w-4 text-amber-500 transition-all duration-300 absolute",
            isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          )}
        />
        <Moon
          className={cn(
            "h-4 w-4 text-sky-400 transition-all duration-300 absolute",
            isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          )}
        />
      </div>

      {showLabel && (
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
      )}
      <span className="sr-only">{isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
    </Button>
  );
}
