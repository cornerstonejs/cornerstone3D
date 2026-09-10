/* eslint-disable */
// @ts-check

/**
 * Karma configuration for the transfer syntax decode tests only.
 *
 * `karma.conf.js` runs every browser test in the repository, and a full run
 * takes several minutes. This configuration runs
 * `packages/dicomImageLoader/test/decoders_test.ts` alone, so that a person who
 * works on a codec gets an answer in about one minute:
 *
 *   pnpm test:decoders
 *
 * The configuration also lets you replace the JPEG Lossless decoder with a
 * different build of that decoder. `packages/dicomImageLoader` depends on
 * `jpeg-lossless-decoder-js` directly, so a fix in that decoder reaches
 * cornerstone3D through a version bump only. To test a fix before its release,
 * point this configuration at the build that holds the fix:
 *
 *   pnpm test:decoders --jpeg-lossless-build ../codecs/packages/dicom-codec/src/vendor/jpeg-lossless-decoder-js/lossless.cjs
 *
 * The environment variable `JPEG_LOSSLESS_BUILD` does the same thing. Use the
 * environment variable in a shell script, and use the option on the command
 * line. The option wins if you give both. The path can be relative to the root
 * of the repository, or absolute. The build must be a CommonJS module or an ES
 * module that exports `Decoder`.
 *
 * Give no override, and the tests use the `jpeg-lossless-decoder-js` version
 * that `pnpm install` resolved. That is what CI tests.
 */

const path = require('path');
const base = require('./karma.conf.js');

/**
 * Reads the path of the decoder build from `--jpeg-lossless-build <path>` or
 * from the environment variable `JPEG_LOSSLESS_BUILD`.
 *
 * @returns { string | undefined } the path, or undefined for no override
 */
function readJpegLosslessBuild() {
  const flag = '--jpeg-lossless-build';
  const index = process.argv.indexOf(flag);

  if (index !== -1) {
    const value = process.argv[index + 1];

    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} needs the path of a decoder build.`);
    }

    return value;
  }

  const inlineArgument = process.argv.find((argument) =>
    argument.startsWith(`${flag}=`)
  );

  if (inlineArgument) {
    return inlineArgument.slice(flag.length + 1);
  }

  return process.env.JPEG_LOSSLESS_BUILD || undefined;
}

/**
 * @param { import("karma").Config } config - karma config
 */
module.exports = function (config) {
  base(config);

  const jpegLosslessBuild = readJpegLosslessBuild();

  if (jpegLosslessBuild) {
    console.log(
      `[karma.decoders.conf.js] jpeg-lossless-decoder-js resolves to ${path.resolve(
        jpegLosslessBuild
      )}`
    );
  }

  config.set({
    files: [
      'packages/dicomImageLoader/test/decoders_test.ts',
      /**
       * `karma.conf.js` computes the served asset patterns, and one of those
       * patterns holds a random webpack output directory. Keep the patterns
       * that the base configuration computed. Every entry that is an object is
       * a served asset pattern, and every entry that is a string is a spec
       * glob that this configuration replaces.
       */
      ...config.files.filter((file) => typeof file === 'object'),
    ],
    /**
     * The suite decodes through five wasm codecs and a web worker, so the first
     * spec waits for a long compile. The default timeouts of karma stop the
     * browser before that compile ends.
     */
    browserNoActivityTimeout: 300000,
    browserDisconnectTimeout: 60000,
    captureTimeout: 120000,
    browsers: ['ChromeHeadlessNoSandbox'],
    singleRun: true,
    reporters: ['spec'],
    plugins: [
      'karma-webpack',
      'karma-jasmine',
      'karma-chrome-launcher',
      'karma-spec-reporter',
    ],
    webpack: {
      ...config.webpack,
      resolve: {
        ...config.webpack.resolve,
        alias: {
          ...config.webpack.resolve.alias,
          ...(jpegLosslessBuild
            ? {
                'jpeg-lossless-decoder-js': path.resolve(jpegLosslessBuild),
              }
            : {}),
        },
      },
    },
  });
};
