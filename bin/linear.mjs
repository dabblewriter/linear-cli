#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import { exec, execSync } from 'child_process';

// ============================================================================
// CONFIG
// ============================================================================

const API_URL = 'https://api.linear.app/graphql';
let CONFIG_FILE = '';
let LINEAR_API_KEY = '';
let TEAM_KEY = '';
let ALIASES = {};

// Colors (ANSI)
const colors = {
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  blue: s => `\x1b[34m${s}\x1b[0m`,
  gray: s => `\x1b[90m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
};

// ============================================================================
// UTILITIES
// ============================================================================

function loadConfig() {
  const localPath = join(process.cwd(), '.linear');
  const globalPath = join(homedir(), '.linear');

  // Priority: ./.linear > ~/.linear > env vars
  if (existsSync(localPath)) {
    CONFIG_FILE = localPath;
  } else if (existsSync(globalPath)) {
    CONFIG_FILE = globalPath;
  }

  // Load from config file first (highest priority)
  if (CONFIG_FILE) {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    let inAliasSection = false;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Check for section header
      if (trimmed === '[aliases]') {
        inAliasSection = true;
        continue;
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inAliasSection = false;
        continue;
      }

      const [key, ...rest] = line.split('=');
      const value = rest.join('=').trim();

      if (inAliasSection) {
        // Store aliases with uppercase keys
        ALIASES[key.trim().toUpperCase()] = value;
      } else {
        if (key.trim() === 'api_key') LINEAR_API_KEY = value;
        if (key.trim() === 'team') TEAM_KEY = value;
      }
    }
  }

  // Fall back to env vars if not set by config file
  if (!LINEAR_API_KEY) LINEAR_API_KEY = process.env.LINEAR_API_KEY || '';
  if (!TEAM_KEY) TEAM_KEY = process.env.LINEAR_TEAM || '';
}

function resolveAlias(nameOrAlias) {
  if (!nameOrAlias) return nameOrAlias;
  return ALIASES[nameOrAlias.toUpperCase()] || nameOrAlias;
}

function saveAlias(code, name) {
  if (!CONFIG_FILE) {
    console.error(colors.red('Error: No config file found. Run "linear login" first.'));
    process.exit(1);
  }

  const content = readFileSync(CONFIG_FILE, 'utf-8');
  const lines = content.split('\n');

  // Find or create [aliases] section
  let aliasStart = -1;
  let aliasEnd = -1;
  let existingAliasLine = -1;
  const upperCode = code.toUpperCase();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '[aliases]') {
      aliasStart = i;
    } else if (aliasStart !== -1 && aliasEnd === -1) {
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        aliasEnd = i;
      } else if (trimmed && !trimmed.startsWith('#')) {
        const [key] = trimmed.split('=');
        if (key.trim().toUpperCase() === upperCode) {
          existingAliasLine = i;
        }
      }
    }
  }

  // If no alias section end found, it goes to EOF
  if (aliasStart !== -1 && aliasEnd === -1) {
    aliasEnd = lines.length;
  }

  const aliasLine = `${upperCode}=${name}`;

  if (existingAliasLine !== -1) {
    // Update existing alias
    lines[existingAliasLine] = aliasLine;
  } else if (aliasStart !== -1) {
    // Add to existing section
    lines.splice(aliasStart + 1, 0, aliasLine);
  } else {
    // Create new section at end
    if (lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push('[aliases]');
    lines.push(aliasLine);
  }

  writeFileSync(CONFIG_FILE, lines.join('\n'));
  ALIASES[upperCode] = name;
}

function removeAlias(code) {
  if (!CONFIG_FILE) {
    console.error(colors.red('Error: No config file found.'));
    process.exit(1);
  }

  const upperCode = code.toUpperCase();
  if (!ALIASES[upperCode]) {
    console.error(colors.red(`Alias not found: ${code}`));
    process.exit(1);
  }

  const content = readFileSync(CONFIG_FILE, 'utf-8');
  const lines = content.split('\n');
  let inAliasSection = false;

  const newLines = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed === '[aliases]') {
      inAliasSection = true;
      return true;
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inAliasSection = false;
      return true;
    }
    if (inAliasSection && trimmed && !trimmed.startsWith('#')) {
      const [key] = trimmed.split('=');
      if (key.trim().toUpperCase() === upperCode) {
        return false;
      }
    }
    return true;
  });

  writeFileSync(CONFIG_FILE, newLines.join('\n'));
  delete ALIASES[upperCode];
}

function checkAuth() {
  if (!LINEAR_API_KEY) {
    console.error(colors.red("Error: Not logged in. Run 'linear login' first."));
    process.exit(1);
  }
}

async function gql(query, variables = {}) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': LINEAR_API_KEY,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    console.error(colors.red(`Network error: ${err.message}`));
    process.exit(1);
  }

  if (!response.ok) {
    console.error(colors.red(`HTTP error: ${response.status} ${response.statusText}`));
    process.exit(1);
  }

  const json = await response.json();

  if (json.errors?.length) {
    console.error(colors.red(`API error: ${json.errors[0].message}`));
    process.exit(1);
  }

  return json;
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

function suggestTeamKey(teamName) {
  // Generate acronym from first letter of each word
  const words = teamName.trim().split(/\s+/);
  let key = words.map(w => w[0] || '').join('').toUpperCase();

  // If single word or very short, use first 3-4 chars instead
  if (key.length < 2) {
    key = teamName.trim().slice(0, 4).toUpperCase().replace(/\s+/g, '');
  }

  // Ensure it's at least 2 chars and max 5
  return key.slice(0, 5) || 'TEAM';
}

function openBrowser(url) {
  let cmd;
  if (process.platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (process.platform === 'win32') {
    // start requires cmd /c, and first quoted arg is window title (so pass empty)
    cmd = `cmd /c start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd);
}

// Strip ANSI escape codes for length calculation
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function formatTable(rows) {
  if (rows.length === 0) return '';
  const colWidths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      // Use visible length (without ANSI codes) for width calculation
      colWidths[i] = Math.max(colWidths[i] || 0, stripAnsi(String(cell)).length);
    });
  }
  return rows.map(row =>
    row.map((cell, i) => {
      const str = String(cell);
      const visibleLen = stripAnsi(str).length;
      // Pad based on visible length, not string length
      return str + ' '.repeat(Math.max(0, colWidths[i] - visibleLen));
    }).join('  ')
  ).join('\n');
}

function parseArgs(args, flags = {}) {
  const result = { _: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--') || arg.startsWith('-')) {
      const key = arg.replace(/^-+/, '');
      const flagDef = flags[key];
      if (flagDef === 'boolean') {
        result[key] = true;
      } else {
        const value = args[++i];
        if (value === undefined || value.startsWith('-')) {
          console.error(colors.red(`Error: --${key} requires a value`));
          process.exit(1);
        }
        result[key] = value;
      }
    } else {
      result._.push(arg);
    }
    i++;
  }
  return result;
}

// ============================================================================
// ISSUES
// ============================================================================

async function cmdIssues(args) {
  const opts = parseArgs(args, {
    unblocked: 'boolean', u: 'boolean',
    all: 'boolean', a: 'boolean',
    open: 'boolean', o: 'boolean',
    backlog: 'boolean', b: 'boolean',
    mine: 'boolean', m: 'boolean',
    'in-progress': 'boolean',
    project: 'string', p: 'string',
    milestone: 'string',
    state: 'string', s: 'string',
    label: 'string', l: 'string',
  });

  const inProgress = opts['in-progress'];
  const unblocked = opts.unblocked || opts.u;
  const allStates = opts.all || opts.a;
  const openOnly = opts.open || opts.o;
  const backlogOnly = opts.backlog || opts.b;
  const mineOnly = opts.mine || opts.m;
  const projectFilter = opts.project || opts.p;
  const milestoneFilter = opts.milestone;
  const stateFilter = opts.state || opts.s;
  const labelFilter = opts.label || opts.l;

  // Get current user ID for filtering/sorting
  const viewerResult = await gql('{ viewer { id } }');
  const viewerId = viewerResult.data?.viewer?.id;

  const query = `{
    team(id: "${TEAM_KEY}") {
      issues(first: 100) {
        nodes {
          identifier
          title
          priority
          sortOrder
          state { name type }
          project { name }
          projectMilestone { name }
          assignee { id name }
          labels { nodes { name } }
          relations(first: 20) {
            nodes {
              type
              relatedIssue { identifier state { type } }
            }
          }
        }
      }
    }
  }`;

  const result = await gql(query);
  let issues = result.data?.team?.issues?.nodes || [];

  // Check if any issues have assignees (to decide whether to show column)
  const hasAssignees = issues.some(i => i.assignee);

  // Sort: assigned to you first, then by priority, then by sortOrder
  issues.sort((a, b) => {
    const aIsMine = a.assignee?.id === viewerId;
    const bIsMine = b.assignee?.id === viewerId;
    if (aIsMine && !bIsMine) return -1;
    if (!aIsMine && bIsMine) return 1;
    // Then by priority (higher = more urgent)
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    // Then by sortOrder
    return (b.sortOrder || 0) - (a.sortOrder || 0);
  });

  // Helper to format issue row
  const formatRow = (i) => {
    const row = [
      i.identifier,
      i.title,
      i.state.name,
      i.project?.name || '-'
    ];
    if (hasAssignees) {
      const assignee = i.assignee?.id === viewerId ? 'you' : (i.assignee?.name || '-');
      row.push(assignee);
    }
    return row;
  };

  // Helper to apply common filters (mine, label, project, milestone)
  const applyFilters = (list) => {
    let filtered = list;
    if (mineOnly) {
      filtered = filtered.filter(i => i.assignee?.id === viewerId);
    }
    if (labelFilter) {
      filtered = filtered.filter(i =>
        i.labels?.nodes?.some(l => l.name.toLowerCase() === labelFilter.toLowerCase())
      );
    }
    if (projectFilter) {
      const resolvedProject = resolveAlias(projectFilter);
      filtered = filtered.filter(i =>
        i.project?.name?.toLowerCase().includes(resolvedProject.toLowerCase())
      );
    }
    if (milestoneFilter) {
      const resolvedMilestone = resolveAlias(milestoneFilter);
      filtered = filtered.filter(i =>
        i.projectMilestone?.name?.toLowerCase().includes(resolvedMilestone.toLowerCase())
      );
    }
    return filtered;
  };

  if (unblocked) {
    // Collect all blocked issue IDs
    const blocked = new Set();
    for (const issue of issues) {
      for (const rel of issue.relations?.nodes || []) {
        if (rel.type === 'blocks') {
          blocked.add(rel.relatedIssue.identifier);
        }
      }
    }

    // Filter to unblocked, non-completed issues
    let filtered = issues.filter(i =>
      !['completed', 'canceled'].includes(i.state.type) &&
      !blocked.has(i.identifier)
    );

    filtered = applyFilters(filtered);

    console.log(colors.bold('Unblocked Issues:\n'));
    console.log(formatTable(filtered.map(formatRow)));
  } else if (allStates) {
    let filtered = applyFilters(issues);

    console.log(colors.bold('All Issues:\n'));
    console.log(formatTable(filtered.map(formatRow)));
  } else if (openOnly) {
    // Open = everything except completed/canceled
    let filtered = issues.filter(i =>
      !['completed', 'canceled'].includes(i.state.type)
    );

    filtered = applyFilters(filtered);

    console.log(colors.bold('Open Issues:\n'));
    console.log(formatTable(filtered.map(formatRow)));
  } else if (inProgress) {
    let filtered = issues.filter(i => i.state.type === 'started');
    filtered = applyFilters(filtered);

    console.log(colors.bold('In Progress:\n'));
    console.log(formatTable(filtered.map(formatRow)));
  } else if (backlogOnly || stateFilter) {
    const targetState = stateFilter || 'backlog';
    let filtered = issues.filter(i =>
      i.state.type === targetState || i.state.name.toLowerCase() === targetState.toLowerCase()
    );

    filtered = applyFilters(filtered);

    console.log(colors.bold(`Issues (${targetState}):\n`));
    console.log(formatTable(filtered.map(formatRow)));
  } else {
    // Default: show backlog
    let filtered = issues.filter(i => i.state.type === 'backlog');
    filtered = applyFilters(filtered);

    console.log(colors.bold('Issues (backlog):\n'));
    console.log(formatTable(filtered.map(formatRow)));
  }
}

