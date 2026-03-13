#!/usr/bin/env node

/**
 * Creates a cornerstone3D worktree in a destination project and sets up
 * linking scripts so the destination can use local cs3d packages.
 *
 * Usage:  bun run link:cs3d DEST BRANCH_SPEC
 *
 * Branch formats:
 *   REMOTE:BRANCH   – fetch from REMOTE, checkout REMOTE/BRANCH
 *   BRANCH          – local branch
 *   -b NEW          – create NEW branch off HEAD
 *   -b NEW BASE     – create NEW branch off BASE
 */

import { execSync } from 'child_process';
import { resolve, dirname, relative, join } from 'path';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
  readdirSync,
} from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cs3dRoot = resolve(__dirname, '..');

// ── Parse arguments ────────────────────────────────────────────────────
const args = process.argv.slice(2);

function usage() {
  console.error(`Usage: bun run link:cs3d DEST BRANCH_SPEC

Branch formats:
  REMOTE:BRANCH   – fetch remote, use remote branch
  BRANCH          – existing local branch
  -b NEW          – create new branch from HEAD
  -b NEW BASE     – create new branch from BASE
`);
  process.exit(1);
}

if (args.length < 2) usage();

const dest = resolve(args[0]);
const branchArgs = args.slice(1);

// ── Parse branch spec ──────────────────────────────────────────────────
let worktreeCmd;
const worktreePath = resolve(dest, 'libs/@cornerstonejs');

if (branchArgs[0] === '-b') {
  if (!branchArgs[1]) {
    console.error('Error: -b requires a branch name');
    usage();
  }
  const newBranch = branchArgs[1];
  const base = branchArgs[2] || 'HEAD';
  worktreeCmd = `git worktree add -b "${newBranch}" "${worktreePath}" ${base}`;
} else {
  const branchSpec = branchArgs[0];
  if (branchSpec.includes(':')) {
    const idx = branchSpec.indexOf(':');
    const remote = branchSpec.slice(0, idx);
    const branch = branchSpec.slice(idx + 1);
    console.log(`Fetching from ${remote}...`);
    execSync(`git fetch ${remote}`, { cwd: cs3dRoot, stdio: 'inherit' });
    worktreeCmd = `git worktree add "${worktreePath}" "${remote}/${branch}"`;
  } else {
    worktreeCmd = `git worktree add "${worktreePath}" "${branchSpec}"`;
  }
}

// ── Create worktree ────────────────────────────────────────────────────
if (existsSync(worktreePath)) {
  console.log(`Worktree already exists at ${worktreePath}`);
} else {
  mkdirSync(resolve(dest, 'libs'), { recursive: true });
  console.log(`Creating worktree: ${worktreeCmd}`);
  execSync(worktreeCmd, { cwd: cs3dRoot, stdio: 'inherit' });
}

// ── Update destination .gitignore ──────────────────────────────────────
const gitignorePath = resolve(dest, '.gitignore');
const gitignoreEntries = [
  '# cornerstone3D local linking',
  'libs/',
  'link-cs3d.js',
  'unlink-cs3d.js',
];

if (existsSync(gitignorePath)) {
  const content = readFileSync(gitignorePath, 'utf8');
  const missing = gitignoreEntries.filter((e) => !content.includes(e));
  if (missing.length > 0) {
    appendFileSync(gitignorePath, '\n' + missing.join('\n') + '\n');
    console.log('Updated .gitignore');
  }
} else {
  writeFileSync(gitignorePath, gitignoreEntries.join('\n') + '\n');
  console.log('Created .gitignore');
}

// ── Add to VS Code workspace if one exists ─────────────────────────────
const worktreeRelative = 'libs/@cornerstonejs';
const workspaceFiles = readdirSync(dest).filter((f) =>
  f.endsWith('.code-workspace')
);

