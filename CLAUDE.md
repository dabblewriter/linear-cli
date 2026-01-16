# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A zero-dependency Linear CLI for AI-assisted development workflows. Single-file implementation (`bin/linear.mjs`) that wraps Linear's GraphQL API.

## Development

This is a single-file CLI with no build step. The entire implementation is in `bin/linear.mjs`.

```bash
# Run locally during development
node bin/linear.mjs <command>

# Test the postinstall script
node postinstall.mjs
```

No tests exist currently. The CLI requires Node 18+ (uses native `fetch`).

## Architecture

**Single-file design**: All CLI logic lives in `bin/linear.mjs` (~2000 lines). This is intentional - zero npm dependencies, just Node.js built-ins.

**Configuration loading** (priority order):
1. `./.linear` (project-specific)
2. `~/.linear` (global fallback)
3. Environment variables (`LINEAR_API_KEY`, `LINEAR_TEAM`)

**Key functions**:
- `gql()` - GraphQL client using native fetch
- `parseArgs()` - Custom argument parser supporting `--flag value` and `--boolean` patterns
- `cmd*()` functions - Command handlers (e.g., `cmdIssues`, `cmdIssueCreate`)

**Postinstall** (`postinstall.mjs`): Copies Claude skill/command files from `claude/` to `~/.claude/` and adds `Bash(linear:*)` permission to `~/.claude/settings.json`.

## Claude Code Integration

The `claude/` directory contains files installed to `~/.claude/`:
- `skills/linear-cli.md` - Teaches Claude how to use the CLI
- `skills/product-planning.md` - Product planning workflows
- `commands/next.md` - `/next` command implementation
- `commands/done.md` - `/done` command implementation
- `commands/standup.md` - `/standup` command implementation

## Git Conventions

Branch names: `ISSUE-ID-slugified-title` (e.g., `ISSUE-5-add-caching-layer`)

Commit messages should include issue ID: `ISSUE-5: Add cache invalidation`

## Key CLI Features

- `--unblocked` filter: Finds issues with no active blockers (the main differentiator)
- Worktree support: `linear next` creates isolated git worktrees in `~/.claude-worktrees/`
- `.worktreeinclude`: Lists gitignored files to copy to new worktrees (e.g., `.linear`, `.env`)
- T-shirt sizing: XS/S/M/L/XL estimates map to Linear's numeric scale
