# /next - Find the next issue to work on

Help the developer find and start working on their next Linear issue, or do product planning.

## Usage

```
/next           # Show unblocked issues to choose from
/next ISSUE-12   # Skip selection, start working on ISSUE-12 directly
```

## If an issue ID is provided

Skip straight to starting work on that issue (see "Starting Work on an Issue" below).

## If no issue ID is provided

1. Run `linear issues --unblocked` to get issues ready to work on
2. Parse the output and count the issues
3. Present options using the format below

### Presenting Options

Always present a numbered list with these rules:
- Show up to **5 issues maximum** (yours are already sorted first by the CLI)
- If more than 5 issues exist, note how many more after the list
- **Always** include "Product planning" as the final option

### Format

```
Here's what's ready to work on:

1. ISSUE-5: Add caching layer [Backlog] (assigned to you)
2. ISSUE-8: Fix login timeout [Backlog]
3. ISSUE-12: Update API docs [Backlog]
4. ISSUE-18: Do Something Else [Backlog]
5. ISSUE-29: Another thing [Backlog]
   ... and 7 more unblocked issues
6. Product planning - brainstorm features, review backlog, plan next phase

Which would you like to work on?
```

### If NO unblocked issues:

```
No unblocked issues at the moment.

1. Product planning - brainstorm features, review backlog, plan next phase

Would you like to work on product planning?
```

### If exactly ONE issue:

```
There's one issue ready to work on:

1. ISSUE-5: Add caching layer [Backlog] (assigned to you)
2. Product planning - brainstorm features, review backlog, plan next phase

Which would you like?
```

## Starting Work on an Issue

When the user selects an issue (or provides one directly via `/next ISSUE-12`):

1. Run `linear issue start <id>` to assign and set In Progress
2. Run `linear branch <id>` to create a git branch
3. Run `linear issue show <id>` to display full context
4. **Enter plan mode** using the EnterPlanMode tool

This ensures every issue starts with a proper implementation plan before writing code.

## If they choose "Product planning"

Start a planning session by asking:

"What would you like to focus on?"
- Review and prioritize the backlog
- Brainstorm new features
- Plan the next phase
- Something specific

Then follow the product-planning skill guidelines to facilitate the session.

## Notes

- Always use long flags (--unblocked, not -u) for clarity
- The CLI already sorts your assigned issues first
- If presenting options, use the AskUserQuestion tool for a clean interface
- The "Product planning" option ensures there's always something productive to do