for (const wsFile of workspaceFiles) {
  const wsPath = resolve(dest, wsFile);
  try {
    const ws = JSON.parse(readFileSync(wsPath, 'utf8'));
    if (!ws.folders) ws.folders = [];

    const alreadyAdded = ws.folders.some(
      (f) =>
        f.path === worktreeRelative ||
        f.path === './' + worktreeRelative ||
        f.path === worktreeRelative + '/'
    );

    if (!alreadyAdded) {
      ws.folders.push({
        path: worktreeRelative,
        name: 'cornerstone3D (local)',
      });
      writeFileSync(wsPath, JSON.stringify(ws, null, '\t') + '\n');
      console.log(`Added worktree to VS Code workspace: ${wsFile}`);
    } else {
      console.log(`Worktree already in VS Code workspace: ${wsFile}`);
    }
  } catch (err) {
    console.warn(`Warning: could not update ${wsFile}: ${err.message}`);
  }
}

// ── Generate link-cs3d.js ──────────────────────────────────────────────
const linkScript = `#!/usr/bin/env node

/**
 * Links local cornerstone3D worktree packages into this project's node_modules.
 * Then installs worktree dependencies, builds, and starts watch mode.
 *
 * Usage:  node link-cs3d.js            – link + build + watch
 *         node link-cs3d.js --no-watch – link + build only
 */

const { readdirSync, readFileSync, rmSync, symlinkSync, existsSync, lstatSync } = require('fs');
const { resolve, join } = require('path');
const { execSync, spawn } = require('child_process');

const root = __dirname;
const worktree = resolve(root, 'libs/@cornerstonejs');
const packagesDir = resolve(worktree, 'packages');
const noWatch = process.argv.includes('--no-watch');
const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';

if (!existsSync(worktree)) {
  console.error('Error: worktree not found at ' + worktree);
  console.error('Run the link:cs3d setup command from the cornerstone3D repo first.');
  process.exit(1);
}

// Step 1: Install worktree dependencies
console.log('\\n==> Installing worktree dependencies...');
execSync('yarn install --frozen-lockfile', { cwd: worktree, stdio: 'inherit' });

// Step 2: Initial ESM build
console.log('\\n==> Building cornerstone3D packages (ESM)...');
execSync('npx lerna run build:esm --stream', { cwd: worktree, stdio: 'inherit' });

// Step 3: Symlink packages into node_modules
console.log('\\n==> Linking packages into node_modules...');
const packages = readdirSync(packagesDir);

for (const pkg of packages) {
  const pkgJsonPath = resolve(packagesDir, pkg, 'package.json');
  if (!existsSync(pkgJsonPath)) continue;

  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  } catch {
    continue;
  }

  const name = pkgJson.name;
  if (!name) continue;

  const target = resolve(packagesDir, pkg);
  const linkPath = resolve(root, 'node_modules', ...name.split('/'));

  // Remove existing (real directory or old symlink)
  try {
    const stat = lstatSync(linkPath);
    if (stat) {
      rmSync(linkPath, { recursive: true });
    }
  } catch {
    // does not exist – fine
  }

  console.log('  ' + name + ' -> ' + target);
  symlinkSync(target, linkPath, symlinkType);
}

console.log('\\nDone! ' + packages.length + ' packages linked.');

if (noWatch) {
  console.log('Skipping watch mode (--no-watch).');
  process.exit(0);
}

// Step 4: Start build:esm:watch
console.log('\\n==> Starting build:esm:watch (Ctrl+C to stop)...');
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['lerna', 'run', 'build:esm:watch', '--stream', '--parallel'],
  { cwd: worktree, stdio: 'inherit', shell: true }
);

child.on('exit', (code) => process.exit(code || 0));

// Forward signals
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
`;

writeFileSync(resolve(dest, 'link-cs3d.js'), linkScript);
console.log('Wrote link-cs3d.js');

// ── Generate unlink-cs3d.js ────────────────────────────────────────────
const cs3dRootEscaped = cs3dRoot.replace(/\\/g, '\\\\');

