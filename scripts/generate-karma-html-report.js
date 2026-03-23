#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

const rootDir = path.resolve(__dirname, '..');
const logPath = process.argv[2] || path.join(rootDir, 'reports', 'karma.log');
const junitPath =
  process.argv[3] || findLatestJunitXml(path.join(rootDir, 'junit'));
const reportName = process.argv[4] || 'karma-html-report';
const reportsDir = path.join(rootDir, 'reports', reportName);
const artifactsDir = path.join(reportsDir, 'artifacts');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });

  const junit = junitPath ? await readJUnit(junitPath) : { tests: [] };
  const diffArtifacts = readDiffArtifacts(logPath, artifactsDir);
  const { tests: testsWithArtifacts, unmatchedArtifacts } = attachArtifacts(
    junit.tests,
    diffArtifacts
  );
  const reportHtml = buildHtmlReport({
    artifacts: diffArtifacts,
    junitPath,
    logPath,
    tests: testsWithArtifacts,
    totals: junit.totals,
    unmatchedArtifacts,
  });

  fs.writeFileSync(path.join(reportsDir, 'index.html'), reportHtml, 'utf8');
  fs.writeFileSync(
    path.join(reportsDir, 'report.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        junitPath,
        logPath,
        totals: junit.totals,
        tests: testsWithArtifacts,
        unmatchedArtifacts,
      },
      null,
      2
    ),
    'utf8'
  );
}

function findLatestJunitXml(junitRoot) {
  if (!fs.existsSync(junitRoot)) {
    return undefined;
  }

  const files = walkFiles(junitRoot).filter((filePath) =>
    filePath.endsWith('test-results.xml')
  );

  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return files[0];
}

function walkFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const output = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      output.push(...walkFiles(fullPath));
      continue;
    }

    output.push(fullPath);
  }

  return output;
}

async function readJUnit(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const parsed = await parseStringPromise(xml);
  const suiteNodes = [];

  collectTestSuites(parsed, suiteNodes);

  const tests = suiteNodes.flatMap((suiteNode) => {
    const suiteName = suiteNode.$?.name || 'Unnamed Suite';

    return (suiteNode.testcase || []).map((testcase) => {
      const failure = testcase.failure?.[0];
      const skipped = testcase.skipped?.[0];
      const status = failure ? 'failed' : skipped ? 'skipped' : 'passed';

      return {
        classname: testcase.$?.classname || '',
        duration: testcase.$?.time || '',
        failureMessage:
          (typeof failure === 'string' ? failure : failure?._) || '',
        name: testcase.$?.name || 'Unnamed Test',
        status,
        suiteName,
      };
    });
  });

  return {
    tests,
    totals: {
      failed: tests.filter((test) => test.status === 'failed').length,
      passed: tests.filter((test) => test.status === 'passed').length,
      skipped: tests.filter((test) => test.status === 'skipped').length,
      total: tests.length,
    },
  };
}

function collectTestSuites(node, target) {
  if (!node || typeof node !== 'object') {
    return;
  }

  const suiteNodes = Array.isArray(node.testsuite)
    ? node.testsuite
    : node.testsuite
      ? [node.testsuite]
      : [];

  if (suiteNodes.length) {
    for (const suiteNode of suiteNodes) {
      if (suiteNode.testcase) {
        target.push(suiteNode);
      }
      collectTestSuites(suiteNode, target);
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectTestSuites(item, target));
    } else if (value && typeof value === 'object') {
      collectTestSuites(value, target);
    }
  }
}

function readDiffArtifacts(inputLogPath, outputArtifactsDir) {
  if (!inputLogPath || !fs.existsSync(inputLogPath)) {
    return [];
  }

  const logText = fs.readFileSync(inputLogPath, 'utf8');
  const artifactRegex = /\[KARMA_IMAGE_ARTIFACT\](\{.*\})/;
  const legacyDiffRegex = /\[KARMA_IMAGE_DIFF\](\{.*\})/;
  const lines = logText.split(/\r?\n/);
  const regex = logText.includes('[KARMA_IMAGE_ARTIFACT]')
    ? artifactRegex
    : legacyDiffRegex;
  const artifactsByKey = new Map();

  for (const line of lines) {
    const match = line.match(regex);

    if (!match) {
      continue;
    }

    try {
      const payload = JSON.parse(match[1]);
      const slug = slugify(payload.outputName);
      const artifactBaseDir = path.join(outputArtifactsDir, slug);

      fs.mkdirSync(artifactBaseDir, { recursive: true });
      writeDataUrl(
        path.join(artifactBaseDir, 'expected.png'),
        payload.expected
      );
      writeDataUrl(path.join(artifactBaseDir, 'actual.png'), payload.actual);
      writeDataUrl(path.join(artifactBaseDir, 'diff.png'), payload.diff);

      const artifact = {
        actualPath: relativeToReport(path.join(artifactBaseDir, 'actual.png')),
        diffPath: relativeToReport(path.join(artifactBaseDir, 'diff.png')),
        expectedPath: relativeToReport(
          path.join(artifactBaseDir, 'expected.png')
        ),
        mismatch: payload.mismatch,
        mismatchExact: payload.mismatchExact ?? String(payload.mismatch),
        outputName: payload.outputName,
        status: payload.status || 'failed',
        testName: payload.testName,
      };

      artifactsByKey.set(getArtifactKey(artifact), artifact);
    } catch (error) {
      console.warn('Failed to parse Karma image diff artifact:', error);
    }
  }

  return Array.from(artifactsByKey.values());
}

