import { cpSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, 'claude');
const dest = join(homedir(), '.claude');

// Copy skill and command files
try {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  // Recursively copy claude/ to ~/.claude/
  cpSync(src, dest, { recursive: true });

  const files = readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(src, join(e.parentPath, e.name)));

  console.log(`\x1b[32m✓\x1b[0m Installed Claude files to ~/.claude/`);
  for (const file of files) {
    console.log(`  - ${file}`);
  }
} catch (err) {
  console.log(`\x1b[33m⚠\x1b[0m Could not install Claude files: ${err.message}`);
}

// Add permissions to settings.json
const settingsPath = join(dest, 'settings.json');

try {
  let settings = { permissions: { allow: [], deny: [] } };

  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  }

  // Ensure structure exists
  settings.permissions = settings.permissions || {};
  settings.permissions.allow = settings.permissions.allow || [];

  // Build list of permissions to add
  const permissions = ['Bash(linear:*)'];

  // Add Skill permissions for each skill in the skills directory
  const skillsDir = join(src, 'skills');
  if (existsSync(skillsDir)) {
    const skills = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const skill of skills) {
      permissions.push(`Skill(${skill})`);
      permissions.push(`Skill(${skill}:*)`);
    }
  }

  // Add permissions if not already present
  const added = [];
  for (const permission of permissions) {
    if (!settings.permissions.allow.includes(permission)) {
      settings.permissions.allow.push(permission);
      added.push(permission);
    }
  }

  if (added.length > 0) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    console.log(`\x1b[32m✓\x1b[0m Added permissions to ~/.claude/settings.json:`);
    for (const permission of added) {
      console.log(`  - ${permission}`);
    }
  }
} catch (err) {
  console.log(`\x1b[33m⚠\x1b[0m Could not update settings: ${err.message}`);
}
