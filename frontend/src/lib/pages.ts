import { lazy, type ComponentType } from "react";

// Route components are split into their own chunks so the first paint doesn't
// carry the whole app, and every chunk is then prefetched while the browser is
// idle — see prefetchAllPages. By the time anyone taps a tab, its chunk is
// already in memory, so splitting costs nothing at navigation time.

type Loader = () => Promise<Record<string, unknown>>;

const loaders: Loader[] = [];

/** Wrap a dynamic import of a named export as a lazy route component. */
function page<T extends ComponentType<Record<string, never>>>(load: () => Promise<Record<string, unknown>>, name: string) {
  loaders.push(load);
  return lazy(async () => ({ default: (await load())[name] as T }));
}

export const Login = page(() => import("@/pages/Login"), "Login");
export const AcceptInvite = page(() => import("@/pages/AcceptInvite"), "AcceptInvite");
export const ChangePassword = page(() => import("@/pages/ChangePassword"), "ChangePassword");
export const Home = page(() => import("@/pages/Home"), "Home");
export const Contacts = page(() => import("@/pages/Contacts"), "Contacts");
export const Events = page(() => import("@/pages/Events"), "Events");
export const EventDetail = page(() => import("@/pages/EventDetail"), "EventDetail");
export const GateCheckIn = page(() => import("@/pages/GateCheckIn"), "GateCheckIn");
export const Import = page(() => import("@/pages/Import"), "Import");
export const Users = page(() => import("@/pages/Users"), "Users");
export const NetworkPage = page(() => import("@/pages/Network"), "NetworkPage");
export const MessagesPage = page(() => import("@/pages/Messages"), "MessagesPage");
export const CoursesPage = page(() => import("@/pages/Courses"), "CoursesPage");
export const CourseDetailPage = page(() => import("@/pages/Courses"), "CourseDetailPage");
export const ProfilePage = page(() => import("@/pages/Profile"), "ProfilePage");
export const NotificationsPage = page(() => import("@/pages/Notifications"), "NotificationsPage");
export const PocPortal = page(() => import("@/pages/PocPortal"), "PocPortal");
export const EventSurveyPage = page(() => import("@/pages/EventSurvey"), "EventSurveyPage");
export const AdminHub = page(() => import("@/pages/AdminHub"), "AdminHub");
export const CoursesAdminPage = page(() => import("@/pages/CoursesAdmin"), "CoursesAdminPage");
export const SurveysAdminPage = page(() => import("@/pages/SurveysAdmin"), "SurveysAdminPage");
export const SurveyAnalyticsPage = page(() => import("@/pages/SurveyAnalytics"), "SurveyAnalyticsPage");
export const AnalyticsDashboardPage = page(() => import("@/pages/AnalyticsDashboard"), "AnalyticsDashboardPage");

/** Pull every route chunk in the background so no tab ever waits on a network
 *  round trip to render. Failures are ignored — React.lazy will retry on use. */
export function prefetchAllPages() {
  const start = () => loaders.forEach((load) => void load().catch(() => undefined));
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(start);
  else window.setTimeout(start, 1200);
}
