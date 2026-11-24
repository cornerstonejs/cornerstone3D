import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  defaultRegistry,
  METRICS,
  packageRoot,
  runSteps,
  selectSteps,
  sourceFiles,
  summarize,
  unifiedDiff,
} from './run-registry.mjs';

/**
 * Measures the Cornerstone3D 6.0 codemod on real code: the examples of a
 * 5.x commit of this repository, or an OHIF checkout. See `--help` and the
 * section "Measure" of the README of this package.
 */

const repoRoot = resolve(packageRoot, '../..');

/**
 * The 5.x names that 6.0 removes or renames, by family, as patterns; a site
 * is one match in a file, outside comment lines. They are the patterns of
 * the measures of 19 to 21 November 2026 (lanes S6A to C2), unchanged, so
 * that the numbers compare.
 */
const SITE_PATTERNS = {
  'viewport types':
    /ViewportType\.(STACK|ORTHOGRAPHIC|PERSPECTIVE|PLANAR_NEXT|VOLUME_3D_NEXT|VIDEO_NEXT|WHOLE_SLIDE_NEXT|ECG_NEXT)\b/g,
  'types and classes':
    /\bTypes\.I(Stack|Volume|BaseVolume|Video|WSI|ECG|Generic)Viewport\b|\b(StackViewport|BaseVolumeViewport|LegacyVolumeViewport3D|GenericVolumeViewport3D|VideoGenericViewport|WSIGenericViewport|ECGGenericViewport)\b|\bVolumeViewport\b(?!3D)/g,
  events:
    /\b(STACK_NEW_IMAGE|VOLUME_NEW_IMAGE|IMAGE_LOAD_ERROR|PRE_STACK_NEW_IMAGE|STACK_VIEWPORT_SCROLL|PRESET_MODIFIED|ACTORS_CHANGED|CLIPPING_PLANES_UPDATED|StackNewImageEvent|VolumeNewImageEvent)\w*/g,
  settings:
    /\b(useGenericViewport|getUseGenericViewport|useCPURendering|setUseCPURendering|resetUseCPURendering|getShouldUseCPURendering)\b/g,
  data: /\.(setStack|setVolumes|addVolumes|setVideo|setEcg|setWSI|setDataIds|setDataList)\(|\b(setVolumesForViewports|addVolumesToViewports|convertStackToVolumeViewport|convertVolumeToStackViewport)\(/g,
  members:
    /\.(setProperties|getProperties|resetProperties|resetCamera|getCamera|setCamera|getViewPresentation|setViewPresentation|setBlendMode|getBlendMode|setSlabThickness|getSlabThickness|flip|jumpToWorld|getActor|getActorUIDs|getActorByIndex|getAllVolumeIds|getBounds|getCornerstoneImage|getIntensityFromWorld|isInAcquisitionPlane|getSliceViewInfo|getCurrentSlicePixelData|setDefaultProperties|togglePlayPause|setChannelVisibility|setFrameRange|getTargetImageIdIndex|resetCameraForResize|setAverageWhite)\(|\.(isDisabled|modality)\b/g,
};

/**
 * The legacy names whose rewrites the OHIF dry run of 20 November 2026 (lane
 * Q5) counted, by kind: the matches on removed lines of the diff less those
 * on added lines.
 */
const OHIF_KINDS = [
  ['Types.IStackViewport', /\bIStackViewport\b/g],
  ['Types.IVolumeViewport', /\bIVolumeViewport\b/g],
  ['Types.IBaseVolumeViewport', /\bIBaseVolumeViewport\b/g],
  ['Types.IECGViewport', /\bIECGViewport\b/g],
  ['BaseVolumeViewport (import)', /\bBaseVolumeViewport\b(?!\))/g],
  ['ViewportType.*_NEXT', /\b(PLANAR|VOLUME_3D|VIDEO|WHOLE_SLIDE|ECG)_NEXT\b/g],
  ['ViewportType.STACK', /ViewportType\.STACK\b/g],
  ['ViewportType.ORTHOGRAPHIC', /ViewportType\.ORTHOGRAPHIC\b/g],
  ['Events.STACK_NEW_IMAGE', /\bSTACK_NEW_IMAGE\b/g],
  ['Events.VOLUME_NEW_IMAGE', /\bVOLUME_NEW_IMAGE\b/g],
  ['Events.IMAGE_LOAD_ERROR', /\bIMAGE_LOAD_ERROR\b/g],
  ['setUseCPURendering', /\bsetUseCPURendering\(/g],
  ['getShouldUseCPURendering', /\bgetShouldUseCPURendering\(/g],
  ['setStack', /\.setStack\(/g],
  ['setEcg', /\.setEcg\(/g],
  ['setCamera({ flip })', /\.setCamera\(\{ flip/g],
  ['resetCamera', /\.resetCamera\(/g],
  ['getAllVolumeIds', /\.getAllVolumeIds\(/g],
];

/** The extensions of the files whose sites the examples measure counts. */
const MEASURED_FILE = /\.(ts|tsx|js)$/;

/**
 * Returns a text without its comment lines.
 */
function codeText(text = '') {
  return text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

/**
 * Counts the sites of each family of `SITE_PATTERNS` in a text.
 */
function countSites(text) {
  return Object.fromEntries(
    Object.entries(SITE_PATTERNS).map(([family, pattern]) => [
      family,
      (text.match(pattern) ?? []).length,
    ])
  );
}

/**
 * Returns the hunks of a line diff of two texts: the start and the length
 * of each changed range, old and new.
 */
function hunks(before, after) {
  const scratch = join(tmpdir(), `codemod-hunks-${process.pid}`);

  mkdirSync(scratch, { recursive: true });
  writeFileSync(join(scratch, 'a'), before);
  writeFileSync(join(scratch, 'b'), after);

  const { stdout } = spawnSync(
    'diff',
    ['-U0', join(scratch, 'a'), join(scratch, 'b')],
    { encoding: 'utf8', maxBuffer: 1 << 28 }
  );

  rmSync(scratch, { recursive: true, force: true });

  return [
    ...stdout.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm),
  ].map((match) => ({
    oldStart: Number(match[1]),
    oldLines: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newLines: match[4] === undefined ? 1 : Number(match[4]),
  }));
}

/**
 * Returns the files with a syntax error, each with its first message, read
 * from a map of path to text with the TypeScript parser of this repository:
 * a `.ts` file as TypeScript, any other as TSX.
 */
function syntaxErrors(texts, files) {
  const ts = createRequire(join(repoRoot, 'package.json'))('typescript');
  const broken = new Map();

  for (const path of files) {
    const text = texts.get(path);

    if (text === undefined) {
      continue;
    }

    const kind = /\.(m|c)?ts$/.test(path)
      ? ts.ScriptKind.TS
      : ts.ScriptKind.TSX;
    const source = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      kind
    );

    if (source.parseDiagnostics.length) {
      broken.set(
        path,
        ts.flattenDiagnosticMessageText(
          source.parseDiagnostics[0].messageText,
          '\n'
        )
      );
    }
  }

  return broken;
}

/**
 * Type checks the examples of a tree against the sources of this checkout:
 * the examples are copied into `<work>/tc` in the layout of the repository,
 * with `utils` linked to the checkout, so that their relative imports of
 * `utils/demo` resolve. Returns every error in an example file.
 */
function typecheckExamples(work, tree) {
  const tc = join(work, 'tc');

  rmSync(tc, { recursive: true, force: true });
  mkdirSync(tc, { recursive: true });
  cpSync(join(tree, 'packages'), join(tc, 'packages'), { recursive: true });
  symlinkSync(join(repoRoot, 'utils'), join(tc, 'utils'));

  const packages = (name) => [`${name}/src`];
  const tsconfig = {
    extends: join(repoRoot, 'tsconfig.json'),
    compilerOptions: {
      noEmit: true,
      declaration: false,
      incremental: false,
      baseUrl: join(repoRoot, 'packages'),
      typeRoots: [join(repoRoot, 'node_modules/@types')],
      paths: {
        '@cornerstonejs/metadata': packages('metadata'),
        '@cornerstonejs/metadata/*': ['metadata/src/*'],
        '@cornerstonejs/utils': packages('utils'),
        '@cornerstonejs/utils/*': ['utils/src/*'],
        '@cornerstonejs/core': packages('core'),
        '@cornerstonejs/core/*': ['core/src/*'],
        '@cornerstonejs/tools': packages('tools'),
        '@cornerstonejs/tools/*': ['tools/src/*'],
        '@cornerstonejs/dicom-image-loader': packages('dicomImageLoader'),
        '@cornerstonejs/nifti-volume-loader': packages('nifti-volume-loader'),
        '@cornerstonejs/ai': packages('ai'),
        '@cornerstonejs/labelmap-interpolation': packages(
          'labelmap-interpolation'
        ),
        '@cornerstonejs/polymorphic-segmentation': packages(
          'polymorphic-segmentation'
        ),
        '@cornerstonejs/adapters': packages('adapters'),
        '*': [join(repoRoot, 'node_modules/*')],
      },
    },
    include: [
      join(tc, 'packages/*/examples/**/*'),
      join(repoRoot, 'utils/demo/**/*'),
    ],
    exclude: [
      join(repoRoot, 'node_modules'),
      join(repoRoot, 'packages/**/dist'),
      join(repoRoot, 'packages/docs'),
    ],
  };

  writeFileSync(join(tc, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

  const result = spawnSync(
    join(repoRoot, 'node_modules/.bin/tsc'),
    ['-p', join(tc, 'tsconfig.json'), '--pretty', 'false'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 28 }
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  writeFileSync(join(work, 'tsc.log'), output);

  const errors = [];

  for (const line of output.split('\n')) {
    const match = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
    const path = match ? resolve(repoRoot, match[1]) : '';

    if (match && path.startsWith(`${join(tc, 'packages')}/`)) {
      errors.push({
        file: relative(tc, path),
        line: Number(match[2]),
        column: Number(match[3]),
        code: match[4],
        message: match[5],
      });
    }
  }

  return errors;
}

/**
 * Tells whether a type error on a changed line is at a site that a step
 * left and reported: a name that the message quotes stood in the same hunk
 * before the run, so no step wrote it, and a manual or review entry of the
 * file names it. `(<PlanarViewport>viewport).setStack(ids)` is such a line:
 * the cast was rewritten, the `setStack` was left with a report.
 */
function isAtLeftSite(error, hunk, beforeLines, rules) {
  const names = [...error.message.matchAll(/'([A-Za-z_$][\w$]*)'/g)].map(
    (match) => match[1]
  );
  const old = beforeLines
    .slice(hunk.oldStart - 1, hunk.oldStart - 1 + hunk.oldLines)
    .join('\n');

  return names.some(
    (name) =>
      new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(old) &&
      rules.some((rule) =>
        new RegExp(`(^|[^\\w$])${name.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(
          rule
        )
      )
  );
}

/**
 * Returns the type errors on the lines that the run changed, each sorted
 * into a wrong rewrite or an error at a site that a step left and reported.
 * With the errors of the input, an error that the same lines had before the
 * run (same code and message) is not counted.
 */
function changedLineErrors(errors, before, after, entries, beforeErrors) {
  const found = [];
  const hunksByFile = new Map();

  for (const error of errors) {
    const old = before.get(error.file);
    const text = after.get(error.file);

    if (old === undefined || text === undefined || old === text) {
      continue;
    }

    if (!hunksByFile.has(error.file)) {
      hunksByFile.set(error.file, hunks(old, text));
    }

    const hunk = hunksByFile
      .get(error.file)
      .find(
        (candidate) =>
          candidate.newLines > 0 &&
          error.line >= candidate.newStart &&
          error.line < candidate.newStart + candidate.newLines
      );
    const hadIt = beforeErrors?.some(
      (other) =>
        other.file === error.file &&
        other.code === error.code &&
        other.message === error.message &&
        hunk &&
        other.line >= hunk.oldStart &&
        other.line < hunk.oldStart + hunk.oldLines
    );

    if (!hunk || hadIt) {
      continue;
    }

    const rules = entries
      .filter(
        (entry) =>
          entry.file === error.file &&
          (entry.metric === METRICS.manual || entry.metric === METRICS.review)
      )
      .map((entry) => entry.rule);

    found.push({
      ...error,
      kind: isAtLeftSite(error, hunk, old.split('\n'), rules)
        ? 'left and reported'
        : 'wrong',
    });
  }

  return found;
}

/**
 * Returns the `node_modules` folders of a checkout, relative to it, without
 * those inside another `node_modules`.
 */
function nodeModulesFolders(checkout, folder = '', depth = 0, found = []) {
  if (depth > 5) {
    return found;
  }

  for (const entry of readdirSync(join(checkout, folder), {
    withFileTypes: true,
  })) {
    const path = join(folder, entry.name);

    if (!entry.isDirectory() || entry.name === '.git') {
      continue;
    }

    if (entry.name === 'node_modules') {
      found.push(path);
    } else {
      nodeModulesFolders(checkout, path, depth + 1, found);
    }
  }

  return found;
}

/**
 * The `@cornerstonejs` packages of this repository, by package name and
 * folder, for the paths of a type check.
 */
const CORNERSTONE_PACKAGES = [
  ['core', 'core'],
  ['tools', 'tools'],
  ['metadata', 'metadata'],
  ['utils', 'utils'],
  ['dicom-image-loader', 'dicomImageLoader'],
  ['adapters', 'adapters'],
  ['ai', 'ai'],
  ['labelmap-interpolation', 'labelmap-interpolation'],
  ['polymorphic-segmentation', 'polymorphic-segmentation'],
  ['nifti-volume-loader', 'nifti-volume-loader'],
];

/**
 * Type checks a copy of an OHIF tree against the sources of this checkout:
 * the `node_modules` folders of the OHIF checkout are linked into the copy,
 * and a `tsconfig` that extends OHIF's maps each `@cornerstonejs` package to
 * its `src` here. Returns every error in a file of the tree.
 */
function typecheckOhif(tree, checkout, log) {
  for (const folder of nodeModulesFolders(checkout)) {
    if (!existsSync(join(tree, folder))) {
      mkdirSync(join(tree, folder, '..'), { recursive: true });
      symlinkSync(join(checkout, folder), join(tree, folder));
    }
  }

  const base = JSON.parse(readFileSync(join(tree, 'tsconfig.json'), 'utf8'));
  const paths = { ...(base.compilerOptions?.paths ?? {}) };

  for (const [name, folder] of CORNERSTONE_PACKAGES) {
    paths[`@cornerstonejs/${name}`] = [
      join(repoRoot, 'packages', folder, 'src'),
    ];
    paths[`@cornerstonejs/${name}/*`] = [
      join(repoRoot, 'packages', folder, 'src/*'),
    ];
  }

  writeFileSync(
    join(tree, 'tsconfig.cs3d.json'),
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          noEmit: true,
          emitDeclarationOnly: false,
          declaration: false,
          sourceMap: false,
          paths,
        },
      },
      null,
      2
    )
  );

  const result = spawnSync(
    join(repoRoot, 'node_modules/.bin/tsc'),
    ['-p', 'tsconfig.cs3d.json', '--pretty', 'false'],
    { cwd: tree, encoding: 'utf8', maxBuffer: 1 << 28 }
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const errors = [];

  writeFileSync(`${tree}.tsc.log`, output);

  for (const line of output.split('\n')) {
    const match = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);

    if (
      match &&
      !match[1].startsWith('/') &&
      !match[1].includes('node_modules')
    ) {
      errors.push({
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        code: match[4],
        message: match[5],
      });
    }
  }

  log(`  ${errors.length} type errors in ${tree}`);

  return errors;
}

/**
 * Returns the archive of a commit of a git checkout, unpacked into a
 * folder, with only the paths that the pathspecs name.
 */
function archive(checkout, ref, folder, pathspecs = []) {
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });

  const result = spawnSync(
    'bash',
    [
      '-c',
      'set -o pipefail; c=$1; r=$2; f=$3; shift 3; git -C "$c" archive --format=tar "$r" -- "$@" | tar -x -C "$f"',
      'archive',
      checkout,
      ref,
      folder,
      ...pathspecs,
    ],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(`git archive of ${ref} failed: ${result.stderr}`);
  }
}

/**
 * Returns the folder of a measure, which must lie outside this repository.
 */
function workFolder(value, name) {
  const work = resolve(value ?? join(tmpdir(), name));
  const fromRepo = relative(repoRoot, work);

  if (!fromRepo.startsWith('..')) {
    throw new Error(`The measure folder ${work} is inside the repository`);
  }

  return work;
}

/**
 * Sums the metric entries of one metric: sites and files.
 */
function reportCounts(entries, metric) {
  const list = entries.filter((entry) => entry.metric === metric);

  return {
    sites: list.reduce((sum, entry) => sum + entry.count, 0),
    files: new Set(list.map((entry) => entry.file)).size,
  };
}

/**
 * Writes the diff of a run and returns it.
 */
function writeDiff(work, before, after) {
  const diff = [...after]
    .filter(([path, text]) => before.get(path) !== text)
    .map(([path, text]) => unifiedDiff(path, before.get(path) ?? '', text))
    .join('');

  writeFileSync(join(work, 'diff.patch'), diff);

  return diff;
}

/**
 * Measures the codemod on the examples of a commit of this repository.
 */
function measureExamples(options) {
  const ref = options.ref ?? 'v5.19.4';
  const work = workFolder(
    options.work,
    `cs3d-codemod-measure-${ref.replace(/\W/g, '_')}`
  );
  const tree = join(work, 'after');
  const steps = selectSteps(options.steps, options.registry);

  console.log(`Examples of ${ref} into ${work}`);
  rmSync(work, { recursive: true, force: true });
  archive(repoRoot, ref, tree, [':(glob)packages/*/examples/**']);

  const files = sourceFiles(tree).filter((path) => MEASURED_FILE.test(path));

  console.log(`${files.length} example files; steps ${steps.join(', ')}`);

  const run = runSteps(options.registry, steps, tree, (line) =>
    console.log(`  ${line}`)
  );
  const entries = run.results.flatMap((result) =>
    result.metrics.map((entry) => ({ ...entry, step: result.step }))
  );
  const families = {};

  for (const path of files) {
    const input = countSites(codeText(run.before.get(path)));
    const output = countSites(codeText(run.after.get(path)));

    for (const family of Object.keys(SITE_PATTERNS)) {
      families[family] ??= { input: 0, left: 0 };
      families[family].input += input[family];
      families[family].left += output[family];
    }
  }

  const sites = Object.values(families).reduce(
    (sum, row) => sum + row.input,
    0
  );
  const left = Object.values(families).reduce((sum, row) => sum + row.left, 0);
  const syntaxBefore = syntaxErrors(run.before, files);
  const syntaxAfter = syntaxErrors(run.after, files);
  const newSyntax = [...syntaxAfter].filter(
    ([path]) => !syntaxBefore.has(path)
  );

  writeDiff(work, run.before, run.after);

  let typeErrors;
  let onChanged = [];

  if (!options['skip-typecheck']) {
    console.log('Type check of the output against this checkout');
    typeErrors = typecheckExamples(work, tree);
    onChanged = changedLineErrors(typeErrors, run.before, run.after, entries);
  }

  const wrong = onChanged.filter((error) => error.kind === 'wrong');
  const result = {
    input: `examples of ${ref}`,
    registry: options.registry,
    steps,
    files: files.length,
    filesChanged: [...run.after].filter(
      ([path, text]) => run.before.get(path) !== text
    ).length,
    sites,
    rewritten: sites - left,
    left,
    families,
    manual: reportCounts(entries, METRICS.manual),
    review: reportCounts(entries, METRICS.review),
    syntaxErrors: newSyntax.map(([path, message]) => ({ path, message })),
    typeErrors: typeErrors?.length,
    changedLineErrors: onChanged,
    wrong: wrong.length + newSyntax.length,
    summary: summarize(run.results),
    entries,
  };

  writeFileSync(join(work, 'measure.json'), JSON.stringify(result, null, 2));
  printExamples(result, work);

  return result;
}

/**
 * Prints the numbers of a measure of the examples.
 */
function printExamples(result, work) {
  const percent = result.sites
    ? ((100 * result.rewritten) / result.sites).toFixed(1)
    : '0';

  console.log(`\nMeasure of the ${result.input} (${result.files} files)`);
  console.log(`  files changed: ${result.filesChanged}`);
  console.log(
    `  5.x sites: ${result.sites}; rewritten ${result.rewritten} (${percent}%), left ${result.left}`
  );

  for (const [family, row] of Object.entries(result.families)) {
    console.log(`    ${family}: ${row.input}, left ${row.left}`);
  }

  console.log(
    `  manual: ${result.manual.sites} sites in ${result.manual.files} files`
  );
  console.log(
    `  review: ${result.review.sites} sites in ${result.review.files} files`
  );
  console.log(`  syntax errors made by the run: ${result.syntaxErrors.length}`);

  if (result.typeErrors !== undefined) {
    const left =
      result.changedLineErrors.length -
      result.changedLineErrors.filter((error) => error.kind === 'wrong').length;

    console.log(
      `  type errors: ${result.typeErrors}, on changed lines ${result.changedLineErrors.length} (${left} at a site left and reported)`
    );

    for (const error of result.changedLineErrors) {
      console.log(
        `    ${error.kind}: ${error.file}:${error.line} ${error.code} ${error.message}`
      );
    }
  }

  console.log(`  wrong: ${result.wrong}`);
  console.log(
    `\nFiles: ${work}/measure.json, diff.patch${result.typeErrors !== undefined ? ', tsc.log' : ''}`
  );
}

/**
 * Counts the rewrites of a unified diff by the kinds of `OHIF_KINDS`.
 */
function countKinds(diff) {
  const removed = [];
  const added = [];

  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    if (line.startsWith('-')) {
      removed.push(line);
    } else if (line.startsWith('+')) {
      added.push(line);
    }
  }

  const count = (list, pattern) =>
    list.reduce((sum, line) => sum + (line.match(pattern)?.length ?? 0), 0);
  const kinds = {};

  for (const [name, pattern] of OHIF_KINDS) {
    const sites = count(removed, pattern) - count(added, pattern);

    if (sites) {
      kinds[name] = sites;
    }
  }

  return kinds;
}

/**
 * Measures the codemod on a commit of an OHIF checkout, copied with
 * `git archive`; the checkout is only read.
 */
function measureOhif(options) {
  const checkout = resolve(options.ohif);
  const ref = options['ohif-ref'] ?? 'HEAD';
  const commit = execFileSync('git', ['-C', checkout, 'rev-parse', ref], {
    encoding: 'utf8',
  }).trim();
  const work = workFolder(
    options.work,
    `cs3d-codemod-measure-ohif-${commit.slice(0, 10)}`
  );
  const tree = join(work, 'after');
  const steps = selectSteps(options.steps, options.registry);

  console.log(`OHIF ${commit} into ${work}`);
  rmSync(work, { recursive: true, force: true });
  archive(checkout, commit, tree);

  const run = runSteps(options.registry, steps, tree, (line) =>
    console.log(`  ${line}`)
  );
  const entries = run.results.flatMap((result) =>
    result.metrics.map((entry) => ({ ...entry, step: result.step }))
  );
  const changed = [...run.after]
    .filter(([path, text]) => run.before.get(path) !== text)
    .map(([path]) => path);
  const diff = writeDiff(work, run.before, run.after);
  const kinds = countKinds(diff);
  const syntaxBefore = syntaxErrors(run.before, changed);
  const newSyntax = [...syntaxErrors(run.after, changed)].filter(
    ([path]) => !syntaxBefore.has(path)
  );
  let onChanged;
  let typeErrors;

  if (!options['skip-typecheck']) {
    const log = (line) => console.log(line);

    console.log(
      'Type check of the input and of the output against this checkout'
    );
    archive(checkout, commit, join(work, 'before'));

    const beforeErrors = typecheckOhif(join(work, 'before'), checkout, log);

    typeErrors = typecheckOhif(tree, checkout, log);
    onChanged = changedLineErrors(
      typeErrors,
      run.before,
      run.after,
      entries,
      beforeErrors
    );
  }

  const wrongTypes = (onChanged ?? []).filter(
    (error) => error.kind === 'wrong'
  );
  const result = {
    input: `OHIF ${commit}`,
    registry: options.registry,
    steps,
    filesChanged: changed.length,
    rewritten: Object.values(kinds).reduce((sum, count) => sum + count, 0),
    kinds,
    manual: reportCounts(entries, METRICS.manual),
    review: reportCounts(entries, METRICS.review),
    syntaxErrors: newSyntax.map(([path, message]) => ({ path, message })),
    typeErrors: typeErrors?.length,
    changedLineErrors: onChanged,
    wrong: newSyntax.length + wrongTypes.length,
    summary: summarize(run.results),
    entries,
  };

  writeFileSync(join(work, 'measure.json'), JSON.stringify(result, null, 2));
  console.log(`\nMeasure of ${result.input}`);
  console.log(`  files changed: ${result.filesChanged}`);
  console.log(`  rewritten (by kind, from the diff): ${result.rewritten}`);

  for (const [name, count] of Object.entries(kinds)) {
    console.log(`    ${name}: ${count}`);
  }

  console.log(
    `  manual: ${result.manual.sites} sites in ${result.manual.files} files`
  );
  console.log(
    `  review: ${result.review.sites} sites in ${result.review.files} files`
  );
  console.log(`  syntax errors made by the run: ${newSyntax.length}`);

  if (onChanged) {
    const left = onChanged.length - wrongTypes.length;

    console.log(
      `  type errors: ${typeErrors.length}, new on changed lines ${onChanged.length} (${left} at a site left and reported)`
    );

    for (const error of onChanged) {
      console.log(
        `    ${error.kind}: ${error.file}:${error.line} ${error.code} ${error.message}`
      );
    }
  }

  console.log(`  wrong: ${result.wrong}`);
  console.log(
    `\nFiles: ${work}/measure.json, diff.patch${onChanged ? ', before.tsc.log, after.tsc.log' : ''}`
  );

  return result;
}

const HELP = `Usage:
  node scripts/measure-registry.mjs [--ref <commit>] [options]
  node scripts/measure-registry.mjs --ohif <checkout> [--ohif-ref <commit>] [options]

Measures the local Cornerstone3D 6.0 registry packages, all steps in the
order of registry/cornerstone3d/6/workflow.yaml, on real code copied with
git archive into a folder outside the repository.

The examples (the default): the example files of a commit of this
repository (--ref, default v5.19.4). Prints the 5.x sites, the rewritten
and left ones by family, the manual and review reports, the syntax errors
that the run made, the type errors of the output against this checkout on
the lines that the run changed, and the wrong sites.

OHIF (--ohif): a commit of an OHIF checkout (--ohif-ref, default HEAD), only
read. Prints the files changed, the rewritten sites by kind, the reports and
the syntax errors that the run made.

Options:
  --steps <names>    the steps, separated by commas, or all (the default)
  --registry <dir>   the registry folder of the steps (default: this
                     package's registry/cornerstone3d/6)
  --work <dir>       the measure folder (default: a folder in the temporary
                     folder of the system, named after the input)
  --skip-typecheck   no type check (the examples)
  --help             print this text`;

const { values: options } = parseArgs({
  options: {
    ref: { type: 'string' },
    ohif: { type: 'string' },
    'ohif-ref': { type: 'string' },
    steps: { type: 'string' },
    registry: { type: 'string' },
    work: { type: 'string' },
    'skip-typecheck': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (options.help) {
  console.log(HELP);
  process.exit(0);
}

options.registry = resolve(options.registry ?? defaultRegistry);

const result = options.ohif ? measureOhif(options) : measureExamples(options);

if (result.wrong) {
  process.exitCode = 1;
}
