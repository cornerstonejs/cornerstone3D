import { utilities } from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

type DrawSelfTestResult = Awaited<ReturnType<typeof utilities.runDrawSelfTest>>;

/** One line of the page and of the report: a label, a value and a verdict. */
type ReportLine = {
  label: string;
  value: string;
  passed?: boolean;
};

/** A titled group of lines. */
type ReportSection = {
  title: string;
  lines: ReportLine[];
};

setTitleAndDescription(
  'Draw self-test',
  'Checks that this device draws 16-bit and float images with the right grey levels on the GPU. It runs once on load. Use "Copy report" to send the results.'
);

const content = document.getElementById('content');
const controls = document.createElement('div');
const runButton = document.createElement('button');
const copyButton = document.createElement('button');
const statusLine = document.createElement('p');
const results = document.createElement('div');
const readout = document.createElement('pre');

let lastSections: ReportSection[] = [];

/** Styles the page for a phone: large buttons, wrapped text, no fixed widths. */
function buildPage(): void {
  controls.style.display = 'flex';
  controls.style.flexWrap = 'wrap';
  controls.style.gap = '8px';
  controls.style.margin = '8px 0';

  [runButton, copyButton].forEach((button) => {
    button.style.fontSize = '16px';
    button.style.padding = '10px 16px';
  });

  runButton.id = 'run-tests';
  runButton.innerText = 'Run tests';
  runButton.onclick = () => void runTests();
  copyButton.id = 'copy-report';
  copyButton.innerText = 'Copy report';
  copyButton.onclick = () => void copyReport();
  statusLine.id = 'status';
  statusLine.style.fontSize = '16px';
  results.id = 'results';
  results.style.fontSize = '15px';
  results.style.lineHeight = '1.4';
  results.style.maxWidth = '100%';
  readout.id = 'report';
  readout.style.whiteSpace = 'pre-wrap';
  readout.style.wordBreak = 'break-word';
  readout.style.fontSize = '12px';

  controls.append(runButton, copyButton);
  content.append(controls, statusLine, results, readout);
}

/** Formats a number for the report. */
function formatNumber(value: number, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'none';
  }

  if (!Number.isFinite(value)) {
    return 'not measured';
  }

  return String(Math.round(value * 10 ** digits) / 10 ** digits);
}

/** The words of a verdict, so that the page does not rely on colour alone. */
function verdictText(passed?: boolean): string {
  if (passed === undefined) {
    return '';
  }

  return passed ? 'PASS' : 'FAIL';
}

/** Builds the sections of the page from a self-test result. */
function buildSections(result: DrawSelfTestResult): ReportSection[] {
  const { capabilities, probe } = result;
  const device: ReportSection = {
    title: 'Device',
    lines: [
      {
        label: 'Device pixel ratio',
        value: String(window.devicePixelRatio || 1),
      },
      { label: 'Renderer', value: capabilities.renderer || 'not exposed' },
      {
        label: 'Software rasterizer',
        value: capabilities.softwareRasterizer ? 'yes' : 'no',
      },
      { label: 'WebGL2', value: capabilities.webgl ? 'yes' : 'no' },
      {
        label: 'Largest 2D texture',
        value: String(result.maxTextureSize || capabilities.maxTextureSize),
      },
      { label: 'Largest 3D texture', value: String(result.max3DTextureSize) },
    ],
  };
  const flags: Array<keyof typeof capabilities> = [
    'norm16',
    'norm16Linear',
    'float',
    'floatLinear',
    'halfFloat',
    'halfFloatLinear',
  ];
  const profile: ReportSection = {
    title: 'Capability profile (stored, used by the viewports)',
    lines: [
      ...flags.map((flag) => ({
        label: flag,
        value: capabilities[flag] ? 'works' : 'does not work',
        passed: Boolean(capabilities[flag]),
      })),
      {
        label: 'norm16 hidden from the viewports',
        value: result.norm16Hidden ? 'yes' : 'no',
      },
      {
        label: 'drawImage copies a WebGL canvas',
        value: capabilities.webglCanvasCopy
          ? 'yes'
          : 'no, the viewports are copied to the screen with readPixels, which is slower',
      },
    ],
  };
  const probeSection: ReportSection = {
    title: `Texture probe (fresh run, ${formatNumber(result.probeDurationMs, 1)} ms)`,
    lines: probe
      ? probe.probes.map((entry) => ({
          label: `${entry.internalFormat} ${entry.filter}`,
          value: entry.available
            ? `largest error ${formatNumber(entry.maxError, 4)}, ${entry.failedSamples} of ${entry.sampleCount} values wrong` +
              (entry.firstFailure
                ? `, first: expected ${formatNumber(entry.firstFailure.expected, 4)} got ${formatNumber(entry.firstFailure.actual, 4)}`
                : '')
            : 'extension missing',
          passed: entry.passed,
        }))
      : [{ label: 'Probe', value: 'could not run', passed: false }],
  };
  const drawSection: ReportSection = {
    title: `Draw self-test (largest allowed error ${result.maxGreyError} grey level)`,
    lines: [
      ...result.cases.flatMap((testCase) => [
        {
          label: testCase.dataType,
          value:
            (testCase.note ? `${testCase.note}. ` : '') +
            `texture ${testCase.textureFormat} ${testCase.filter}` +
            (testCase.formatUsable ? '' : ' (profile says it does not work)') +
            `, largest error ${formatNumber(testCase.maxError)} grey levels, ` +
            `${testCase.pixelsOff} of ${testCase.pixelsChecked} pixels off` +
            (testCase.error ? `, error: ${testCase.error}` : ''),
          passed: testCase.passed,
        },
        ...testCase.draws.map((draw) => ({
          label: `  ${testCase.dataType} ${draw.name}`,
          value: `texture ${draw.textureFormat} ${draw.filter}, largest error ${formatNumber(draw.maxError)}, ${draw.pixelsOff} pixels off`,
          passed: draw.pixelsOff === 0,
        })),
      ]),
      {
        label: 'Copy to the screen',
        value: result.screenCopy
          ? `with ${result.screenCopy.method}, largest error ${formatNumber(result.screenCopy.maxError)} grey levels, ` +
            `${result.screenCopy.pixelsOff} of ${result.screenCopy.pixelsChecked} pixels off`
          : 'could not be checked',
        passed: result.screenCopy?.passed,
      },
      {
        label: 'All',
        value:
          `${formatNumber(result.durationMs, 1)} ms` +
          (result.error ? `, error: ${result.error}` : ''),
        passed: result.passed,
      },
    ],
  };

  return [device, profile, probeSection, drawSection];
}

