import { Link } from "react-router-dom";
import { BarChart3, BookOpen, FileQuestion, FileUp, LayoutDashboard, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";

export function AdminHub() {
  const { user } = useAuth();
  const items = [
    { to: "/import", label: "Import contacts", description: "Upload and normalize guest lists.", icon: FileUp, show: true },
    { to: "/courses-admin", label: "Course administration", description: "Programs, catalogs, modules, resources, and grants.", icon: BookOpen, show: user?.role === "ADMIN" },
    { to: "/surveys-admin", label: "Questionnaires", description: "Build templates, attach them to events, and open or close the form.", icon: FileQuestion, show: true },
    { to: "/survey-analytics", label: "Questionnaire analytics", description: "Charts by industry and role, follow-up leads, and every individual response.", icon: BarChart3, show: true },
    { to: "/analytics-dashboard", label: "Admin dashboard", description: "The analytics charts you pinned, laid out for display.", icon: LayoutDashboard, show: true },
    { to: "/users", label: "Users", description: "Staff, member, and guest account access.", icon: Users, show: user?.role === "ADMIN" },
  ].filter((i) => i.show);
  return <div className="space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">More tools</h1></header><div className="grid gap-3 md:grid-cols-2">{items.map((item) => <Link key={item.to} to={item.to} className="group"><Card className="h-full p-5 transition-shadow group-hover:shadow-panel"><item.icon className="h-6 w-6 text-accent-ink" /><h2 className="mt-4 text-lg font-semibold text-ink">{item.label}</h2><p className="mt-1 text-sm text-ink-muted">{item.description}</p></Card></Link>)}</div></div>;
}
