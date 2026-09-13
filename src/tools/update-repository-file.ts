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

export const updateRepositoryFile = tool({
  description:
    "Create or update a file in a GitHub repository branch.",

  inputSchema: z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    path: z.string().describe("File path inside the repository"),
    content: z.string().describe("Complete new file content"),
    branchName: z.string().describe("Branch to update"),
    commitMessage: z.string().describe("Git commit message"),
  }),

  execute: async ({
    owner,
    repo,
    path,
    content,
    branchName,
    commitMessage,
  }) => {
    const headers = getGitHubHeaders();

    const encodedPath = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const fileUrl =
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branchName)}`;

    const existingResponse = await fetch(fileUrl, {
      headers,
    });

    let sha: string | undefined;

    if (existingResponse.ok) {
      const existingFile = (await existingResponse.json()) as {
        sha?: string;
      };

      sha = existingFile.sha;
    } else if (existingResponse.status !== 404) {
      const error = await existingResponse.text();

      throw new Error(
        `Unable to inspect existing file: ${existingResponse.status} ${error}`,
      );
    }

    const updateUrl =
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

    const response = await fetch(updateUrl, {
      method: "PUT",

      headers: {
        ...headers,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(content, "utf-8").toString("base64"),
        branch: branchName,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.text();

      throw new Error(
        `File update failed: ${response.status} ${error}`,
      );
    }

    const data = (await response.json()) as {
      commit?: {
        sha?: string;
      };
      content?: {
        html_url?: string;
      };
    };

    return {
      success: true,
      repository: `${owner}/${repo}`,
      path,
      branchName,
      commitSha: data.commit?.sha,
      fileUrl: data.content?.html_url,
    };
  },
});