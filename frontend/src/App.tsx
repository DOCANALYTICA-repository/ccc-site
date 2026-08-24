import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ToastProvider } from "@/hooks/useToast";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";
import { AcceptInvite } from "@/pages/AcceptInvite";
import { Dashboard } from "@/pages/Dashboard";
import { Contacts } from "@/pages/Contacts";
import { Events } from "@/pages/Events";
import { EventDetail } from "@/pages/EventDetail";
import { GateCheckIn } from "@/pages/GateCheckIn";
import { Import } from "@/pages/Import";
import { Users } from "@/pages/Users";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />

              {/* Gate check-in is its own full-screen layout — no AppShell chrome. */}
              <Route element={<ProtectedRoute />}>
                <Route path="/events/:id/gate" element={<GateCheckIn />} />
              </Route>

              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/events/:id" element={<EventDetail />} />
                  <Route path="/import" element={<Import />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute adminOnly />}>
                <Route element={<AppShell />}>
                  <Route path="/users" element={<Users />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
