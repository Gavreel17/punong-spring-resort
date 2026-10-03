import { Link, useNavigate } from "@tanstack/react-router";
import { Palmtree, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useSystemSettings } from "@/hooks/use-system-settings";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, role, signOut } = useAuth();
  const { settings } = useSystemSettings();
  const navigate = useNavigate();

  const links = [
    { to: "/", label: "Home" },
    { to: "/rooms", label: "Rooms & Cottages" },
    { to: "/about", label: "About" },
    { to: "/contact", label: "Contact" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-3 sm:px-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-base sm:text-xl font-bold text-primary truncate"
        >
          <Palmtree className="h-5 w-5 sm:h-6 sm:w-6 text-accent shrink-0" />
          <span className="truncate">{settings.resort_name}</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
              activeProps={{ className: "text-primary" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
                My Bookings
              </Button>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/auth" })}>
                Sign in
              </Button>
              <Button
                size="sm"
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => navigate({ to: "/rooms" })}
              >
                Book Now
              </Button>
            </>
          )}
        </div>

        <button 
          className="flex items-center justify-center h-10 w-10 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none md:hidden" 
          onClick={() => setOpen(!open)} 
          aria-label="Toggle navigation menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background shadow-lg md:hidden animate-in slide-in-from-top-2 duration-200">
          <div className="container mx-auto flex flex-col gap-1 px-4 py-4 max-h-[calc(100vh-4rem)] overflow-y-auto">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="py-3 px-3 text-base font-semibold rounded-lg hover:bg-slate-100 text-slate-800 transition-colors"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 pt-3 border-t border-slate-100 mt-2">
              {user ? (
                <>
                  <Button
                    variant="outline"
                    className="w-full h-11 text-base font-medium justify-center"
                    onClick={() => {
                      navigate({ to: "/dashboard" });
                      setOpen(false);
                    }}
                  >
                    My Bookings
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full h-11 text-base text-red-600 hover:bg-red-50 justify-center"
                    onClick={() => {
                      signOut();
                      setOpen(false);
                    }}
                  >
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="w-full h-11 text-base font-medium justify-center"
                    onClick={() => {
                      navigate({ to: "/auth" });
                      setOpen(false);
                    }}
                  >
                    Sign in
                  </Button>
                  <Button
                    className="w-full h-11 text-base font-semibold bg-accent text-accent-foreground hover:bg-accent/90 justify-center shadow-sm"
                    onClick={() => {
                      navigate({ to: "/rooms" });
                      setOpen(false);
                    }}
                  >
                    Book Now
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
