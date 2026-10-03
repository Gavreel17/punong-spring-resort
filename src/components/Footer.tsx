import { Palmtree, MapPin, Phone, Mail, Clock } from "lucide-react";
import { useSystemSettings } from "@/hooks/use-system-settings";

export function Footer() {
  const { settings } = useSystemSettings();

  return (
    <footer className="border-t border-border bg-secondary/40">
      <div className="container mx-auto grid gap-8 px-4 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-bold text-primary">
            <Palmtree className="h-5 w-5 text-accent shrink-0" />
            <span className="truncate">{settings.resort_name}</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Relax, Reserve, and Enjoy Your Stay in tropical paradise.
          </p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Visit Us</h4>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{settings.address}</span>
          </p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Contact</h4>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4 shrink-0 text-accent" />
            <a href={`tel:${settings.contact_number}`} className="hover:underline">
              {settings.contact_number}
            </a>
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4 shrink-0 text-accent" />
            <a href={`mailto:${settings.contact_email}`} className="hover:underline truncate">
              {settings.contact_email}
            </a>
          </p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Hours</h4>
          <p className="flex items-start gap-2 text-sm text-muted-foreground mb-1">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{settings.business_hours}</span>
          </p>
          <p className="text-sm text-muted-foreground pl-6">Check-in: 2:00 PM</p>
          <p className="text-sm text-muted-foreground pl-6">Check-out: 12:00 PM</p>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {settings.resort_name}. All rights reserved.
      </div>
    </footer>
  );
}
