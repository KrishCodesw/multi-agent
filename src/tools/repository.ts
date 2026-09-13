import { tool } from "ai";
import { z } from "zod";

const repositoryFileSchema = z.object({
  owner: z.string().describe("GitHub repository owner"),
  repo: z.string().describe("GitHub repository name"),
  path: z
    .string()
    .describe(
      "File or directory path inside the repository. Use an empty string to inspect the repository root.",
    ),
});

type GitHubContentItem = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
};

type GitHubFileResponse = {
  type: "file";
  path: string;
  encoding?: string;
  content?: string;
};

type GitHubDirectoryResponse = GitHubContentItem[];

function getGitHubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;

  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "github-issue-agent",
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
  };
}

export const readRepositoryFile = tool({
  description:
    "Inspect the root, directory, or file of any GitHub repository. " +
    "Use an empty path to inspect the repository root. " +
    "Use a directory path to list its contents. " +
    "Use a file path to read its complete contents.",

  inputSchema: repositoryFileSchema,

  execute: async ({
    owner,
    repo,
    path,
  }): Promise<
    | {
        type: "directory";
        path: string;
        files: GitHubContentItem[];
      }
    | {
        type: "file";
        path: string;
        content: string;
      }
  > => {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");

    const encodedPath = normalizedPath
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const url = encodedPath
      ? `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`
      : `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;

    const response = await fetch(url, {
      method: "GET",
      headers: getGitHubHeaders(),
    });

    if (!response.ok) {
      const errorBody = await response.text();

      throw new Error(
        `GitHub repository request failed for ${owner}/${repo}/${normalizedPath || "(root)"}: ` +
          `${response.status} ${response.statusText}. ` +
          `${errorBody}`,
      );
    }

    const data = (await response.json()) as
      | GitHubDirectoryResponse
      | GitHubFileResponse;

    if (Array.isArray(data)) {
      return {
        type: "directory",
        path: normalizedPath,
        files: data.map((item) => ({
          name: item.name,
          path: item.path,
          type: item.type,
        })),
      };
    }

    if (data.type !== "file") {
      throw new Error(
        `Unsupported GitHub content type for path: ${normalizedPath}`,
      );
    }

    if (data.encoding !== "base64" || !data.content) {
      throw new Error(
        `GitHub did not return base64 file content for: ${normalizedPath}`,
      );
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");

    return {
      type: "file",
      path: normalizedPath,
      content,
    };
  },
});