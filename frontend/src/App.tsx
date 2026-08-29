import { Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ToastProvider } from "@/hooks/useToast";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  AcceptInvite,
  AdminHub,
  ChangePassword,
  Contacts,
  CourseDetailPage,
  CoursesAdminPage,
  CoursesPage,
  EventDetail,
  EventSurveyPage,
  Events,
  GateCheckIn,
  Home,
  Import,
  Login,
  MessagesPage,
  NetworkPage,
  NotificationsPage,
  PocPortal,
  ProfilePage,
  SurveyAnalyticsPage,
  SurveysAdminPage,
  Users,
  prefetchAllPages,
} from "@/lib/pages";

export default function App() {
  // Warm every route chunk once the first screen is interactive, so route
  // splitting never costs a navigation its instant paint. Not on the POC
  // portal: that is a phone on venue wifi that will never visit another
  // route, and pulling the whole app down behind it buys nothing.
  useEffect(() => {
    if (window.location.pathname.startsWith("/poc")) return;
    prefetchAllPages();
  }, []);

  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-ink-muted">Loading…</div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/accept-invite" element={<AcceptInvite />} />

                {/* The POC gate portal. Deliberately outside every guard and
                    outside AppShell: student point-of-contacts hold a scoped
                    token from the venue QR, not an account, and the portal is
                    a dead end with no route back into the application. */}
                <Route path="/poc" element={<PocPortal />} />
                <Route element={<ProtectedRoute allowPasswordChange />}>
                  <Route path="/change-password" element={<ChangePassword />} />
                </Route>

                {/* Gate check-in is its own full-screen layout — no AppShell chrome. */}
                <Route element={<ProtectedRoute roles={["ADMIN", "STAFF"]} />}>
                  <Route path="/events/:id/gate" element={<GateCheckIn />} />
                </Route>

                <Route element={<ProtectedRoute />}>
                  <Route element={<AppShell />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/network" element={<NetworkPage />} />
                    <Route path="/messages" element={<MessagesPage />} />
                    <Route path="/courses" element={<CoursesPage />} />
                    <Route path="/courses/:id" element={<CourseDetailPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/events/:id/survey" element={<EventSurveyPage />} />
                  </Route>
                </Route>

                {/* Internal staff tools — API rejects non-staff, and the route
                    guard keeps the broken page shell from rendering at all. */}
                <Route element={<ProtectedRoute roles={["ADMIN", "STAFF"]} />}>
                  <Route element={<AppShell />}>
                    <Route path="/admin" element={<AdminHub />} />
                    <Route path="/surveys-admin" element={<SurveysAdminPage />} />
                    <Route path="/survey-analytics" element={<SurveyAnalyticsPage />} />
                    <Route path="/courses-admin" element={<CoursesAdminPage />} />
                    <Route path="/contacts" element={<Contacts />} />
                    <Route path="/events" element={<Events />} />
                    <Route path="/events/:id" element={<EventDetail />} />
                    <Route path="/import" element={<Import />} />
                  </Route>
                </Route>

                <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
                  <Route element={<AppShell />}>
                    <Route path="/users" element={<Users />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
