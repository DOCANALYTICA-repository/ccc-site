import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QrCode, ScanLine } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";

export function CheckInPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initial = new URLSearchParams(location.search).get("token") ?? "";
  const [token, setToken] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function checkIn(value = token) { if (!value) return; setError(null); try { const r = await api.post<{ alreadyCheckedIn: boolean }>("/community/check-in", { token: value }); setMessage(r.alreadyCheckedIn ? "You were already checked in." : "You’re checked in. Welcome to the event."); } catch (e) { setError(e instanceof ApiError ? e.message : "Check-in failed."); } }
  useEffect(() => { if (initial) checkIn(initial); }, []);
  return <div className="mx-auto max-w-lg space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Event arrival</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Check in</h1><p className="mt-2 text-sm text-ink-muted">Use your phone camera to scan the venue QR. The link will return here automatically.</p></header><Card className="p-6"><ScanLine className="h-10 w-10 text-accent-ink" /><div className="mt-5"><Label htmlFor="checkinToken">QR token</Label><Input id="checkinToken" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Scan the QR or paste its token" /></div>{error && <p role="alert" className="mt-3 text-sm text-accent-ink">{error}</p>}{message && <div className="mt-4 rounded-control bg-ink p-4 text-page"><p className="font-semibold">{message}</p><Button className="mt-3 bg-page text-ink" onClick={() => navigate("/")}>Return home</Button></div>} {!message && <Button className="mt-4 w-full" onClick={() => checkIn()} disabled={!token}><QrCode className="h-4 w-4" />Check in</Button>}</Card></div>;
}
