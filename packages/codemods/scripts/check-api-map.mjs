#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const apiMap = join(
  repoRoot,
  'packages/docs/docs/migration-guides/6x/3-api-map.md'
);
const registry = join(packageRoot, 'registry/cornerstone3d/6');

/**
 * The names of rows of the API map that no step rewrites or reports, by the
 * code of their Legacy cell, each with the reason. A name of a row that is
 * neither in a step nor here fails the check.
 */
const UNREACHABLE = {
  'getZoom()':
    'a deprecated member of every 6.0 viewport (the "legacy shim" of PlanarViewport and its kin): the call still works',
  'setZoom()':
    'a deprecated member of every 6.0 viewport: the call still works',
  'getPan()': 'a deprecated member of every 6.0 viewport: the call still works',
  'setPan()': 'a deprecated member of every 6.0 viewport: the call still works',
  'customRenderViewportToCanvas()':
    'still a method of the 6.0 video, whole slide and ECG viewports, which the rendering engine calls: the call still works',
  threshold:
    'a key of the colormap given to setProperties: setProperties is rewritten key by key or reported as a whole ("setProperties: not one object literal")',
  isComputedVOI:
    'a key of setProperties: every key that the step does not rewrite is reported ("setProperties: the key isComputedVOI")',
  pan: 'a key of setProperties of the whole slide viewport: reported as "setProperties: the key pan"',
  scrollSpeed:
    'a key of setProperties of the video viewport: reported as "setProperties: the key scrollSpeed"',
  actorUID:
    'a key of a volume input: a setVolumes input with a key that the step does not rewrite is reported ("setVolumes: more arguments", "the input has ...")',
  visibility: 'a key of a volume input: reported with its setVolumes call',
  callback:
    'a key of a volume input: reported as "setVolumes: the input has callback"',
  blendMode: 'a key of a volume input: reported with its setVolumes call',
  immediate:
    'the last argument of setVolumes, setCamera and their kin: a call with it is reported ("more arguments", "the arguments")',
  resetToCenter:
    'an option of resetCamera: reported as "resetCamera: options without a twin"',
  resetAspectRatio:
    'an option of resetCamera: reported as "resetCamera: options without a twin"',
  fit: 'an option of resetCamera: reported as "resetCamera: options without a twin"',
  debounceLoading:
    'an option of setStack: a setStack with options is reported ("setStack: the arguments")',
  groupId: 'an option of setDataIds, which is reported as a whole',
  viewSelector: 'an option of setDataIds, which is reported as a whole',
  viewReference: 'an option of setDataIds, which is reported as a whole',
  miniNavigationOverlay:
    'an option of the whole slide setDataIds, which is reported as a whole',
  webClient:
    'an option of the whole slide setDataIds, which is reported as a whole',
  ECGGenericViewportInput:
    'private: the beta names were not exported from the package root (the row says so)',
  VideoGenericViewportInput: 'private: the beta names were not exported',
  WSIGenericViewportInput: 'private: the beta names were not exported',
  ViewportDataReference:
    'the type keeps its name; its key dataId is the rule (display-sets reports and rewrites dataId)',
  'viewport.getResolvedView().toICamera()':
    'context of the row of presentationScale, which is the rule',
  CAMERA_MODIFIED:
    'a behaviour change: a slab change fires DISPLAY_SET_APPEARANCE_CHANGED; the event itself stays',
  'MetadataModules.DISPLAY_SET':
    'a behaviour change of the display set store: the module stays, the registry is the one place',
  'utilities.setCacheData':
    'a behaviour change of the display set store: the function stays',
  DISPLAY_SET:
    'a behaviour change of the display set store: the last add under an id wins',
  'MetadataModuleType.displaySetModule':
    'a behaviour change of the type that metaData.getTyped gives: the name stays',
  IDisplaySet: 'context of a behaviour change: the type stays',
  'instance.imageId':
    'context of a behaviour change: where a video or an ECG viewport finds its image id',
  underlyingImageIds:
    'context of a behaviour change: where a video or an ECG viewport finds its image id',
  'cornerstoneStreamingImageVolume:<displaySetId>':
    'a behaviour change: the default volume id is utilities.getDefaultVolumeId(imageIds)',
  'utilities.segmentation.getOrCreateImageVolume':
    'a behaviour change of the default volume id: the function stays',
  PlanarSetDataOptions:
    'not exported at 6.0.0-beta.2: no application could name it; PlanarMountOptions is an addition',
  Volume3DSetDataOptions:
    'not exported at 6.0.0-beta.2: no application could name it; Volume3DMountOptions is an addition',
  canRenderOrientation:
    'a behaviour change: a mounted viewport no longer reads the registration again',
  Volume3DRequestedRenderMode:
    'the type of the renderMode mount option, which render-modes deletes or reports; the type was not exported at 6.0.0-beta.2',
  'viewport.getCurrentMode()':
    "a changed answer, not a name: a 3D viewport that shows a surface says 'geometry3d'",
  "'unknown'": "a changed answer, not a name: 'geometry3d' in its place",
  'tools/displayTools/Labelmap':
    'the folder of the modules of the rows below it, which have their rules',
};