async function cmdIssueShow(args) {
  const issueId = args[0];
  if (!issueId) {
    console.error(colors.red('Error: Issue ID required'));
    process.exit(1);
  }

  // Enhanced query to get parent context with siblings
  const query = `{
    issue(id: "${issueId}") {
      identifier
      title
      description
      state { name }
      priority
      project { name }
      labels { nodes { name } }
      assignee { name }
      parent {
        identifier
        title
        description
        children { nodes { identifier title state { name } } }
        parent {
          identifier
          title
          children { nodes { identifier title state { name } } }
          parent {
            identifier
            title
          }
        }
      }
      children { nodes { identifier title state { name } } }
      relations(first: 20) {
        nodes {
          type
          relatedIssue { identifier title state { name } }
        }
      }
      comments { nodes { body createdAt user { name } } }
    }
  }`;

  const result = await gql(query);
  const issue = result.data?.issue;

  if (!issue) {
    console.error(colors.red(`Issue not found: ${issueId}`));
    process.exit(1);
  }

  console.log(`# ${issue.identifier}: ${issue.title}\n`);
  console.log(`State: ${issue.state.name}`);
  console.log(`Priority: ${issue.priority || 'None'}`);
  console.log(`Project: ${issue.project?.name || 'None'}`);
  console.log(`Assignee: ${issue.assignee?.name || 'Unassigned'}`);
  console.log(`Labels: ${issue.labels.nodes.map(l => l.name).join(', ') || 'None'}`);

  // Show parent context with siblings (where you are in the larger work)
  if (issue.parent) {
    console.log('\n## Context\n');

    // Build parent chain (walk up)
    const parentChain = [];
    let current = issue.parent;
    while (current) {
      parentChain.unshift(current);
      current = current.parent;
    }

    // Show parent chain
    for (let i = 0; i < parentChain.length; i++) {
      const parent = parentChain[i];
      const indent = '  '.repeat(i);
      console.log(`${indent}${colors.bold(parent.identifier)}: ${parent.title}`);

      // Show siblings at each level (children of this parent)
      const siblings = parent.children?.nodes || [];
      for (const sibling of siblings) {
        const sibIndent = '  '.repeat(i + 1);
        const isCurrent = sibling.identifier === issue.identifier;
        const isDirectParent = i === parentChain.length - 1;

        if (isCurrent && isDirectParent) {
          // This is the current issue - highlight it
          console.log(`${sibIndent}${colors.green('→')} [${sibling.state.name}] ${colors.green(sibling.identifier)}: ${sibling.title} ${colors.green('← you are here')}`);
        } else {
          console.log(`${sibIndent}- [${sibling.state.name}] ${sibling.identifier}: ${sibling.title}`);
        }
      }
    }

    // Show parent description if available (most immediate parent)
    const immediateParent = parentChain[parentChain.length - 1];
    if (immediateParent.description) {
      console.log(`\n### Parent Description (${immediateParent.identifier})\n`);
      // Show truncated description
      const desc = immediateParent.description;
      const truncated = desc.length > 500 ? desc.slice(0, 500) + '...' : desc;
      console.log(colors.gray(truncated));
    }
  }

  if (issue.children.nodes.length > 0) {
    console.log('\n## Sub-issues\n');
    for (const child of issue.children.nodes) {
      console.log(`  - [${child.state.name}] ${child.identifier}: ${child.title}`);
    }
  }

  const blockedBy = issue.relations.nodes.filter(r => r.type === 'is_blocked_by');
  if (blockedBy.length > 0) {
    console.log('\n## Blocked by\n');
    for (const rel of blockedBy) {
      console.log(`  - ${rel.relatedIssue.identifier}: ${rel.relatedIssue.title}`);
    }
  }

  const blocks = issue.relations.nodes.filter(r => r.type === 'blocks');
  if (blocks.length > 0) {
    console.log('\n## Blocks\n');
    for (const rel of blocks) {
      console.log(`  - ${rel.relatedIssue.identifier}: ${rel.relatedIssue.title}`);
    }
  }

  console.log('\n## Description\n');
  console.log(issue.description || 'No description');

  if (issue.comments.nodes.length > 0) {
    console.log('\n## Comments\n');
    for (const comment of issue.comments.nodes) {
      const date = comment.createdAt.split('T')[0];
      console.log(`**${comment.user.name}** (${date}):`);
      console.log(comment.body);
      console.log('');
    }
  }
}

// T-shirt size to Linear estimate mapping
const ESTIMATE_MAP = {
  'xs': 0,
  's': 1,
  'm': 2,
  'l': 3,
  'xl': 5,
};

async function cmdIssueCreate(args) {
  const opts = parseArgs(args, {
    title: 'string', t: 'string',
    description: 'string', d: 'string',
    project: 'string', p: 'string',
    milestone: 'string',
    parent: 'string',
    state: 'string', s: 'string',
    assign: 'boolean',
    estimate: 'string', e: 'string',
    label: 'string', l: 'string',
    blocks: 'string',
    'blocked-by': 'string',
  });

  const title = opts.title || opts.t || opts._[0];
  const description = opts.description || opts.d || '';
  const project = resolveAlias(opts.project || opts.p);
  const milestone = resolveAlias(opts.milestone);
  const parent = opts.parent;
  const shouldAssign = opts.assign;
  const estimate = (opts.estimate || opts.e || '').toLowerCase();
  const labelName = opts.label || opts.l;
  const blocksIssue = opts.blocks;
  const blockedByIssue = opts['blocked-by'];

  if (!title) {
    console.error(colors.red('Error: Title is required'));
    console.error('Usage: linear issue create --title "Issue title" [--project "..."] [--milestone "..."] [--parent ISSUE-X] [--estimate M] [--assign] [--label bug] [--blocks ISSUE-X] [--blocked-by ISSUE-X]');
    process.exit(1);
  }

  // Validate estimate
  if (estimate && !ESTIMATE_MAP.hasOwnProperty(estimate)) {
    console.error(colors.red(`Error: Invalid estimate "${estimate}". Use: XS, S, M, L, or XL`));
    process.exit(1);
  }

  // Get team UUID (required for mutations)
  const teamResult = await gql(`{ team(id: "${TEAM_KEY}") { id } }`);
  const teamId = teamResult.data?.team?.id;

  if (!teamId) {
    console.error(colors.red(`Error: Team not found: ${TEAM_KEY}`));
    process.exit(1);
  }

  // Look up project and milestone IDs
  let projectId = null;
  let milestoneId = null;
  if (project || milestone) {
    const projectsResult = await gql(`{
      team(id: "${TEAM_KEY}") {
        projects(first: 50) {
          nodes {
            id name
            projectMilestones { nodes { id name } }
          }
        }
      }
    }`);
    const projects = projectsResult.data?.team?.projects?.nodes || [];

    if (project) {
      const projectMatch = projects.find(p => p.name.toLowerCase().includes(project.toLowerCase()));
      if (projectMatch) {
        projectId = projectMatch.id;
        // Look for milestone within this project
        if (milestone) {
          const milestoneMatch = projectMatch.projectMilestones?.nodes?.find(m =>
            m.name.toLowerCase().includes(milestone.toLowerCase())
          );
          if (milestoneMatch) milestoneId = milestoneMatch.id;
        }
      }
    } else if (milestone) {
      // Search all projects for the milestone
      for (const p of projects) {
        const milestoneMatch = p.projectMilestones?.nodes?.find(m =>
          m.name.toLowerCase().includes(milestone.toLowerCase())
        );
        if (milestoneMatch) {
          projectId = p.id; // Auto-set project from milestone
          milestoneId = milestoneMatch.id;
          break;
        }
      }
    }
  }

  // Look up label ID
  let labelIds = [];
  if (labelName) {
    const labelsResult = await gql(`{
      team(id: "${TEAM_KEY}") {
        labels(first: 100) { nodes { id name } }
      }
    }`);
    const labels = labelsResult.data?.team?.labels?.nodes || [];
    const match = labels.find(l => l.name.toLowerCase() === labelName.toLowerCase());
    if (match) {
      labelIds.push(match.id);
    } else {
      console.error(colors.yellow(`Warning: Label "${labelName}" not found. Creating issue without label.`));
    }
  }

  // Get current user ID if assigning
  let assigneeId = null;
  if (shouldAssign) {
    const viewerResult = await gql('{ viewer { id } }');
    assigneeId = viewerResult.data?.viewer?.id;
  }

  const mutation = `
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { identifier title url estimate }
      }
    }
  `;

  const input = { teamId, title, description };
  if (projectId) input.projectId = projectId;
  if (milestoneId) input.projectMilestoneId = milestoneId;
  if (parent) input.parentId = parent;
  if (assigneeId) input.assigneeId = assigneeId;
  if (estimate) input.estimate = ESTIMATE_MAP[estimate];
  if (labelIds.length > 0) input.labelIds = labelIds;

  const result = await gql(mutation, { input });

  if (result.data?.issueCreate?.success) {
    const issue = result.data.issueCreate.issue;
    const estLabel = estimate ? ` [${estimate.toUpperCase()}]` : '';
    console.log(colors.green(`Created: ${issue.identifier}${estLabel}`));
    console.log(issue.url);

    // Create blocking relations if specified
    if (blocksIssue || blockedByIssue) {
      const relationMutation = `
        mutation($input: IssueRelationCreateInput!) {
          issueRelationCreate(input: $input) { success }
        }
      `;

      if (blocksIssue) {
        // This issue blocks another issue
        await gql(relationMutation, {
          input: { issueId: issue.identifier, relatedIssueId: blocksIssue, type: 'blocks' }
        });
        console.log(colors.gray(`  → blocks ${blocksIssue}`));
      }

      if (blockedByIssue) {
        // This issue is blocked by another issue
        await gql(relationMutation, {
          input: { issueId: blockedByIssue, relatedIssueId: issue.identifier, type: 'blocks' }
        });
        console.log(colors.gray(`  → blocked by ${blockedByIssue}`));
      }
    }
  } else {
    console.error(colors.red('Failed to create issue'));
    console.error(result.errors?.[0]?.message || JSON.stringify(result));
    process.exit(1);
  }
}

