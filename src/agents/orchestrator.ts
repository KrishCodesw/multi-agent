import { generateText, stepCountIs } from "ai";

import { model } from "../lib/ai.js";

export async function runOrchestrator(
  owner: string,
  repo: string,
  issueNumber: number,
  issueAnalysis: string,
  codeInvestigation: string,
  testPlan: string,
): Promise<string> {
  const result = await generateText({
    model,

    system: `
You are the Orchestrator Agent in a GitHub issue-to-PR engineering system.

Your task is to combine the outputs of:
- The Issue Analyst Agent.
- The Code Investigator Agent.
- The Test Agent.

You must produce a final engineering report that is accurate, actionable, and based
only on the provided information.

Produce exactly these sections:

1. Issue Summary
2. Affected Components
3. Root Cause
4. Required Changes
5. Test Plan
6. Risks and Edge Cases
7. Final Recommendation

Rules:

- Do not invent information.
- Do not invent file paths, routes, APIs, frameworks, functions, or test results.
- Use exact file paths from the Code Investigator output whenever available.
- Clearly distinguish confirmed findings from assumptions.
- If the investigation is incomplete, state what is missing.
- Do not claim that the issue is solved.
- Do not modify code.
- Do not generate a complete patch.
- Do not silently replace missing information with generic recommendations.
- The report must be useful to the Patch Agent.
- Required changes must be specific enough for another engineer to implement.
- If the issue cannot be safely implemented based on the available evidence, recommend further investigation instead of pretending the report is complete.
`,

    prompt: `
Create the final engineering report for GitHub issue #${issueNumber} in ${owner}/${repo}.

=== ISSUE ANALYSIS ===

${issueAnalysis}

=== CODE INVESTIGATION ===

${codeInvestigation}

=== TEST PLAN ===

${testPlan}

=== REPORT REQUIREMENTS ===

Use the exact seven required sections from your system instructions.

Make the report repository-specific.
Do not add unsupported assumptions.
`,

    stopWhen: stepCountIs(1),
    maxRetries: 1,
    maxOutputTokens: 5000,
  });

  const output = result.text.trim();

  if (!output) {
    throw new Error("Orchestrator returned an empty output.");
  }

  return output;
}