/** Shows the sections as lines with a coloured verdict in words. */
function showSections(sections: ReportSection[]): void {
  results.replaceChildren();

  sections.forEach((section) => {
    const title = document.createElement('h3');

    title.innerText = section.title;
    title.style.margin = '16px 0 4px';
    results.appendChild(title);

    section.lines.forEach((line) => {
      const row = document.createElement('div');
      const verdict = document.createElement('strong');

      row.style.overflowWrap = 'anywhere';
      verdict.innerText = verdictText(line.passed);

      if (line.passed !== undefined) {
        verdict.style.color = line.passed ? '#0a7d28' : '#c01818';
        verdict.style.marginRight = '6px';
        row.dataset.passed = String(line.passed);
      }

      row.append(
        verdict,
        document.createTextNode(`${line.label}: ${line.value}`)
      );
      results.appendChild(row);
    });
  });
}

/** Builds the report as plain text. */
function buildReadout(): string {
  return lastSections
    .map((section) =>
      [
        `## ${section.title}`,
        ...section.lines.map((line) =>
          [verdictText(line.passed), `${line.label}: ${line.value}`]
            .filter(Boolean)
            .join(' ')
        ),
      ].join('\n')
    )
    .join('\n\n');
}

/** Runs the probe and the draw self-test and shows the results. */
async function runTests(): Promise<void> {
  runButton.disabled = true;
  statusLine.innerText = 'Running...';
  document.body.dataset.drawSelfTest = 'running';

  await new Promise((resolve) => setTimeout(resolve, 0));

  const result = await utilities.runDrawSelfTest();

  (
    window as unknown as { drawSelfTestResult: DrawSelfTestResult }
  ).drawSelfTestResult = result;
  lastSections = buildSections(result);
  showSections(lastSections);
  readout.innerText = buildReadout();
  statusLine.innerText = result.passed
    ? 'PASS: this device draws the test images correctly.'
    : 'FAIL: some results are wrong. Copy the report and send it.';
  statusLine.style.color = result.passed ? '#0a7d28' : '#c01818';
  document.body.dataset.drawSelfTest = 'done';
  runButton.disabled = false;
}

/** Selects the readout text so it can be copied by hand. */
function selectReadout(): void {
  const range = document.createRange();
  const selection = window.getSelection();

  range.selectNodeContents(readout);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Puts the report on the clipboard. The clipboard API needs a secure page,
 * which a phone on plain http is not, so the fallback selects the text and
 * tries the older copy command.
 */
async function copyReport(): Promise<void> {
  const text = buildReadout();

  readout.innerText = text;

  try {
    await navigator.clipboard.writeText(text);
    statusLine.innerText = 'Report copied. Paste it in your message.';

    return;
  } catch {
    selectReadout();
  }

  let copied = false;

  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  statusLine.innerText = copied
    ? 'Report copied. Paste it in your message.'
    : 'The browser does not allow copying here. The report is selected: copy it by hand.';
}

/** Starts the page and runs the tests once. */
async function run(): Promise<void> {
  buildPage();
  await initDemo();
  await runTests();
}

run();