async function cmdIssueUpdate(args) {
  const issueId = args[0];
  if (!issueId) {
    console.error(colors.red('Error: Issue ID required'));
    process.exit(1);
  }

  const opts = parseArgs(args.slice(1), {
    title: 'string', t: 'string',
    description: 'string', d: 'string',
    state: 'string', s: 'string',
    project: 'string', p: 'string',
    milestone: 'string',
    append: 'string', a: 'string',
    blocks: 'string',
    'blocked-by': 'string',
  });

  const blocksIssue = opts.blocks;
  const blockedByIssue = opts['blocked-by'];
  const projectName = resolveAlias(opts.project || opts.p);
  const milestoneName = resolveAlias(opts.milestone);
  const input = {};

  if (opts.title || opts.t) input.title = opts.title || opts.t;

  // Handle append
  if (opts.append || opts.a) {
    const currentResult = await gql(`{ issue(id: "${issueId}") { description } }`);
    const current = currentResult.data?.issue?.description || '';
    input.description = current + '\n\n' + (opts.append || opts.a);
  } else if (opts.description || opts.d) {
    input.description = opts.description || opts.d;
  }

  // Handle state
  if (opts.state || opts.s) {
    const stateName = opts.state || opts.s;
    const statesResult = await gql(`{
      team(id: "${TEAM_KEY}") {
        states { nodes { id name } }
      }
    }`);
    const states = statesResult.data?.team?.states?.nodes || [];
    const match = states.find(s => s.name.toLowerCase().includes(stateName.toLowerCase()));
    if (match) input.stateId = match.id;
  }

  // Handle project and milestone
  if (projectName || milestoneName) {
    const projectsResult = await gql(`{
      team(id: "${TEAM_KEY}") {
        projects(first: 50) {
          nodes {
            id name
            projectMilestones { nodes { id name } }
          }
        }
      }
    }`);
    const projects = projectsResult.data?.team?.projects?.nodes || [];

    if (projectName) {
      const projectMatch = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));
      if (projectMatch) {
        input.projectId = projectMatch.id;
        if (milestoneName) {
          const milestoneMatch = projectMatch.projectMilestones?.nodes?.find(m =>
            m.name.toLowerCase().includes(milestoneName.toLowerCase())
          );
          if (milestoneMatch) input.projectMilestoneId = milestoneMatch.id;
        }
      }
    } else if (milestoneName) {
      // Search all projects for the milestone
      for (const p of projects) {
        const milestoneMatch = p.projectMilestones?.nodes?.find(m =>
          m.name.toLowerCase().includes(milestoneName.toLowerCase())
        );
        if (milestoneMatch) {
          input.projectId = p.id;
          input.projectMilestoneId = milestoneMatch.id;
          break;
        }
      }
    }
  }

  // Handle blocking relations (can be set even without other updates)
  const hasRelationUpdates = blocksIssue || blockedByIssue;

  if (Object.keys(input).length === 0 && !hasRelationUpdates) {
    console.error(colors.red('Error: No updates specified'));
    process.exit(1);
  }

  // Update issue fields if any
  if (Object.keys(input).length > 0) {
    const mutation = `
      mutation($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue { identifier title state { name } }
        }
      }
    `;

    const result = await gql(mutation, { id: issueId, input });

    if (result.data?.issueUpdate?.success) {
      const issue = result.data.issueUpdate.issue;
      console.log(colors.green(`Updated: ${issue.identifier}`));
      console.log(`${issue.identifier}: ${issue.title} [${issue.state.name}]`);
    } else {
      console.error(colors.red('Failed to update issue'));
      console.error(result.errors?.[0]?.message || JSON.stringify(result));
      process.exit(1);
    }
  }

  // Create blocking relations if specified
  if (hasRelationUpdates) {
    const relationMutation = `
      mutation($input: IssueRelationCreateInput!) {
        issueRelationCreate(input: $input) { success }
      }
    `;

    if (blocksIssue) {
      await gql(relationMutation, {
        input: { issueId: issueId, relatedIssueId: blocksIssue, type: 'blocks' }
      });
      console.log(colors.green(`${issueId} now blocks ${blocksIssue}`));
    }

    if (blockedByIssue) {
      await gql(relationMutation, {
        input: { issueId: blockedByIssue, relatedIssueId: issueId, type: 'blocks' }
      });
      console.log(colors.green(`${issueId} now blocked by ${blockedByIssue}`));
    }
  }
}

async function cmdIssueClose(args) {
  const issueId = args[0];
  if (!issueId) {
    console.error(colors.red('Error: Issue ID required'));
    process.exit(1);
  }

  // Find completed state
  const statesResult = await gql(`{
    team(id: "${TEAM_KEY}") {
      states { nodes { id name type } }
    }
  }`);
  const states = statesResult.data?.team?.states?.nodes || [];
  const doneState = states.find(s => s.type === 'completed');

  if (!doneState) {
    console.error(colors.red('Error: Could not find completed state'));
    process.exit(1);
  }

  const mutation = `
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { identifier }
      }
    }
  `;

  const result = await gql(mutation, { id: issueId, input: { stateId: doneState.id } });

  if (result.data?.issueUpdate?.success) {
    console.log(colors.green(`Closed: ${issueId}`));
  } else {
    console.error(colors.red('Failed to close issue'));
    console.error(result.errors?.[0]?.message || JSON.stringify(result));
    process.exit(1);
  }
}

async function cmdIssueStart(args) {
  const issueId = args[0];
  if (!issueId) {
    console.error(colors.red('Error: Issue ID required'));
    process.exit(1);
  }

  // Get current user and "In Progress" state
  const dataResult = await gql(`{
    viewer { id }
    team(id: "${TEAM_KEY}") {
      states { nodes { id name type } }
    }
  }`);

  const viewerId = dataResult.data?.viewer?.id;
  const states = dataResult.data?.team?.states?.nodes || [];
  const inProgressState = states.find(s => s.type === 'started');

  if (!inProgressState) {
    console.error(colors.red('Error: Could not find "In Progress" state'));
    process.exit(1);
  }

  const mutation = `
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { identifier title state { name } }
      }
    }
  `;

  const result = await gql(mutation, {
    id: issueId,
    input: { stateId: inProgressState.id, assigneeId: viewerId }
  });

  if (result.data?.issueUpdate?.success) {
    const issue = result.data.issueUpdate.issue;
    console.log(colors.green(`Started: ${issue.identifier}`));
    console.log(`${issue.identifier}: ${issue.title} [${issue.state.name}]`);
  } else {
    console.error(colors.red('Failed to start issue'));
    console.error(result.errors?.[0]?.message || JSON.stringify(result));
    process.exit(1);
  }
}

async function cmdIssueComment(args) {
  const issueId = args[0];
  const body = args.slice(1).join(' ');

  if (!issueId || !body) {
    console.error(colors.red('Error: Issue ID and comment body required'));
    console.error('Usage: linear issue comment ISSUE-1 "Comment text"');
    process.exit(1);
  }

  const mutation = `
    mutation($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
      }
    }
  `;

  const result = await gql(mutation, { input: { issueId, body } });

  if (result.data?.commentCreate?.success) {
    console.log(colors.green(`Comment added to ${issueId}`));
  } else {
    console.error(colors.red('Failed to add comment'));
    console.error(result.errors?.[0]?.message || JSON.stringify(result));
    process.exit(1);
  }
}

// ============================================================================
// PROJECTS
// ============================================================================

async function cmdProjects(args) {
  const opts = parseArgs(args, { all: 'boolean', a: 'boolean' });
  const showAll = opts.all || opts.a;

  const query = `{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) {
        nodes { id name description state progress }
      }
    }
  }`;

  const result = await gql(query);
  let projects = result.data?.team?.projects?.nodes || [];

  if (!showAll) {
    projects = projects.filter(p => !['completed', 'canceled'].includes(p.state));
  }

  // Find alias for a project (name must start with alias target)
  const findAliasFor = (name) => {
    const lowerName = name.toLowerCase();
    let bestMatch = null;
    let bestLength = 0;
    for (const [code, aliasName] of Object.entries(ALIASES)) {
      const lowerAlias = aliasName.toLowerCase();
      // Name must start with the alias target, and prefer longer matches
      if (lowerName.startsWith(lowerAlias) && lowerAlias.length > bestLength) {
        bestMatch = code;
        bestLength = lowerAlias.length;
      }
    }
    return bestMatch;
  };

  console.log(colors.bold('Projects:\n'));
  const rows = projects.map(p => {
    const alias = findAliasFor(p.name);
    const nameCol = alias ? `${colors.bold(`[${alias}]`)} ${p.name}` : p.name;
    return [nameCol, p.state, `${Math.floor(p.progress * 100)}%`];
  });
  console.log(formatTable(rows));
}

async function cmdProjectShow(args) {
  const projectName = args[0];
  if (!projectName) {
    console.error(colors.red('Error: Project name required'));
    process.exit(1);
  }

  const query = `{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) {
        nodes {
          id name description state progress
          issues { nodes { identifier title state { name } } }
        }
      }
    }
  }`;

  const result = await gql(query);
  const projects = result.data?.team?.projects?.nodes || [];
  const project = projects.find(p => p.name.includes(projectName));

  if (!project) {
    console.error(colors.red(`Project not found: ${projectName}`));
    process.exit(1);
  }

  console.log(`# ${project.name}\n`);
  console.log(`State: ${project.state}`);
  console.log(`Progress: ${Math.floor(project.progress * 100)}%`);
  console.log(`\n## Description\n${project.description || 'No description'}`);

  // Group issues by state
  const byState = {};
  for (const issue of project.issues.nodes) {
    const state = issue.state.name;
    if (!byState[state]) byState[state] = [];
    byState[state].push(issue);
  }

  console.log('\n## Issues\n');
  for (const [state, issues] of Object.entries(byState)) {
    console.log(`### ${state}`);
    for (const issue of issues) {
      console.log(`- ${issue.identifier}: ${issue.title}`);
    }
    console.log('');
  }
}

async function cmdProjectCreate(args) {
  const opts = parseArgs(args, {
    name: 'string', n: 'string',
    description: 'string', d: 'string',
  });

  const name = opts.name || opts.n || opts._[0];
  const description = opts.description || opts.d || '';

  if (!name) {
    console.error(colors.red('Error: Name is required'));
    console.error('Usage: linear project create "Project name" [--description "..."]');
    process.exit(1);
  }

  // Get team UUID
  const teamResult = await gql(`{ team(id: "${TEAM_KEY}") { id } }`);
  const teamId = teamResult.data?.team?.id;

  const mutation = `
    mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project { id name url }
      }
    }
  `;

  const result = await gql(mutation, {
    input: { name, description, teamIds: [teamId] }
  });

  if (result.data?.projectCreate?.success) {
    const project = result.data.projectCreate.project;
    console.log(colors.green(`Created project: ${project.name}`));
    console.log(project.url);
  } else {
    console.error(colors.red('Failed to create project'));
    console.error(result.errors?.[0]?.message || JSON.stringify(result));
    process.exit(1);
  }
}

async function cmdProjectComplete(args) {
  const projectName = args[0];
  if (!projectName) {
    console.error(colors.red('Error: Project name required'));
    process.exit(1);
  }

  // Find project
  const projectsResult = await gql(`{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) { nodes { id name } }
    }
  }`);
  const projects = projectsResult.data?.team?.projects?.nodes || [];
  const project = projects.find(p => p.name.includes(projectName));

  if (!project) {
    console.error(colors.red(`Project not found: ${projectName}`));
    process.exit(1);
  }

  const mutation = `
    mutation($id: String!, $input: ProjectUpdateInput!) {
      projectUpdate(id: $id, input: $input) {
        success
        project { name state }
      }
    }
  `;

  const result = await gql(mutation, { id: project.id, input: { state: 'completed' } });

  if (result.data?.projectUpdate?.success) {
    console.log(colors.green(`Completed project: ${projectName}`));
  } else {
    console.error(colors.red('Failed to complete project'));
    console.error(result.errors?.[0]?.message || JSON.stringify(result));
    process.exit(1);
  }
}

// ============================================================================
// MILESTONES
// ============================================================================