const unlinkScript = `#!/usr/bin/env node

/**
 * Unlinks local cornerstone3D packages from this project's node_modules
 * and restores them from the registry.
 *
 * Usage:  node unlink-cs3d.js            – unlink only
 *         node unlink-cs3d.js --delete   – unlink and remove the worktree
 */

const { readdirSync, readFileSync, rmSync, existsSync, lstatSync } = require('fs');
const { resolve } = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const worktree = resolve(root, 'libs/@cornerstonejs');
const packagesDir = resolve(worktree, 'packages');
const shouldDelete = process.argv.includes('--delete');
const cs3dRoot = '${cs3dRootEscaped}';

// Step 1: Remove symlinks
if (existsSync(packagesDir)) {
  console.log('==> Removing symlinks...');
  const packages = readdirSync(packagesDir);

  for (const pkg of packages) {
    const pkgJsonPath = resolve(packagesDir, pkg, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;

    let pkgJson;
    try {
      pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    } catch {
      continue;
    }

    const name = pkgJson.name;
    if (!name) continue;

    const linkPath = resolve(root, 'node_modules', ...name.split('/'));
    try {
      const stat = lstatSync(linkPath);
      if (stat && stat.isSymbolicLink()) {
        rmSync(linkPath, { recursive: true });
        console.log('  Removed ' + name);
      }
    } catch {
      // already gone
    }
  }
} else {
  console.log('No worktree packages found – skipping unlink.');
}

// Step 2: Restore packages from registry
console.log('\\n==> Restoring packages from registry (yarn install)...');
try {
  execSync('yarn install --frozen-lockfile', { cwd: root, stdio: 'inherit' });
} catch {
  console.log('yarn install failed, trying without --frozen-lockfile...');
  execSync('yarn install', { cwd: root, stdio: 'inherit' });
}

// Step 3: Optionally delete the worktree
if (shouldDelete) {
  console.log('\\n==> Removing worktree...');
  try {
    execSync('git worktree remove "' + worktree.replace(/\\\\/g, '/') + '" --force', {
      cwd: cs3dRoot,
      stdio: 'inherit',
    });
    console.log('Worktree removed.');
  } catch (err) {
    console.error('Failed to remove worktree via git. Removing directory manually...');
    rmSync(worktree, { recursive: true, force: true });
    // Prune stale worktree entries
    try {
      execSync('git worktree prune', { cwd: cs3dRoot, stdio: 'inherit' });
    } catch {}
  }

  // Clean up libs dir if empty
  const libsDir = resolve(root, 'libs');
  try {
    const remaining = readdirSync(libsDir);
    if (remaining.length === 0) {
      rmSync(libsDir, { recursive: true });
    }
  } catch {}

  // Remove from VS Code workspace files
  const wsFiles = readdirSync(root).filter(f => f.endsWith('.code-workspace'));
  for (const wsFile of wsFiles) {
    const wsPath = resolve(root, wsFile);
    try {
      const ws = JSON.parse(readFileSync(wsPath, 'utf8'));
      if (ws.folders) {
        const before = ws.folders.length;
        ws.folders = ws.folders.filter(
          f => f.path !== 'libs/@cornerstonejs' &&
               f.path !== './libs/@cornerstonejs' &&
               f.path !== 'libs/@cornerstonejs/'
        );
        if (ws.folders.length < before) {
          const { writeFileSync: wfs } = require('fs');
          wfs(wsPath, JSON.stringify(ws, null, '\\t') + '\\n');
          console.log('Removed worktree from VS Code workspace: ' + wsFile);
        }
      }
    } catch {}
  }

  console.log('Done! Worktree deleted.');
} else {
  console.log('\\nDone! Packages restored. Worktree kept at libs/@cornerstonejs');
  console.log('Run with --delete to also remove the worktree.');
}
`;

writeFileSync(resolve(dest, 'unlink-cs3d.js'), unlinkScript);
console.log('Wrote unlink-cs3d.js');

// ── Summary ────────────────────────────────────────────────────────────
console.log(`
Setup complete!

  Worktree:    ${worktreePath}
  Link script: ${resolve(dest, 'link-cs3d.js')}
  Unlink:      ${resolve(dest, 'unlink-cs3d.js')}

Next steps:
  cd ${dest}
  node link-cs3d.js            # install, build, link, and start watch
  node link-cs3d.js --no-watch # install, build, and link (no watch)

To unlink later:
  node unlink-cs3d.js            # restore packages from registry
  node unlink-cs3d.js --delete   # also remove the worktree
`);
