import { imageLoader, metaData } from '@cornerstonejs/core';
import dataSetCacheManager from '../src/imageLoader/wadouri/dataSetCacheManager';
import init from '../src/init';

/**
 * Every entry here is a lossless re-encoding of testImages/CTImage.dcm, so each
 * one has to decode to pixels identical to the uncompressed original. That
 * makes this a ground truth test rather than a smoke test: a decoder that
 * produces a plausible but wrong image fails.
 *
 * CTImage.dcm is signed (PixelRepresentation 1), which is worth knowing because
 * it is the case that catches a decoder taking signedness from its codec rather
 * than from the data set - JPEG XL and JPEG-LS both always report unsigned.
 *
 * `pnpm test:decoders` runs this suite alone, in about one minute rather than
 * the several minutes of a full `pnpm test`. That script also takes
 * `--jpeg-lossless-build <path>`, which replaces jpeg-lossless-decoder-js with
 * a different build of that decoder, so you can test a decoder fix before its
 * release. See karma.decoders.conf.js.
 */
const transferSyntaxes = {
  '1.2.840.10008.1.2': 'LittleEndianImplicitTransferSyntax',
  '1.2.840.10008.1.2.1': 'LittleEndianExplicitTransferSyntax',

  '1.2.840.10008.1.2.2': 'BigEndianExplicitTransferSyntax',

  '1.2.840.10008.1.2.4.57': 'JPEGProcess14TransferSyntax',
  '1.2.840.10008.1.2.4.70': 'JPEGProcess14SV1TransferSyntax',
  '1.2.840.10008.1.2.4.80': 'JPEGLSLosslessTransferSyntax',

  '1.2.840.10008.1.2.4.90': 'JPEG2000LosslessOnlyTransferSyntax',
  '1.2.840.10008.1.2.4.201': 'HTJ2KLosslessTransferSyntax',
  '1.2.840.10008.1.2.5': 'RLELosslessTransferSyntax',

  '1.2.840.10008.1.2.1.98':
    'EncapsulatedUncompressedExplicitVRLittleEndianTransferSyntax',
  '1.2.840.10008.1.2.8.1': 'DeflatedImageFrameCompressionTransferSyntax',
  '1.2.840.10008.1.2.4.110': 'JPEGXLLosslessTransferSyntax',
};

/**
 * Syntaxes with a fixture but a pre-existing failure, reported as pending so
 * they stay visible rather than being quietly dropped from the list. It is not
 * related to the syntaxes added alongside this suite being enabled.
 *
 * 1.2.840.10008.1.2.4.70 used to sit here: exactly one sample was wrong, the
 * last, decoding as 0 instead of -2000, because jpeg-lossless-decoder-js
 * 2.1.2 read the 0xFF introducing EOI as entropy coded data whenever the final
 * Huffman code ended on a byte boundary - which is what DCMTK writes for a
 * frame ending in a run of one value. Fixed upstream in
 * cornerstonejs/JPEGLosslessDecoderJS; the case is in the active list above.
 */
const pendingTransferSyntaxes = {
  '1.2.840.10008.1.2.1.99': [
    'DeflatedExplicitVRLittleEndianTransferSyntax',
    // The whole data set is deflated, and dataSetCacheManager inflates it via
    // parseDicomWithInflater - but the naturalized path hands the raw
    // ArrayBuffer to addDicomPart10Instance, which cannot parse it, so nothing
    // reaches NATURALIZED. Passes through the legacy metadata provider.
    'addDicomPart10Instance does not inflate a deflated data set',
  ],
};

/**
 * The colour set. Not every syntax is duplicated in colour - the point is to
 * cover each decoder whose colour handling differs from its grayscale
 * handling, which is a smaller set than the list of syntaxes.
 *
 * Encapsulated uncompressed is deliberately absent: its fragment is the same
 * native little endian pixel data Explicit VR LE already carries, so a colour
 * case would re-test the base image rather than a decoder, at 1.2MB.
 *
 * ColorImage.dcm is kodim23 from the Kodak True Color suite - 768x512
 * interleaved RGB, PlanarConfiguration 0 - so unlike the CT it is unsigned and
 * multi-sample. The .57, .80 and .201 fixtures are that same image as encoded
 * by viewer-testdata's colorEncode corpus, which verifies all twelve of its
 * encodings decode to one reference; the rest are produced by
 * testImages/make-fixtures.py.
 */
