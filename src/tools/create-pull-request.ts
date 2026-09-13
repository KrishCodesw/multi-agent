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

export const createPullRequest = tool({
  description:
    "Create a pull request from a fork branch into an upstream repository.",

  inputSchema: z.object({
    owner: z
      .string()
      .describe("Upstream repository owner"),

    repo: z
      .string()
      .describe("Upstream repository name"),

    headOwner: z
      .string()
      .describe("Owner of the fork containing the feature branch"),

    branchName: z
      .string()
      .describe("Feature branch name in the fork"),

    baseBranch: z
      .string()
      .describe("Target branch in the upstream repository"),

    title: z
      .string()
      .describe("Pull request title"),

    body: z
      .string()
      .describe("Pull request description"),

    issueNumber: z
      .number()
      .int()
      .positive()
      .describe("Issue number this pull request resolves"),
  }),

  execute: async ({
    owner,
    repo,
    headOwner,
    branchName,
    baseBranch,
    title,
    body,
    issueNumber,
  }) => {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",

        headers: {
          ...getGitHubHeaders(),
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          title,

          /*
           * For a cross-repository pull request, GitHub expects:
           *
           * head: "fork-owner:branch-name"
           */
          head: `${headOwner}:${branchName}`,

          base: baseBranch,
          body: `${body}\n\nCloses #${issueNumber}`,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();

      throw new Error(
        `Pull request creation failed: ${response.status} ${error}`,
      );
    }

    const data = (await response.json()) as {
      number?: number;
      html_url?: string;
      head?: {
        ref?: string;
        label?: string;
      };
      base?: {
        ref?: string;
        label?: string;
      };
    };

    return {
      success: true,
      pullRequestNumber: data.number,
      pullRequestUrl: data.html_url,
      head: data.head?.label ?? `${headOwner}:${branchName}`,
      base: data.base?.label ?? `${owner}:${baseBranch}`,
      branchName,
    };
  },
});