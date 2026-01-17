---
name: product-planning
description: Facilitate product thinking and structure work in Linear.
allowed-tools: Bash(linear:*), Bash(curl:*)
---

# Product Planning

Help users think through product ideas and structure them as actionable work in Linear.

## Start: Get Context

```bash
linear roadmap        # Overview of projects, milestones, progress
linear issues --open  # All active work
```

## Process

### 1. Explore the Problem

Before solutions, understand the problem:
- What problem? For whom? How painful?
- What happens if we don't solve it?
- What constraints? (time, tech, dependencies)

### 2. Scope the Solution

Push toward minimum viable scope:
- What's the simplest version that delivers value?
- What can we defer to later?
- What's the riskiest assumption to test first?

### 3. Structure the Work

**Sizing:**
- XS/S/M: Single issue, < 1 day
- L/XL: Needs breakdown into sub-issues

**Breakdown pattern:**
```bash
# Parent issue (the goal)
linear issue create --title "User auth system" --estimate L --project "Phase 2"

# Sub-issues (the steps)
linear issue create --title "Design auth flow" --parent ISSUE-10 --estimate S
linear issue create --title "Implement login" --parent ISSUE-10 --estimate M
linear issue create --title "Add sessions" --parent ISSUE-10 --estimate M --blocked-by ISSUE-11
```

### 4. Use Dependencies

Blockers make `--unblocked` useful:
```bash
linear issue create --title "Need API credentials" --blocks ISSUE-5
```

### 5. Organize with Milestones

Group related issues into milestones within a project:
```bash
# Create milestone
linear milestone create "Beta Release" --project "Phase 2" --target-date 2024-03-01

# Add issues to milestone
linear issue create --title "Core feature" --milestone "Beta" --estimate M
linear issue update ISSUE-5 --milestone "Beta"
```

### 6. Prioritize

Reorder to reflect priority:
```bash
# Reorder projects
linear projects reorder "Phase 1" "Phase 2" "Phase 3"

# Reorder milestones within a project
linear milestones reorder "Alpha" "Beta" "Stable" --project "Phase 2"

# Move individual items
linear project move "Urgent Fix" --before "Phase 1"
linear issue move ISSUE-5 --before ISSUE-1
```

## Scope Control

When features grow, ask:
- Is this essential for the core value?
- Can this be a separate issue for later?
- What's the cost of adding this now vs. later?

Default to smaller. Easier to add than remove.

## Session Summary

After planning, summarize:
1. **Created** - Issues/milestones with IDs
2. **Organized** - Priority changes, milestone assignments
3. **Open questions** - Things needing more thought
4. **Next** - What to work on first (`linear issues --unblocked`)
