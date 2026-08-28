import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ToastProvider } from "@/hooks/useToast";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";
import { AcceptInvite } from "@/pages/AcceptInvite";
import { Home } from "@/pages/Home";
import { Contacts } from "@/pages/Contacts";
import { Events } from "@/pages/Events";
import { EventDetail } from "@/pages/EventDetail";
import { GateCheckIn } from "@/pages/GateCheckIn";
import { Import } from "@/pages/Import";
import { Users } from "@/pages/Users";
import { ChangePassword } from "@/pages/ChangePassword";
import { NetworkPage } from "@/pages/Network";
import { MessagesPage } from "@/pages/Messages";
import { CoursesPage, CourseDetailPage } from "@/pages/Courses";
import { ProfilePage } from "@/pages/Profile";
import { NotificationsPage } from "@/pages/Notifications";
import { CheckInPage } from "@/pages/CheckIn";
import { EventSurveyPage } from "@/pages/EventSurvey";
import { AdminHub } from "@/pages/AdminHub";
import { CoursesAdminPage } from "@/pages/CoursesAdmin";
import { SurveysAdminPage } from "@/pages/SurveysAdmin";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />
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
                  <Route path="/check-in" element={<CheckInPage />} />
                  <Route path="/events/:id/survey" element={<EventSurveyPage />} />
                </Route>
              </Route>

              {/* Internal staff tools — API rejects non-staff, and the route
                  guard keeps the broken page shell from rendering at all. */}
              <Route element={<ProtectedRoute roles={["ADMIN", "STAFF"]} />}>
                <Route element={<AppShell />}>
                  <Route path="/admin" element={<AdminHub />} />
                  <Route path="/surveys-admin" element={<SurveysAdminPage />} />
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
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
