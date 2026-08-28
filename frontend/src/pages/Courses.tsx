import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, Download, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { api } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { useDebounced } from "@/hooks/useDebounced";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface CatalogSummary { id: string; title: string; academicYear: string; version: string; description: string | null; status: string; program: { name: string; code: string }; _count: { courses: number }; }
interface Catalog extends CatalogSummary { courses: Array<{ id: string; code: string; title: string; semester: number; credits: number | null; description: string | null; modules: Array<{ id: string; title: string; content: string }>; resources: Array<{ id: string; title: string; resourceType: string }> }>; }

export function CoursesPage() {
  const [q, setQ] = useState("");
  const search = useDebounced(q, 200);
  const key = `/courses?q=${encodeURIComponent(search)}`;
  const { data } = useQuery(key, () => api.get<{ catalogs: CatalogSummary[] }>(key), { keepPreviousData: true });
  const catalogs = data?.catalogs ?? [];
  return <div className="space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Department of Commerce</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Course library</h1><p className="mt-2 text-sm text-ink-muted">Catalogs and syllabi granted to your account.</p></header><div className="relative max-w-xl"><Search className="absolute left-3 top-3 h-5 w-5 text-ink-muted" /><Input aria-label="Search courses" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Program, course code, title…" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{catalogs.map((catalog) => <Link key={catalog.id} to={`/courses/${catalog.id}`} className="group"><Card className="h-full p-5 transition-shadow group-hover:shadow-panel"><BookOpen className="h-6 w-6 text-accent-ink" /><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">{catalog.program.code} · {catalog.academicYear}</p><h2 className="mt-1 text-lg font-semibold text-ink">{catalog.title}</h2><p className="mt-2 line-clamp-3 text-sm text-ink-muted">{catalog.description ?? "View courses, modules, and syllabus resources."}</p><p className="mt-4 text-xs font-medium text-accent-ink">{catalog._count.courses} courses · Version {catalog.version}</p></Card></Link>)}</div>{!catalogs.length && <p className="py-10 text-center text-sm text-ink-muted">No catalogs are currently available.</p>}</div>;
}

export function CourseDetailPage() {
  const { id } = useParams();
  const { data } = useQuery(id ? `/courses/${id}` : null, () => api.get<{ catalog: Catalog }>(`/courses/${id}`));
  const catalog = data?.catalog;
  async function openResource(resourceId: string) { const { url } = await api.get<{ url: string }>(`/courses/resources/${resourceId}/access`); window.open(url, "_blank", "noopener,noreferrer"); }
  if (!catalog) return <p className="text-sm text-ink-muted">Loading catalog…</p>;
  return <div className="mx-auto max-w-4xl space-y-6"><header><Link to="/courses" className="text-sm font-medium text-ink-muted">← Course library</Link><p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">{catalog.program.name} · {catalog.academicYear}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{catalog.title}</h1><p className="mt-2 text-sm text-ink-muted">{catalog.description}</p></header>{catalog.courses.map((course) => <Card key={course.id} className="p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">Semester {course.semester}{course.credits != null ? ` · ${course.credits} credits` : ""}</p><h2 className="mt-1 text-xl font-semibold text-ink">{course.code} · {course.title}</h2>{course.description && <p className="mt-2 text-sm text-ink-muted">{course.description}</p>}<div className="mt-5 space-y-5">{course.modules.map((module) => <section key={module.id}><h3 className="font-semibold text-ink">{module.title}</h3><div className="prose prose-sm mt-2 max-w-none text-ink-muted"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{module.content}</ReactMarkdown></div></section>)}</div>{course.resources.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{course.resources.map((resource) => <Button key={resource.id} size="sm" variant="secondary" onClick={() => openResource(resource.id)}><Download className="h-4 w-4" />{resource.title}</Button>)}</div>}</Card>)}</div>;
}
