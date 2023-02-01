/* eslint import/extensions: 0 */
import { should } from 'chai';
import getPixelData from '../src/imageLoader/wadouri/getPixelData.js';
import xhrRequest from '../src/imageLoader/internal/xhrRequest.js';
import dataSetCacheManager from '../src/imageLoader/wadouri/dataSetCacheManager.js';
import parseImageId from '../src/imageLoader/wadouri/parseImageId.js';
import createImage from '../src/imageLoader/createImage.js';
import configure from '../src/imageLoader/configure.js';

should();

const transferSyntaxes = {
  '1.2.840.10008.1.2': 'LittleEndianImplicitTransferSyntax',
  '1.2.840.10008.1.2.1': 'LittleEndianExplicitTransferSyntax',
  '1.2.840.10008.1.2.1.99': 'DeflatedExplicitVRLittleEndianTransferSyntax',

  '1.2.840.10008.1.2.2': 'BigEndianExplicitTransferSyntax',

  // retired? Do we care?
  // '1.2.840.10008.1.2.4.53': 'JPEGProcess6_8TransferSyntax',
  // '1.2.840.10008.1.2.4.55': 'JPEGProcess10_12TransferSyntax',

  '1.2.840.10008.1.2.4.57': 'JPEGProcess14TransferSyntax',
  '1.2.840.10008.1.2.4.70': 'JPEGProcess14SV1TransferSyntax',
  '1.2.840.10008.1.2.4.80': 'JPEGLSLosslessTransferSyntax',

  '1.2.840.10008.1.2.4.90': 'JPEG2000LosslessOnlyTransferSyntax',
  '1.2.840.10008.1.2.5': 'RLELosslessTransferSyntax',
};

const base = 'CTImage.dcm';
const url = 'dicomweb://localhost:9876/base/testImages/';

describe('Test lossless TransferSyntaxes decoding', function () {
  let uncompressedPixelData = null;

  let uncompressedImage = null;

  before(function (done) {
    this.timeout(5000);
    // loads uncompressed study (the original one)
    const imageId = `${url}${base}`;
    const parsedImageId = parseImageId(imageId);

    configure({
      // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
      beforeSend(/* xhr, imageId */) {},
      // callback allowing modification of newly created image objects
      imageCreated(/* image */) {},
      strict: false,
      decodeConfig: {},
    });

    dataSetCacheManager
      .load(parsedImageId.url, xhrRequest, imageId)
      .then((dataSet) => {
        const transferSyntax = dataSet.string('x00020010');

        uncompressedPixelData = getPixelData(dataSet);

        createImage(imageId, uncompressedPixelData, transferSyntax, {}).then(
          (image) => {
            uncompressedImage = image;
          }
        );

        done();
      })
      .catch(done);
  });

  after(function () {
    dataSetCacheManager.purge();
  });

  Object.keys(transferSyntaxes).forEach((transferSyntaxUid) => {
    const name = transferSyntaxes[transferSyntaxUid];
    const filename = `${base}_${name}_${transferSyntaxUid}.dcm`;

    it(`should properly decode ${name}`, function (done) {
      this.timeout(5000);
      const imageId = `${url}${filename}`;
      const parsedImageId = parseImageId(imageId);
      const dataSetPromise = dataSetCacheManager.load(
        parsedImageId.url,
        xhrRequest,
        imageId
      );

      dataSetPromise.then((dataSet) => {
        try {
          const pixelData = getPixelData(dataSet);
          const curTransferSyntax = dataSet.string('x00020010');

          curTransferSyntax.should.to.be.equals(transferSyntaxUid);

          createImage(imageId, pixelData, curTransferSyntax, {})
            .then((image) => {
              const uncompressedImagePixelData =
                uncompressedImage.getPixelData();
              const curPixelData = image.getPixelData();

              uncompressedImagePixelData.length.should.to.be.equals(
                curPixelData.length
              );

              for (let i = 0; i < curPixelData.length - 1; i++) {
                if (curPixelData[i] !== uncompressedImagePixelData[i]) {
                  curPixelData[i]
                    .should(`Pixel data is not equal at position: ${i}`)
                    .to.equal(uncompressedImagePixelData[i]);
                }
              }

              done();
            })
            .catch(done);
        } catch (error) {
          done(error);
        }
      }, done);
    });
  });
});
