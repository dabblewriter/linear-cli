# /done - Complete work on an issue

Help the developer wrap up their work on the current Linear issue.

## Usage

```
/done           # Complete the issue detected from branch name
/done ISSUE-12   # Complete a specific issue
```

## Steps

1. **Detect the issue** from the branch name or use the provided ID
2. **Summarize the work** by checking:
   - `git log --oneline <base>..HEAD` to see commits
   - `git diff --stat <base>..HEAD` to see files changed
3. **Ask what they want to do** using AskUserQuestion:
   - Close the issue in Linear
   - Create a PR first
   - Add final notes to the issue
   - Just clean up (worktree only)

## After Selection

### If they want to create a PR:
1. Run `gh pr create --title "ISSUE-12: Issue title" --body "..."` with a summary
2. Then proceed to closing if requested

### If they want to add notes:
1. Ask what notes to add
2. Run `linear issue update ISSUE-12 --append "..."` with the notes

### If they want to close:
1. Run `linear done ISSUE-12` to close the issue

### Worktree cleanup:
If in a worktree, `linear done` will output commands to clean up. Let the user know they can copy those commands or run them manually.

## Example Flow

```
User: /done

Claude: Let me check what you've been working on...

[Runs git log and git diff]

You've made 3 commits on ISSUE-12: Add caching layer
- src/cache.ts (new file, 45 lines)
- src/api.ts (modified, +12 -3)

What would you like to do?
1. Create PR and close issue
2. Close issue (no PR)
3. Add notes and close
4. Just clean up worktree (don't close)
```

## Notes

- Always show a summary of the work done before asking
- If there are no commits, skip the PR option
- The `linear done` command handles the mechanical parts (closing, worktree detection)
- Don't auto-close - always confirm with the user first
