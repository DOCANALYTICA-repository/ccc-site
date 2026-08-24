// Vercel serverless entry point. The whole Express app runs as one
// function — proportionate for two staff users and under 100 contacts.
// See PLAN.md section 9.
import { createApp } from "../src/app.js";

export default createApp();
