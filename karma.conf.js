// @ts-check
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * Downloads the arm64 build of a Chromium revision into a folder. The build is
 * unpacked into a folder of its own that is renamed when complete, so a karma
 * run that starts meanwhile never finds half a browser. A failure leaves
 * nothing behind.
 *
 * @param {string} revision - the Chromium revision of puppeteer
 * @param {string} folder - the folder of the build
 */
function downloadAppleSiliconChromium(revision, folder) {
  const host =
    process.env.PUPPETEER_DOWNLOAD_HOST || 'https://storage.googleapis.com';
  const url = `${host}/chromium-browser-snapshots/Mac_Arm/${revision}/chrome-mac.zip`;
  const partial = `${folder}.partial-${process.pid}`;
  const archive = `${partial}.zip`;

  console.log(
    `[karma.conf.js] downloading the arm64 build of Chromium ${revision} from ${url}`
  );

  try {
    execFileSync(
      '/usr/bin/curl',
      [
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        '--output',
        archive,
        url,
      ],
      { stdio: 'inherit' }
    );
    execFileSync('/usr/bin/ditto', ['-x', '-k', archive, partial]);
    if (!fs.existsSync(folder)) {
      fs.renameSync(partial, folder);
    }
  } catch (error) {
    console.warn(
      `[karma.conf.js] the arm64 build of Chromium ${revision} could not be downloaded, so karma runs the Intel build under Rosetta 2: ${error.message}`
    );
  } finally {
    fs.rmSync(archive, { force: true });
    fs.rmSync(partial, { recursive: true, force: true });
  }
}

/**
 * The arm64 build of the Chromium that puppeteer runs, on a Mac with Apple
 * silicon; undefined anywhere else.
 *
 * puppeteer 13.7 downloads the Intel build of its Chromium on every Mac
 * (`mac-<revision>`), so on Apple silicon karma ran it under Rosetta 2. There
 * its renderer died with SIGBUS (BUS_ADRERR) in 3 of 15 decoder runs, at a
 * different codec each time, and karma lost the browser (open issue 91); the
 * arm64 build of the same revision lost it in none of 15. The arm64 build
 * comes from the snapshot host that puppeteer downloads from, into
 * `mac_arm-<revision>` beside the Intel build, on the first run that needs
 * it. If the download fails, karma runs the Intel build as before.
 *
 * @param {string} puppeteerChrome - the path that puppeteer gives
 * @returns {string | undefined} the path of the arm64 build
 */
function appleSiliconChromium(puppeteerChrome) {
  if (os.platform() !== 'darwin' || os.arch() !== 'arm64') {
    return undefined;
  }

  const intelBuild =
    /^(.*)[\\/]mac-(\d+)[\\/]chrome-mac[\\/]Chromium\.app[\\/]Contents[\\/]MacOS[\\/]Chromium$/.exec(
      puppeteerChrome || ''
    );

  if (!intelBuild) {
    return undefined;
  }

  const [, downloads, revision] = intelBuild;
  const folder = path.join(downloads, `mac_arm-${revision}`);
  const executable = path.join(
    folder,
    'chrome-mac',
    'Chromium.app',
    'Contents',
    'MacOS',
    'Chromium'
  );

  if (!fs.existsSync(executable)) {
    downloadAppleSiliconChromium(revision, folder);
  }

  return fs.existsSync(executable) ? executable : undefined;
}

/**
 * Resolve the Chrome/Chromium binary that karma-chrome-launcher should use.
 *
 * Historically this unconditionally set CHROME_BIN to puppeteer's bundled
 * Chromium path. Under pnpm, puppeteer's optional download (an install script)
 * may not have run, in which case `executablePath()` still returns a path that
 * does not exist on disk - karma then fails with "Cannot start ChromeHeadless /
 * Can not find the binary ...". To stay robust:
 *   1. Honor a CHROME_BIN already provided by the environment (e.g. a system
 *      Chrome installed by CI).
 *   2. On a Mac with Apple silicon, use the arm64 build of puppeteer's
 *      Chromium revision (`appleSiliconChromium`).
 *   3. Otherwise fall back to puppeteer's Chromium, but only if it actually
 *      exists on disk.
 *   4. Otherwise leave CHROME_BIN unset so karma-chrome-launcher can auto-detect
 *      an installed Chrome.
 */
