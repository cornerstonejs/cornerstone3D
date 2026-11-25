import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * Runs the local Cornerstone3D 6.0 registry packages on code, step by step in
 * the order of the aggregate workflow, and counts what each step rewrote and
 * reported. The aggregate workflow itself takes its steps from the Codemod
 * registry, so a local rule can only be tried this way.
 *
 * Usage: node scripts/run-registry.mjs [options] <target> [<target> ...]
 * See `--help`.
 */

export const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..'
);
export const defaultRegistry = resolve(packageRoot, 'registry/cornerstone3d/6');

/** The extensions of the files that the steps read. */
const SOURCE_FILE = /\.(ts|mts|cts|tsx|js|jsx|mjs|cjs)$/;

/** The folders that the steps leave out. */
const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', '.git']);

/** The metric of every rewritten site, which only some steps fill. */
export const REWRITTEN_METRIC = 'cornerstone3d-6-rewritten';

/** The metrics that the steps report. */
export const METRICS = {
  manual: 'cornerstone3d-6-manual',
  review: 'cornerstone3d-6-review',
  rewritten: REWRITTEN_METRIC,
};

/**
 * Returns the steps of the aggregate workflow of a registry folder, in their
 * order: the folder name of each `@cornerstonejs/cornerstone3d-6-<name>`.
 */
export function workflowSteps(registry = defaultRegistry) {
  const workflow = readFileSync(join(registry, 'workflow.yaml'), 'utf8');

  return [
    ...workflow.matchAll(
      /source:\s*['"]?@cornerstonejs\/cornerstone3d-6-([\w-]+)/g
    ),
  ].map((match) => match[1]);
}

/**
 * Returns the steps that a `--steps` value names, in the order of the
 * workflow: `all`, or names separated by commas.
 */
export function selectSteps(value, registry = defaultRegistry) {
  const all = workflowSteps(registry);

  if (!value || value === 'all') {
    return all;
  }

  const wanted = value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = wanted.filter((name) => !all.includes(name));

  if (unknown.length) {
    throw new Error(
      `Unknown step ${unknown.join(', ')}; the steps are ${all.join(', ')}`
    );
  }

  return all.filter((name) => wanted.includes(name));
}

/**
 * Returns the source files under a path, relative to it, without the
 * folders that the steps leave out. A file gives itself.
 */
export function sourceFiles(path, found = [], base = path) {
  if (statSync(path).isFile()) {
    return SOURCE_FILE.test(path) ? [relative(dirname(base), path)] : [];
  }

  for (const entry of readdirSync(path)) {
    const entryPath = join(path, entry);

    if (statSync(entryPath).isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry)) {
        sourceFiles(entryPath, found, base);
      }
    } else if (SOURCE_FILE.test(entry)) {
      found.push(relative(base, entryPath));
    }
  }

  return found;
}

/**
 * Reads the source files under a folder into a map of path to text.
 */
export function snapshot(folder) {
  const texts = new Map();

  for (const path of sourceFiles(folder)) {
    texts.set(path, readFileSync(join(folder, path), 'utf8'));
  }

  return texts;
}

/**
 * Parses the metrics that the tool prints at the end of a run: each entry
 * with its metric, file, line, rule and count. The tool prints the fields of
 * an entry in any order.
 */
export function parseMetrics(output) {
  const entries = [];
  let metric = '';
  let inMetrics = false;

  for (const line of output.split('\n')) {
    if (/^Metrics:\s*$/.test(line)) {
      inMetrics = true;
      continue;
    }

    const header = inMetrics ? /^ {2}(\S+):$/.exec(line) : null;

    if (header) {
      metric = header[1];
      continue;
    }

    const entry = inMetrics && metric ? /^ {4}(.*): (\d+)$/.exec(line) : null;

    if (!entry) {
      continue;
    }

    const fields = {};

    for (const part of entry[1].split(/, (?=(?:file|line|rule)=)/)) {
      const at = part.indexOf('=');

      fields[part.slice(0, at)] = part.slice(at + 1);
    }

    entries.push({
      metric,
      file: fields.file ?? '',
      line: Number(fields.line ?? 0),
      rule: fields.rule ?? '',
      count: Number(entry[2]),
    });
  }

  return entries;
}

/**
 * Returns the numbers of the lines of a new text that differ from an old
 * text, by a diff of their lines.
 */
