import { generateText, stepCountIs } from "ai";

import { strongModel } from "../lib/ai.js";
import { readRepositoryFile } from "../tools/repository.js";

export async function investigateCode(
  owner: string,
  repo: string,
  issueNumber: number,
  issueAnalysis: string,
): Promise<string> {
  const result = await generateText({
    model: strongModel,

    system: `
You are the Code Investigator Agent in a GitHub issue-to-PR engineering system.

Your task is to investigate the repository and determine exactly how the reported issue
relates to the existing implementation.

You must:

1. Inspect the repository using the available repository tools.
2. Start by reading the repository root or repository file listing if available.
3. Identify the most relevant files based on the issue analysis.
4. Read the relevant source files.
5. Understand how the current implementation works.
6. Identify the likely root cause, missing implementation, or affected behavior.
7. Mention exact file paths.
8. Mention relevant functions, components, routes, classes, or code sections.
9. Identify existing tests or testing patterns when they are visible.
10. Clearly separate confirmed findings from assumptions.

Important rules:

- You must investigate the repository yourself.
- Do not ask the user which files or directories to inspect.
- Do not stop after reading only one file unless the repository genuinely contains no other relevant files.
- Do not invent files, routes, frameworks, APIs, functions, or implementation details.
- Use repository tools before making conclusions.
- Do not modify files.
- Do not write a final patch.
- If a required file cannot be accessed, explicitly state that limitation.
- If the issue analysis is incomplete, still inspect the repository and explain what can and cannot be confirmed.

Your response must contain these sections:

1. Investigation Summary
2. Repository Areas Inspected
3. Relevant Files
4. Current Implementation
5. Root Cause or Missing Implementation
6. Existing Tests
7. Uncertainties and Limitations
`,

    prompt: `
Investigate GitHub issue #${issueNumber} in ${owner}/${repo}.

=== ISSUE ANALYSIS ===

${issueAnalysis}

=== INVESTIGATION INSTRUCTIONS ===

Begin by inspecting the repository root.

Then:
- Locate the application entry points.
- Locate files related to the issue.
- Read the relevant files.
- Trace the current behavior.
- Explain what must change to resolve the issue.

Do not ask the user for additional file paths.
`,

    tools: {
      readRepositoryFile,
    },

    stopWhen: stepCountIs(10),
    // Retrying quota/rate-limit failures immediately makes the limit worse.
    maxRetries: 0,
    maxOutputTokens: 5000,
  });

const output = result.text.trim();

if (!output) {
  throw new Error(
    "Code Investigator completed without producing an investigation report. " +
    "The repository inspection tool may have failed or returned unusable results.",
  );
}

return output;
}