if (!process.env.CHROME_BIN) {
  try {
    const puppeteerChrome = require('puppeteer').executablePath();
    const nativeChrome = appleSiliconChromium(puppeteerChrome);
    if (nativeChrome) {
      process.env.CHROME_BIN = nativeChrome;
    } else if (puppeteerChrome && fs.existsSync(puppeteerChrome)) {
      process.env.CHROME_BIN = puppeteerChrome;
    }
  } catch (err) {
    // puppeteer not installed / no bundled Chromium - rely on a system Chrome.
  }
}

/**
 *
 * Tests for the dicomImageLoaders require support for Web Workers and loading
 * wasm files required for image decoding.
 *
 * In order to support this, the karma config requires some customisation. This
 * is based on
 * https://github.com/codymikol/karma-webpack/issues/498#issuecomment-790040818
 *
 * The changes are:
 * - Define a custom output path for webpack to emit files to
 * - Serve the output path via a `files` entry in the karma config
 *
 * Without this, webpack correctly bundles and outputs the worker and wasm
 * files, but they can't be loaded by the tests.  Trying to load the worker or
 * wasm files returns a 404.
 *
 * Manually create an output path.  This is the same as the default
 * karma-webpack config
 * https://github.com/codymikol/karma-webpack?tab=readme-ov-file#default-webpack-configuration
 */
const outputPath =
  path.join(os.tmpdir(), '_karma_webpack_') +
  Math.floor(Math.random() * 1000000);
const forceCpuRendering = process.env.FORCE_CPU_RENDERING === 'true';
const grepPattern = process.env.KARMA_GREP;