export function changedLines(before, after) {
  const scratch = mkdtempSync(join(tmpdir(), 'codemod-lines-'));

  try {
    writeFileSync(join(scratch, 'a'), before);
    writeFileSync(join(scratch, 'b'), after);

    const { stdout } = spawnSync(
      'diff',
      ['-U0', join(scratch, 'a'), join(scratch, 'b')],
      { encoding: 'utf8', maxBuffer: 1 << 28 }
    );
    const lines = [];

    for (const match of stdout.matchAll(
      /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm
    )) {
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);

      for (let line = start; line < start + count; line += 1) {
        lines.push(line);
      }
    }

    return lines;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Returns the unified diff of one file between two texts, with the path in
 * its header.
 */
export function unifiedDiff(path, before, after) {
  const scratch = mkdtempSync(join(tmpdir(), 'codemod-diff-'));

  try {
    writeFileSync(join(scratch, 'a'), before);
    writeFileSync(join(scratch, 'b'), after);

    const { stdout } = spawnSync(
      'diff',
      [
        '-u',
        '--label',
        `a/${path}`,
        '--label',
        `b/${path}`,
        join(scratch, 'a'),
        join(scratch, 'b'),
      ],
      { encoding: 'utf8', maxBuffer: 1 << 28 }
    );

    return stdout;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Runs one step of a registry on a folder in place, with the metric of the
 * rewritten sites turned on, and returns its exit code, its time, its output
 * and its metric entries.
 */
export function runStep(registry, step, folder) {
  const start = Date.now();
  const result = spawnSync(
    'npx',
    [
      'codemod',
      '--disable-analytics',
      'workflow',
      'run',
      '-w',
      join(registry, step),
      '-t',
      folder,
      '--allow-dirty',
      '--no-interactive',
      '--param',
      `${REWRITTEN_METRIC}=true`,
    ],
    { cwd: tmpdir(), encoding: 'utf8', maxBuffer: 1 << 28 }
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  return {
    step,
    status: result.status ?? 1,
    seconds: (Date.now() - start) / 1000,
    output,
    metrics: parseMetrics(output),
  };
}

/**
 * Runs steps one after the other on a folder in place. Before each step it
 * reads the files, so that each step's changed files and lines are known.
 * Returns the result of each step, the texts before the first and after
 * the last, and the texts that each step read (`inputs`, in the order of the
 * steps): the line of a metric entry of a step is a line of its input.
 */
export function runSteps(registry, steps, folder, log = () => {}) {
  const before = snapshot(folder);
  let current = before;
  const results = [];
  const inputs = [];

  for (const step of steps) {
    inputs.push(current);

    const result = runStep(registry, step, folder);
    const after = snapshot(folder);
    const files = {};

    for (const [path, text] of after) {
      const old = current.get(path);

      if (old !== undefined && old !== text) {
        files[path] = { changedLines: changedLines(old, text).length };
      }
    }

    result.files = files;
    results.push(result);
    current = after;
    log(
      `${step}: exit ${result.status}, ${result.seconds.toFixed(1)} s, ${Object.keys(files).length} files changed`
    );
  }

  return { results, before, after: current, inputs };
}

/**
 * Returns a label for a target path: its path from the working directory,
 * or from this repository, or its name for a path outside both.
 */
function targetLabel(target, used) {
  const inside = [process.cwd(), resolve(packageRoot, '../..')]
    .map((base) => relative(base, target))
    .find((path) => path && !path.startsWith('..'));
  let label = inside ?? basename(target);

  for (let index = 2; used.has(label); index += 1) {
    label = `${basename(target)}-${index}`;
  }

  used.add(label);

  return label;
}

/** The languages of a fenced code block of Markdown, by their file extension. */
const SNIPPET_EXTENSIONS = {
  ts: 'ts',
  typescript: 'ts',
  tsx: 'tsx',
  js: 'js',
  javascript: 'js',
  jsx: 'jsx',
};

/**
 * Returns the fenced code blocks of a Markdown text whose language the steps
 * read: the lines of each, without the indent of its fence, with the
 * extension of its language.
 */
export function markdownSnippets(text) {
  const lines = text.split('\n');
  const snippets = [];

  for (let index = 0; index < lines.length; index += 1) {
    const open = /^(\s*)(```+|~~~+)\s*([\w-]+)?/.exec(lines[index]);

    if (!open) {
      continue;
    }

    const [, indent, fence, language] = open;
    const close = lines.findIndex(
      (line, at) =>
        at > index && line.trimEnd() === `${indent}${fence}`.trimEnd()
    );

    if (close === -1) {
      break;
    }

    const extension = SNIPPET_EXTENSIONS[(language ?? '').toLowerCase()];

    if (extension) {
      snippets.push({
        start: index + 1,
        end: close,
        indent,
        extension,
        text: lines
          .slice(index + 1, close)
          .map((line) =>
            line.startsWith(indent) ? line.slice(indent.length) : line
          )
          .join('\n'),
      });
    }

    index = close;
  }

  return snippets;
}

/**
 * Returns a Markdown text with the code of its snippets replaced, each
 * snippet with its own new text, indented as its fence.
 */
export function replaceSnippets(text, snippets, texts) {
  const lines = text.split('\n');

  for (let index = snippets.length - 1; index >= 0; index -= 1) {
    const snippet = snippets[index];
    const code = texts[index];

    if (code === undefined || code === snippet.text) {
      continue;
    }

    lines.splice(
      snippet.start,
      snippet.end - snippet.start,
      ...code
        .split('\n')
        .map((line) => (line ? `${snippet.indent}${line}` : line))
    );
  }

  return lines.join('\n');
}

/**
 * Returns the path of the file that holds one snippet of a Markdown file in
 * the work folder: `guide.md.snippet-3.ts` for its third snippet.
 */
function snippetPath(path, index, extension) {
  return `${path}.snippet-${index + 1}.${extension}`;
}

/**
 * Copies the targets into a work folder, each under its label: their source
 * files, and with `markdown` the code blocks of their Markdown files as
 * files of their own. The Markdown files of a `migration-guides` folder are
 * left out (`guides` counts them): they show the old code on purpose.
 * Returns what is needed to write the result back: each work file with its
 * target file, and each Markdown file with its snippets.
 */
export function copyTargets(targets, work, { markdown = false } = {}) {
  const used = new Set();
  const files = [];
  const documents = [];
  let guides = 0;

  for (const target of targets) {
    const label = targetLabel(target, used);
    const isFile = statSync(target).isFile();
    const base = isFile ? dirname(target) : target;
    const paths = isFile
      ? [basename(target)]
      : [...sourceFiles(target), ...(markdown ? markdownFiles(target) : [])];

    for (const path of paths) {
      const from = join(base, path);

      if (SOURCE_FILE.test(path)) {
        const to = join(label, path);

        mkdirSync(dirname(join(work, to)), { recursive: true });
        cpSync(from, join(work, to));
        files.push({ work: to, target: from });
        continue;
      }

      if (!markdown || !MARKDOWN_FILE.test(path)) {
        continue;
      }

      if (GUIDE_FOLDER.test(from)) {
        guides += 1;
        continue;
      }

      const text = readFileSync(from, 'utf8');
      const snippets = markdownSnippets(text);
      const snippetFiles = snippets.map((snippet, index) =>
        join(label, snippetPath(path, index, snippet.extension))
      );

      snippets.forEach((snippet, index) => {
        mkdirSync(dirname(join(work, snippetFiles[index])), {
          recursive: true,
        });
        writeFileSync(join(work, snippetFiles[index]), snippet.text);
      });

      if (snippets.length) {
        documents.push({
          work: join(label, path),
          target: from,
          text,
          snippets,
          snippetFiles,
        });
      }
    }
  }

  return { files, documents, guides };
}

/** The extensions of a Markdown file. */
const MARKDOWN_FILE = /\.(md|mdx)$/;

/** A path in a folder of migration guides, whose code shows old names on purpose. */
const GUIDE_FOLDER = /(^|[\\/])migration-guides[\\/]/;

/**
 * Returns the Markdown files under a folder, relative to it.
 */
function markdownFiles(folder, found = [], base = folder) {
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry);

    if (statSync(path).isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry)) {
        markdownFiles(path, found, base);
      }
    } else if (MARKDOWN_FILE.test(entry)) {
      found.push(relative(base, path));
    }
  }

  return found;
}

/**
 * Returns the texts of a copy as its targets read: each source file as it
 * is, each Markdown file with its snippets put back.
 */
export function targetTexts(copy, texts) {
  const result = new Map();
  const inDocuments = new Set(
    copy.documents.flatMap((doc) => doc.snippetFiles)
  );

  for (const file of copy.files) {
    if (texts.has(file.work)) {
      result.set(file.work, texts.get(file.work));
    }
  }

  for (const doc of copy.documents) {
    result.set(
      doc.work,
      replaceSnippets(
        doc.text,
        doc.snippets,
        doc.snippetFiles.map((path) => texts.get(path))
      )
    );
  }

  for (const [path, text] of texts) {
    if (!result.has(path) && !inDocuments.has(path)) {
      result.set(path, text);
    }
  }

  return result;
}

/**
 * Writes the files that a run changed back to their targets.
 */
export function writeBack(copy, before, after) {
  const targets = new Map([
    ...copy.files.map((file) => [file.work, file.target]),
    ...copy.documents.map((doc) => [doc.work, doc.target]),
  ]);
  let written = 0;

  for (const [path, text] of after) {
    if (before.get(path) !== text && targets.has(path)) {
      writeFileSync(targets.get(path), text);
      written += 1;
    }
  }

  return written;
}

/**
 * Sums the metric entries by a key.
 */
function sumBy(entries, key) {
  const sums = new Map();

  for (const entry of entries) {
    const name = key(entry);

    sums.set(name, (sums.get(name) ?? 0) + entry.count);
  }

  return sums;
}

/**
 * Returns the counts of a run: per step, per rule and per file, with the
 * totals.
 */
export function summarize(results) {
  const entries = results.flatMap((result) =>
    result.metrics.map((entry) => ({ ...entry, step: result.step }))
  );
  const files = new Map();
  const fileRow = (path) => {
    if (!files.has(path)) {
      files.set(path, { changedLines: 0, rewritten: 0, manual: 0, review: 0 });
    }

    return files.get(path);
  };

  for (const result of results) {
    for (const [path, { changedLines: lines }] of Object.entries(
      result.files
    )) {
      fileRow(path).changedLines += lines;
    }
  }

  for (const entry of entries) {
    const name = Object.keys(METRICS).find(
      (key) => METRICS[key] === entry.metric
    );

    if (name) {
      fileRow(entry.file)[name] += entry.count;
    }
  }

  const rules = [
    ...sumBy(entries, (entry) => JSON.stringify([entry.step, entry.rule])),
  ]
    .map(([key, count]) => {
      const [step, rule] = JSON.parse(key);
      const of = (metric) =>
        entries
          .filter(
            (entry) =>
              entry.step === step &&
              entry.rule === rule &&
              entry.metric === metric
          )
          .reduce((sum, entry) => sum + entry.count, 0);

      return {
        step,
        rule,
        rewritten: of(METRICS.rewritten),
        manual: of(METRICS.manual),
        review: of(METRICS.review),
        count,
      };
    })
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));
  const steps = results.map((result) => {
    const of = (metric) =>
      result.metrics
        .filter((entry) => entry.metric === metric)
        .reduce((sum, entry) => sum + entry.count, 0);

    return {
      step: result.step,
      status: result.status,
      seconds: result.seconds,
      filesChanged: Object.keys(result.files).length,
      changedLines: Object.values(result.files).reduce(
        (sum, file) => sum + file.changedLines,
        0
      ),
      rewritten: of(METRICS.rewritten),
      countsRewrites: result.metrics.some(
        (entry) => entry.metric === METRICS.rewritten
      ),
      manual: of(METRICS.manual),
      review: of(METRICS.review),
    };
  });
  const filesWith = (name) =>
    [...files.values()].filter((row) => row[name] > 0).length;

  return {
    steps,
    rules,
    files: Object.fromEntries(
      [...files].sort(([a], [b]) => a.localeCompare(b))
    ),
    totals: {
      filesChanged: filesWith('changedLines'),
      changedLines: steps.reduce((sum, step) => sum + step.changedLines, 0),
      rewritten: steps.reduce((sum, step) => sum + step.rewritten, 0),
      manual: steps.reduce((sum, step) => sum + step.manual, 0),
      manualFiles: filesWith('manual'),
      review: steps.reduce((sum, step) => sum + step.review, 0),
      reviewFiles: filesWith('review'),
    },
  };
}

/**
 * Prints the counts of a run.
 */
export function printSummary(summary, { byFile = true } = {}) {
  console.log(
    '\nSteps (changed lines from a diff; rewritten from the metric of a step that fills it):'
  );

  for (const step of summary.steps) {
    const rewritten = step.countsRewrites
      ? `, rewritten ${step.rewritten}`
      : '';

    console.log(
      `  ${step.step}: exit ${step.status}, ${step.filesChanged} files, ${step.changedLines} changed lines${rewritten}, manual ${step.manual}, review ${step.review}`
    );
  }

  console.log('\nRules (rewritten / manual / review):');

  for (const rule of summary.rules) {
    console.log(
      `  ${String(rule.rewritten).padStart(5)} ${String(rule.manual).padStart(5)} ${String(rule.review).padStart(5)}  [${rule.step}] ${rule.rule}`
    );
  }

  if (byFile) {
    console.log('\nFiles (changed lines / rewritten / manual / review):');

    for (const [path, row] of Object.entries(summary.files)) {
      console.log(
        `  ${String(row.changedLines).padStart(5)} ${String(row.rewritten).padStart(5)} ${String(row.manual).padStart(5)} ${String(row.review).padStart(5)}  ${path}`
      );
    }
  }

  const { totals } = summary;

  console.log(
    `\nTotal: ${totals.filesChanged} files changed, ${totals.changedLines} changed lines, rewritten ${totals.rewritten} (steps with the metric), manual ${totals.manual} in ${totals.manualFiles} files, review ${totals.review} in ${totals.reviewFiles} files`
  );
}

const HELP = `Usage: node scripts/run-registry.mjs [options] <target> [<target> ...]

Runs the local Cornerstone3D 6.0 registry packages on the targets, step by
step in the order of registry/cornerstone3d/6/workflow.yaml, and prints what
each step rewrote and reported, per step, per rule and per file. The steps
run on a copy of the targets in a work folder; the changed files are
written back to the targets at the end, unless --dry-run.

Options:
  --steps <names>   the steps to run, separated by commas (folders of the
                    registry, such as api-names), or all (the default)
  --registry <dir>  the registry folder of the steps (default: this package's
                    registry/cornerstone3d/6)
  --dry-run         leave the targets as they are
  --markdown        also run the steps on the ts, tsx, js and jsx code
                    blocks of the .md and .mdx files of the targets (each
                    block as a file of its own, path.md.snippet-<n>.<ext>),
                    and write changed blocks back into the Markdown; the
                    files of a migration-guides folder are left out, as
                    their code shows the old names on purpose
  --work <dir>      the work folder, kept afterwards (default: a temporary
                    folder, deleted afterwards)
  --diff <file>     write the diff of the run, as the targets read it
  --json <file>     write the counts and every metric entry as JSON
  --no-files        do not print the counts per file
  --help            print this text`;

/**
 * Runs the command line.
 */
function main() {
  const { values: options, positionals: targets } = parseArgs({
    allowPositionals: true,
    options: {
      steps: { type: 'string' },
      registry: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      markdown: { type: 'boolean', default: false },
      work: { type: 'string' },
      diff: { type: 'string' },
      json: { type: 'string' },
      'no-files': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (options.help || !targets.length) {
    console.log(HELP);
    process.exit(options.help ? 0 : 1);
  }

  const registry = resolve(options.registry ?? defaultRegistry);
  const steps = selectSteps(options.steps, registry);
  const resolved = targets.map((target) => resolve(target));
  const missing = resolved.filter((target) => !existsSync(target));

  if (missing.length) {
    console.error(`No such target: ${missing.join(', ')}`);
    process.exit(1);
  }

  const work = options.work
    ? resolve(options.work)
    : mkdtempSync(join(tmpdir(), 'codemod-run-'));

  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const copy = copyTargets(resolved, work, { markdown: options.markdown });
  const snippets = copy.documents.reduce(
    (sum, doc) => sum + doc.snippets.length,
    0
  );

  console.log(`Registry: ${registry}`);
  console.log(`Steps: ${steps.join(', ')}`);
  console.log(
    `Targets: ${resolved.join(', ')} (${copy.files.length} source files${options.markdown ? `, ${snippets} code blocks of ${copy.documents.length} Markdown files` : ''})`
  );

  if (copy.guides) {
    console.log(
      `Left out: ${copy.guides} Markdown files of migration guides, whose code shows the old names on purpose`
    );
  }

  const run = runSteps(registry, steps, work, (line) =>
    console.log(`  ${line}`)
  );
  const before = targetTexts(copy, run.before);
  const after = targetTexts(copy, run.after);
  const summary = summarize(run.results);

  printSummary(summary, { byFile: !options['no-files'] });

  if (options['dry-run']) {
    console.log('Dry run: the targets are as they were');
  } else {
    console.log(`Written back: ${writeBack(copy, before, after)} files`);
  }

  if (options.diff) {
    const diff = [...after]
      .filter(([path, text]) => before.get(path) !== text)
      .map(([path, text]) => unifiedDiff(path, before.get(path) ?? '', text))
      .join('');

    writeFileSync(options.diff, diff);
    console.log(`Diff: ${options.diff}`);
  }

  if (options.json) {
    writeFileSync(
      options.json,
      JSON.stringify(
        {
          registry,
          steps,
          targets: resolved,
          summary,
          entries: run.results.flatMap((result) =>
            result.metrics.map((entry) => ({ ...entry, step: result.step }))
          ),
        },
        null,
        2
      )
    );
    console.log(`JSON: ${options.json}`);
  }

  if (options.work) {
    console.log(`Work folder kept: ${work}`);
  } else {
    rmSync(work, { recursive: true, force: true });
  }

  if (run.results.some((result) => result.status !== 0)) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
