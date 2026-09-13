import "dotenv/config";

import { analyzeIssue } from "./agents/issue-analyst.js";
import { investigateCode } from "./agents/code-investigator.js";
import { runTestAgent } from "./agents/test-agent.js";
import { runOrchestrator } from "./agents/orchestrator.js";
import { runPatchAgent } from "./agents/patch-agent.js";

import { getAuthenticatedUser, ensureFork } from "./tools/github.js";

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const [repository, issueNumberInput] = process.argv.slice(2);

if (!repository || !issueNumberInput) {
  console.error(
    "Usage: npm run dev -- <owner/repository> <issue-number>",
  );
  process.exit(1);
}

const repositoryParts = repository.split("/");

if (repositoryParts.length !== 2) {
  console.error(
    "Invalid repository. Expected format: owner/repository",
  );
  process.exit(1);
}

const [sourceOwner, repositoryName] = repositoryParts;

if (!sourceOwner || !repositoryName) {
  console.error(
    "Invalid repository. Expected format: owner/repository",
  );
  process.exit(1);
}

const issueNumber = Number(issueNumberInput);

if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
  console.error(
    "Invalid issue number. Use a positive integer.",
  );
  process.exit(1);
}

async function askForApproval(): Promise<boolean> {
  const readline = createInterface({
    input,
    output,
  });

  const answer = await readline.question(
    "\nDo you approve this report and want to create a branch and prepare a PR? (yes/no): ",
  );

  readline.close();

  return ["yes", "y"].includes(answer.trim().toLowerCase());
}

function requireOutput(
  agentName: string,
  outputValue: string,
): string {
  const output = outputValue.trim();

  if (!output) {
    throw new Error(`${agentName} returned an empty output.`);
  }

  return output;
}

async function main(): Promise<void> {
  const authenticatedUser = await getAuthenticatedUser();

  const targetRepository =
    `${authenticatedUser.login}/${repositoryName}`;

  console.log(`Source repository: ${repository}`);
  console.log(`Target fork: ${targetRepository}`);
  console.log("Target base branch will be detected from the fork.\n");

  console.log("Starting Issue Analyst Agent...\n");

  const issueAnalysis = requireOutput(
    "Issue Analyst",
    await analyzeIssue(
      sourceOwner,
      repositoryName,
      issueNumber,
    ),
  );

  console.log("\n=== ISSUE ANALYSIS ===\n");
  console.log(issueAnalysis);

  console.log("\nStarting Code Investigator Agent...\n");

  const codeInvestigation = requireOutput(
    "Code Investigator",
    await investigateCode(
      sourceOwner,
      repositoryName,
      issueNumber,
      issueAnalysis,
    ),
  );

  console.log("\n=== CODE INVESTIGATION ===\n");
  console.log(codeInvestigation);

  console.log("\nStarting Test Agent...\n");

  const testPlan = requireOutput(
    "Test Agent",
    await runTestAgent(
      sourceOwner,
      repositoryName,
      issueAnalysis,
      codeInvestigation,
    ),
  );

  console.log("\n=== TEST PLAN ===\n");
  console.log(testPlan);

  console.log("\nStarting Orchestrator Agent...\n");

  const finalReport = requireOutput(
    "Orchestrator",
    await runOrchestrator(
      sourceOwner,
      repositoryName,
      issueNumber,
      issueAnalysis,
      codeInvestigation,
      testPlan,
    ),
  );

  console.log("\n=== FINAL ENGINEERING REPORT ===\n");
  console.log(finalReport);

  const approved = await askForApproval();

  if (!approved) {
    console.log("\nReport rejected. No code changes were made.");
    return;
  }

  console.log(`\nEnsuring ${targetRepository} exists as a fork...`);

  const fork = await ensureFork(sourceOwner, repositoryName);
  const resolvedTargetRepository = `${fork.owner}/${fork.repo}`;
  const targetBranch = fork.defaultBranch;

  console.log(
    fork.alreadyExisted
      ? `Fork already existed: ${resolvedTargetRepository}`
      : `Created fork: ${resolvedTargetRepository}`,
  );
  console.log(`Using target base branch: ${targetBranch}`);

  console.log("\nStarting Patch Agent...\n");

  const patchResult = await runPatchAgent(
    sourceOwner,
    repositoryName,
    issueNumber,
    finalReport,
    resolvedTargetRepository,
    targetBranch,
  );

  console.log("\n=== PATCH AGENT RESULT ===\n");
  console.log(patchResult);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error("\nAgent failed:", message);
  process.exit(1);
});