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

  const junit = junitPath
    ? await readJUnit(junitPath)
    : { tests: [], totals: { total: 0, passed: 0, failed: 0, skipped: 0 } };
  const diffArtifacts = readDiffArtifacts(logPath, artifactsDir);
  const { tests: testsWithArtifacts, unmatchedArtifacts } = attachArtifacts(
    junit.tests,
    diffArtifacts
  );
  const reportHtml = buildHtmlReport({
    artifacts: diffArtifacts,
    junitPath,
    logPath,
    reportName,
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

// ---------------------------------------------------------------------------
// Data loading (unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// HTML report generation
// ---------------------------------------------------------------------------

function buildHtmlReport({
  tests,
  totals,
  junitPath: _junitPath,
  logPath: _logPath,
  reportName: rName = '',
  unmatchedArtifacts = [],
}) {
  const items = [];

  for (const test of tests) {
    if (test.artifacts.length > 0) {
      // One entry per image artifact
      for (const artifact of test.artifacts) {
        items.push({
          type: 'image',
          testName: test.name,
          suiteName: test.suiteName,
          testStatus: test.status,
          failureMessage: '',
          outputName: artifact.outputName,
          expected: artifact.expectedPath,
          actual: artifact.actualPath,
          diff: artifact.diffPath,
          mismatch: artifact.mismatch,
          mismatchExact: artifact.mismatchExact,
          status: artifact.status,
        });
      }
      // If the test also has a non-image failure, add a separate entry for it
      if (test.status === 'failed' && test.failureMessage) {
        const isOnlyImageFailure = test.artifacts.some(
          (a) =>
            a.status === 'failed' &&
            test.failureMessage.includes(a.outputName)
        );
        if (!isOnlyImageFailure) {
          items.push({
            type: 'error',
            testName: test.name,
            suiteName: test.suiteName,
            testStatus: test.status,
            failureMessage: test.failureMessage,
            outputName: '',
            expected: '',
            actual: '',
            diff: '',
            mismatch: 0,
            mismatchExact: '0',
            status: 'failed',
          });
        }
      }
    } else {
      // No image artifacts - show as text-only entry
      items.push({
        type: test.status === 'failed' ? 'error' : 'test',
        testName: test.name,
        suiteName: test.suiteName,
        testStatus: test.status,
        failureMessage: test.failureMessage || '',
        outputName: '',
        expected: '',
        actual: '',
        diff: '',
        mismatch: 0,
        mismatchExact: '0',
        status: test.status,
      });
    }
  }

  for (const artifact of unmatchedArtifacts) {
    items.push({
      type: 'image',
      testName: artifact.testName || artifact.outputName,
      suiteName: 'Unmatched Artifacts',
      testStatus: artifact.status === 'failed' ? 'failed' : 'passed',
      failureMessage: '',
      outputName: artifact.outputName,
      expected: artifact.expectedPath,
      actual: artifact.actualPath,
      diff: artifact.diffPath,
      mismatch: artifact.mismatch,
      mismatchExact: artifact.mismatchExact,
      status: artifact.status,
    });
  }

  // Sort: failed first, then by suite/test name
  items.sort((a, b) => {
    if (a.status === 'failed' && b.status !== 'failed') return -1;
    if (a.status !== 'failed' && b.status === 'failed') return 1;
    return (
      a.suiteName.localeCompare(b.suiteName) ||
      a.testName.localeCompare(b.testName)
    );
  });

  const itemsJson = JSON.stringify(items);
  const totalsJson = JSON.stringify(totals || {});
  const karmaModeJson = JSON.stringify({
    compat: rName.includes('compat'),
    cpu: rName.includes('-cpu'),
  });

  // Write data as a separate JS file so the report can be reloaded
  // without re-running the generator when editing style.css or client.js
  fs.writeFileSync(
    path.join(reportsDir, 'data.js'),
    'var ITEMS = ' + itemsJson + ';\n' +
    'var TOTALS = ' + totalsJson + ';\n' +
    'var KARMA_MODE = ' + karmaModeJson + ';\n',
    'utf8'
  );

  // Compute relative path from report dir to the template assets
  const templateDir = path.join(__dirname, 'karma-report');
  const relTemplatePath = path.relative(reportsDir, templateDir).split(path.sep).join('/');

  // Read body HTML template
  const bodyHtml = fs.readFileSync(path.join(templateDir, 'body.html'), 'utf8');

  return (
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>Karma Image Report</title>\n' +
    '<link rel="stylesheet" href="' + relTemplatePath + '/style.css">\n' +
    '</head>\n' +
    '<body>\n' +
    bodyHtml + '\n' +
    '<script src="data.js"></script>\n' +
    '<script src="' + relTemplatePath + '/client.js"></script>\n' +
    '</body>\n' +
    '</html>'
  );
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

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
      .filter(
        (candidate) =>
          candidate.name && artifactTestName.endsWith(candidate.name)
      );

    if (suffixMatches.length === 1) {
      return suffixMatches[0].index;
    }
  }

  const outputNameHint = normalizeText('for ' + artifact.outputName);
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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
