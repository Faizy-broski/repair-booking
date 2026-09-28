"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Every lead-gen form on the marketing site (contact us, book a demo,
 * enterprise enquiry, newsletter) renders through this one component and
 * posts to POST /api/public/leads. That endpoint writes a `leads` row the
 * super admin can see, filter, and action at /superadmin/leads — this is the
 * single place a new marketing form needs to plug into for that to happen.
 */

export type LeadSource = "contact_us" | "demo_request" | "enterprise_contact" | "newsletter";
type LeadField = "name" | "email" | "phone" | "company" | "message";

interface LeadFormProps {
  source: LeadSource;
  fields?: LeadField[];
  submitLabel?: string;
  successMessage?: string;
  className?: string;
  onSuccess?: () => void;
}

const DEFAULT_FIELDS: Record<LeadSource, LeadField[]> = {
  contact_us: ["name", "email", "phone", "message"],
  demo_request: ["name", "email", "company", "phone"],
  enterprise_contact: ["name", "email", "company", "phone", "message"],
  newsletter: ["email"],
};

export function LeadForm({
  source,
  fields,
  submitLabel = "Submit",
  successMessage = "Thanks — we'll be in touch shortly.",
  className,
  onSuccess,
}: LeadFormProps) {
  const activeFields = fields ?? DEFAULT_FIELDS[source];
  const [values, setValues] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function set(field: keyof typeof values, v: string) {
    setValues((prev) => ({ ...prev, [field]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          name: activeFields.includes("name") ? values.name : "Newsletter subscriber",
          email: values.email,
          phone: activeFields.includes("phone") ? values.phone || undefined : undefined,
          company: activeFields.includes("company") ? values.company || undefined : undefined,
          message: activeFields.includes("message") ? values.message || undefined : undefined,
          page_url: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Please try again.");
      setDone(true);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className={className}>
        <div className="flex items-center gap-3 rounded-xl border border-teal-100 bg-teal-50 px-4 py-4 text-teal-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{successMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className ?? ""}`}>
      {activeFields.includes("name") && (
        <Input
          label="Full name"
          required
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Jane Doe"
        />
      )}
      {activeFields.includes("email") && (
        <Input
          label="Email"
          type="email"
          required
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="jane@yourshop.com"
        />
      )}
      {activeFields.includes("phone") && (
        <Input
          label="Phone"
          type="tel"
          value={values.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="+44 7700 900000"
        />
      )}
      {activeFields.includes("company") && (
        <Input
          label="Business name"
          value={values.company}
          onChange={(e) => set("company", e.target.value)}
          placeholder="Your shop"
        />
      )}
      {activeFields.includes("message") && (
        <div className="w-full">
          <label className="mb-1 block text-sm font-medium text-on-surface-variant">Message</label>
          <textarea
            rows={4}
            value={values.message}
            onChange={(e) => set("message", e.target.value)}
            placeholder="How can we help?"
            className="w-full rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
          />
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <Button type="submit" disabled={submitting} className="w-full justify-center">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}
