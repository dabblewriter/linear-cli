import { unlinkSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, 'claude');
const dest = join(homedir(), '.claude');

// Remove files that were installed from claude/
let removedCount = 0;
try {
  const files = readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(src, join(e.parentPath, e.name)));

  for (const file of files) {
    const filePath = join(dest, file);
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        removedCount++;
      }
    } catch (err) {
      // Silently ignore removal errors
    }
  }
} catch (err) {
  // Silently ignore if claude/ dir doesn't exist
}

if (removedCount > 0) {
  console.log(`\x1b[32m✓\x1b[0m Removed ${removedCount} Claude file(s) from ~/.claude/`);
}

// Remove linear permission from settings.json
const PERMISSION = 'Bash(linear:*)';
const settingsPath = join(dest, 'settings.json');

try {
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    if (settings.permissions?.allow?.includes(PERMISSION)) {
      settings.permissions.allow = settings.permissions.allow.filter(p => p !== PERMISSION);
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      console.log(`\x1b[32m✓\x1b[0m Removed ${PERMISSION} from ~/.claude/settings.json`);
    }
  }
} catch (err) {
  // Silently ignore settings errors
}