function relativeToReport(filePath) {
  return path.relative(reportsDir, filePath).split(path.sep).join('/');
}

function writeDataUrl(filePath, dataUrl) {
  const base64 = String(dataUrl).replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
}

function attachArtifacts(tests, artifacts) {
  const testsWithArtifacts = tests.map((test) => ({
    ...test,
    artifacts: [],
  }));
  const unmatchedArtifacts = [];

  for (const artifact of artifacts) {
    const matchIndex = findMatchingTestIndex(testsWithArtifacts, artifact);

    if (matchIndex === -1) {
      unmatchedArtifacts.push(artifact);
      continue;
    }

    testsWithArtifacts[matchIndex].artifacts.push(artifact);
  }

  return {
    tests: testsWithArtifacts,
    unmatchedArtifacts,
  };
}

function buildHtmlReport({
  tests,
  totals,
  junitPath,
  logPath,
  unmatchedArtifacts = [],
}) {
  const unmatchedArtifactGroups = groupArtifactsByTest(unmatchedArtifacts);
  const orderedTests = [...tests].sort((left, right) => {
    return statusSortWeight(left.status) - statusSortWeight(right.status);
  });
  const testsWithArtifactsCount =
    orderedTests.filter((test) => test.artifacts.length).length +
    unmatchedArtifactGroups.length;

  const rows = orderedTests.length
    ? orderedTests
        .map((test) => {
          return `
            <details class="testcase ${test.status}" data-status="${escapeHtml(
              test.status
            )}" data-has-artifacts="${test.artifacts.length ? 'true' : 'false'}" ${test.status === 'failed' ? 'open' : ''}>
              <summary>
                <span class="status">${escapeHtml(test.status.toUpperCase())}</span>
                <span class="name">${escapeHtml(test.name)}</span>
                <span class="suite">${escapeHtml(test.suiteName)}</span>
              </summary>
              <div class="details">
                <div class="meta">
                  <div><strong>Suite:</strong> ${escapeHtml(test.suiteName)}</div>
                  <div><strong>Class:</strong> ${escapeHtml(test.classname || '-')}</div>
                  <div><strong>Duration:</strong> ${escapeHtml(test.duration || '-')}</div>
                </div>
                ${
                  test.failureMessage
                    ? `<pre class="failure">${escapeHtml(test.failureMessage)}</pre>`
                    : ''
                }
                ${renderArtifacts(test.artifacts)}
              </div>
            </details>
          `;
        })
        .join('\n')
    : `
        <section class="empty-state">
          <strong>No testcases were parsed from the JUnit XML.</strong>
          <div class="empty-state-meta">
            Check the JUnit and log paths above if this report looks wrong.
          </div>
        </section>
      `;

  const unmatchedArtifactsHtml = buildUnmatchedArtifactsSection(
    unmatchedArtifactGroups
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Karma Report</title>
    <style>
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 24px;
        background: #111827;
        color: #e5e7eb;
      }
      a { color: #93c5fd; }
      .summary {
        margin-bottom: 24px;
        padding: 16px 20px;
        background: #1f2937;
        border: 1px solid #374151;
        border-radius: 12px;
      }
      .counts {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-top: 8px;
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }
      .filter-button {
        appearance: none;
        background: #111827;
        border: 1px solid #374151;
        border-radius: 999px;
        color: #e5e7eb;
        cursor: pointer;
        font: inherit;
        padding: 8px 12px;
      }
      .filter-button.active {
        background: #e5e7eb;
        border-color: #e5e7eb;
        color: #111827;
      }
      .count {
        padding: 8px 12px;
        border-radius: 999px;
        background: #111827;
        border: 1px solid #374151;
      }
      .results-meta {
        color: #9ca3af;
        margin-top: 12px;
      }
      .empty-state {
        margin-bottom: 12px;
        padding: 16px 20px;
        background: #1f2937;
        border: 1px dashed #4b5563;
        border-radius: 12px;
      }
      .empty-state-meta {
        margin-top: 8px;
        color: #9ca3af;
      }
      .testcase {
        margin-bottom: 12px;
        border: 1px solid #374151;
        border-radius: 12px;
        background: #1f2937;
        overflow: hidden;
      }
      .testcase summary {
        cursor: pointer;
        list-style: none;
        display: grid;
        grid-template-columns: 110px 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 14px 16px;
      }
      .testcase summary::-webkit-details-marker { display: none; }
      .status {
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .testcase.passed .status { color: #86efac; }
      .testcase.failed .status { color: #fca5a5; }
      .testcase.skipped .status { color: #fde68a; }
      .suite {
        color: #9ca3af;
        font-size: 13px;
      }
      .details {
        padding: 0 16px 16px;
      }
      .meta {
        display: grid;
        gap: 6px;
        margin-bottom: 12px;
        color: #d1d5db;
      }
      .failure {
        overflow: auto;
        white-space: pre-wrap;
        background: #111827;
        border: 1px solid #374151;
        border-radius: 8px;
        padding: 12px;
        color: #f3f4f6;
      }
      .artifact {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #374151;
      }
      .artifact-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .image-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .image-grid-four-up {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .image-card {
        background: #111827;
        border: 1px solid #374151;
        border-radius: 10px;
        overflow: hidden;
        min-width: 0;
      }
      .image-card-header {
        padding: 10px 12px;
        border-bottom: 1px solid #374151;
        font-weight: 600;
      }
      .image-card a {
        display: block;
        padding: 12px;
      }
      .image-card img {
        display: block;
        width: 100%;
        height: auto;
        background: #000;
      }
      .compare-card {
        background: #111827;
        border: 1px solid #374151;
        border-radius: 10px;
        overflow: hidden;
        min-width: 0;
      }
      .compare-card-header {
        align-items: center;
        border-bottom: 1px solid #374151;
        display: flex;
        font-weight: 600;
        justify-content: space-between;
        padding: 10px 12px;
      }
      .compare-stage {
        aspect-ratio: 1 / 1;
        background: #000;
        overflow: hidden;
        position: relative;
      }
      .compare-stage img {
        display: block;
        height: 100%;
        left: 0;
        object-fit: contain;
        pointer-events: none;
        position: absolute;
        top: 0;
        user-select: none;
        width: 100%;
      }
      .compare-overlay {
        border-right: 2px solid rgba(255, 255, 255, 0.95);
        bottom: 0;
        clip-path: inset(0 calc(100% - var(--compare-position, 50%)) 0 0);
        left: 0;
        position: absolute;
        right: 0;
        top: 0;
      }
      .compare-handle {
        background: rgba(255, 255, 255, 0.95);
        border: 0;
        border-radius: 999px;
        box-shadow: 0 0 0 2px rgba(17, 24, 39, 0.65);
        height: 18px;
        left: var(--compare-position, 50%);
        pointer-events: none;
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 18px;
      }
      .compare-range {
        appearance: none;
        background: transparent;
        bottom: 10px;
        cursor: ew-resize;
        left: 12px;
        position: absolute;
        right: 12px;
      }
      .compare-range::-webkit-slider-runnable-track {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 999px;
        height: 4px;
      }
      .compare-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        background: #fff;
        border-radius: 999px;
        height: 14px;
        margin-top: -5px;
        width: 14px;
      }
      .compare-range::-moz-range-track {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 999px;
        height: 4px;
      }
      .compare-range::-moz-range-thumb {
        background: #fff;
        border: 0;
        border-radius: 999px;
        height: 14px;
        width: 14px;
      }
      .compare-labels {
        color: #9ca3af;
        display: flex;
        font-size: 12px;
        justify-content: space-between;
        padding: 10px 12px 12px;
      }
      .no-artifacts {
        margin-top: 16px;
        color: #9ca3af;
      }
      @media (max-width: 1200px) {
        .image-grid-four-up {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 720px) {
        .image-grid-four-up {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <section class="summary">
      <h1>Karma HTML Report</h1>
      <div>JUnit: ${escapeHtml(junitPath || 'not found')}</div>
      <div>Log: ${escapeHtml(logPath || 'not found')}</div>
      <div class="counts">
        <div class="count">Total: ${totals.total}</div>
        <div class="count">Passed: ${totals.passed}</div>
        <div class="count">Failed: ${totals.failed}</div>
        <div class="count">Skipped: ${totals.skipped}</div>
      </div>
      <div class="filters">
        <button class="filter-button status-filter active" data-filter="all" type="button">All (${totals.total})</button>
        <button class="filter-button status-filter" data-filter="failed" type="button">Failed (${totals.failed})</button>
        <button class="filter-button status-filter" data-filter="passed" type="button">Passed (${totals.passed})</button>
        <button class="filter-button status-filter" data-filter="skipped" type="button">Skipped (${totals.skipped})</button>
        <button class="filter-button artifact-filter" id="artifact-filter" type="button" aria-pressed="false">With Images (${testsWithArtifactsCount})</button>
      </div>
      <div class="results-meta" id="results-meta">Showing ${totals.total} of ${totals.total} tests</div>
    </section>
    ${rows}
    ${unmatchedArtifactsHtml}
    <script>
      (() => {
        const statusButtons = Array.from(document.querySelectorAll('.status-filter'));
        const artifactButton = document.getElementById('artifact-filter');
        const testcases = Array.from(document.querySelectorAll('.testcase'));
        const resultsMeta = document.getElementById('results-meta');
        let currentStatusFilter = 'all';
        let artifactsOnly = false;

        function applyFilters() {
          let visibleCount = 0;

          testcases.forEach((testcase) => {
            const matchesStatus =
              currentStatusFilter === 'all' ||
              testcase.dataset.status === currentStatusFilter;
            const matchesArtifacts =
              !artifactsOnly || testcase.dataset.hasArtifacts === 'true';
            const matches = matchesStatus && matchesArtifacts;

            testcase.hidden = !matches;

            if (matches) {
              visibleCount += 1;
            }
          });

          statusButtons.forEach((button) => {
            button.classList.toggle(
              'active',
              button.dataset.filter === currentStatusFilter
            );
          });
          artifactButton?.classList.toggle('active', artifactsOnly);
          artifactButton?.setAttribute(
            'aria-pressed',
            artifactsOnly ? 'true' : 'false'
          );

          resultsMeta.textContent = 'Showing ' + visibleCount + ' of ' + testcases.length + ' tests';
        }

        statusButtons.forEach((button) => {
          button.addEventListener('click', () => {
            currentStatusFilter = button.dataset.filter;
            applyFilters();
          });
        });

        artifactButton?.addEventListener('click', () => {
          artifactsOnly = !artifactsOnly;
          applyFilters();
        });

        applyFilters();

        document.querySelectorAll('.compare-card').forEach((card) => {
          const overlay = card.querySelector('.compare-overlay');
          const range = card.querySelector('.compare-range');

          function sync() {
            const value = range.value + '%';
            card.style.setProperty('--compare-position', value);
          }

          range.addEventListener('input', sync);
          sync();
        });
      })();
    </script>
  </body>
</html>`;
}

function statusSortWeight(status) {
  switch (status) {
    case 'failed':
      return 0;
    case 'skipped':
      return 1;
    case 'passed':
      return 2;
    default:
      return 3;
  }
}

function imageCard(label, imagePath) {
  const openLabel = `Open ${String(label).toLowerCase()}`;

  return `
    <div class="image-card">
      <div class="image-card-header">
        <span>${escapeHtml(label)}</span>
        <a href="${escapeHtml(imagePath)}" target="_blank" rel="noreferrer">${escapeHtml(
          openLabel
        )}</a>
      </div>
      <a href="${escapeHtml(imagePath)}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(imagePath)}" alt="${escapeHtml(label)}" />
      </a>
    </div>
  `;
}

function overlayCompareCard(expectedPath, actualPath, artifactName) {
  return `
    <div class="compare-card">
      <div class="compare-card-header">
        <span>Compare</span>
        <span>
          <a href="${escapeHtml(expectedPath)}" target="_blank" rel="noreferrer">Open expected</a>
          <span> / </span>
          <a href="${escapeHtml(actualPath)}" target="_blank" rel="noreferrer">Open actual</a>
        </span>
      </div>
      <div class="compare-stage">
        <img src="${escapeHtml(expectedPath)}" alt="${escapeHtml(
          'Expected image for ' + artifactName
        )}" />
        <div class="compare-overlay">
          <img src="${escapeHtml(actualPath)}" alt="${escapeHtml(
            'Actual image for ' + artifactName
          )}" />
        </div>
        <div class="compare-handle" aria-hidden="true"></div>
        <input class="compare-range" type="range" min="0" max="100" value="50" aria-label="${escapeHtml(
          'Compare expected and actual for ' + artifactName
        )}" />
      </div>
      <div class="compare-labels">
        <span>Expected</span>
        <span>Actual</span>
      </div>
    </div>
  `;
}

function renderArtifacts(artifacts) {
  if (!artifacts.length) {
    return '<div class="no-artifacts">No image artifacts for this test.</div>';
  }

  return artifacts.map(renderArtifact).join('');
}

function renderArtifact(artifact) {
  return `
    <div class="artifact">
      <div class="artifact-header">
        <strong>${escapeHtml(artifact.outputName)}</strong>
        <span>${escapeHtml(getMismatchLabel(artifact))}% mismatch</span>
      </div>
      <div class="image-grid image-grid-four-up">
        ${imageCard('Expected', artifact.expectedPath)}
        ${imageCard('Actual', artifact.actualPath)}
        ${overlayCompareCard(
          artifact.expectedPath,
          artifact.actualPath,
          artifact.outputName
        )}
        ${imageCard('Diff Mask', artifact.diffPath)}
      </div>
    </div>
  `;
}

function buildUnmatchedArtifactsSection(unmatchedArtifactGroups) {
  if (!unmatchedArtifactGroups.length) {
    return '';
  }

  const rows = unmatchedArtifactGroups
    .map(
      (group) => `
        <details class="testcase ${group.status}" data-status="${escapeHtml(
          group.status
        )}" data-has-artifacts="true" open>
          <summary>
            <span class="status">${escapeHtml(group.status.toUpperCase())}</span>
            <span class="name">${escapeHtml(group.name)}</span>
            <span class="suite">Image Artifacts</span>
          </summary>
          <div class="details">
            <div class="meta">
              <div><strong>Suite:</strong> Image artifacts captured from Karma output but not matched to a parsed JUnit testcase.</div>
              <div><strong>Class:</strong> -</div>
              <div><strong>Duration:</strong> -</div>
            </div>
            ${renderArtifacts(group.artifacts)}
          </div>
        </details>
      `
    )
    .join('\n');

  return `
    <section class="summary">
      <h2>Unmatched Image Artifacts</h2>
      <div>${unmatchedArtifactGroups.length} image artifact group(s) could not be attached to a parsed JUnit testcase, so they are listed here.</div>
    </section>
    ${rows}
  `;
}

function groupArtifactsByTest(artifacts) {
  const groups = new Map();

  for (const artifact of artifacts) {
    const groupName = artifact.testName || artifact.outputName;
    const existing = groups.get(groupName);

    if (existing) {
      existing.artifacts.push(artifact);
      if (artifact.status === 'failed') {
        existing.status = 'failed';
      }
      continue;
    }

    groups.set(groupName, {
      name: groupName,
      status: artifact.status === 'failed' ? 'failed' : 'passed',
      artifacts: [artifact],
    });
  }

  return Array.from(groups.values()).sort((left, right) => {
    const statusDifference =
      statusSortWeight(left.status) - statusSortWeight(right.status);

    if (statusDifference !== 0) {
      return statusDifference;
    }

    return left.name.localeCompare(right.name);
  });
}

function findMatchingTestIndex(tests, artifact) {
  const artifactTestName = normalizeText(artifact.testName);

  if (artifactTestName) {
    const exactMatchIndex = tests.findIndex(
      (test) => normalizeText(test.name) === artifactTestName
    );

    if (exactMatchIndex !== -1) {
      return exactMatchIndex;
    }

    const suffixMatches = tests
      .map((test, index) => ({
        index,
        name: normalizeText(test.name),
      }))
      .filter((candidate) => candidate.name && artifactTestName.endsWith(candidate.name));

    if (suffixMatches.length === 1) {
      return suffixMatches[0].index;
    }
  }

  const outputNameHint = normalizeText(`for ${artifact.outputName}`);
  const failureMatches = tests
    .map((test, index) => ({
      failureMessage: normalizeText(test.failureMessage),
      index,
    }))
    .filter((candidate) => candidate.failureMessage.includes(outputNameHint));

  if (failureMatches.length === 1) {
    return failureMatches[0].index;
  }

  return failureMatches[0]?.index ?? -1;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getArtifactKey(artifact) {
  return [
    normalizeText(artifact.testName),
    normalizeText(artifact.outputName),
  ].join('::');
}

function getMismatchLabel(artifact) {
  return String(artifact.mismatchExact ?? artifact.mismatch ?? '');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
