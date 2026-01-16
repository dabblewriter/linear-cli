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

**From GitHub (if in a repo):**
- Commits you made yesterday
- PRs you opened or merged yesterday

## After Running

1. Present the output from `linear standup` to the user
2. Offer to help with:
   - Drafting a standup message for Slack/Teams
   - Identifying what to work on next (suggest `/next`)
   - Resolving any blockers

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

**GitHub:**
- 4 commits on beautiful-tech
- PR #42 merged: ISSUE-5: Add caching layer

Would you like me to help draft a standup message, or shall we look at what to work on next?
```

## Notes

- The `linear standup` command handles all the data fetching
- GitHub info requires the `gh` CLI to be installed and authenticated
- If not in a git repo, GitHub section will be skipped
- Use `--no-github` flag to skip GitHub even if available
