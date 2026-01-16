---
name: product-planning
description: Help with product planning, feature brainstorming, and backlog management using Linear.
allowed-tools: Bash(linear:*), Bash(curl:*)
---

# Product Planning Skill

Help the developer think through product direction, brainstorm features, and manage their Linear backlog.

## When to Use This Skill

Use this skill when the developer wants to:
- Brainstorm new features or improvements
- Review and prioritize the backlog
- Break down large ideas into actionable issues
- Plan a new phase or milestone
- Think through product strategy

## Approach

### 1. Understand Current State

First, gather context:

```bash
# See all open issues (backlog + in progress, excludes completed)
linear issues --open

# See active projects/phases
linear projects
```

### 2. Facilitate Discussion

Ask good questions to help clarify thinking:

- "What problem are we trying to solve?"
- "Who benefits from this feature?"
- "What's the simplest version that would be valuable?"
- "What are the dependencies or blockers?"
- "How does this fit with the current phase?"

### 3. Break Down Ideas

When a feature is identified, help break it into Linear issues:

**For small features (S/M):**
- Create a single issue with clear acceptance criteria
- Assign appropriate estimate

**For large features (L/XL):**
- Create a parent issue describing the overall goal
- Break into sub-issues, each S or M sized
- Identify dependencies between sub-issues

```bash
# Create parent issue
linear issue create --title "User authentication system" --estimate L --project "Phase 2"

# Create sub-issues
linear issue create --title "Design auth flow" --parent ISSUE-10 --estimate S
linear issue create --title "Implement login endpoint" --parent ISSUE-10 --estimate M
linear issue create --title "Add session management" --parent ISSUE-10 --estimate M --blocked-by ISSUE-12
```

### 4. Organize Into Phases

If planning a new phase:

```bash
# Create the phase
linear project create "Phase 3: User Dashboard" --description "Build the main user-facing dashboard with key metrics"

# Add issues to it
linear issue create --title "Dashboard layout" --project "Phase 3" --estimate M
```

## Brainstorming Prompts

When the developer is stuck, try these prompts:

**For new features:**
- "What do users complain about most?"
- "What manual process could we automate?"
- "What would make you excited to use this product?"

**For improvements:**
- "Where do users get confused?"
- "What takes too long?"
- "What breaks most often?"

**For prioritization:**
- "What would have the biggest impact with the least effort?"
- "What's blocking other work?"
- "What do users ask for most?"

## Output Format

After a planning session, summarize:

1. **New issues created** - List with IDs and estimates
2. **Backlog changes** - Any reprioritization or updates
3. **Next steps** - What to work on next
4. **Open questions** - Things that need more thought

## Example Session

```
Developer: "I want to add user notifications"

Claude: Let me check the current state...
[runs linear issues --all]

Good context. A few questions:
1. What triggers notifications? (events, mentions, etc.)
2. Where do they appear? (in-app, email, push?)
3. Is this blocking other work?

Developer: "Just in-app for now, triggered by comments on their issues"

That's a nicely scoped M-sized feature. Let me create it:
[runs linear issue create --title "In-app notifications for issue comments" --estimate M --project "Phase 2"]

Created ISSUE-15. Should I break this down further, or is it small enough to tackle as one unit?
```

## Integration with /next

When invoked from the `/next` command (user chose "product planning"), start by asking:

"What would you like to focus on today?"
- Review and prioritize the backlog
- Brainstorm new features
- Plan the next phase
- Something specific (let them describe)
