/**
 * Workspace ↔ AgentRun repository matching.
 *
 * Pure module (no vscode imports) so it can be exercised outside the
 * extension host — dev scripts and tests hit it directly against a live
 * cluster via AgentRunClient.
 */
import type { AgentRun } from "./types";

/**
 * Normalize a git URL for equality comparison: strip the scheme
 * (https/http/ssh/git@ shorthand), a trailing ".git" and trailing
 * slashes, then lowercase. Mirrors utilities/git.ts normalizeGitUrl,
 * which stays module-private there (and that module imports vscode).
 */
export function normalizeRepoUrl(url: string): string {
  let normalized = url.trim();
  // ssh://[user@]host/path — any user, not just git@ (Bitbucket/AzDO vary)
  normalized = normalized.replace(/^ssh:\/\/(?:[^/@]+@)?([^/]+)\//, "$1/");
  normalized = normalized
    .replace(/^https?:\/\//, "")
    .replace(/^git:\/\//, "")
    // scp-like shorthand user@host:path -> host/path
    .replace(/^([^/@]+)@([^:/]+):/, "$2/")
    // residual userinfo, e.g. https://alice@bitbucket.org/... after scheme strip
    .replace(/^[^/@]+@/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  // Case-insensitive compare: hosts always are, and the dominant forges
  // (GitHub/GitLab) treat repo paths case-insensitively too. Trade-off:
  // on case-sensitive self-hosted servers, two repos differing only by
  // path case would collide.
  return normalized.toLowerCase();
}

/** The run's declared repository param, if any. */
export function runRepository(run: AgentRun): string | undefined {
  return run.spec.params?.find((p) => p.name === "repository")?.value;
}

/** The run's declared branch param, if any. */
export function runBranch(run: AgentRun): string | undefined {
  return run.spec.params?.find((p) => p.name === "branch")?.value;
}

/**
 * Running AgentRuns whose repository param points at the given workspace
 * remote (any scheme/.git spelling), newest first.
 */
export function matchRunsToRemote(runs: AgentRun[], remoteUrl: string): AgentRun[] {
  const want = normalizeRepoUrl(remoteUrl);
  if (!want) {
    return [];
  }
  return runs
    .filter((r) => r.status?.phase === "Running")
    .filter((r) => {
      const repo = runRepository(r);
      return repo !== undefined && normalizeRepoUrl(repo) === want;
    })
    .sort((a, b) =>
      (b.metadata.creationTimestamp ?? "").localeCompare(a.metadata.creationTimestamp ?? ""),
    );
}