const colorTransferSyntaxes = {
  // Deflated frames: three samples per pixel changes the frame length
  // arithmetic the inflate path checks against.
  '1.2.840.10008.1.2.8.1': 'DeflatedImageFrameCompressionTransferSyntax',
  // The three codecs whose colour handling is a separate path from grayscale,
  // one per decoder rather than one per syntax:
  //   .57  decodeJPEGLossless, a JavaScript decoder
  //   .80  decodeJPEGLS, charls, which has interleave modes
  //   .201 decodeHTJ2K, OpenJPH, stored as YBR_RCT so the codec has to undo
  //        the reversible colour transform to give back RGB
  //   .110 decodeJPEGXL, libjxl, three channels rather than one
  '1.2.840.10008.1.2.4.57': 'JPEGProcess14TransferSyntax',
  '1.2.840.10008.1.2.4.80': 'JPEGLSLosslessTransferSyntax',
  '1.2.840.10008.1.2.4.201': 'HTJ2KLosslessTransferSyntax',
  '1.2.840.10008.1.2.4.110': 'JPEGXLLosslessTransferSyntax',
};

/**
 * Lossy syntaxes, which by definition cannot be compared bit-for-bit against
 * the uncompressed original, so each one carries the largest per sample
 * difference it is allowed to produce.
 *
 * .50 is the one syntax libjpeg-turbo decodes here, so it is the only case that
 * covers that codec at all - every entry in the lossless list above goes to a
 * different decoder.
 *
 * It runs against GrayImage.dcm rather than either of the other two bases, and
 * both of those would be the wrong image for it:
 *
 *   CTImage.dcm is 16 bit, while JPEG Baseline is an 8 bit process, so the
 *   fixture would be an 8 bit frame compared against 16 bit CT values - not
 *   the same value space, which is why the older
 *   test/lossyImagesDecoding_test.ts needed a tolerance of 100 and recorded a
 *   TODO against it.
 *
 *   ColorImage.dcm would not reach this codec at all. decodeImageFrame.ts
 *   sends 8 bit .50 with three or four samples per pixel to the browser's own
 *   JPEG decoder, so a colour fixture tests the browser rather than
 *   libjpeg-turbo.
 *
 * Against a matched 8 bit grayscale base the bound is a real one. The encode is
 * quality 90, whose worst sample lands 14 off; 20 leaves room for two libjpeg
 * derived decoders to differ slightly through their IDCT without making the
 * bound meaningless.
 */
const lossyTransferSyntaxes = {
  '1.2.840.10008.1.2.4.50': {
    name: 'JPEGProcess1TransferSyntax',
    tolerance: 20,
  },
};

const base = 'CTImage.dcm';
const colorBase = 'ColorImage.dcm';
const grayBase = 'GrayImage.dcm';
// Karma serves the repository under /base, so this is the real path to the
// fixtures.
const url =
  'dicomweb://localhost:9876/base/packages/dicomImageLoader/testImages/';

/**
 * Loads an image the way an application does - through the registered image
 * loader, which takes its metadata from the naturalized cache that
 * dataSetCacheManager populates while reading the Part 10 file - and returns
 * its samples.
 */
async function decodeSamples(imageId: string) {
  const image = await imageLoader.loadImage(imageId);
  const { transferSyntaxUID } = metaData.get('transferSyntax', imageId) || {};

  return { transferSyntaxUID, samples: image.voxelManager.getScalarData() };
}

describe('Test lossless TransferSyntaxes decoding', function () {
  let uncompressedSamples = null;

  beforeAll(async function () {
    init({
      beforeSend(/* xhr, imageId */) {},
      imageCreated(/* image */) {},
      strict: false,
      decodeConfig: {},
    });

    ({ samples: uncompressedSamples } = await decodeSamples(`${url}${base}`));
  });

  afterAll(function () {
    dataSetCacheManager.purge();
  });

  Object.keys(transferSyntaxes).forEach((transferSyntaxUid) => {
    const name = transferSyntaxes[transferSyntaxUid];
    const filename = `${base}_${name}_${transferSyntaxUid}.dcm`;

    it(`should properly decode ${name}`, async function () {
      const { transferSyntaxUID, samples } = await decodeSamples(
        `${url}${filename}`
      );

      // Guards against a fixture that is not the syntax its name claims, which
      // would otherwise pass here while testing the wrong decoder.
      expect(transferSyntaxUID).toBe(transferSyntaxUid);
      expect(samples.length).toBe(uncompressedSamples.length);

      let firstDifference = -1;
      for (let i = 0; i < samples.length; i++) {
        if (samples[i] !== uncompressedSamples[i]) {
          firstDifference = i;
          break;
        }
      }

      if (firstDifference !== -1) {
        fail(
          `${name}: pixel ${firstDifference} is ${samples[firstDifference]}, ` +
            `expected ${uncompressedSamples[firstDifference]}`
        );
      }
    });
  });

  Object.keys(pendingTransferSyntaxes).forEach((transferSyntaxUid) => {
    const [name, reason] = pendingTransferSyntaxes[transferSyntaxUid];

    it(`should properly decode ${name}`, function () {
      pending(reason);
    });
  });
});

