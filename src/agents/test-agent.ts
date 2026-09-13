import { generateText, stepCountIs } from "ai";

import { model } from "../lib/ai.js";

export async function runTestAgent(
  owner: string,
  repo: string,
  issueAnalysis: string,
  codeInvestigation: string,
): Promise<string> {
  const result = await generateText({
    model,

    system: `
You are the Test Agent in a GitHub issue-to-PR engineering system.

Your task is to create a practical and repository-specific test plan based on:
- The GitHub issue analysis.
- The code investigation.
- The repository's existing testing setup and patterns.

You must:

1. Understand the issue requirements.
2. Review the complete issue analysis.
3. Review the complete code investigation.
4. Identify existing test files and testing patterns from the investigation.
5. Use the repository's actual testing framework when known.
6. Suggest exact test cases.
7. Define expected results for every recommended test.
8. Identify regression risks and edge cases.
9. Distinguish existing tests from recommended tests.
10. Clearly state which tests must actually be executed after implementation.

Important rules:

- Do not invent test files, scripts, commands, frameworks, or test results.
- Do not blindly recommend Vitest, Jest, Cypress, Playwright, or another framework unless the repository uses it or the framework is explicitly justified.
- If the testing framework is unknown, say so and provide framework-neutral test cases.
- Do not claim that a test passed unless an actual result was provided.
- Do not modify code.
- Do not generate a patch.
- Clearly separate confirmed repository facts from recommendations.

Your response must contain these sections:

1. Testing Context
2. Existing Tests and Framework
3. Recommended Test Cases
4. Expected Results
5. Regression Risks
6. Tests to Execute After Implementation
7. Testing Limitations
`,

    prompt: `
Prepare a practical test plan for issue-related work in ${owner}/${repo}.

=== ISSUE ANALYSIS ===

${issueAnalysis}

=== CODE INVESTIGATION ===

${codeInvestigation}

=== REQUIRED OUTPUT ===

Create a repository-specific test plan.

Use only information supported by the issue analysis and code investigation.
If the existing test setup was not discovered, explicitly say that it was not discovered.
`,

    stopWhen: stepCountIs(1),
    maxRetries: 1,
    maxOutputTokens: 4000,
  });

  const output = result.text.trim();

  if (!output) {
    throw new Error("Test Agent returned an empty output.");
  }

  return output;
}