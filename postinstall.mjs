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

// Add linear permission to settings.json
const PERMISSION = 'Bash(linear:*)';
const settingsPath = join(dest, 'settings.json');

try {
  let settings = { permissions: { allow: [], deny: [] } };

  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  }

  // Ensure structure exists
  settings.permissions = settings.permissions || {};
  settings.permissions.allow = settings.permissions.allow || [];

  // Add permission if not already present
  if (!settings.permissions.allow.includes(PERMISSION)) {
    settings.permissions.allow.push(PERMISSION);
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    console.log(`\x1b[32m✓\x1b[0m Added ${PERMISSION} to ~/.claude/settings.json`);
  }
} catch (err) {
  console.log(`\x1b[33m⚠\x1b[0m Could not update settings: ${err.message}`);
}
