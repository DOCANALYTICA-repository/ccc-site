import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma.js";

/** Publishes the Department of Commerce syllabi as department-wide catalogs.
 *
 * Each program gets one PUBLISHED, isPublic catalog holding a single course
 * whose only resource is the syllabus PDF. That shape is a little thin for
 * the course model, but it is honest: what the department actually has to
 * publish today is one document per program, and inventing module rows to
 * fill out the schema would mean inventing content.
 *
 * Idempotent — re-running updates in place rather than duplicating.
 */

const ACADEMIC_YEAR = "2026";
const VERSION = "1.0";

const ASSETS_DIR = path.resolve(__dirname, "../assets/syllabus");

interface Entry {
  code: string;
  program: string;
  title: string;
  file: string;
}

const SYLLABI: Entry[] = [
  { code: "BCOM", program: "B.Com.", title: "B.Com. — Syllabus", file: "bcom.pdf" },
  { code: "BCOM-HON", program: "B.Com. (Honours / Honours with Research)", title: "B.Com. (Honours / Honours with Research) — Syllabus", file: "bcom-honours.pdf" },
  { code: "BCOM-AT", program: "B.Com. Accountancy and Taxation (Honours / Honours with Research)", title: "B.Com. Accountancy and Taxation (Honours / Honours with Research) — Syllabus", file: "bcom-accountancy-and-taxation-honours.pdf" },
  { code: "BCOM-AFA", program: "B.Com. Applied Finance and Analytics (Honours / Honours with Research)", title: "B.Com. Applied Finance and Analytics (Honours / Honours with Research) — Syllabus", file: "bcom-applied-finance-and-analytics-honours.pdf" },
  { code: "BCOM-FI", program: "B.Com. Finance and Investment", title: "B.Com. Finance and Investment — Syllabus", file: "bcom-finance-and-investment.pdf" },
  { code: "BCOM-FI-HON", program: "B.Com. Finance and Investment (Honours / Honours with Research)", title: "B.Com. Finance and Investment (Honours / Honours with Research) — Syllabus", file: "bcom-finance-and-investment-honours.pdf" },
  { code: "BCOM-SF", program: "B.Com. Strategic Finance (Honours / Honours with Research)", title: "B.Com. Strategic Finance (Honours / Honours with Research) — Syllabus", file: "bcom-strategic-finance-honours.pdf" },
  { code: "BCOM-WI", program: "B.Com. (Work Integrated)", title: "B.Com. (Work Integrated) — Syllabus", file: "bcom-work-integrated.pdf" },
  { code: "BSC-AA", program: "B.Sc. Accountancy and Analytics", title: "B.Sc. Accountancy and Analytics — Syllabus", file: "bsc-accountancy-and-analytics.pdf" },
  { code: "MCOM", program: "M.Com.", title: "M.Com. — Syllabus", file: "mcom.pdf" },
];

async function main() {
  const missing = SYLLABI.filter((s) => !fs.existsSync(path.join(ASSETS_DIR, s.file)));
  if (missing.length) {
    console.error(`Missing PDFs in ${ASSETS_DIR}:`);
    missing.forEach((m) => console.error(`  - ${m.file}`));
    process.exit(1);
  }

  for (const entry of SYLLABI) {
    const bytes = fs.statSync(path.join(ASSETS_DIR, entry.file)).size;

    const program = await prisma.program.upsert({
      where: { code: entry.code },
      update: { name: entry.program },
      create: { code: entry.code, name: entry.program },
    });

    const existing = await prisma.courseCatalog.findUnique({
      where: {
        programId_academicYear_version: {
          programId: program.id,
          academicYear: ACADEMIC_YEAR,
          version: VERSION,
        },
      },
    });

    const data = {
      title: entry.title,
      description: `Department of Commerce syllabus for ${entry.program}, ${ACADEMIC_YEAR}.`,
      status: "PUBLISHED" as const,
      isPublic: true,
      publishedAt: existing?.publishedAt ?? new Date(),
    };

    const catalog = existing
      ? await prisma.courseCatalog.update({ where: { id: existing.id }, data })
      : await prisma.courseCatalog.create({
          data: { programId: program.id, academicYear: ACADEMIC_YEAR, version: VERSION, ...data },
        });

    const course = await prisma.course.upsert({
      where: { catalogId_code: { catalogId: catalog.id, code: "SYLLABUS" } },
      update: { title: entry.title },
      create: { catalogId: catalog.id, code: "SYLLABUS", title: entry.title, semester: 1, position: 0 },
    });

    // No natural key on CourseResource, so replace rather than upsert.
    await prisma.courseResource.deleteMany({ where: { courseId: course.id } });
    await prisma.courseResource.create({
      data: {
        courseId: course.id,
        title: entry.title,
        resourceType: "SYLLABUS",
        storagePath: `local:syllabus/${entry.file}`,
        mimeType: "application/pdf",
        sizeBytes: bytes,
      },
    });

    console.log(`✓ ${entry.program} — ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  }

  console.log(`\n${SYLLABI.length} syllabi published and readable by every signed-in account.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