async function cmdMilestones(args) {
  const opts = parseArgs(args, {
    project: 'string', p: 'string',
    all: 'boolean', a: 'boolean',
  });
  const projectFilter = opts.project || opts.p;
  const showAll = opts.all || opts.a;

  const query = `{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) {
        nodes {
          id name state
          projectMilestones {
            nodes { id name targetDate sortOrder status }
          }
        }
      }
    }
  }`;

  const result = await gql(query);
  let projects = result.data?.team?.projects?.nodes || [];

  // Filter to active projects unless --all
  if (!showAll) {
    projects = projects.filter(p => !['completed', 'canceled'].includes(p.state));
  }

  // Filter by project name if specified (resolve alias first)
  if (projectFilter) {
    const resolvedFilter = resolveAlias(projectFilter);
    projects = projects.filter(p => p.name.toLowerCase().includes(resolvedFilter.toLowerCase()));
  }

  // Find alias for a name (name must start with alias target)
  const findAliasFor = (name) => {
    const lowerName = name.toLowerCase();
    let bestMatch = null;
    let bestLength = 0;
    for (const [code, aliasName] of Object.entries(ALIASES)) {
      const lowerAlias = aliasName.toLowerCase();
      // Name must start with the alias target, and prefer longer matches
      if (lowerName.startsWith(lowerAlias) && lowerAlias.length > bestLength) {
        bestMatch = code;
        bestLength = lowerAlias.length;
      }
    }
    return bestMatch;
  };

  console.log(colors.bold('Milestones:\n'));
  for (const project of projects) {
    const milestones = project.projectMilestones?.nodes || [];
    if (milestones.length === 0) continue;

    const projectAlias = findAliasFor(project.name);
    const projectHeader = projectAlias
      ? `${colors.bold(`[${projectAlias}]`)} ${colors.bold(project.name)}`
      : colors.bold(project.name);
    console.log(projectHeader);
    for (const m of milestones) {
      const milestoneAlias = findAliasFor(m.name);
      const namePrefix = milestoneAlias ? `${colors.bold(`[${milestoneAlias}]`)} ` : '';
      const date = m.targetDate ? ` (${m.targetDate})` : '';
      const status = m.status !== 'planned' ? ` [${m.status}]` : '';
      console.log(`  ${namePrefix}${m.name}${date}${status}`);
    }
    console.log('');
  }
}

async function cmdMilestoneShow(args) {
  const milestoneName = args[0];
  if (!milestoneName) {
    console.error(colors.red('Error: Milestone name required'));
    process.exit(1);
  }

  const query = `{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) {
        nodes {
          name
          projectMilestones {
            nodes {
              id name description targetDate status sortOrder
              issues { nodes { identifier title state { name type } } }
            }
          }
        }
      }
    }
  }`;

  const result = await gql(query);
  const projects = result.data?.team?.projects?.nodes || [];

  let milestone = null;
  let projectName = '';
  for (const p of projects) {
    const m = p.projectMilestones?.nodes?.find(m =>
      m.name.toLowerCase().includes(milestoneName.toLowerCase())
    );
    if (m) {
      milestone = m;
      projectName = p.name;
      break;
    }
  }

  if (!milestone) {
    console.error(colors.red(`Milestone not found: ${milestoneName}`));
    process.exit(1);
  }

  console.log(`# ${milestone.name}\n`);
  console.log(`Project: ${projectName}`);
  console.log(`Status: ${milestone.status}`);
  if (milestone.targetDate) console.log(`Target: ${milestone.targetDate}`);
  if (milestone.description) console.log(`\n## Description\n${milestone.description}`);

  const issues = milestone.issues?.nodes || [];
  if (issues.length > 0) {
    // Group by state type
    const done = issues.filter(i => i.state.type === 'completed');
    const inProgress = issues.filter(i => i.state.type === 'started');
    const backlog = issues.filter(i => !['completed', 'started', 'canceled'].includes(i.state.type));

    console.log('\n## Issues\n');
    if (inProgress.length > 0) {
      console.log('### In Progress');
      inProgress.forEach(i => console.log(`- ${i.identifier}: ${i.title}`));
      console.log('');
    }
    if (backlog.length > 0) {
      console.log('### Backlog');
      backlog.forEach(i => console.log(`- ${i.identifier}: ${i.title}`));
      console.log('');
    }
    if (done.length > 0) {
      console.log('### Done');
      done.forEach(i => console.log(`- ${i.identifier}: ${i.title}`));
      console.log('');
    }
  }
}

async function cmdMilestoneCreate(args) {
  const opts = parseArgs(args, {
    name: 'string', n: 'string',
    project: 'string', p: 'string',
    description: 'string', d: 'string',
    'target-date': 'string',
  });

  const name = opts.name || opts.n || opts._[0];
  const projectName = opts.project || opts.p;
  const description = opts.description || opts.d;
  const targetDate = opts['target-date'];

  if (!name) {
    console.error(colors.red('Error: Milestone name required'));
    console.error('Usage: linear milestone create "Name" --project "Project" [--target-date 2024-03-01]');
    process.exit(1);
  }

  if (!projectName) {
    console.error(colors.red('Error: Project required (--project)'));
    process.exit(1);
  }

  // Find project
  const projectsResult = await gql(`{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) { nodes { id name } }
    }
  }`);
  const projects = projectsResult.data?.team?.projects?.nodes || [];
  const project = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));

  if (!project) {
    console.error(colors.red(`Project not found: ${projectName}`));
    process.exit(1);
  }

  const mutation = `
    mutation($input: ProjectMilestoneCreateInput!) {
      projectMilestoneCreate(input: $input) {
        success
        projectMilestone { id name }
      }
    }
  `;

  const input = { projectId: project.id, name };
  if (description) input.description = description;
  if (targetDate) input.targetDate = targetDate;

  const result = await gql(mutation, { input });

  if (result.data?.projectMilestoneCreate?.success) {
    console.log(colors.green(`Created milestone: ${name}`));
    console.log(`Project: ${project.name}`);
  } else {
    console.error(colors.red('Failed to create milestone'));
    console.error(result.errors?.[0]?.message || JSON.stringify(result));
    process.exit(1);
  }
}

// ============================================================================
// ROADMAP
// ============================================================================

async function cmdRoadmap(args) {
  const opts = parseArgs(args, { all: 'boolean', a: 'boolean' });
  const showAll = opts.all || opts.a;

  // Fetch projects and milestones
  const projectsQuery = `{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) {
        nodes {
          id name state priority sortOrder targetDate startDate
          projectMilestones {
            nodes {
              id name targetDate status sortOrder
            }
          }
        }
      }
    }
  }`;

  // Fetch issues separately to avoid complexity limits
  const issuesQuery = `{
    team(id: "${TEAM_KEY}") {
      issues(first: 200) {
        nodes {
          id identifier title state { name type } sortOrder priority
          project { id }
          projectMilestone { id }
        }
      }
    }
  }`;

  const [projectsResult, issuesResult] = await Promise.all([
    gql(projectsQuery),
    gql(issuesQuery)
  ]);

  let projects = projectsResult.data?.team?.projects?.nodes || [];
  const allIssues = issuesResult.data?.team?.issues?.nodes || [];

  // Sort by sortOrder descending (higher = first)
  projects.sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0));

  if (!showAll) {
    projects = projects.filter(p => !['completed', 'canceled'].includes(p.state));
  }

  console.log(colors.bold('Roadmap\n'));

  for (const project of projects) {
    const issues = allIssues.filter(i => i.project?.id === project.id);
    const milestones = project.projectMilestones?.nodes || [];

    // Count issues by state
    const done = issues.filter(i => i.state.type === 'completed').length;
    const inProgress = issues.filter(i => i.state.type === 'started').length;
    const backlog = issues.filter(i => !['completed', 'started', 'canceled'].includes(i.state.type)).length;

    // Project header
    const dates = [];
    if (project.startDate) dates.push(`start: ${project.startDate}`);
    if (project.targetDate) dates.push(`target: ${project.targetDate}`);
    const dateStr = dates.length > 0 ? ` (${dates.join(', ')})` : '';
    const priorityStr = project.priority > 0 ? ` [P${project.priority}]` : '';

    console.log(colors.bold(`${project.name}${priorityStr}${dateStr}`));
    console.log(`  ${colors.green(`✓ ${done}`)} done | ${colors.yellow(`→ ${inProgress}`)} in progress | ${colors.gray(`○ ${backlog}`)} backlog`);

    // Show milestones with their issues
    if (milestones.length > 0) {
      // Sort milestones by sortOrder descending
      milestones.sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0));

      for (const m of milestones) {
        // Count issues in this milestone from project issues
        const mIssues = issues.filter(i => i.projectMilestone?.id === m.id);
        const mDone = mIssues.filter(i => i.state.type === 'completed').length;
        const mTotal = mIssues.length;
        const statusIcon = m.status === 'completed' ? colors.green('✓') :
                          m.status === 'inProgress' ? colors.yellow('→') : '○';
        const targetStr = m.targetDate ? ` (${m.targetDate})` : '';

        console.log(`  ${statusIcon} ${m.name}${targetStr}: ${mDone}/${mTotal} done`);

        // Show non-completed issues in this milestone
        const issuesInMilestone = mIssues.filter(i =>
          !['completed', 'canceled'].includes(i.state.type)
        );

        // Sort by priority then sortOrder
        issuesInMilestone.sort((a, b) => {
          if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
          return (b.sortOrder || 0) - (a.sortOrder || 0);
        });

        for (const i of issuesInMilestone.slice(0, 5)) {
          const stateIcon = i.state.type === 'started' ? colors.yellow('→') : '○';
          console.log(`    ${stateIcon} ${i.identifier}: ${i.title}`);
        }
        if (issuesInMilestone.length > 5) {
          console.log(colors.gray(`    ... and ${issuesInMilestone.length - 5} more`));
        }
      }
    }

    // Show issues not in any milestone
    const unmilestonedIssues = issues.filter(i =>
      !i.projectMilestone &&
      !['completed', 'canceled'].includes(i.state.type)
    );

    if (unmilestonedIssues.length > 0 && milestones.length > 0) {
      console.log(colors.gray(`  (${unmilestonedIssues.length} issues not in milestones)`));
    } else if (unmilestonedIssues.length > 0) {
      // Sort by priority then sortOrder
      unmilestonedIssues.sort((a, b) => {
        if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
        return (b.sortOrder || 0) - (a.sortOrder || 0);
      });

      for (const i of unmilestonedIssues.slice(0, 5)) {
        const stateIcon = i.state.type === 'started' ? colors.yellow('→') : '○';
        console.log(`    ${stateIcon} ${i.identifier}: ${i.title}`);
      }
      if (unmilestonedIssues.length > 5) {
        console.log(colors.gray(`    ... and ${unmilestonedIssues.length - 5} more`));
      }
    }

    console.log('');
  }
}

// ============================================================================
// REORDERING
// ============================================================================

async function cmdProjectsReorder(args) {
  if (args.length < 2) {
    console.error(colors.red('Error: At least 2 project names required'));
    console.error('Usage: linear projects reorder "Project A" "Project B" "Project C"');
    process.exit(1);
  }

  // Get all projects
  const projectsResult = await gql(`{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) { nodes { id name sortOrder } }
    }
  }`);
  const allProjects = projectsResult.data?.team?.projects?.nodes || [];

  // Match provided names to projects
  const orderedProjects = [];
  for (const name of args) {
    const match = allProjects.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
    if (!match) {
      console.error(colors.red(`Project not found: ${name}`));
      process.exit(1);
    }
    orderedProjects.push(match);
  }

  // Assign new sortOrders (highest first)
  const baseSort = Math.max(...allProjects.map(p => p.sortOrder || 0)) + 1000;
  const mutations = [];

  for (let i = 0; i < orderedProjects.length; i++) {
    const newSortOrder = baseSort - (i * 1000);
    mutations.push(gql(`
      mutation {
        projectUpdate(id: "${orderedProjects[i].id}", input: { sortOrder: ${newSortOrder} }) {
          success
        }
      }
    `));
  }

  await Promise.all(mutations);
  console.log(colors.green('Reordered projects:'));
  orderedProjects.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
}

