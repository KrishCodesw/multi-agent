import { generateText, stepCountIs } from "ai";

import { strongModel } from "../lib/ai.js";

import { readRepositoryFile } from "../tools/repository.js";
import { createBranch } from "../tools/create-branch.js";
import { updateRepositoryFile } from "../tools/update-repository-file.js";
import { createPullRequest } from "../tools/create-pull-request.js";

export async function runPatchAgent(
  sourceOwner: string,
  sourceRepo: string,
  issueNumber: number,
  finalReport: string,
  targetRepository: string,
  targetBranch: string,
): Promise<string> {
  const [targetOwner, targetRepo] = targetRepository.split("/");

  if (!targetOwner || !targetRepo) {
    throw new Error(
      `Invalid target repository: ${targetRepository}`,
    );
  }

  const result = await generateText({
    model: strongModel,

    system: `
You are the Patch Agent.

Implement only the changes described in the approved engineering report.

Rules:

- Work only after explicit user approval.
- Never modify main or master directly.
- Create a separate feature branch.
- Inspect relevant files before editing. You MUST call readRepositoryFile to
  fetch the CURRENT, EXACT content of every file you intend to change before
  calling updateRepositoryFile. updateRepositoryFile always overwrites the
  ENTIRE file, so never call it without first reading that exact file in
  this session.
- Make minimal changes: start from the real file content you just read and
  apply the smallest edit that satisfies the report. Do not rewrite files
  from memory or assumption.
- Do not modify unrelated files.
- Do not invent file contents, file paths, or line numbers that you have not
  actually read via readRepositoryFile in this session.
- Use a unique feature branch name that includes the issue number, such as
  fix/issue-${issueNumber}. If that branch already exists, choose another
  unique name rather than modifying an existing branch.
- Prepare a pull request.
- If implementation cannot be completed (e.g. a required file cannot be
  read, or the report is too ambiguous to implement safely), explain why in
  your final answer instead of guessing.

Repository workflow:

1. Use readRepositoryFile to read the current content of every file in the
   source repository that you plan to change (and any other files you need
   for context).
2. Create the feature branch in the target fork with createBranch.
3. For each file to change, call updateRepositoryFile with the FULL updated
   file content (the file you read in step 1, with your edits applied) in
   the target fork's feature branch.
4. Create a pull request in the upstream (source) repository with
   createPullRequest.
5. The pull request head must be:
   <target-owner>:<feature-branch>
6. The pull request base must be the provided target base branch.
7. Pass the issue number to createPullRequest so the PR is linked to the issue.
`,

    prompt: `
Source repository: ${sourceOwner}/${sourceRepo}

Issue Number: #${issueNumber}

Target fork: ${targetRepository}

Target base branch: ${targetBranch}

Approved Engineering Report:

${finalReport}

First, use readRepositoryFile to read every file you plan to change (and any
file you need for context) from the SOURCE repository below. Then create a
feature branch in the target fork, implement the required changes, and
prepare a pull request from the target fork into the source repository.

Use these repositories correctly:

- Source repository for reading files and for pull request creation:
  ${sourceOwner}/${sourceRepo}

- Target fork for branch creation and file updates:
  ${targetRepository}

- Target base branch:
  ${targetBranch}

- Pull request head:
  ${targetOwner}:<feature-branch>

- Pull request must resolve issue #${issueNumber}.
`,

    tools: {
      readRepositoryFile,
      createBranch,
      updateRepositoryFile,
      createPullRequest,
    },

    stopWhen: stepCountIs(16),
    // Do not retry quota/rate-limit failures automatically.
    maxRetries: 0,
    maxOutputTokens: 4000,
  });

  const output = result.text.trim();

  if (!output) {
    throw new Error(
      "Patch Agent completed without producing a summary. Check the tool " +
        "calls above to see whether the branch, file updates, or pull " +
        "request actually succeeded.",
    );
  }

  return output;
}