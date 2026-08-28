// One-off seed: loads the Corporate–Academia Collaboration Interest
// Questionnaire (from Corporate_Academia_Collaboration_Questionnaire.docx)
// as a reusable SurveyTemplate. Safe to re-run — creates a new template
// each time, so delete any previous run first if re-seeding.
import { prisma } from "../src/lib/prisma.js";

type Q =
  | { section: string; prompt: string; type: "TEXT" }
  | { section: string; prompt: string; type: "YES_NO" }
  | { section: string; prompt: string; type: "SCALE_1_5" }
  | { section: string; prompt: string; type: "SINGLE_SELECT" | "MULTI_SELECT"; options: string[] };

const questions: Q[] = [
  // Section 1: Organisation Profile — intentionally omitted per request.

  // Section 2: Experiential Learning & Student Engagement
  {
    section: "Experiential Learning & Student Engagement",
    prompt: "Capstone Projects – Would your organisation be willing to provide real-world business problems/projects for 4th-year UG Capstone Projects?",
    type: "SINGLE_SELECT", options: ["Yes, definitely", "Yes, subject to discussion", "Maybe / Need more information", "Not at present"],
  },
  {
    section: "Experiential Learning & Student Engagement", prompt: "Preferred areas for Capstone Projects", type: "MULTI_SELECT",
    options: ["Accounting", "Tax & Auditing", "Finance & Investment", "Banking", "Insurance", "Business Analytics", "Marketing", "Entrepreneurship", "Strategic Management", "Other"],
  },
  {
    section: "Experiential Learning & Student Engagement",
    prompt: "Internships – Would your organisation be willing to offer internships to UG/PG students?",
    type: "SINGLE_SELECT", options: ["Yes", "Yes, depending on requirements", "We currently offer internships", "We may consider in the future", "Not interested"],
  },
  {
    section: "Experiential Learning & Student Engagement", prompt: "Internship areas", type: "MULTI_SELECT",
    options: ["Finance", "Accounting", "Audit & Taxation", "Investment", "Banking", "Insurance", "Analytics", "Marketing", "HR", "Consulting", "Strategy", "Other"],
  },

  // Section 3: Consultancy & Research Collaboration
  {
    section: "Consultancy & Research Collaboration",
    prompt: "Consultancy Projects – Would your organisation be interested in engaging with the School/Department for consultancy projects to address real-world business challenges?",
    type: "SINGLE_SELECT", options: ["Yes, definitely", "Yes, subject to requirements", "We would like to explore this", "Not at present"],
  },
  {
    section: "Consultancy & Research Collaboration", prompt: "Potential consultancy areas", type: "MULTI_SELECT",
    options: ["Market Research", "Business Analysis", "Financial Analysis", "Investment Analysis", "Data Analytics", "Consumer Research", "ESG", "MSME Development", "Strategy", "Process Improvement", "Other"],
  },
  {
    section: "Consultancy & Research Collaboration",
    prompt: "Joint Research / Applied Research – Would your organisation be interested in collaborating on applied research projects addressing industry/business problems?",
    type: "SINGLE_SELECT", options: ["Yes", "Yes, subject to discussion", "Interested in exploring", "Not at present"],
  },
  {
    section: "Consultancy & Research Collaboration",
    prompt: "Potential research areas / challenges you would like to explore",
    type: "TEXT",
  },

  // Section 4: Case Writing & Knowledge Creation
  {
    section: "Case Writing & Knowledge Creation",
    prompt: "Business Case Development – Would your organisation be willing to collaborate in developing real-world business cases for teaching, executive education and knowledge creation?",
    type: "SINGLE_SELECT", options: ["Yes", "Yes, subject to confidentiality arrangements", "Interested in exploring", "Not at present"],
  },
  {
    section: "Case Writing & Knowledge Creation", prompt: "Preferred case areas", type: "MULTI_SELECT",
    options: ["Finance", "Investment", "Banking", "Marketing", "Strategy", "Entrepreneurship", "ESG", "Operations", "Leadership", "Other"],
  },

  // Section 5: CSR & ESG Collaboration
  {
    section: "CSR & ESG Collaboration",
    prompt: "CSR & ESG Projects – Would your organisation be interested in collaborating on CSR and/or ESG initiatives?",
    type: "SINGLE_SELECT", options: ["Yes, CSR", "Yes, ESG", "Both CSR & ESG", "Interested in exploring", "Not at present"],
  },
  {
    section: "CSR & ESG Collaboration", prompt: "Potential CSR/ESG areas", type: "MULTI_SELECT",
    options: ["Community Development", "MSME Development", "Financial Literacy", "Entrepreneurship Development", "School Education", "Sustainability", "Climate / Environmental Initiatives", "Social Impact Measurement", "ESG Reporting / Assessment", "Other"],
  },

  // Section 6: Executive Education & Professional Training
  {
    section: "Executive Education & Professional Training",
    prompt: "Executive Training / Management Development Programmes – Would your organisation be interested in customised training, upskilling or MDPs for employees?",
    type: "SINGLE_SELECT", options: ["Yes", "Yes, subject to requirements", "Interested in exploring", "Not at present"],
  },
  {
    section: "Executive Education & Professional Training", prompt: "Preferred training areas", type: "MULTI_SELECT",
    options: ["Finance & Financial Management", "Investment & Wealth Management", "Banking", "Accounting & Taxation", "Business Analytics", "AI & Digital Transformation", "ESG & Sustainability", "Leadership", "Strategic Management", "Entrepreneurship", "Other"],
  },
  {
    section: "Executive Education & Professional Training",
    prompt: "Would you be interested in co-designing customised programmes with us?",
    type: "SINGLE_SELECT", options: ["Yes", "No", "Maybe"],
  },

  // Section 7: Industry Participation in Academics
  {
    section: "Industry Participation in Academics",
    prompt: "Advisory Board Participation – Would you be willing to serve on the School/Department Advisory Board and contribute industry perspectives?",
    type: "SINGLE_SELECT", options: ["Yes", "Yes, subject to organisational approval", "Interested in exploring", "Not at present"],
  },
  {
    section: "Industry Participation in Academics",
    prompt: "Board of Studies & Curriculum Development – Would you be willing to participate in Board of Studies / curriculum development activities?",
    type: "SINGLE_SELECT", options: ["Yes", "Yes, subject to availability", "Interested in exploring", "Not at present"],
  },
  {
    section: "Industry Participation in Academics", prompt: "Potential contributions to curriculum/Board of Studies", type: "MULTI_SELECT",
    options: ["Curriculum Design", "Industry Skill Requirements", "Course Content Review", "Emerging Industry Trends", "Assessment Design", "Employability Skills", "Other"],
  },
  {
    section: "Industry Participation in Academics",
    prompt: "Industry Expert Engagement – Would professionals from your organisation be willing to engage with students as industry experts?",
    type: "SINGLE_SELECT", options: ["Yes", "No", "Subject to availability"],
  },
  {
    section: "Industry Participation in Academics", prompt: "Preferred formats for industry expert engagement", type: "MULTI_SELECT",
    options: ["Guest Lectures", "Weekend Teaching Sessions", "Workshops", "Masterclasses", "Panel Discussions", "Industry Visits", "Mentoring", "Competitions / Hackathons", "Career Talks", "Other"],
  },
  {
    section: "Industry Participation in Academics",
    prompt: "Would your organisation be willing to provide remunerated expert sessions/workshops where applicable?",
    type: "SINGLE_SELECT", options: ["Yes", "Subject to discussion", "No"],
  },

  // Section 8: Centre for Applied Finance & Investment (CAFI)
  {
    section: "Centre for Applied Finance & Investment (CAFI)",
    prompt: "Would your organisation be interested in collaborating with CAFI? (CAFI provides opportunities for collaboration in finance, investment, capital markets and financial analytics, supported by a state-of-the-art Bloomberg Lab.)",
    type: "SINGLE_SELECT", options: ["Yes", "Yes, subject to discussion", "Interested in exploring", "Not at present"],
  },
  {
    section: "Centre for Applied Finance & Investment (CAFI)", prompt: "Potential CAFI collaboration areas", type: "MULTI_SELECT",
    options: ["Co-curation of Finance Courses", "Investment & Capital Markets Training", "Bloomberg-based Learning", "Financial Analytics", "Industry Projects", "Research", "Executive Education", "Investment Workshops", "Faculty Development Programmes", "Student Competitions / Challenges", "Other"],
  },

  // Section 9: Preferred Nature of Partnership
  {
    section: "Preferred Nature of Partnership",
    prompt: "What type of long-term collaboration would your organisation be interested in? (Select all that apply.)",
    type: "MULTI_SELECT",
    options: ["Student Internships", "Capstone Projects", "Consultancy", "Joint Research", "Case Writing", "CSR Projects", "ESG Projects", "Executive Education / MDPs", "Advisory Board", "Board of Studies", "Curriculum Development", "Guest Lectures", "Workshops", "Mentoring", "Industry Visits", "Placement / Recruitment", "Knowledge Partnership", "Joint Conferences / Events", "Centre-level Collaboration", "Other"],
  },
  {
    section: "Preferred Nature of Partnership", prompt: "At what level would your organisation prefer to collaborate?",
    type: "SINGLE_SELECT", options: ["One-time engagement", "Short-term project-based collaboration", "Annual collaboration", "Long-term strategic partnership", "Open to exploring different models"],
  },
  {
    section: "Preferred Nature of Partnership", prompt: "Preferred mode of engagement",
    type: "SINGLE_SELECT", options: ["In-person", "Online", "Hybrid", "No preference"],
  },

  // Section 10: Collaboration Opportunities
  {
    section: "Collaboration Opportunities",
    prompt: "Are there any specific business problems, projects, skill requirements or areas where you would like to collaborate with us?",
    type: "TEXT",
  },
  {
    section: "Collaboration Opportunities",
    prompt: "What would be the most valuable outcome you expect from an industry–academia partnership?",
    type: "TEXT",
  },
  {
    section: "Collaboration Opportunities",
    prompt: "Would you like our team to contact you to discuss potential collaboration opportunities?",
    type: "SINGLE_SELECT", options: ["Yes", "No"],
  },
  {
    section: "Collaboration Opportunities", prompt: "Preferred mode of contact",
    type: "SINGLE_SELECT", options: ["Email", "Phone", "Meeting", "Online meeting"],
  },

  // Section 11: Overall Interest
  {
    section: "Overall Interest",
    prompt: "Overall, how interested is your organisation in developing a formal association with the School/Department? (1 = Not Interested; 5 = Highly Interested)",
    type: "SCALE_1_5",
  },
  {
    section: "Overall Interest",
    prompt: "Would your organisation be interested in exploring a formal MoU / Knowledge Partnership?",
    type: "SINGLE_SELECT", options: ["Yes", "Yes, interested in discussion", "Maybe in the future", "Not at present"],
  },

  // Section 12: Final Question
  {
    section: "Final Question",
    prompt: "Please share any additional suggestions or collaboration opportunities that you would like us to explore.",
    type: "TEXT",
  },
];

async function main() {
  const template = await prisma.surveyTemplate.create({
    data: {
      name: "Corporate–Academia Collaboration Interest Questionnaire",
      description: "Capturing corporate willingness for industry–academia collaboration across experiential learning, research, executive education, CSR/ESG, and partnership models.",
      questions: {
        create: questions.map((q, position) => ({
          prompt: q.prompt,
          type: q.type,
          section: q.section,
          options: "options" in q ? q.options : undefined,
          position,
        })),
      },
    },
    include: { questions: true },
  });
  console.log(`Created template ${template.id} with ${template.questions.length} questions.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
