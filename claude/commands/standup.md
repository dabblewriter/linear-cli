# /standup - Daily standup summary

Generate a summary of your work for standup meetings.

## Usage

```
/standup        # Show standup summary from Linear + GitHub
```

## What It Shows

Run `linear standup` to get:

**From Linear:**
- Issues you completed yesterday
- Issues currently in progress
- Issues that are blocked

**From GitHub (across all repos):**
- Commits you made yesterday, grouped by repo
- PRs you opened or merged yesterday

## After Running

1. Present the output from `linear standup` to the user
2. Ask what they want to do next:
   - Draft standup message (for Slack/Teams)
   - Find next issue (run /next)
   - Resolve blockers

## Example Flow

```
User: /standup

Claude: [Runs linear standup]

Here's your standup summary:

**Yesterday:**
✓ ISSUE-5: Add caching layer
✓ ISSUE-6: Fix login timeout

**Today:**
→ ISSUE-8: Implement worktree support

**Blocked:**
⊘ ISSUE-12: Waiting on API credentials

**GitHub (all repos):**
- dabble/beautiful-tech: 4 commits
- dabble/linear-cli: 2 commits
- PR #42 merged: ISSUE-5: Add caching layer

[Presents options above]
```

## Notes

- The `linear standup` command handles all the data fetching
- GitHub info requires the `gh` CLI to be installed and authenticated
- Shows activity across all GitHub repos, not just the current one
- Use `--no-github` flag to skip GitHub even if available
