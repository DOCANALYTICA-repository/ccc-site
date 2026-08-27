import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import type { NetworkProfile } from "@/lib/types";

const empty: Omit<NetworkProfile, "userId"> = {
  displayName: "", organization: "", designation: "", headline: "", bio: "",
  publicEmail: "", linkedInUrl: "", discoverable: false,
  shareDesignation: false, shareHeadline: false, shareBio: false, shareEmail: false, shareLinkedIn: false,
};

export function ProfilePage() {
  const { push } = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ profile: NetworkProfile | null }>("/network/profile").then(({ profile }) => {
      if (profile) setForm({ ...empty, ...profile });
    });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/network/profile", form);
      push("Profile saved.", "success");
    } finally { setSaving(false); }
  }

  const field = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Your profile</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Control what your network sees</h1></header>
      <Card className="flex items-start gap-3 border-l-4 border-l-accent p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden /><p className="text-sm text-ink-muted">Your phone number is used only for login and is never shared. Name and organisation appear before connecting; every other field is controlled below.</p></Card>
      <form className="space-y-5" onSubmit={submit}>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Display name" id="displayName"><Input id="displayName" required value={form.displayName} onChange={(e) => field("displayName", e.target.value)} /></Field>
          <Field label="Organisation" id="organization"><Input id="organization" value={form.organization ?? ""} onChange={(e) => field("organization", e.target.value)} /></Field>
          <Field label="Role / designation" id="designation"><Input id="designation" value={form.designation ?? ""} onChange={(e) => field("designation", e.target.value)} /></Field>
          <Field label="Headline" id="headline"><Input id="headline" value={form.headline ?? ""} onChange={(e) => field("headline", e.target.value)} /></Field>
          <Field label="Public email" id="publicEmail"><Input id="publicEmail" type="email" value={form.publicEmail ?? ""} onChange={(e) => field("publicEmail", e.target.value)} /></Field>
          <Field label="LinkedIn URL" id="linkedInUrl"><Input id="linkedInUrl" type="url" value={form.linkedInUrl ?? ""} onChange={(e) => field("linkedInUrl", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Label htmlFor="bio">Bio</Label><Textarea id="bio" rows={5} value={form.bio ?? ""} onChange={(e) => field("bio", e.target.value)} /></div>
        </Card>
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold text-ink">Visibility</h2>
          <Toggle checked={form.discoverable} onChange={(v) => field("discoverable", v)} label="Appear in the networking directory" prominent />
          <div className="border-t border-hairline pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Reveal after connection</p>
            <Toggle checked={form.shareDesignation} onChange={(v) => field("shareDesignation", v)} label="Role / designation" />
            <Toggle checked={form.shareHeadline} onChange={(v) => field("shareHeadline", v)} label="Headline" />
            <Toggle checked={form.shareBio} onChange={(v) => field("shareBio", v)} label="Bio" />
            <Toggle checked={form.shareEmail} onChange={(v) => field("shareEmail", v)} label="Public email" />
            <Toggle checked={form.shareLinkedIn} onChange={(v) => field("shareLinkedIn", v)} label="LinkedIn URL" />
          </div>
        </Card>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
      </form>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div><Label htmlFor={id}>{label}</Label>{children}</div>; }
function Toggle({ checked, onChange, label, prominent = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; prominent?: boolean }) {
  return <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-control px-2 py-2 hover:bg-page"><span className={prominent ? "font-medium text-ink" : "text-sm text-ink"}>{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`flex h-8 w-14 items-center rounded-full p-1 transition-colors ${checked ? "justify-end bg-ink" : "justify-start bg-hairline"}`}>{checked ? <Eye className="h-6 w-6 rounded-full bg-page p-1 text-ink" /> : <EyeOff className="h-6 w-6 rounded-full bg-surface p-1 text-ink-muted" />}</button></label>;
}
