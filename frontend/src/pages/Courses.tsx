import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, Download, ExternalLink, FileText, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { api } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { useDebounced } from "@/hooks/useDebounced";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface Resource {
  id: string;
  title: string;
  resourceType: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

interface CatalogSummary {
  id: string;
  title: string;
  academicYear: string;
  version: string;
  description: string | null;
  status: string;
  isPublic?: boolean;
  program: { name: string; code: string };
  _count: { courses: number };
}

interface Catalog extends CatalogSummary {
  courses: Array<{
    id: string;
    code: string;
    title: string;
    semester: number;
    credits: number | null;
    description: string | null;
    modules: Array<{ id: string; title: string; content: string }>;
    resources: Resource[];
  }>;
}

export function CoursesPage() {
  const [q, setQ] = useState("");
  const search = useDebounced(q, 200);
  const key = `/courses?q=${encodeURIComponent(search)}`;
  const { data } = useQuery(key, () => api.get<{ catalogs: CatalogSummary[] }>(key), { keepPreviousData: true });
  const catalogs = data?.catalogs ?? [];

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Department of Commerce</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Course library</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Programme syllabi, published in full. Open one to read it here.
        </p>
      </header>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3 h-5 w-5 text-ink-muted" aria-hidden />
        <Input
          aria-label="Search courses"
          className="pl-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Programme, course code, title…"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {catalogs.map((catalog) => (
          <Link key={catalog.id} to={`/courses/${catalog.id}`} className="group">
            <Card className="flex h-full flex-col p-5 transition-shadow group-hover:shadow-panel">
              <BookOpen className="h-6 w-6 text-accent-ink" aria-hidden />
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {catalog.program.code} · {catalog.academicYear}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-ink">{catalog.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-ink-muted">
                {catalog.description ?? "View the full syllabus document."}
              </p>
              <p className="mt-auto pt-4 text-xs font-medium text-accent-ink">Read syllabus →</p>
            </Card>
          </Link>
        ))}
      </div>

      {!catalogs.length && (
        <p className="py-10 text-center text-sm text-ink-muted">
          {search ? "Nothing matches that search." : "No catalogs are currently available."}
        </p>
      )}
    </div>
  );
}

export function CourseDetailPage() {
  const { id } = useParams();
  const { data, error } = useQuery(id ? `/courses/${id}` : null, () => api.get<{ catalog: Catalog }>(`/courses/${id}`));
  const catalog = data?.catalog;

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link to="/courses" className="text-sm font-medium text-ink-muted">← Course library</Link>
        <p className="mt-6 text-sm text-ink-muted">This catalog isn’t available to your account.</p>
      </div>
    );
  }
  if (!catalog) return <p className="text-sm text-ink-muted">Loading catalog…</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link to="/courses" className="text-sm font-medium text-ink-muted">← Course library</Link>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">
          {catalog.program.name} · {catalog.academicYear}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{catalog.title}</h1>
        {catalog.description && <p className="mt-2 text-sm text-ink-muted">{catalog.description}</p>}
      </header>

      {catalog.courses.map((course) => {
        // A syllabus-only catalog is one course holding one PDF. Showing that
        // as a card titled with the same words as the page heading, wrapping a
        // button that opens the document elsewhere, would be three layers of
        // chrome around the one thing anyone came for — so render the document.
        const documents = course.resources.filter((r) => (r.mimeType ?? "application/pdf") === "application/pdf");
        const other = course.resources.filter((r) => !documents.includes(r));
        const bare = !course.description && course.modules.length === 0 && documents.length > 0;

        return (
          <section key={course.id} className="space-y-4">
            {!bare && (
              <Card className="p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">
                  Semester {course.semester}
                  {course.credits != null ? ` · ${course.credits} credits` : ""}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-ink">{course.code} · {course.title}</h2>
                {course.description && <p className="mt-2 text-sm text-ink-muted">{course.description}</p>}
                <div className="mt-5 space-y-5">
                  {course.modules.map((module) => (
                    <div key={module.id}>
                      <h3 className="font-semibold text-ink">{module.title}</h3>
                      <div className="prose prose-sm mt-2 max-w-none text-ink-muted">
                        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{module.content}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
                {other.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {other.map((resource) => (
                      <ResourceLink key={resource.id} resource={resource} />
                    ))}
                  </div>
                )}
              </Card>
            )}

            {documents.map((resource) => (
              <PdfDocument key={resource.id} resource={resource} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function ResourceLink({ resource }: { resource: Resource }) {
  async function open() {
    const { url } = await api.get<{ url: string }>(`/courses/resources/${resource.id}/access`);
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return (
    <Button size="sm" variant="secondary" onClick={open}>
      <ExternalLink className="h-4 w-4" aria-hidden />
      {resource.title}
    </Button>
  );
}

/** Renders the PDF in the page rather than handing over a download.
 *
 * The URL is short-lived and signed, minted only after the API has checked
 * this account may read the catalog — which is also why the <iframe> can live
 * on a different origin from the API without depending on third-party cookies.
 *
 * Mobile browsers, iOS Safari especially, still refuse to paginate a PDF
 * inside an iframe, so the open-in-a-tab and download affordances are always
 * present rather than being a fallback nobody can find.
 */
function PdfDocument({ resource }: { resource: Resource }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setUrl(null);
    setFailed(null);
    api
      .get<{ url: string }>(`/courses/resources/${resource.id}/access`)
      .then((res) => live && setUrl(res.url))
      .catch(() => live && setFailed("This document could not be opened. Refresh the page and try again."));
    return () => {
      live = false;
    };
  }, [resource.id]);

  const megabytes = resource.sizeBytes ? (resource.sizeBytes / 1024 / 1024).toFixed(1) : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3 sm:px-5">
        <FileText className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{resource.title}</p>
          <p className="text-xs text-ink-muted">PDF{megabytes ? ` · ${megabytes} MB` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={!url} onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open
          </Button>
          <a
            href={url ?? undefined}
            download={`${resource.title}.pdf`}
            aria-disabled={!url}
            className="tap-target inline-flex h-9 items-center gap-1.5 rounded-control border border-hairline px-3 text-sm font-medium text-ink aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            Save
          </a>
        </div>
      </div>

      {failed && <p className="px-4 py-10 text-center text-sm text-ink-muted sm:px-5">{failed}</p>}

      {/* <object>, not <iframe>: when the browser has no PDF viewer of its own
          — some mobile browsers, some embedded webviews — it renders the
          children instead of a blank black rectangle, so the reader always
          gets something they can act on. */}
      {!failed && url && (
        <object data={url} type="application/pdf" className="block h-[75vh] min-h-[420px] w-full bg-page">
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <FileText className="h-10 w-10 text-ink-muted" aria-hidden />
            <p className="text-sm text-ink-muted">
              Your browser can’t display PDFs inline. Open the syllabus in a new tab to read it.
            </p>
            <Button onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open syllabus
            </Button>
          </div>
        </object>
      )}

      {!failed && !url && (
        <p className="px-4 py-16 text-center text-sm text-ink-muted sm:px-5">Loading the document…</p>
      )}

      {!failed && (
        <p className="border-t border-hairline px-4 py-3 text-xs text-ink-muted sm:px-5">
          Not showing on your phone? Tap <span className="font-medium text-ink">Open</span> to read it in a new tab.
        </p>
      )}
    </Card>
  );
}