async function cmdProjectMove(args) {
  const opts = parseArgs(args, {
    before: 'string',
    after: 'string',
  });

  const projectName = opts._[0];
  const beforeName = opts.before;
  const afterName = opts.after;

  if (!projectName) {
    console.error(colors.red('Error: Project name required'));
    console.error('Usage: linear project move "Project" --before "Other" or --after "Other"');
    process.exit(1);
  }

  if (!beforeName && !afterName) {
    console.error(colors.red('Error: --before or --after required'));
    process.exit(1);
  }

  // Get all projects
  const projectsResult = await gql(`{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) { nodes { id name sortOrder } }
    }
  }`);
  const projects = projectsResult.data?.team?.projects?.nodes || [];
  projects.sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0));

  const project = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));
  const target = projects.find(p => p.name.toLowerCase().includes((beforeName || afterName).toLowerCase()));

  if (!project) {
    console.error(colors.red(`Project not found: ${projectName}`));
    process.exit(1);
  }
  if (!target) {
    console.error(colors.red(`Target project not found: ${beforeName || afterName}`));
    process.exit(1);
  }

  const targetIdx = projects.findIndex(p => p.id === target.id);
  let newSortOrder;

  if (beforeName) {
    // Insert before target (higher sortOrder)
    const prevProject = projects[targetIdx - 1];
    if (prevProject) {
      newSortOrder = (target.sortOrder + prevProject.sortOrder) / 2;
    } else {
      newSortOrder = target.sortOrder + 1000;
    }
  } else {
    // Insert after target (lower sortOrder)
    const nextProject = projects[targetIdx + 1];
    if (nextProject) {
      newSortOrder = (target.sortOrder + nextProject.sortOrder) / 2;
    } else {
      newSortOrder = target.sortOrder - 1000;
    }
  }

  await gql(`
    mutation {
      projectUpdate(id: "${project.id}", input: { sortOrder: ${newSortOrder} }) {
        success
      }
    }
  `);

  console.log(colors.green(`Moved "${project.name}" ${beforeName ? 'before' : 'after'} "${target.name}"`));
}

async function cmdMilestonesReorder(args) {
  const opts = parseArgs(args, { project: 'string', p: 'string' });
  const projectName = opts.project || opts.p;
  const milestoneNames = opts._;

  if (!projectName) {
    console.error(colors.red('Error: --project required'));
    console.error('Usage: linear milestones reorder "M1" "M2" "M3" --project "Project"');
    process.exit(1);
  }

  if (milestoneNames.length < 2) {
    console.error(colors.red('Error: At least 2 milestone names required'));
    process.exit(1);
  }

  // Get project with milestones
  const projectsResult = await gql(`{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) {
        nodes {
          id name
          projectMilestones { nodes { id name sortOrder } }
        }
      }
    }
  }`);
  const projects = projectsResult.data?.team?.projects?.nodes || [];
  const project = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));

  if (!project) {
    console.error(colors.red(`Project not found: ${projectName}`));
    process.exit(1);
  }

  const allMilestones = project.projectMilestones?.nodes || [];

  // Match provided names to milestones
  const orderedMilestones = [];
  for (const name of milestoneNames) {
    const match = allMilestones.find(m => m.name.toLowerCase().includes(name.toLowerCase()));
    if (!match) {
      console.error(colors.red(`Milestone not found: ${name}`));
      process.exit(1);
    }
    orderedMilestones.push(match);
  }

  // Assign new sortOrders
  const baseSort = Math.max(...allMilestones.map(m => m.sortOrder || 0)) + 1000;
  const mutations = [];

  for (let i = 0; i < orderedMilestones.length; i++) {
    const newSortOrder = baseSort - (i * 1000);
    mutations.push(gql(`
      mutation {
        projectMilestoneUpdate(id: "${orderedMilestones[i].id}", input: { sortOrder: ${newSortOrder} }) {
          success
        }
      }
    `));
  }

  await Promise.all(mutations);
  console.log(colors.green(`Reordered milestones in ${project.name}:`));
  orderedMilestones.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));
}

async function cmdMilestoneMove(args) {
  const opts = parseArgs(args, {
    before: 'string',
    after: 'string',
  });

  const milestoneName = opts._[0];
  const beforeName = opts.before;
  const afterName = opts.after;

  if (!milestoneName) {
    console.error(colors.red('Error: Milestone name required'));
    process.exit(1);
  }

  if (!beforeName && !afterName) {
    console.error(colors.red('Error: --before or --after required'));
    process.exit(1);
  }

  // Get all projects with milestones
  const projectsResult = await gql(`{
    team(id: "${TEAM_KEY}") {
      projects(first: 50) {
        nodes {
          id name
          projectMilestones { nodes { id name sortOrder } }
        }
      }
    }
  }`);
  const projects = projectsResult.data?.team?.projects?.nodes || [];

  // Find milestone and its project
  let milestone = null;
  let projectMilestones = [];
  for (const p of projects) {
    const m = p.projectMilestones?.nodes?.find(m =>
      m.name.toLowerCase().includes(milestoneName.toLowerCase())
    );
    if (m) {
      milestone = m;
      projectMilestones = p.projectMilestones.nodes;
      projectMilestones.sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0));
      break;
    }
  }

  if (!milestone) {
    console.error(colors.red(`Milestone not found: ${milestoneName}`));
    process.exit(1);
  }

  const target = projectMilestones.find(m =>
    m.name.toLowerCase().includes((beforeName || afterName).toLowerCase())
  );

  if (!target) {
    console.error(colors.red(`Target milestone not found: ${beforeName || afterName}`));
    process.exit(1);
  }

  const targetIdx = projectMilestones.findIndex(m => m.id === target.id);
  let newSortOrder;

  if (beforeName) {
    const prevMilestone = projectMilestones[targetIdx - 1];
    if (prevMilestone) {
      newSortOrder = (target.sortOrder + prevMilestone.sortOrder) / 2;
    } else {
      newSortOrder = target.sortOrder + 1000;
    }
  } else {
    const nextMilestone = projectMilestones[targetIdx + 1];
    if (nextMilestone) {
      newSortOrder = (target.sortOrder + nextMilestone.sortOrder) / 2;
    } else {
      newSortOrder = target.sortOrder - 1000;
    }
  }

  await gql(`
    mutation {
      projectMilestoneUpdate(id: "${milestone.id}", input: { sortOrder: ${newSortOrder} }) {
        success
      }
    }
  `);

  console.log(colors.green(`Moved "${milestone.name}" ${beforeName ? 'before' : 'after'} "${target.name}"`));
}

async function cmdIssuesReorder(args) {
  if (args.length < 2) {
    console.error(colors.red('Error: At least 2 issue IDs required'));
    console.error('Usage: linear issues reorder ISSUE-1 ISSUE-2 ISSUE-3');
    process.exit(1);
  }

  // Get issues to verify they exist
  const query = `{
    team(id: "${TEAM_KEY}") {
      issues(first: 100) {
        nodes { id identifier sortOrder }
      }
    }
  }`;

  const result = await gql(query);
  const allIssues = result.data?.team?.issues?.nodes || [];

  // Match provided IDs to issues
  const orderedIssues = [];
  for (const id of args) {
    const match = allIssues.find(i => i.identifier === id.toUpperCase());
    if (!match) {
      console.error(colors.red(`Issue not found: ${id}`));
      process.exit(1);
    }
    orderedIssues.push(match);
  }

  // Assign new sortOrders
  const baseSort = Math.max(...allIssues.map(i => i.sortOrder || 0)) + 1000;
  const mutations = [];

  for (let i = 0; i < orderedIssues.length; i++) {
    const newSortOrder = baseSort - (i * 1000);
    mutations.push(gql(`
      mutation {
        issueUpdate(id: "${orderedIssues[i].identifier}", input: { sortOrder: ${newSortOrder} }) {
          success
        }
      }
    `));
  }

  await Promise.all(mutations);
  console.log(colors.green('Reordered issues:'));
  orderedIssues.forEach((i, idx) => console.log(`  ${idx + 1}. ${i.identifier}`));
}

async function cmdIssueMove(args) {
  const opts = parseArgs(args, {
    before: 'string',
    after: 'string',
  });

  const issueId = opts._[0];
  const beforeId = opts.before;
  const afterId = opts.after;

  if (!issueId) {
    console.error(colors.red('Error: Issue ID required'));
    console.error('Usage: linear issue move ISSUE-1 --before ISSUE-2 or --after ISSUE-2');
    process.exit(1);
  }

  if (!beforeId && !afterId) {
    console.error(colors.red('Error: --before or --after required'));
    process.exit(1);
  }

  // Get issues
  const query = `{
    team(id: "${TEAM_KEY}") {
      issues(first: 100) {
        nodes { id identifier sortOrder }
      }
    }
  }`;

  const result = await gql(query);
  const issues = result.data?.team?.issues?.nodes || [];
  issues.sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0));

  const issue = issues.find(i => i.identifier === issueId.toUpperCase());
  const target = issues.find(i => i.identifier === (beforeId || afterId).toUpperCase());

  if (!issue) {
    console.error(colors.red(`Issue not found: ${issueId}`));
    process.exit(1);
  }
  if (!target) {
    console.error(colors.red(`Target issue not found: ${beforeId || afterId}`));
    process.exit(1);
  }

  const targetIdx = issues.findIndex(i => i.identifier === target.identifier);
  let newSortOrder;

  if (beforeId) {
    const prevIssue = issues[targetIdx - 1];
    if (prevIssue) {
      newSortOrder = (target.sortOrder + prevIssue.sortOrder) / 2;
    } else {
      newSortOrder = target.sortOrder + 1000;
    }
  } else {
    const nextIssue = issues[targetIdx + 1];
    if (nextIssue) {
      newSortOrder = (target.sortOrder + nextIssue.sortOrder) / 2;
    } else {
      newSortOrder = target.sortOrder - 1000;
    }
  }

  await gql(`
    mutation {
      issueUpdate(id: "${issue.identifier}", input: { sortOrder: ${newSortOrder} }) {
        success
      }
    }
  `);

  console.log(colors.green(`Moved ${issue.identifier} ${beforeId ? 'before' : 'after'} ${target.identifier}`));
}

// ============================================================================
// LABELS
// ============================================================================

async function cmdLabels() {
  const query = `{
    team(id: "${TEAM_KEY}") {
      labels(first: 100) {
        nodes { id name color description }
      }
    }
  }`;

  const result = await gql(query);
  const labels = result.data?.team?.labels?.nodes || [];

  console.log(colors.bold('Labels:\n'));
  if (labels.length === 0) {
    console.log('No labels found. Create one with: linear label create "name"');
    return;
  }

  const rows = labels.map(l => [
    l.name,
    l.description || '-'
  ]);
  console.log(formatTable(rows));
}

