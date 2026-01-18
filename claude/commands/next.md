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

Present interactive options:
- Up to **3 issues** (CLI already sorts yours first)
- **Always** include "Product planning" as an option
- If >3 issues, note how many more
- User can always type a specific issue ID

## Starting Work on an Issue

When the user selects an issue (or provides one directly via `/next ISSUE-12`):

1. Run `linear issue start <id>` to assign and set In Progress
2. Run `linear branch <id>` to create a git branch
3. Run `linear issue show <id>` to display full context
4. **Enter plan mode** to explore the codebase and design an implementation approach

## If they choose "Product planning"

Ask what they want to focus on:
- Review and prioritize backlog
- Brainstorm new features
- Plan the next phase

Then follow the product-planning skill guidelines.

## Notes

- Always use long flags (--unblocked, not -u) for clarity
- The CLI already sorts your assigned issues first
- The "Product planning" option ensures there's always something productive to do