/** Names of a code cell that say where, not what: receivers, namespaces, arguments. */
const NOT_NAMES = new Set([
  'viewport',
  'utilities',
  'Enums',
  'Types',
  'Events',
  'EventTypes',
  'cornerstone',
  'csTools',
  'tools',
  'core',
  'this',
  'renderingEngine',
  'displaySetId',
  'imageId',
  'id',
  'index',
  'props',
  'value',
  'element',
  'viewportId',
  'true',
  'false',
  'undefined',
  'null',
  'new',
  'await',
  'evt',
  'event',
]);

/**
 * Returns the source of every step of the 6.0 workflow, without `lib.ts`
 * (the shared helpers name no rule) and without the fixtures.
 */
function stepSources() {
  const found = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry);

      if (statSync(path).isDirectory()) {
        if (entry !== 'tests') {
          walk(path);
        }
      } else if (
        entry.endsWith('.ts') &&
        entry !== 'lib.ts' &&
        entry !== 'self-test.ts'
      ) {
        found.push(readFileSync(path, 'utf8'));
      }
    }
  };

  walk(registry);

  return found.join('\n');
}

/**
 * Tells whether the steps name a name as a rule does: in quotes, in a
 * regular expression of names, as the key of a table, or at the end of a
 * module path.
 */
function isNamed(source, name) {
  const word = name.replace(/[$]/g, '\\$');

  return new RegExp(
    `['"\`|(/]${word}['"\`|)]|(^|[\\s{,])${word}\\s*:|['"\`]${word}[.(:\\s]|[.]${word}['"\`]`,
    'm'
  ).test(source);
}

/**
 * Returns the code of the Legacy cell of each row of the API map whose name
 * goes in 6.0 (`Replaced` or `Removed`), and is public: a row whose Access
 * says Private needs no step.
 */
function removedNames(text) {
  const lines = text.split('\n');
  const names = [];
  let columns;
  let section = '';

  lines.forEach((line, index) => {
    if (line.startsWith('## ')) {
      section = line.slice(3);
    }

    if (!line.startsWith('|')) {
      columns = undefined;

      return;
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (/^\|\s*:?-{3,}/.test(lines[index + 1] ?? '')) {
      columns = {
        name: cells.findIndex((cell) => /^(Legacy|Event)/.test(cell)),
        status: cells.indexOf('6.0'),
        access: cells.indexOf('Access'),
      };

      return;
    }

    if (
      !columns ||
      columns.name < 0 ||
      columns.status < 0 ||
      /^:?-{3,}/.test(cells[0] ?? '') ||
      !/^(Replaced|Removed)$/.test(cells[columns.status]) ||
      (columns.access >= 0 && /^Private/.test(cells[columns.access]))
    ) {
      return;
    }

    for (const match of cells[columns.name].matchAll(/`([^`]+)`/g)) {
      names.push({ code: match[1], line: index + 1, section });
    }
  });

  return names;
}

const { values: options } = parseArgs({
  options: { help: { type: 'boolean', default: false } },
});

if (options.help) {
  console.log(`Usage: node scripts/check-api-map.mjs

Reads the names that 6.0 removes or replaces from the tables of
packages/docs/docs/migration-guides/6x/3-api-map.md (the code of the Legacy
cell of each Replaced or Removed row that is not Private) and checks that a
step of registry/cornerstone3d/6 names each of them as a rule does. A name
that no step can reach is listed in UNREACHABLE of this script, with the
reason. Fails when a name is in neither place.`);
  process.exit(0);
}

const source = stepSources();
const names = removedNames(readFileSync(apiMap, 'utf8'));
const missing = [];
const listed = new Set();
let reached = 0;

for (const { code, line, section } of names) {
  const words = [...code.matchAll(/[A-Za-z_$][\w$]*/g)]
    .map((match) => match[0])
    .filter(
      (word) => (word.length > 2 || word === code) && !NOT_NAMES.has(word)
    );

  if (words.some((word) => isNamed(source, word))) {
    reached += 1;
  } else if (UNREACHABLE[code]) {
    listed.add(code);
  } else {
    missing.push(`  3-api-map.md:${line} (${section}): \`${code}\``);
  }
}

const stale = Object.keys(UNREACHABLE).filter((code) => !listed.has(code));

console.log(
  `API map: ${names.length} names of removed or replaced rows; ${reached} named by a step, ${listed.size} listed as unreachable with a reason, ${missing.length} in neither place`
);

if (stale.length) {
  console.log(
    `Listed as unreachable but reached by a step now, or gone from the map (delete from UNREACHABLE): ${stale.join(', ')}`
  );
}

if (missing.length) {
  console.error(
    `Names with no rule and no reason: add a rewrite or a report to a step, or the name and its reason to UNREACHABLE of scripts/check-api-map.mjs:\n${missing.join('\n')}`
  );
  process.exit(1);
}
