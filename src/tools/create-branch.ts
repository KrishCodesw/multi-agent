import { tool } from "ai";
import { z } from "zod";

function getGitHubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is missing from the environment.",
    );
  }

  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "github-issue-agent",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export const createBranch = tool({
  description:
    "Create a new branch in a GitHub repository from a base branch.",

  inputSchema: z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    branchName: z.string().describe("New feature branch name"),
    baseBranch: z
      .string()
      .describe("Branch from which the new branch is created"),
  }),

  execute: async ({
    owner,
    repo,
    branchName,
    baseBranch,
  }) => {
    const headers = getGitHubHeaders();

    const baseRefUrl =
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(baseBranch)}`;

    const refResponse = await fetch(baseRefUrl, {
      headers,
    });

    if (!refResponse.ok) {
      const error = await refResponse.text();

      throw new Error(
        `Unable to find base branch "${baseBranch}" in ${owner}/${repo}: ${refResponse.status} ${error}`,
      );
    }

    const refData = (await refResponse.json()) as {
      object?: {
        sha?: string;
      };
    };

    const baseSha = refData.object?.sha;

    if (!baseSha) {
      throw new Error(
        `GitHub did not return a commit SHA for ${owner}/${repo}:${baseBranch}.`,
      );
    }

    const createRefUrl =
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`;

    const response = await fetch(createRefUrl, {
      method: "POST",

      headers: {
        ...headers,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });

    if (!response.ok) {
      const error = await response.text();

      throw new Error(
        `Branch creation failed: ${response.status} ${error}`,
      );
    }

    return {
      success: true,
      repository: `${owner}/${repo}`,
      branchName,
      baseBranch,
      baseSha,
    };
  },
});