import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Lightweight model for simple, mostly-text tasks with no/short tool loops
 * (issue analysis, test-plan writing, report synthesis).
 */
export const model = google(
  process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
);

/**
 * Stronger model for agents that must reliably drive multi-step tool loops
 * over an unfamiliar codebase and produce exact file contents
 * (code investigation, patch generation). "flash-lite" is optimized for
 * speed/cost and frequently under-explores the repository or stops the
 * tool loop early, which was a major source of shallow investigations and
 * hallucinated patches in this system.
 */
export const strongModel = google(
  process.env.GEMINI_STRONG_MODEL ?? "gemini-3.6-flash",
);