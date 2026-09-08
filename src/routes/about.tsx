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

import { useSystemSettings } from "@/hooks/use-system-settings";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Punong Spring Resort" },
      { name: "description", content: "About Punong Spring Resort and our story." },
    ],
  }),
  component: About,
});

function About() {
  const { settings } = useSystemSettings();

  return (
    <div className="min-h-screen">
      <Navbar />
      <section className="bg-[image:var(--gradient-hero)] py-16 text-white">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold">About {settings.resort_name}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-white/90">
            A tropical sanctuary where Filipino hospitality meets timeless luxury.
          </p>
        </div>
      </section>
      <section className="container mx-auto max-w-3xl space-y-12 px-4 py-16">
        <div>
          <h2 className="text-3xl font-bold">Our Story</h2>
          <p className="mt-4 text-muted-foreground">
            Founded in the heart of {settings.address}, {settings.resort_name} began as a small family beach house and has grown into a tranquil retreat for travelers from around the world. We blend handcrafted Filipino architecture with modern comforts to give every guest a stay to remember.
          </p>
        </div>
        <div>
          <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="mt-4">
            <AccordionItem value="1">
              <AccordionTrigger>What time is check-in and check-out?</AccordionTrigger>
              <AccordionContent>
                Check-in starts at 2:00 PM and check-out is by 12:00 PM.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="2">
              <AccordionTrigger>Do you offer airport transfers?</AccordionTrigger>
              <AccordionContent>
                Yes, complimentary transfers are available for all confirmed bookings.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="3">
              <AccordionTrigger>Is breakfast included?</AccordionTrigger>
              <AccordionContent>
                Daily buffet breakfast is included with every stay.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="4">
              <AccordionTrigger>What is your cancellation policy?</AccordionTrigger>
              <AccordionContent>
                Free cancellation up to 7 days before your check-in date.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>
      <Footer />
    </div>
  );
}