async function cmdLabelCreate(args) {
  const opts = parseArgs(args, {
    name: 'string', n: 'string',
    description: 'string', d: 'string',
    color: 'string', c: 'string',
  });

  const name = opts.name || opts.n || opts._[0];
  const description = opts.description || opts.d || '';
  const color = opts.color || opts.c;

  if (!name) {
    console.error(colors.red('Error: Name is required'));
    console.error('Usage: linear label create "label name" [--description "..."] [--color "#FF0000"]');
    process.exit(1);
  }

  // Get team UUID
  const teamResult = await gql(`{ team(id: "${TEAM_KEY}") { id } }`);
  const teamId = teamResult.data?.team?.id;

  const mutation = `
    mutation($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) {
        success
        issueLabel { id name }
      }
    }
  `;

  const input = { teamId, name };
  if (description) input.description = description;
  if (color) input.color = color;

  const result = await gql(mutation, { input });

  if (result.data?.issueLabelCreate?.success) {
    console.log(colors.green(`Created label: ${name}`));
  } else {
    console.error(colors.red('Failed to create label'));
    console.error(result.errors?.[0]?.message || JSON.stringify(result));
    process.exit(1);
  }
}

// ============================================================================
// ALIASES
// ============================================================================

async function cmdAlias(args) {
  const opts = parseArgs(args, {
    list: 'boolean', l: 'boolean',
    remove: 'string', r: 'string',
  });

  const showList = opts.list || opts.l;
  const removeCode = opts.remove || opts.r;
  const code = opts._[0];
  const name = opts._[1];

  // List aliases
  if (showList || (Object.keys(opts).length === 1 && opts._.length === 0)) {
    const aliases = Object.entries(ALIASES);
    if (aliases.length === 0) {
      console.log('No aliases defined.');
      console.log('Usage: linear alias CODE "Project or Milestone Name"');
      return;
    }

    // Fetch projects to determine type (project vs milestone)
    const query = `{
      team(id: "${TEAM_KEY}") {
        projects(first: 50) {
          nodes { name }
        }
      }
    }`;

    const result = await gql(query);
    const projects = result.data?.team?.projects?.nodes || [];

    // Check if alias target matches a project (using partial match)
    const matchesProject = (target) => {
      const lowerTarget = target.toLowerCase();
      return projects.some(p => p.name.toLowerCase().includes(lowerTarget));
    };

    console.log(colors.bold('Aliases:\n'));
    for (const [code, target] of aliases) {
      const isProject = matchesProject(target);
      const type = isProject ? colors.blue('project') : colors.yellow('milestone');
      console.log(`  ${colors.bold(code)} -> ${target} (${type})`);
    }
    return;
  }

  // Remove alias
  if (removeCode) {
    removeAlias(removeCode);
    console.log(colors.green(`Removed alias: ${removeCode.toUpperCase()}`));
    return;
  }

  // Create/update alias
  if (!code || !name) {
    console.error(colors.red('Error: Code and name required'));
    console.error('Usage: linear alias CODE "Project or Milestone Name"');
    console.error('       linear alias --list');
    console.error('       linear alias --remove CODE');
    process.exit(1);
  }

  saveAlias(code, name);
  console.log(colors.green(`Alias set: ${code.toUpperCase()} -> ${name}`));
}

// ============================================================================
// GIT INTEGRATION
// ============================================================================

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '')      // Trim leading/trailing dashes
    .slice(0, 50);                // Limit length
}

function detectPackageManager(dir) {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(dir, 'bun.lockb'))) return 'bun';
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm';
  if (existsSync(join(dir, 'package.json'))) return 'npm'; // fallback
  return null;
}

function copyWorktreeIncludes(repoRoot, worktreePath) {
  const includeFile = join(repoRoot, '.worktreeinclude');
  if (!existsSync(includeFile)) return [];

  const patterns = readFileSync(includeFile, 'utf-8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'));

  const copied = [];
  for (const pattern of patterns) {
    const sourcePath = join(repoRoot, pattern);
    const destPath = join(worktreePath, pattern);

    if (!existsSync(sourcePath)) continue;

    // Check if the file/dir is gitignored (only copy if it is)
    try {
      execSync(`git check-ignore -q "${pattern}"`, { cwd: repoRoot, stdio: 'pipe' });
      // If we get here, the file IS ignored - copy it
      const destDir = join(destPath, '..');
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      // Use cp for both files and directories
      const fileStat = statSync(sourcePath);
      if (fileStat.isDirectory()) {
        execSync(`cp -r "${sourcePath}" "${destPath}"`, { stdio: 'pipe' });
      } else {
        execSync(`cp "${sourcePath}" "${destPath}"`, { stdio: 'pipe' });
      }
      copied.push(pattern);
    } catch (err) {
      // File is not gitignored or doesn't exist, skip it
    }
  }
  return copied;
}

async function cmdNext(args) {
  const opts = parseArgs(args, { 'dry-run': 'boolean' });
  const dryRun = opts['dry-run'];

  // Get repo info
  let repoRoot;
  try {
    repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch (err) {
    console.error(colors.red('Error: Not in a git repository'));
    process.exit(1);
  }
  const repoName = basename(repoRoot);

  // Get current user ID for sorting
  const viewerResult = await gql('{ viewer { id } }');
  const viewerId = viewerResult.data?.viewer?.id;

  // Fetch unblocked issues (reuse logic from cmdIssues --unblocked)
  const query = `{
    team(id: "${TEAM_KEY}") {
      issues(first: 100) {
        nodes {
          identifier
          title
          priority
          state { name type }
          project { name }
          assignee { id name }
          relations(first: 20) {
            nodes {
              type
              relatedIssue { identifier state { type } }
            }
          }
        }
      }
    }
  }`;

  const result = await gql(query);
  let issues = result.data?.team?.issues?.nodes || [];

  // Collect all blocked issue IDs
  const blocked = new Set();
  for (const issue of issues) {
    for (const rel of issue.relations?.nodes || []) {
      if (rel.type === 'blocks') {
        blocked.add(rel.relatedIssue.identifier);
      }
    }
  }

  // Filter to unblocked, non-completed issues
  issues = issues.filter(i =>
    !['completed', 'canceled'].includes(i.state.type) &&
    !blocked.has(i.identifier)
  );

  // Sort: assigned to you first, then by identifier
  issues.sort((a, b) => {
    const aIsMine = a.assignee?.id === viewerId;
    const bIsMine = b.assignee?.id === viewerId;
    if (aIsMine && !bIsMine) return -1;
    if (!aIsMine && bIsMine) return 1;
    return a.identifier.localeCompare(b.identifier);
  });

  // Limit to 10 issues
  issues = issues.slice(0, 10);

  if (issues.length === 0) {
    console.error(colors.red('No unblocked issues found'));
    process.exit(1);
  }

  // Display issues with numbered selection
  console.log(colors.bold('Select an issue to work on:\n'));
  issues.forEach((issue, i) => {
    const assignee = issue.assignee?.id === viewerId ? colors.green('(you)') : '';
    const project = issue.project?.name ? colors.gray(`[${issue.project.name}]`) : '';
    console.log(`  ${i + 1}. ${issue.identifier}: ${issue.title} ${assignee} ${project}`);
  });
  console.log('');

  // Interactive selection
  const selection = await prompt('Enter number: ');
  const idx = parseInt(selection) - 1;

  if (isNaN(idx) || idx < 0 || idx >= issues.length) {
    console.error(colors.red('Invalid selection'));
    process.exit(1);
  }

  const selectedIssue = issues[idx];
  const branchName = `${selectedIssue.identifier}-${slugify(selectedIssue.title)}`;
  const worktreePath = join(homedir(), '.claude-worktrees', repoName, branchName);

  if (dryRun) {
    console.log(colors.bold('\nDry run - would execute:\n'));
    console.log(`  git worktree add "${worktreePath}" -b "${branchName}"`);
    console.log(`  Copy .worktreeinclude files to worktree`);
    const pm = detectPackageManager(repoRoot);
    if (pm) {
      console.log(`  ${pm} install`);
    }
    console.log(`  cd "${worktreePath}" && claude --plan "/next ${selectedIssue.identifier}"`);
    process.exit(0);
  }

  // Create worktree directory parent if needed
  const worktreeParent = join(homedir(), '.claude-worktrees', repoName);
  if (!existsSync(worktreeParent)) {
    mkdirSync(worktreeParent, { recursive: true });
  }

  // Check if worktree already exists
  if (existsSync(worktreePath)) {
    console.log(colors.yellow(`\nWorktree already exists: ${worktreePath}`));
    console.log(`cd "${worktreePath}" && claude --plan "/next ${selectedIssue.identifier}"`);
    process.exit(0);
  }

  // Create the worktree
  console.log(colors.gray(`\nCreating worktree at ${worktreePath}...`));
  try {
    execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
      cwd: repoRoot,
      stdio: 'inherit'
    });
  } catch (err) {
    // Branch might already exist, try without -b
    try {
      execSync(`git worktree add "${worktreePath}" "${branchName}"`, {
        cwd: repoRoot,
        stdio: 'inherit'
      });
    } catch (err2) {
      console.error(colors.red(`Failed to create worktree: ${err2.message}`));
      process.exit(1);
    }
  }

  // Copy .worktreeinclude files
  const copied = copyWorktreeIncludes(repoRoot, worktreePath);
  if (copied.length > 0) {
    console.log(colors.green(`Copied: ${copied.join(', ')}`));
  }

  // Detect package manager and install dependencies
  const pm = detectPackageManager(worktreePath);
  if (pm) {
    console.log(colors.gray(`Installing dependencies with ${pm}...`));
    try {
      execSync(`${pm} install`, { cwd: worktreePath, stdio: 'inherit' });
    } catch (err) {
      console.error(colors.yellow(`Warning: ${pm} install failed, continuing anyway`));
    }
  }

  // Output eval-able shell command for the wrapper function
  console.log(`cd "${worktreePath}" && claude --plan "/next ${selectedIssue.identifier}"`);
}

async function cmdBranch(args) {
  const issueId = args[0];
  if (!issueId) {
    console.error(colors.red('Error: Issue ID required'));
    console.error('Usage: linear branch ISSUE-5');
    process.exit(1);
  }

  // Fetch issue title
  const result = await gql(`{
    issue(id: "${issueId}") {
      identifier
      title
    }
  }`);

  const issue = result.data?.issue;
  if (!issue) {
    console.error(colors.red(`Issue not found: ${issueId}`));
    process.exit(1);
  }

  // Create branch name: ISSUE-5-slugified-title
  const branchName = `${issue.identifier}-${slugify(issue.title)}`;

  try {
    // Check for uncommitted changes
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    if (status.trim()) {
      console.error(colors.yellow('Warning: You have uncommitted changes'));
    }

    // Create and checkout branch
    execSync(`git checkout -b "${branchName}"`, { stdio: 'inherit' });
    console.log(colors.green(`\nCreated branch: ${branchName}`));
    console.log(`\nWorking on: ${issue.identifier} - ${issue.title}`);
  } catch (err) {
    if (err.message?.includes('not a git repository')) {
      console.error(colors.red('Error: Not in a git repository'));
    } else if (err.message?.includes('already exists')) {
      console.error(colors.red(`Branch '${branchName}' already exists`));
      console.log(`Try: git checkout ${branchName}`);
    } else {
      console.error(colors.red(`Git error: ${err.message}`));
    }
    process.exit(1);
  }
}

// ============================================================================
// DONE (Complete work on an issue)
// ============================================================================

function getIssueFromBranch() {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    // Extract issue ID from branch name (e.g., ISSUE-12-some-title -> ISSUE-12)
    const match = branch.match(/^([A-Z]+-\d+)/);
    return match ? match[1] : null;
  } catch (err) {
    return null;
  }
}

function isInWorktree() {
  try {
    // In a worktree, git rev-parse --git-dir returns something like /path/to/main/.git/worktrees/branch-name
    const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();
    return gitDir.includes('/worktrees/');
  } catch (err) {
    return false;
  }
}