/** @param {import('karma').Config} config */
module.exports = function (config) {
  config.set({
    reporters: ['junit', 'coverage', 'spec'],
    client: {
      forceCpuRendering,
      args: grepPattern ? ['--grep', grepPattern] : [],
      jasmine: {
        random: false, // don't randomize the order of tests
        stopOnFailure: false,
        failFast: false,
      },
      // Set to true to capture WARN level logging
      // See browserConsoleLogOptions for setting other log levels
      captureConsole: true,
      clearContext: false,
    },
    concurrency: 1,
    browserConsoleLogOptions: {
      terminal: true,
      level: 'log',
    },
    specReporter: {
      maxLogLines: 5, // limit number of lines logged per test
      suppressSummary: true, // do not print summary
      suppressErrorSummary: true, // do not print error summary
      suppressFailed: false, // do not print information about failed tests
      suppressPassed: false, // do not print information about passed tests
      suppressSkipped: true, // do not print information about skipped tests
      showSpecTiming: false, // print the time elapsed for each spec
      failFast: false, // test would finish with error when a first fail occurs
      prefixes: {
        success: '  PASS: ', // override prefix for passed tests, default is '✓ '
        failure: 'FAILED: ', // override prefix for failed tests, default is '✗ '
        skipped: 'SKIPPED: ', // override prefix for skipped tests, default is '- '
      },
    },
    junitReporter: {
      outputDir: 'junit',
      outputFile: 'test-results.xml',
    },
    plugins: [
      'karma-webpack',
      'karma-jasmine',
      'karma-chrome-launcher',
      // Reports / Output
      'karma-junit-reporter',
      'karma-coverage',
      'karma-spec-reporter',
    ],
    frameworks: ['jasmine', 'webpack'],
    files: [
      ...(process.env.KARMA_PACKAGE === 'core'
        ? []
        : ['packages/tools/test/**/*_test.js']),
      ...(process.env.KARMA_PACKAGE === 'tools'
        ? []
        : ['packages/core/test/**/*_test.js']),
      // packages/dicomImageLoader/test/decoders_test.ts has its own karma run,
      // karma.decoders.conf.js, with the long timeouts its wasm codecs need.
      // In this run the browser was sometimes lost in that block.
      // `pnpm test:ci` and scripts/run-karma.sh run it after this suite.
      // Serve dicomImageLoad test images
      {
        pattern: 'packages/dicomImageLoader/testImages/**/*',
        watched: false,
        included: false,
        served: true,
      },
      // CPU-mode baselines for dynamic comparison
      {
        pattern: 'karma-baselines/**/*.png',
        watched: false,
        included: false,
        served: true,
      },
      /**
       * Required to allow karma to load wasm and worker files built via webpack.
       * See the comment at the top of this file for more details.
       */
      {
        pattern: `${outputPath}/**/*`,
        included: false,
        served: true,
        watched: false,
      },
    ],
    proxies: {
      '/testImages/': '/base/packages/dicomImageLoader/testImages/',
      '/karma-baselines/': '/base/karma-baselines/',
    },
    preprocessors: {
      'packages/core/test/**/*_test.js': ['webpack'],
      'packages/tools/test/**/*_test.js': ['webpack'],
      'packages/dicomImageLoader/test/decoders_test.ts': ['webpack'],
    },
    coverageReporter: {
      type: 'html',
      dir: 'coverage/',
    },
    /**
     * How long the browser may stay silent before karma drops it: the
     * default of karma, 30 s. At 6 s a loaded machine lost the browser in the
     * middle of a test that was still working, with "Disconnected, because no
     * message in 6000 ms" (open issue 46). A test that hangs still fails by
     * the timeout of jasmine, which reports to karma.
     */
    browserNoActivityTimeout: 30000,
    /** How long karma waits for a lost browser to come back (default 2 s). */
    browserDisconnectTimeout: 6000,

    /*webpackMiddleware: {
      noInfo: true
    },*/
    webpack: {
      devtool: 'eval-source-map',
      mode: 'development',
      output: {
        /**
         * Override default karma-webpack output path with the one we defined
         * above this allows webpack generated files including wasm and workers
         * to be served by karma without this, the default config won't allow
         * tests to load web workers or wasm files.
         */
        path: outputPath,
      },
      module: {
        rules: [
          {
            test: /\.(js|jsx|ts|tsx)$/,
            exclude: /node_modules/,
            use: {
              loader: 'babel-loader',
              options: {
                plugins: [['babel-plugin-istanbul', {}]],
              },
            },
          },
          {
            test: /\.wasm/,
            type: 'asset/inline',
          },
          {
            test: /\.png$/i,
            use: [
              {
                loader: 'url-loader',
              },
            ],
          },
          {
            test: /\.wasm/,
            type: 'asset/resource',
          },
          // NOTE: For better debugging you can comment out the
          // istanbul-instrumenter-loader below
          // {
          //   test: /\.ts$/,
          //   exclude: [path.resolve(__dirname, 'test')],
          //   enforce: 'post',
          //   use: {
          //     loader: 'istanbul-instrumenter-loader',
          //     options: { esModules: true },
          //   },
          // },
        ],
      },
      experiments: {
        asyncWebAssembly: true,
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        fallback: {
          fs: false,
          path: require.resolve('path-browserify'),
          // vtk.js 36 pulls in xmlbuilder2@4 -> @oozcitak/url, which requires
          // node's built-in 'url' module. It isn't needed for the XML parsing
          // exercised by the tests, so stub it out for the browser bundle.
          url: false,
        },
        alias: {
          '@cornerstonejs/core': path.resolve('packages/core/src/index'),
          '@cornerstonejs/tools': path.resolve('packages/tools/src/index'),
          '@cornerstonejs/dicom-image-loader': path.resolve(
            'packages/dicomImageLoader/src/index'
          ),
          '@cornerstonejs/metadata': path.resolve(
            'packages/metadata/src/index'
          ),
          '@cornerstonejs/utils': path.resolve('packages/utils/src/index'),
        },
      },
    },
    webpackMiddleware: {
      noInfo: false,
    },
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: [
          '--disable-translate',
          '--disable-extensions',
          '--no-sandbox',
          '--ignore-gpu-blacklist',
          '--remote-debugging-port=9229',
          // vtk.js needs a WebGL context. Headless Chrome only provides one via
          // a software (SwiftShader) GL backend. Older bundled Chromium enabled
          // this by default, but Chrome 110+ requires it to be explicitly opted
          // into - without these flags vtk.js' get3DContext() returns null and
          // tests fail with "no webgl context". Unknown flags are ignored by
          // older Chrome, so this is safe across versions.
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
        ],
      },
    },
    browsers: ['ChromeHeadlessNoSandbox'],
    // browsers: ['Chrome'],
    // singleRun: true,
    // colors: true,
    // autoWatch: true,
  });
};
