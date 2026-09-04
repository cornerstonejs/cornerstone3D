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
 */
const transferSyntaxes = {
  '1.2.840.10008.1.2': 'LittleEndianImplicitTransferSyntax',
  '1.2.840.10008.1.2.1': 'LittleEndianExplicitTransferSyntax',

  '1.2.840.10008.1.2.2': 'BigEndianExplicitTransferSyntax',

  '1.2.840.10008.1.2.4.57': 'JPEGProcess14TransferSyntax',
  '1.2.840.10008.1.2.4.80': 'JPEGLSLosslessTransferSyntax',

  '1.2.840.10008.1.2.4.90': 'JPEG2000LosslessOnlyTransferSyntax',
  '1.2.840.10008.1.2.5': 'RLELosslessTransferSyntax',

  '1.2.840.10008.1.2.1.98':
    'EncapsulatedUncompressedExplicitVRLittleEndianTransferSyntax',
  '1.2.840.10008.1.2.8.1': 'DeflatedImageFrameCompressionTransferSyntax',
  '1.2.840.10008.1.2.4.110': 'JPEGXLLosslessTransferSyntax',
};

/**
 * Syntaxes with a fixture but a pre-existing failure, reported as pending so
 * they stay visible rather than being quietly dropped from the list. Neither is
 * related to the syntaxes added alongside this suite being enabled.
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
  '1.2.840.10008.1.2.4.70': [
    'JPEGProcess14SV1TransferSyntax',
    // Fails against the uncompressed original through either metadata
    // provider, so this is the decoder rather than the metadata path.
    'decoder does not reproduce the source exactly',
  ],
};

/**
 * The colour set. Only the syntaxes whose colour path differs meaningfully from
 * the grayscale one are duplicated here, rather than all twelve: three samples
 * per pixel changes the frame length arithmetic that encapsulated uncompressed
 * and deflated frames depend on, and JPEG XL colour is a separate code path in
 * the codec from JPEG XL grayscale.
 *
 * ColorImage.dcm is kodim23 from the Kodak True Color suite - 768x512
 * interleaved RGB, PlanarConfiguration 0 - so unlike the CT it is unsigned and
 * multi-sample.
 */
const colorTransferSyntaxes = {
  '1.2.840.10008.1.2.1.98':
    'EncapsulatedUncompressedExplicitVRLittleEndianTransferSyntax',
  '1.2.840.10008.1.2.8.1': 'DeflatedImageFrameCompressionTransferSyntax',
  '1.2.840.10008.1.2.4.110': 'JPEGXLLosslessTransferSyntax',
};

const base = 'CTImage.dcm';
const colorBase = 'ColorImage.dcm';
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
