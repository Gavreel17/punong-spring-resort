import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MapPin, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSystemSettings } from "@/hooks/use-system-settings";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Punong Spring Resort" },
      { name: "description", content: "Get in touch with Punong Spring Resort." },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { user } = useAuth();
  const { settings } = useSystemSettings();
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill with customer profile details if logged in
  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("fullname, email")
        .eq("id", user.id)
        .single()
        .then(({ data }: { data: { fullname?: string | null; email?: string | null } | null }) => {
          if (data) {
            setForm((prev) => ({
              ...prev,
              name: prev.name || data.fullname || "",
              email: prev.email || data.email || user.email || "",
            }));
          }
        });
    }
  }, [user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = form.name.trim();
    const trimmedEmail = form.email.trim().toLowerCase();
    const trimmedMessage = form.message.trim();

    if (!trimmedName) {
      return toast.error("Please enter your name.");
    }
    if (!trimmedEmail) {
      return toast.error("Please enter your email address.");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return toast.error("Please provide a valid email address.");
    }
    if (!trimmedMessage) {
      return toast.error("Please enter your message.");
    }

    setSubmitting(true);

    try {
      const inquiryId = crypto.randomUUID();

      const { error: inqError } = await supabase
        .from("inquiries")
        .insert({
          id: inquiryId,
          customer_id: user?.id || null,
          name: trimmedName,
          email: trimmedEmail,
          message: trimmedMessage,
          status: "waiting_reply",
        });

      if (inqError) {
        console.error("Inquiry insertion error:", inqError);
        throw new Error(inqError.message);
      }

      await supabase.from("inquiry_messages").insert({
        inquiry_id: inquiryId,
        sender_id: user?.id || null,
        sender_role: "customer",
        message: trimmedMessage,
        read_at: new Date().toISOString(),
      });

      toast.success("Your message has been sent successfully. The resort will get back to you soon.");
      setForm((prev) => ({
        name: user ? prev.name : "",
        email: user ? prev.email : "",
        message: "",
      }));
    } catch (err: any) {
      toast.error(err.message || "Failed to send message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <section className="bg-[image:var(--gradient-hero)] py-16 text-white">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold">Contact Us</h1>
          <p className="mt-3 text-white/90">We'd love to hear from you</p>
        </div>
      </section>
      <section className="container mx-auto grid max-w-5xl gap-8 px-4 py-16 md:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-1 h-5 w-5 text-accent shrink-0" />
            <div>
              <p className="font-semibold">Address</p>
              <p className="text-sm text-muted-foreground">
                {settings.address}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="mt-1 h-5 w-5 text-accent shrink-0" />
            <div>
              <p className="font-semibold">Phone</p>
              <p className="text-sm text-muted-foreground">
                <a href={`tel:${settings.contact_number}`} className="hover:underline">
                  {settings.contact_number}
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="mt-1 h-5 w-5 text-accent shrink-0" />
            <div>
              <p className="font-semibold">Email</p>
              <p className="text-sm text-muted-foreground">
                <a href={`mailto:${settings.contact_email}`} className="hover:underline">
                  {settings.contact_email}
                </a>
              </p>
            </div>
          </div>
        </div>
        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                rows={5}
                required
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending Message...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Message
                </>
              )}
            </Button>
          </form>
        </Card>
      </section>
      <Footer />
    </div>
  );
}
