import { tool } from "ai";
import { z } from "zod";

const githubIssueSchema = z.object({
  owner: z.string().describe("GitHub repository owner"),
  repo: z.string().describe("GitHub repository name"),
  issueNumber: z
    .number()
    .int()
    .positive()
    .describe("GitHub issue number"),
});

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

export async function getAuthenticatedUser(): Promise<{
  login: string;
}> {
  const response = await fetch(
    "https://api.github.com/user",
    {
      headers: getGitHubHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to get authenticated GitHub user: ${response.status} ${response.statusText}`,
    );
  }

  const user = (await response.json()) as {
    login?: string;
  };

  if (!user.login) {
    throw new Error(
      "GitHub API response did not contain an authenticated username.",
    );
  }

  return {
    login: user.login,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensures a fork of `${sourceOwner}/${repo}` exists under the authenticated
 * user, creating it if necessary, and waits until GitHub has finished
 * provisioning it (forks are created asynchronously).
 *
 * The rest of the pipeline (createBranch, updateRepositoryFile,
 * createPullRequest) silently assumed this fork already existed. Without
 * this check, the Patch Agent's very first tool call (reading the base
 * branch ref in the "target fork") would 404 for any repository the user
 * had not manually forked ahead of time.
 */
export async function ensureFork(
  sourceOwner: string,
  repo: string,
): Promise<{
  owner: string;
  repo: string;
  defaultBranch: string;
  alreadyExisted: boolean;
}> {
  const headers = getGitHubHeaders();
  const authenticatedUser = await getAuthenticatedUser();
  const targetOwner = authenticatedUser.login;

  const existingResponse = await fetch(
    `https://api.github.com/repos/${targetOwner}/${repo}`,
    { headers },
  );

  if (existingResponse.ok) {
    const data = (await existingResponse.json()) as {
      fork?: boolean;
      default_branch?: string;
      parent?: { full_name?: string };
    };

    if (data.fork && data.parent?.full_name === `${sourceOwner}/${repo}`) {
      if (!data.default_branch) {
        throw new Error(
          `The existing fork ${targetOwner}/${repo} did not report a default branch.`,
        );
      }

      return {
        owner: targetOwner,
        repo,
        defaultBranch: data.default_branch,
        alreadyExisted: true,
      };
    }

    throw new Error(
      `A repository named "${repo}" already exists under ${targetOwner} ` +
        `but is not a fork of ${sourceOwner}/${repo}. Refusing to use it ` +
        `as the patch target.`,
    );
  }

  if (existingResponse.status !== 404) {
    const error = await existingResponse.text();

    throw new Error(
      `Unable to check for an existing fork: ${existingResponse.status} ${error}`,
    );
  }

  const forkResponse = await fetch(
    `https://api.github.com/repos/${sourceOwner}/${repo}/forks`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );

  if (!forkResponse.ok) {
    const error = await forkResponse.text();

    throw new Error(
      `Failed to fork ${sourceOwner}/${repo}: ${forkResponse.status} ${error}`,
    );
  }

  // Fork creation is asynchronous on GitHub's side; poll until it is queryable.
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await delay(1500);

    const pollResponse = await fetch(
      `https://api.github.com/repos/${targetOwner}/${repo}`,
      { headers },
    );

    if (pollResponse.ok) {
      const data = (await pollResponse.json()) as {
        default_branch?: string;
        fork?: boolean;
        parent?: { full_name?: string };
      };

      if (
        data.fork &&
        data.parent?.full_name === `${sourceOwner}/${repo}` &&
        data.default_branch
      ) {
        return {
          owner: targetOwner,
          repo,
          defaultBranch: data.default_branch,
          alreadyExisted: false,
        };
      }
    }
  }

  throw new Error(
    `Forked ${sourceOwner}/${repo} to ${targetOwner}/${repo}, but it did ` +
      `not become available within the expected time.`,
  );
}

export const getIssue = tool({
  description:
    "Read a GitHub issue from any public repository.",

  inputSchema: githubIssueSchema,

  execute: async ({
    owner,
    repo,
    issueNumber,
  }) => {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        headers: getGitHubHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const issue = (await response.json()) as {
      title?: string;
      body?: string | null;
      state?: string;
      labels?: Array<{
        name?: string;
      }>;
      html_url?: string;
    };

    return {
      title: issue.title ?? "",
      body: issue.body ?? "",
      state: issue.state ?? "",
      labels:
        issue.labels?.map((label) => label.name ?? "") ?? [],
      htmlUrl: issue.html_url ?? "",
    };
  },
});