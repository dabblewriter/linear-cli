# @dabble/linear-cli

A cross-platform Linear CLI with unblocked issue filtering, built for AI-assisted development.

## Installation

```bash
npm install -g @dabble/linear-cli
```

This installs:
- The `linear` command globally
- A Claude Code skill to `~/.claude/skills/linear-cli.md`
- The `/next` command to `~/.claude/commands/next.md`
- Permission for Claude to use `linear` in `~/.claude/settings.json`

## Quick Start

```bash
# First-time setup (opens browser, prompts for API key, pick team)
linear login

# Find issues ready to work on (no blockers)
linear issues --unblocked

# View issue details
linear issue show ISSUE-1

# Update issue with notes
linear issue update ISSUE-1 --append "Found the root cause..."
```

## Features

- **`--unblocked` filter**: Find issues with no active blockers—our killer feature
- **Per-project config**: Different Linear accounts per directory (`./.linear`)
- **Full CRUD**: Issues, sub-issues, projects, comments
- **Cross-platform**: Works on macOS, Linux, and Windows
- **Zero dependencies**: Uses only Node.js built-ins (requires Node 18+)
- **Claude Code skill**: Auto-installs skill file for AI-assisted workflows

## Commands

### Authentication
```bash
linear login              # Interactive setup (prompts for location)
linear logout             # Remove config
linear whoami             # Show current user and team
```

### Issues
```bash
linear issues                        # Default: backlog + todo
linear issues --unblocked           # Ready to work on
linear issues --open                # All non-completed issues
linear issues --status in-progress  # Filter by status
linear issues --status todo --status in-progress  # Multiple statuses
linear issues --mine                # Only your issues
linear issues --label bug           # Filter by label
linear issue show ISSUE-1            # Full details with parent context
linear issue start ISSUE-1           # Assign to you + set In Progress
linear issue create --title "..." --project "Phase 1" --assign --estimate M
linear issue create --title "..." --blocked-by ISSUE-2
linear issue create --title "Sub-task" --parent ISSUE-1
linear issue update ISSUE-1 --append "Notes..."
linear issue update ISSUE-1 --blocks ISSUE-3
linear issue close ISSUE-1
linear issue comment ISSUE-1 "Comment"
```

### Git Integration
```bash
linear branch ISSUE-1                # Create branch: ISSUE-1-issue-title
```

### Worktrees (Parallel Development)
```bash
linear next                         # Pick an issue, create worktree, start Claude
linear next --dry-run               # Preview what would happen
linear done                         # Close issue, show worktree cleanup commands
linear done --no-close              # Just show cleanup commands
linear standup                      # Daily standup summary (Linear + GitHub)
linear standup --no-github          # Linear only
```

The `next` command creates isolated git worktrees for each issue, making it easy to work on multiple issues in parallel with Claude Code. Worktrees are stored in `~/.claude-worktrees/<repo>/<branch>`.

**Shell setup** (add to `~/.zshrc` or `~/.bashrc`):
```bash
lnext() { eval "$(linear next "$@")"; }
```

Then use `lnext` to:
1. See a list of unblocked issues
2. Pick one interactively
3. Create a git worktree in `~/.claude-worktrees/`
4. Copy `.worktreeinclude` files (like `.linear`)
5. Run package manager install
6. Change to the worktree directory
7. Launch Claude in plan mode with the issue context

**`.worktreeinclude` file**: List gitignored files/directories that should be copied to new worktrees:
```
.linear
.env
```

### Labels
```bash
linear labels                       # List all labels
linear label create "bug" --color "#FF0000"
```

### Projects
```bash
linear projects                     # Active projects
linear projects --all               # Include completed
linear project show "Phase 1"       # Details with issues
linear project create "Name" --description "..."
linear project complete "Phase 1"   # Mark done
```

## Configuration

Config is loaded in order:
1. `./.linear` (project-specific)
2. `~/.linear` (global fallback)
3. Environment variables

```bash
# .linear file format
api_key=lin_api_xxx
team=ISSUE

# Or use environment variables
export LINEAR_API_KEY=lin_api_xxx
export LINEAR_TEAM=ISSUE
```

## Claude Code Integration

This CLI is designed to work seamlessly with Claude Code. After installation:

- **Skill file** (`~/.claude/skills/linear-cli.md`): Teaches Claude how to use the CLI, including workflow guidelines and git conventions.

- **`/next` command** (`~/.claude/commands/next.md`): Run `/next` in Claude Code to find your next issue to work on.
  - `/next` - List unblocked issues to choose from
  - `/next ISSUE-12` - Skip selection, start working on a specific issue
  - Always enters plan mode to design the implementation before coding
  - Includes "Product planning" option to brainstorm features or review backlog

- **`/done` command** (`~/.claude/commands/done.md`): Run `/done` to wrap up work on an issue.
  - Summarizes commits and changes made
  - Offers to create PR, add notes, and/or close the issue
  - Shows worktree cleanup commands if in a worktree

- **`/standup` command** (`~/.claude/commands/standup.md`): Run `/standup` for daily standup.
  - Shows issues completed yesterday, in progress today, and blocked
  - Includes GitHub commits and PRs from yesterday
  - Offers to draft a standup message

- **Global permission**: Adds `Bash(linear:*)` to `~/.claude/settings.json` so Claude can use the CLI anywhere without prompting.

## Why This Exists

We tried existing Linear CLIs but hit bugs. This CLI does exactly what we need with zero npm dependencies.

## License

MIT