describe('Test lossless TransferSyntaxes decoding of colour', function () {
  let uncompressedSamples = null;

  beforeAll(async function () {
    init({
      beforeSend(/* xhr, imageId */) {},
      imageCreated(/* image */) {},
      strict: false,
      decodeConfig: {},
    });

    ({ samples: uncompressedSamples } = await decodeSamples(
      `${url}${colorBase}`
    ));

    // Three interleaved samples per pixel over 768x512, so a decoder that drops
    // or reorders a channel shows up as a length or value difference rather
    // than passing quietly.
    expect(uncompressedSamples.length).toBe(768 * 512 * 3);
  });

  afterAll(function () {
    dataSetCacheManager.purge();
  });

  Object.keys(colorTransferSyntaxes).forEach((transferSyntaxUid) => {
    const name = colorTransferSyntaxes[transferSyntaxUid];
    const filename = `${colorBase}_${name}_${transferSyntaxUid}.dcm`;

    it(`should properly decode colour ${name}`, async function () {
      const { transferSyntaxUID, samples } = await decodeSamples(
        `${url}${filename}`
      );

      expect(transferSyntaxUID).toBe(transferSyntaxUid);
      expect(samples.length).toBe(uncompressedSamples.length);

      let firstDifference = -1;
      for (let i = 0; i < samples.length; i++) {
        if (samples[i] !== uncompressedSamples[i]) {
          firstDifference = i;
          break;
        }
      }

      if (firstDifference !== -1) {
        // Reported as pixel and channel, since a wrong colour transform
        // typically shows as a consistent offset in one channel.
        const pixel = Math.floor(firstDifference / 3);
        const channel = 'RGB'[firstDifference % 3];
        fail(
          `${name}: pixel ${pixel} channel ${channel} is ` +
            `${samples[firstDifference]}, expected ` +
            `${uncompressedSamples[firstDifference]}`
        );
      }
    });
  });
});

describe('Test lossy TransferSyntaxes decoding', function () {
  let uncompressedSamples = null;

  beforeAll(async function () {
    init({
      beforeSend(/* xhr, imageId */) {},
      imageCreated(/* image */) {},
      strict: false,
      decodeConfig: {},
    });

    ({ samples: uncompressedSamples } = await decodeSamples(
      `${url}${grayBase}`
    ));

    // 768x512 single sample, so a fixture that decoded as colour, or that lost
    // a row, shows up as a length difference rather than passing quietly.
    expect(uncompressedSamples.length).toBe(768 * 512);
  });

  afterAll(function () {
    dataSetCacheManager.purge();
  });

  Object.keys(lossyTransferSyntaxes).forEach((transferSyntaxUid) => {
    const { name, tolerance } = lossyTransferSyntaxes[transferSyntaxUid];
    const filename = `${grayBase}_${name}_${transferSyntaxUid}.dcm`;

    it(`should properly decode ${name}`, async function () {
      const { transferSyntaxUID, samples } = await decodeSamples(
        `${url}${filename}`
      );

      // Guards against a fixture that is not the syntax its name claims, which
      // would otherwise pass here while testing the wrong decoder.
      expect(transferSyntaxUID).toBe(transferSyntaxUid);
      expect(samples.length).toBe(uncompressedSamples.length);

      // The whole frame is scanned rather than stopping at the first sample
      // over the tolerance, so the failure message reports the worst sample in
      // the image instead of whichever one happens to come first.
      let worstIndex = -1;
      let worstDifference = 0;
      for (let i = 0; i < samples.length; i++) {
        const difference = Math.abs(samples[i] - uncompressedSamples[i]);

        if (difference > worstDifference) {
          worstDifference = difference;
          worstIndex = i;
        }
      }

      if (worstDifference > tolerance) {
        fail(
          `${name}: pixel ${worstIndex} is ${samples[worstIndex]}, expected ` +
            `${uncompressedSamples[worstIndex]} within ${tolerance} ` +
            `(difference ${worstDifference})`
        );
      }
    });
  });
});
