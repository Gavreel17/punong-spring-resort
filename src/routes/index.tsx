import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Waves, MapPin, Star, Bike, Sailboat } from "lucide-react";
import hero from "@/assets/hero-resort.jpg";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSettings } from "@/hooks/use-system-settings";
import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery3 from "@/assets/gallery-3.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Punong Spring Resort — Relax, Reserve, and Enjoy Your Stay" },
      {
        name: "description",
        content:
          "Book your tropical getaway at Punong Spring Resort. Beachfront rooms, cottages and function halls.",
      },
      { property: "og:title", content: "Punong Spring Resort" },
      {
        property: "og:description",
        content: "Beachfront paradise. Book rooms, cottages and function halls online.",
      },
    ],
  }),
  component: Index,
});

const amenities = [
  { icon: Waves, title: "Infinity Pool", desc: "Ocean-view pool open from dawn to dusk." },
  { icon: Bike, title: "ATV", desc: "Explore the rugged terrain with our ATV rentals." },
  { icon: Sailboat, title: "Kayak", desc: "Paddle through crystal clear waters." },
];

function Index() {
  const { settings } = useSystemSettings();

  const { data: feedbacks = [] } = useQuery({
    queryKey: ["approved-feedbacks"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("get_approved_feedbacks" as any);
        if (!error && data) return data;
      } catch (e) {
        console.warn("RPC get_approved_feedbacks unavailable, using table query fallback:", e);
      }

      const { data: feedbackRows, error } = await supabase
        .from("feedbacks")
        .select("*")
        .eq("is_approved", true)
        .order("created_at", { ascending: false });

      if (error || !feedbackRows) return [];
      return feedbackRows.map((f: any) => ({
        ...f,
        guest_name: f.guest_name || "Verified Guest",
      }));
    },
  });

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative h-[88vh] min-h-[600px] w-full overflow-hidden">
        <img
          src="/hero-bg.jpg"
          alt={`${settings.resort_name} view`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/60" />
        <div className="relative z-10 mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-4 text-center text-white">
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-white/80">
            {settings.address}
          </p>
          <h1 className="font-display text-5xl font-bold leading-tight md:text-7xl">
            {settings.resort_name}
          </h1>
          <p className="mt-4 text-lg italic text-white/90 md:text-2xl">
            Relax, Reserve, and Enjoy Your Stay
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-elegant"
            >
              <Link to="/rooms">Book Now</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/60 bg-white/10 text-white backdrop-blur hover:bg-white/20"
            >
              <Link to="/about">Explore Resort</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Amenities */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-sm uppercase tracking-widest text-accent">Featured Amenities</p>
            <h2 className="mt-2 text-4xl font-bold">Everything you need to unwind</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {amenities.map((a) => (
              <Card
                key={a.title}
                className="group border-border/60 p-6 transition-all hover:-translate-y-1 hover:shadow-elegant"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                  <a.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{a.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{a.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="bg-secondary/40 py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-sm uppercase tracking-widest text-accent">Gallery</p>
            <h2 className="mt-2 text-4xl font-bold">A glimpse of paradise</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { src: gallery1, alt: "Resort swimming pool" },
              { src: gallery2, alt: "Resort cottages" },
              { src: gallery3, alt: "Poolside view" },
            ].map((g) => (
              <div key={g.alt} className="group relative aspect-square overflow-hidden rounded-2xl">
                <img
                  src={g.src}
                  alt={g.alt}
                  loading="lazy"
                  width={1024}
                  height={1024}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-sm uppercase tracking-widest text-accent">Guest Stories</p>
            <h2 className="mt-2 text-4xl font-bold">Loved by our guests</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {feedbacks.length === 0 ? (
              <p className="text-center text-muted-foreground col-span-3">No guest stories yet.</p>
            ) : (
              feedbacks.map((t: any) => (
                <Card key={t.id} className="border-border/60 p-6">
                  <div className="mb-3 flex gap-1 text-accent">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  {t.comment && <p className="text-foreground/90">"{t.comment}"</p>}
                  <p className="mt-4 text-sm font-semibold">
                    — {t.resolved_name || t.guest_name || t.booking?.guest_name || "Verified Guest"}
                  </p>
                </Card>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Contact / Location */}
      <section className="bg-[image:var(--gradient-hero)] py-20 text-white">
        <div className="container mx-auto grid gap-12 px-4 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-4xl font-bold">Find your way to us</h2>
            <p className="mt-4 text-white/90">
              Tucked between palm groves and serene natural landscapes at {settings.address}.
            </p>
            <div className="mt-6 space-y-3 text-white/90">
              <p className="flex items-center gap-3">
                <MapPin className="h-5 w-5 shrink-0 text-accent" /> {settings.address}
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="mt-8 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link to="/rooms">Reserve Your Stay</Link>
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl shadow-elegant">
            <iframe
              title="Location map"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(settings.address)}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
              className="h-80 w-full border-0"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
