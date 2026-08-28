import { useEffect, useState, type FormEvent } from "react";
import { BookPlus, GraduationCap, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useQuery, invalidateQueries, invalidateQuery } from "@/hooks/useQuery";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";

type Program = { id: string; name: string; code: string };
type Catalog = { id: string; title: string; academicYear: string; version: string; status: string; program: Program; courses?: Array<{ id: string; code: string; title: string }> };
type User = { id: string; name: string; phone: string | null; role: string };

export function CoursesAdminPage() {
  const { push } = useToast();
  const programsQuery = useQuery("/courses/admin/programs/list", () => api.get<{ programs: Program[] }>("/courses/admin/programs/list"));
  const catalogsQuery = useQuery("/courses", () => api.get<{ catalogs: Catalog[] }>("/courses"));
  const usersQuery = useQuery("/users", () => api.get<{ users: User[] }>("/users"));
  const programs = programsQuery.data?.programs ?? [];
  const catalogs = catalogsQuery.data?.catalogs ?? [];
  const users = usersQuery.data?.users ?? [];

  const [selectedCatalog, setSelectedCatalog] = useState("");
  const coursesQuery = useQuery(
    selectedCatalog ? `/courses/${selectedCatalog}` : null,
    () => api.get<{ catalog: Catalog }>(`/courses/${selectedCatalog}`),
  );
  const courses = coursesQuery.data?.catalog.courses ?? [];
  const [program, setProgram] = useState({ name: "", code: "" });
  const [catalog, setCatalog] = useState({ programId: "", title: "", academicYear: "", version: "1.0", description: "" });
  const [course, setCourse] = useState({ code: "", title: "", semester: "1", credits: "", description: "" });
  const [module, setModule] = useState({ courseId: "", title: "", content: "" });
  const [grantUser, setGrantUser] = useState("");

  // Default the catalog form to the first program once programs are known.
  useEffect(() => {
    const first = programs[0]?.id;
    if (first) setCatalog((v) => (v.programId ? v : { ...v, programId: first }));
  }, [programs]);

  const done = (message: string) => {
    push(message, "success");
    invalidateQueries("/courses");
    invalidateQuery("/users");
  };

  async function addProgram(e: FormEvent) { e.preventDefault(); await api.post("/courses/admin/programs", program); setProgram({ name: "", code: "" }); done("Program created."); }
  async function addCatalog(e: FormEvent) { e.preventDefault(); await api.post("/courses/admin/catalogs", { ...catalog, description: catalog.description || null }); setCatalog((v) => ({ ...v, title: "", description: "" })); done("Catalog created."); }
  async function addCourse(e: FormEvent) { e.preventDefault(); await api.post(`/courses/admin/catalogs/${selectedCatalog}/courses`, { ...course, semester: Number(course.semester), credits: course.credits ? Number(course.credits) : null, description: course.description || null }); setCourse({ code: "", title: "", semester: "1", credits: "", description: "" }); done("Course added."); }
  async function addModule(e: FormEvent) { e.preventDefault(); await api.post(`/courses/admin/courses/${module.courseId}/modules`, { title: module.title, content: module.content, position: 0 }); setModule({ courseId: "", title: "", content: "" }); done("Course module added."); }
  async function grant(e: FormEvent) { e.preventDefault(); await api.post(`/courses/admin/catalogs/${selectedCatalog}/grants`, { userId: grantUser }); done("Catalog access granted."); }

  return <div className="space-y-6"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Academic content</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Course administration</h1></header><div className="grid gap-4 xl:grid-cols-2"><AdminCard title="Create program" icon={GraduationCap}><form className="grid gap-3 sm:grid-cols-2" onSubmit={addProgram}><Field label="Program name"><Input required value={program.name} onChange={(e) => setProgram({ ...program, name: e.target.value })} /></Field><Field label="Code"><Input required value={program.code} onChange={(e) => setProgram({ ...program, code: e.target.value })} /></Field><Button type="submit">Create program</Button></form></AdminCard><AdminCard title="Create catalog" icon={BookPlus}><form className="grid gap-3 sm:grid-cols-2" onSubmit={addCatalog}><Field label="Program"><select className="h-11 w-full rounded-control border bg-surface px-3 text-sm" value={catalog.programId} onChange={(e) => setCatalog({ ...catalog, programId: e.target.value })}>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Catalog title"><Input required value={catalog.title} onChange={(e) => setCatalog({ ...catalog, title: e.target.value })} /></Field><Field label="Academic year"><Input required value={catalog.academicYear} onChange={(e) => setCatalog({ ...catalog, academicYear: e.target.value })} placeholder="2026–27" /></Field><Field label="Version"><Input required value={catalog.version} onChange={(e) => setCatalog({ ...catalog, version: e.target.value })} /></Field><div className="sm:col-span-2"><Label>Description</Label><Textarea value={catalog.description} onChange={(e) => setCatalog({ ...catalog, description: e.target.value })} /></div><Button type="submit">Create catalog</Button></form></AdminCard></div><Card className="space-y-4 p-5"><Field label="Working catalog"><select className="h-11 w-full rounded-control border bg-surface px-3 text-sm" value={selectedCatalog} onChange={(e) => setSelectedCatalog(e.target.value)}><option value="">Select catalog</option>{catalogs.map((c) => <option key={c.id} value={c.id}>{c.title} · {c.status}</option>)}</select></Field>{selectedCatalog && <><div className="grid gap-4 lg:grid-cols-2"><form className="space-y-3 rounded-control bg-page p-4" onSubmit={addCourse}><h2 className="font-semibold text-ink">Add course</h2><div className="grid grid-cols-2 gap-3"><Field label="Code"><Input required value={course.code} onChange={(e) => setCourse({ ...course, code: e.target.value })} /></Field><Field label="Semester"><Input type="number" min={1} required value={course.semester} onChange={(e) => setCourse({ ...course, semester: e.target.value })} /></Field></div><Field label="Title"><Input required value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} /></Field><Field label="Description"><Textarea value={course.description} onChange={(e) => setCourse({ ...course, description: e.target.value })} /></Field><Button type="submit">Add course</Button></form><form className="space-y-3 rounded-control bg-page p-4" onSubmit={addModule}><h2 className="font-semibold text-ink">Add module</h2><Field label="Course"><select required className="h-11 w-full rounded-control border bg-surface px-3 text-sm" value={module.courseId} onChange={(e) => setModule({ ...module, courseId: e.target.value })}><option value="">Select course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></Field><Field label="Module title"><Input required value={module.title} onChange={(e) => setModule({ ...module, title: e.target.value })} /></Field><Field label="Markdown content"><Textarea rows={6} required value={module.content} onChange={(e) => setModule({ ...module, content: e.target.value })} /></Field><Button type="submit">Add module</Button></form></div><form className="flex flex-wrap items-end gap-3 border-t border-hairline pt-4" onSubmit={grant}><div className="min-w-64 flex-1"><Label>Grant catalog to user</Label><select required className="h-11 w-full rounded-control border bg-surface px-3 text-sm" value={grantUser} onChange={(e) => setGrantUser(e.target.value)}><option value="">Select user</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}</select></div><Button type="submit"><Send className="h-4 w-4" />Grant access</Button><Button type="button" variant="secondary" onClick={() => api.patch(`/courses/admin/catalogs/${selectedCatalog}`, { status: "PUBLISHED" }).then(() => done("Catalog published."))}>Publish catalog</Button></form></>}</Card></div>;
}
function AdminCard({ title, icon: Icon, children }: { title: string; icon: typeof BookPlus; children: React.ReactNode }) { return <Card className="p-5"><div className="mb-4 flex items-center gap-2"><Icon className="h-5 w-5 text-accent-ink" /><h2 className="font-semibold text-ink">{title}</h2></div>{children}</Card>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label>{label}</Label>{children}</div>; }