function getMainRepoPath() {
  try {
    // Get the path to the main working tree
    const worktreeList = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const lines = worktreeList.split('\n');
    // First worktree entry is the main repo
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        return line.replace('worktree ', '');
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function cmdDone(args) {
  const opts = parseArgs(args, {
    'no-close': 'boolean',
    'keep-branch': 'boolean',
  });

  // Determine issue ID: from argument or from branch name
  let issueId = opts._[0];
  if (!issueId) {
    issueId = getIssueFromBranch();
    if (!issueId) {
      console.error(colors.red('Error: Could not detect issue from branch name'));
      console.error('Usage: linear done [ISSUE-12]');
      process.exit(1);
    }
  }

  const shouldClose = !opts['no-close'];
  const keepBranch = opts['keep-branch'];
  const inWorktree = isInWorktree();

  // Verify the issue exists
  const result = await gql(`{
    issue(id: "${issueId}") {
      identifier
      title
      state { name type }
    }
  }`);

  const issue = result.data?.issue;
  if (!issue) {
    console.error(colors.red(`Issue not found: ${issueId}`));
    process.exit(1);
  }

  console.log(colors.bold(`\nCompleting: ${issue.identifier}: ${issue.title}\n`));

  // Close the issue if not already closed
  if (shouldClose && issue.state.type !== 'completed') {
    const statesResult = await gql(`{
      team(id: "${TEAM_KEY}") {
        states { nodes { id name type } }
      }
    }`);
    const states = statesResult.data?.team?.states?.nodes || [];
    const doneState = states.find(s => s.type === 'completed');

    if (doneState) {
      const closeResult = await gql(`
        mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { success }
        }
      `, { id: issueId, input: { stateId: doneState.id } });

      if (closeResult.data?.issueUpdate?.success) {
        console.log(colors.green(`✓ Closed ${issueId}`));
      } else {
        console.error(colors.yellow(`Warning: Could not close issue`));
      }
    }
  } else if (issue.state.type === 'completed') {
    console.log(colors.gray(`Issue already closed`));
  }

  // Handle worktree cleanup
  if (inWorktree) {
    const currentDir = process.cwd();
    const mainRepo = getMainRepoPath();
    const branchName = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();

    console.log(colors.gray(`\nWorktree detected: ${currentDir}`));

    // Output commands for the shell wrapper to execute
    // We can't cd from within Node, so we output eval-able commands
    console.log(colors.bold('\nTo clean up the worktree, run:\n'));
    console.log(`cd "${mainRepo}"`);
    console.log(`git worktree remove "${currentDir}"`);
    if (!keepBranch) {
      console.log(`git branch -d "${branchName}"`);
    }

    // Also provide a one-liner
    console.log(colors.gray('\nOr copy this one-liner:'));
    const oneLiner = keepBranch
      ? `cd "${mainRepo}" && git worktree remove "${currentDir}"`
      : `cd "${mainRepo}" && git worktree remove "${currentDir}" && git branch -d "${branchName}"`;
    console.log(oneLiner);
  } else {
    console.log(colors.green('\nDone!'));
  }
}

// ============================================================================
// STANDUP
// ============================================================================

function getYesterdayDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

async function cmdStandup(args) {
  const opts = parseArgs(args, {
    'no-github': 'boolean',
  });

  const skipGitHub = opts['no-github'];
  const yesterday = getYesterdayDate();
  const today = getTodayDate();

  // Get current user
  const viewerResult = await gql('{ viewer { id name } }');
  const viewer = viewerResult.data?.viewer;
  if (!viewer) {
    console.error(colors.red('Error: Could not fetch user info'));
    process.exit(1);
  }

  console.log(colors.bold(`\nStandup for ${viewer.name}\n`));
  console.log(colors.gray(`─────────────────────────────────────────\n`));

  // Fetch issues with completion info
  const query = `{
    team(id: "${TEAM_KEY}") {
      issues(first: 100) {
        nodes {
          identifier
          title
          state { name type }
          assignee { id }
          completedAt
          relations(first: 20) {
            nodes {
              type
              relatedIssue { identifier state { type } }
            }
          }
        }
      }
    }
  }`;

  const result = await gql(query);
  const issues = result.data?.team?.issues?.nodes || [];

  // Issues completed yesterday (by me)
  const completedYesterday = issues.filter(i => {
    if (i.assignee?.id !== viewer.id) return false;
    if (!i.completedAt) return false;
    const completedDate = i.completedAt.split('T')[0];
    return completedDate === yesterday;
  });

  // Issues in progress (assigned to me)
  const inProgress = issues.filter(i =>
    i.assignee?.id === viewer.id &&
    i.state.type === 'started'
  );

  // Blocked issues (assigned to me)
  const blockedIds = new Set();
  for (const issue of issues) {
    for (const rel of issue.relations?.nodes || []) {
      if (rel.type === 'blocks' && rel.relatedIssue.state.type !== 'completed') {
        blockedIds.add(rel.relatedIssue.identifier);
      }
    }
  }
  const blocked = issues.filter(i =>
    i.assignee?.id === viewer.id &&
    blockedIds.has(i.identifier)
  );

  // Display Linear info
  console.log(colors.bold('Yesterday (completed):'));
  if (completedYesterday.length === 0) {
    console.log(colors.gray('  No issues completed'));
  } else {
    for (const issue of completedYesterday) {
      console.log(`  ${colors.green('✓')} ${issue.identifier}: ${issue.title}`);
    }
  }

  console.log('');
  console.log(colors.bold('Today (in progress):'));
  if (inProgress.length === 0) {
    console.log(colors.gray('  No issues in progress'));
  } else {
    for (const issue of inProgress) {
      console.log(`  → ${issue.identifier}: ${issue.title}`);
    }
  }

  if (blocked.length > 0) {
    console.log('');
    console.log(colors.bold('Blocked:'));
    for (const issue of blocked) {
      console.log(`  ${colors.red('⊘')} ${issue.identifier}: ${issue.title}`);
    }
  }

  // GitHub activity
  if (!skipGitHub) {
    console.log('');
    console.log(colors.gray(`─────────────────────────────────────────\n`));
    console.log(colors.bold('GitHub Activity (yesterday):'));

    try {
      // Get commits from yesterday
      const sinceDate = `${yesterday}T00:00:00`;
      const untilDate = `${today}T00:00:00`;

      // Try to get repo info
      let repoOwner, repoName;
      try {
        const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
        const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
        if (match) {
          repoOwner = match[1];
          repoName = match[2];
        }
      } catch (err) {
        // Not in a git repo or no origin
      }

      if (repoOwner && repoName) {
        // Get git user name for author matching (may differ from Linear display name)
        let gitUserName;
        try {
          gitUserName = execSync('git config user.name', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        } catch (err) {
          gitUserName = viewer.name; // Fall back to Linear name
        }

        // Get commits using git log (more reliable than gh for commits)
        try {
          const gitLog = execSync(
            `git log --since="${sinceDate}" --until="${untilDate}" --author="${gitUserName}" --oneline`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
          ).trim();

          if (gitLog) {
            const commits = gitLog.split('\n').filter(Boolean);
            console.log(`\n  Commits (${commits.length}):`);
            for (const commit of commits.slice(0, 10)) {
              console.log(`    ${commit}`);
            }
            if (commits.length > 10) {
              console.log(colors.gray(`    ... and ${commits.length - 10} more`));
            }
          }
        } catch (err) {
          // No commits or git error
        }

        // Get PRs using gh
        try {
          const prsJson = execSync(
            `gh pr list --author @me --state all --json number,title,state,mergedAt,createdAt --limit 20`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
          );
          const prs = JSON.parse(prsJson);

          // Filter to PRs created or merged yesterday
          const relevantPrs = prs.filter(pr => {
            const createdDate = pr.createdAt?.split('T')[0];
            const mergedDate = pr.mergedAt?.split('T')[0];
            return createdDate === yesterday || mergedDate === yesterday;
          });

          if (relevantPrs.length > 0) {
            console.log(`\n  Pull Requests:`);
            for (const pr of relevantPrs) {
              const status = pr.state === 'MERGED' ? colors.green('merged') :
                            pr.state === 'OPEN' ? colors.yellow('open') :
                            colors.gray(pr.state.toLowerCase());
              console.log(`    #${pr.number} ${pr.title} [${status}]`);
            }
          }
        } catch (err) {
          // gh not available or error
          console.log(colors.gray('  (gh CLI not available or not authenticated)'));
        }
      } else {
        console.log(colors.gray('  (not in a GitHub repository)'));
      }
    } catch (err) {
      console.log(colors.gray(`  Error fetching GitHub data: ${err.message}`));
    }
  }

  console.log('');
}

// ============================================================================
// AUTH
// ============================================================================

async function cmdLogin(args) {
  console.log(colors.bold('Linear CLI Login\n'));

  // Ask where to save credentials
  console.log('Where would you like to save your credentials?\n');
  console.log('  1. This project only (./.linear)');
  console.log('  2. Global, for all projects (~/.linear)');
  console.log('');

  const locationChoice = await prompt('Enter number: ');
  if (locationChoice !== '1' && locationChoice !== '2') {
    console.error(colors.red('Error: Please enter 1 or 2'));
    process.exit(1);
  }
  const saveGlobal = locationChoice === '2';
  console.log('');

  // Explain and prompt before opening browser
  console.log('To authenticate, you\'ll need a Linear API key.');
  console.log(colors.gray('(Create a new personal API key if you don\'t have one)\n'));
  await prompt('Press Enter to open Linear\'s API settings in your browser...');

  openBrowser('https://linear.app/settings/api');

  console.log('');
  const apiKey = await prompt('Paste your API key: ');

  if (!apiKey) {
    console.error(colors.red('Error: API key is required'));
    process.exit(1);
  }

  console.log('\nValidating...');
  LINEAR_API_KEY = apiKey;

  const teamsResult = await gql('{ teams { nodes { id key name } } }');
  const teams = teamsResult.data?.teams?.nodes;

  if (!teams || teams.length === 0) {
    console.error(colors.red('Error: Invalid API key or no access to any teams'));
    if (teamsResult.errors) {
      console.error(teamsResult.errors[0]?.message);
    }
    process.exit(1);
  }

  console.log(colors.green('Valid!\n'));
  console.log(colors.bold('Select a team:\n'));

  teams.forEach((team, i) => {
    console.log(`  ${i + 1}. ${team.name} (${team.key})`);
  });
  console.log(`  ${teams.length + 1}. Create a new team...`);
  console.log('');

  const selection = await prompt('Enter number: ');
  const selectionNum = parseInt(selection);
  if (!selection || isNaN(selectionNum) || selectionNum < 1 || selectionNum > teams.length + 1) {
    console.error(colors.red('Error: Invalid selection'));
    process.exit(1);
  }
  let selectedKey = '';

  if (selectionNum === teams.length + 1) {
    // Create new team
    console.log('');
    const teamName = await prompt('Team name: ');

    if (!teamName) {
      console.error(colors.red('Error: Team name is required'));
      process.exit(1);
    }

    const suggestedKey = suggestTeamKey(teamName);
    let teamKey = await prompt(`Team key [${suggestedKey}]: `);
    teamKey = (teamKey || suggestedKey).toUpperCase();

    const createResult = await gql(`
      mutation($input: TeamCreateInput!) {
        teamCreate(input: $input) {
          success
          team { key name }
        }
      }
    `, { input: { name: teamName, key: teamKey } });

    if (createResult.data?.teamCreate?.success) {
      selectedKey = teamKey;
      console.log(colors.green(`Created team: ${teamName} (${teamKey})`));
    } else {
      console.error(colors.red('Failed to create team'));
      console.error(createResult.errors?.[0]?.message || JSON.stringify(createResult));
      process.exit(1);
    }
  } else {
    selectedKey = teams[selectionNum - 1].key;
  }

  // Save config
  const configPath = saveGlobal ? join(homedir(), '.linear') : join(process.cwd(), '.linear');
  const configContent = `# Linear CLI configuration
api_key=${apiKey}
team=${selectedKey}
`;

  writeFileSync(configPath, configContent);

  console.log('');
  console.log(colors.green(`Saved to ${configPath}`));

  // Add .linear to .gitignore if saving locally
  if (!saveGlobal) {
    const gitignorePath = join(process.cwd(), '.gitignore');
    try {
      let gitignore = '';
      if (existsSync(gitignorePath)) {
        gitignore = readFileSync(gitignorePath, 'utf-8');
      }

      // Check if .linear is already in .gitignore
      const lines = gitignore.split('\n').map(l => l.trim());
      if (!lines.includes('.linear')) {
        // Add .linear to .gitignore
        const newline = gitignore.endsWith('\n') || gitignore === '' ? '' : '\n';
        const content = gitignore + newline + '.linear\n';
        writeFileSync(gitignorePath, content);
        console.log(colors.green(`Added .linear to .gitignore`));
      }
    } catch (err) {
      // Silently ignore if we can't update .gitignore
    }

    // Add .linear to .worktreeinclude for worktree support
    const worktreeIncludePath = join(process.cwd(), '.worktreeinclude');
    try {
      let worktreeInclude = '';
      if (existsSync(worktreeIncludePath)) {
        worktreeInclude = readFileSync(worktreeIncludePath, 'utf-8');
      }

      const wtLines = worktreeInclude.split('\n').map(l => l.trim());
      if (!wtLines.includes('.linear')) {
        const newline = worktreeInclude.endsWith('\n') || worktreeInclude === '' ? '' : '\n';
        writeFileSync(worktreeIncludePath, worktreeInclude + newline + '.linear\n');
        console.log(colors.green(`Added .linear to .worktreeinclude`));
      }
    } catch (err) {
      // Silently ignore if we can't update .worktreeinclude
    }
  }

  console.log('');
  console.log("You're ready to go! Try:");
  console.log('  linear issues --unblocked');
  console.log('  linear projects');
}

async function cmdLogout() {
  const localPath = join(process.cwd(), '.linear');
  const globalPath = join(homedir(), '.linear');

  if (existsSync(localPath)) {
    unlinkSync(localPath);
    console.log(colors.green(`Removed ${localPath}`));
  } else if (existsSync(globalPath)) {
    unlinkSync(globalPath);
    console.log(colors.green(`Removed ${globalPath}`));
  } else {
    console.log('No config file found.');
  }
}

async function cmdWhoami() {
  checkAuth();

  const result = await gql('{ viewer { id name email } }');
  const user = result.data?.viewer;

  if (!user) {
    console.error(colors.red('Error: Could not fetch user info'));
    process.exit(1);
  }

  console.log(`Logged in as: ${user.name} <${user.email}>`);
  console.log(`Team: ${TEAM_KEY}`);
  console.log(`Config: ${CONFIG_FILE || '(environment variables)'}`);
}

// ============================================================================
// HELP
// ============================================================================

function showHelp() {
  console.log(`Linear CLI - A simple wrapper around Linear's GraphQL API

USAGE:
  linear <command> [options]

AUTHENTICATION:
  login                      Login and save credentials to .linear
  logout                     Remove saved credentials
  whoami                     Show current user and team

PLANNING:
  roadmap [options]          Overview of projects, milestones, and issues
    --all, -a                Include completed projects

ISSUES:
  issues [options]           List issues (default: backlog, yours first)
    --unblocked, -u          Show only unblocked issues
    --open, -o               Show all non-completed/canceled issues
    --backlog, -b            Show only backlog issues
    --all, -a                Show all states (including completed)
    --mine, -m               Show only issues assigned to you
    --in-progress            Show issues in progress
    --project, -p <name>     Filter by project
    --milestone <name>       Filter by milestone
    --state, -s <state>      Filter by state
    --label, -l <name>       Filter by label
  issues reorder <ids...>    Reorder issues by listing IDs in order

  issue show <id>            Show issue details with parent context
  issue start <id>           Assign to yourself and set to In Progress
  issue create [options]     Create a new issue
    --title, -t <title>      Issue title (required)
    --description, -d <desc> Issue description
    --project, -p <name>     Add to project
    --milestone <name>       Add to milestone
    --parent <id>            Parent issue (for sub-issues)
    --assign                 Assign to yourself
    --estimate, -e <size>    Estimate: XS, S, M, L, XL
    --label, -l <name>       Add label
    --blocks <id>            This issue blocks another
    --blocked-by <id>        This issue is blocked by another
  issue update <id> [opts]   Update an issue
    --title, -t <title>      New title
    --description, -d <desc> New description
    --state, -s <state>      New state
    --project, -p <name>     Move to project
    --milestone <name>       Move to milestone
    --append, -a <text>      Append to description
    --blocks <id>            Add blocking relation
    --blocked-by <id>        Add blocked-by relation
  issue close <id>           Mark issue as done
  issue comment <id> <body>  Add a comment
  issue move <id>            Move issue in sort order
    --before <id>            Move before this issue
    --after <id>             Move after this issue

PROJECTS:
  projects [options]         List projects
    --all, -a                Include completed projects
  projects reorder <names..> Reorder projects by listing names in order

  project show <name>        Show project details with issues
  project create [options]   Create a new project
    --name, -n <name>        Project name (required)
    --description, -d <desc> Project description
  project complete <name>    Mark project as completed
  project move <name>        Move project in sort order
    --before <name>          Move before this project
    --after <name>           Move after this project

MILESTONES:
  milestones [options]       List milestones by project
    --project, -p <name>     Filter by project
    --all, -a                Include completed projects
  milestones reorder <names> Reorder milestones (requires --project)
    --project, -p <name>     Project containing milestones

  milestone show <name>      Show milestone with issues
  milestone create [options] Create a new milestone
    --name, -n <name>        Milestone name (required)
    --project, -p <name>     Project (required)
    --description, -d <desc> Milestone description
    --target-date <date>     Target date (YYYY-MM-DD)
  milestone move <name>      Move milestone in sort order
    --before <name>          Move before this milestone
    --after <name>           Move after this milestone

LABELS:
  labels                     List all labels
  label create [options]     Create a new label
    --name, -n <name>        Label name (required)
    --description, -d <desc> Label description
    --color, -c <hex>        Label color (e.g., #FF0000)

ALIASES:
  alias <CODE> "<name>"      Create alias for project/milestone
  alias --list               List all aliases
  alias --remove <CODE>      Remove an alias

  Aliases can be used anywhere a project or milestone name is accepted:
    linear issues --project LWW
    linear issue create --milestone MVP "New feature"

GIT:
  branch <id>                Create git branch from issue (ISSUE-5-issue-title)

WORKFLOW:
  next                       Pick an issue and start in a new worktree
    --dry-run                Show commands without executing
  done [id]                  Complete work on an issue
    --no-close               Don't close the issue in Linear
    --keep-branch            Don't suggest deleting the branch
  standup                    Show daily standup summary
    --no-github              Skip GitHub activity

  Shell setup (add to ~/.zshrc):
    lnext() { eval "$(linear next "$@")"; }

CONFIGURATION:
  Config is loaded from ./.linear first, then ~/.linear, then env vars.

  File format:
    api_key=lin_api_xxx
    team=ISSUE

    [aliases]
    LWW=Last-Write-Wins Support
    MVP=MVP Release

EXAMPLES:
  linear roadmap             # See all projects and milestones
  linear issues --unblocked  # Find workable issues
  linear issues --project "Phase 1"  # Issues in a project
  linear issue create --title "Fix bug" --milestone "Beta" --estimate M
  linear projects reorder "Phase 1" "Phase 2" "Phase 3"
  linear project move "Phase 3" --before "Phase 1"
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  loadConfig();

  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    showHelp();
    process.exit(0);
  }

  try {
    switch (cmd) {
      case 'login':
        await cmdLogin(args.slice(1));
        break;
      case 'logout':
        await cmdLogout();
        break;
      case 'whoami':
        await cmdWhoami();
        break;
      case 'issues': {
        checkAuth();
        // Check for "issues reorder" subcommand
        if (args[1] === 'reorder') {
          await cmdIssuesReorder(args.slice(2));
        } else {
          await cmdIssues(args.slice(1));
        }
        break;
      }
      case 'issue': {
        checkAuth();
        const subcmd = args[1];
        const subargs = args.slice(2);
        switch (subcmd) {
          case 'show': await cmdIssueShow(subargs); break;
          case 'create': await cmdIssueCreate(subargs); break;
          case 'update': await cmdIssueUpdate(subargs); break;
          case 'start': await cmdIssueStart(subargs); break;
          case 'close': await cmdIssueClose(subargs); break;
          case 'comment': await cmdIssueComment(subargs); break;
          case 'move': await cmdIssueMove(subargs); break;
          default:
            console.error(`Unknown issue command: ${subcmd}`);
            process.exit(1);
        }
        break;
      }
      case 'projects': {
        checkAuth();
        // Check for "projects reorder" subcommand
        if (args[1] === 'reorder') {
          await cmdProjectsReorder(args.slice(2));
        } else {
          await cmdProjects(args.slice(1));
        }
        break;
      }
      case 'project': {
        checkAuth();
        const subcmd = args[1];
        const subargs = args.slice(2);
        switch (subcmd) {
          case 'show': await cmdProjectShow(subargs); break;
          case 'create': await cmdProjectCreate(subargs); break;
          case 'complete': await cmdProjectComplete(subargs); break;
          case 'move': await cmdProjectMove(subargs); break;
          default:
            console.error(`Unknown project command: ${subcmd}`);
            process.exit(1);
        }
        break;
      }
      case 'milestones': {
        checkAuth();
        // Check for "milestones reorder" subcommand
        if (args[1] === 'reorder') {
          await cmdMilestonesReorder(args.slice(2));
        } else {
          await cmdMilestones(args.slice(1));
        }
        break;
      }
      case 'milestone': {
        checkAuth();
        const subcmd = args[1];
        const subargs = args.slice(2);
        switch (subcmd) {
          case 'show': await cmdMilestoneShow(subargs); break;
          case 'create': await cmdMilestoneCreate(subargs); break;
          case 'move': await cmdMilestoneMove(subargs); break;
          default:
            console.error(`Unknown milestone command: ${subcmd}`);
            process.exit(1);
        }
        break;
      }
      case 'roadmap':
        checkAuth();
        await cmdRoadmap(args.slice(1));
        break;
      case 'labels':
        checkAuth();
        await cmdLabels();
        break;
      case 'label': {
        checkAuth();
        const subcmd = args[1];
        const subargs = args.slice(2);
        switch (subcmd) {
          case 'create': await cmdLabelCreate(subargs); break;
          default:
            console.error(`Unknown label command: ${subcmd}`);
            process.exit(1);
        }
        break;
      }
      case 'alias':
        checkAuth();
        await cmdAlias(args.slice(1));
        break;
      case 'branch':
        checkAuth();
        await cmdBranch(args.slice(1));
        break;
      case 'next':
        checkAuth();
        await cmdNext(args.slice(1));
        break;
      case 'done':
        checkAuth();
        await cmdDone(args.slice(1));
        break;
      case 'standup':
        checkAuth();
        await cmdStandup(args.slice(1));
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(colors.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

main();
