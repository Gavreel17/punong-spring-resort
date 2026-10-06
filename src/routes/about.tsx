import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ShowerHead,
  Shirt,
  Users,
  AlertTriangle,
  ShieldAlert,
  UtensilsCrossed,
  Lock,
  Quote,
  Sparkles,
} from "lucide-react";

import { useSystemSettings } from "@/hooks/use-system-settings";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Punong Spring Resort" },
      { name: "description", content: "About Punong Spring Resort, our story, and resort rules." },
    ],
  }),
  component: About,
});

const resortRules = [
  {
    icon: ShowerHead,
    title: "Shower Before Entering",
    desc: "Please rinse off and shower before entering the swimming pool.",
    badge: "Hygiene",
  },
  {
    icon: Shirt,
    title: "Proper Swimming Attire",
    desc: "Wear proper swimming attire. Jeans, maong shorts, and shorts with pockets and zippers are not allowed.",
    badge: "Dress Code",
  },
  {
    icon: Users,
    title: "Child Supervision",
    desc: "Children must always be accompanied and supervised by a responsible adult.",
    badge: "Safety",
  },
  {
    icon: AlertTriangle,
    title: "Caution & No Rough Play",
    desc: "Be careful. No running, diving, and rough play. The floor is slippery when wet.",
    badge: "Pool Area",
  },
  {
    icon: ShieldAlert,
    title: "Safety Disclaimer",
    desc: "Management shall not be responsible for any injury or accident within the premises.",
    badge: "Notice",
  },
  {
    icon: UtensilsCrossed,
    title: "No Food & Drinks in Pool",
    desc: "Food and drinks are strictly not allowed in the pool area.",
    badge: "Cleanliness",
  },
  {
    icon: Lock,
    title: "Secure Your Valuables",
    desc: "Do not leave your valuables unattended. Management shall not be responsible for any personal belongings lost or left behind.",
    badge: "Security",
  },
];

function About() {
  const { settings } = useSystemSettings();

  return (
    <div className="min-h-screen">
      <Navbar />
      
      {/* Hero Section */}
      <section className="bg-[image:var(--gradient-hero)] py-16 text-white">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold">About {settings.resort_name}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-white/90">
            A tropical sanctuary where Filipino hospitality meets timeless luxury.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
        {/* Our Story */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-widest text-accent font-semibold">Welcome to Our Sanctuary</p>
          <h2 className="text-3xl font-bold md:text-4xl">Our Story</h2>
          <p className="text-muted-foreground leading-relaxed text-base">
            Founded in the heart of {settings.address}, {settings.resort_name} began as a small family beach house and has grown into a tranquil retreat for travelers from around the world. We blend handcrafted Filipino architecture with modern comforts to give every guest a stay to remember.
          </p>
        </div>

        {/* Resort Rules and Regulations */}
        <div className="space-y-6">
          <div className="border-b border-border/60 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <p className="text-xs uppercase tracking-widest text-accent font-semibold">Resort Guidelines</p>
            </div>
            <h2 className="mt-1 text-3xl font-bold md:text-4xl">Rules and Regulations</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              For your safety and comfort, all guests are kindly requested to observe our resort policies during their stay.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {resortRules.map((rule, idx) => {
              const Icon = rule.icon;
              return (
                <Card
                  key={idx}
                  className="group relative border-border/70 p-5 transition-all hover:border-accent/60 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-foreground text-sm">{rule.title}</h3>
                        <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          {rule.badge}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {rule.desc}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Inspirational Banner from signage */}
          <div className="mt-6 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/5 via-accent/10 to-accent/5 p-6 text-center sm:p-8">
            <Quote className="mx-auto h-7 w-7 text-accent mb-3 opacity-80" />
            <p className="font-serif italic text-foreground text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              "Don't let anyone look down on you because you are young, but set an example for the believers in speech, in conduct, in love, in faith."
            </p>
            <p className="mt-3 text-xs font-bold tracking-widest uppercase text-accent">
              1 Timothy 4:12
            </p>
          </div>
        </div>

        {/* Frequently Asked Questions */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-widest text-accent font-semibold">Help & Answers</p>
          <h2 className="text-3xl font-bold md:text-4xl">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="mt-4">
            <AccordionItem value="1">
              <AccordionTrigger>What time is check-in and check-out?</AccordionTrigger>
              <AccordionContent>
                Check-in for overnight rooms and cottages starts at 2:00 PM, and check-out is by 12:00 PM (noon). Day-use cottages are available from 8:00 AM to 6:00 PM.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="2">
              <AccordionTrigger>What is your cancellation policy?</AccordionTrigger>
              <AccordionContent>
                Reservations may be cancelled directly through your customer dashboard up to 5 hours before scheduled check-in. Failure to arrive within 5 hours of your scheduled check-in time without prior cancellation will automatically result in the reservation being marked as a No-Show, and the accommodation will automatically be made available for other guests.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      <Footer />
    </div>
  );
}
