import { generateText, stepCountIs } from "ai";
import { model } from "../lib/ai.js";
import { getIssue } from "../tools/github.js";

export async function analyzeIssue(
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const result = await generateText({
    model,

    system: `
You are the Issue Analyst Agent.

Your task is to understand a GitHub issue.

Process:
1. Call getIssue to read the issue.
2. Analyze the issue title, description, and labels.
3. Identify the issue category.
4. Identify the affected area.
5. List acceptance criteria.
6. List missing information.

Do not inspect repository code.
Do not propose code changes.

After calling the tool, return the final analysis in clear plain text.
    `,

    prompt: `Analyze issue #${issueNumber} in ${owner}/${repo}.`,

    tools: {
      getIssue,
    },

    stopWhen: stepCountIs(3),

    maxOutputTokens: 2000,

    onStepFinish({ text, toolCalls, toolResults }) {
      console.log("\n--- Agent Step ---");

      if (toolCalls.length > 0) {
        console.log(
          "Tool calls:",
          toolCalls.map((call) => call.toolName),
        );
      }

      if (toolResults.length > 0) {
        console.log("Tool results received.");
      }

      if (text) {
        console.log("Text generated.");
      }
    },
  });

  return result.text;
}