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
  '1.2.840.10008.1.2.4.81': {
    name: 'JPEGLSLossyTransferSyntax',
    threshold: 1,
  },
  '1.2.840.10008.1.2.4.91': {
    name: 'JPEG2000TransferSyntax',
    threshold: 6,
  },
};

const base = 'CTImage.dcm';
const url = 'dicomweb://localhost:9876/base/testImages/';

describe('Test lossy TransferSyntaxes decoding', function() {
  let uncompressedPixelData = null;

  let uncompressedImage = null;

  let rescaleInterceptUncompressed = null;

  let rescaleSlopeUncompressed = null;

  before(function(done) {
    // loads uncompressed study (the original one)
    this.timeout(5000);
    const imageId = `${url}${base}`;
    const parsedImageId = parseImageId(imageId);

    configure({
      // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
      beforeSend(/* xhr, imageId */) {},
      // callback allowing modification of newly created image objects
      imageCreated(/* image */) {},
      strict: false,
      useWebWorkers: false,
      decodeConfig: {
        usePDFJS: false,
      },
    });

    dataSetCacheManager
      .load(parsedImageId.url, xhrRequest, imageId)
      .then(dataSet => {
        const transferSyntax = dataSet.string('x00020010');

        rescaleInterceptUncompressed = dataSet.floatString('x00281052');
        rescaleSlopeUncompressed = dataSet.floatString('x00281053');
        uncompressedPixelData = getPixelData(dataSet);

        createImage(imageId, uncompressedPixelData, transferSyntax, {})
          .then(image => {
            uncompressedImage = image;
          })
          .catch(done);

        done();
      })
      .catch(done);
  });

  after(function() {
    dataSetCacheManager.purge();
  });

  Object.keys(transferSyntaxes).forEach(transferSyntaxUid => {
    const testsData = transferSyntaxes[transferSyntaxUid];
    const name = testsData.name;
    const filename = `${base}_${name}_${transferSyntaxUid}.dcm`;

    it(`should properly decode ${name}`, function(done) {
      this.timeout(5000);
      const imageId = `${url}${filename}`;
      const parsedImageId = parseImageId(imageId);
      const dataSetPromise = dataSetCacheManager.load(
        parsedImageId.url,
        xhrRequest,
        imageId
      );

      dataSetPromise.then(dataSet => {
        try {
          const pixelData = getPixelData(dataSet);
          const curTransferSyntax = dataSet.string('x00020010');
          const rescaleIntercept = dataSet.floatString('x00281052');
          const rescaleSlope = dataSet.floatString('x00281053');

          curTransferSyntax.should.to.be.equals(transferSyntaxUid);

          createImage(imageId, pixelData, curTransferSyntax, {})
            .then(image => {
              const uncompressedImagePixelData = uncompressedImage.getPixelData();
              const curPixelData = image.getPixelData();

              for (let i = 0; i < curPixelData.length - 1; i++) {
                const threshold = testsData.threshold;
                const difference = Math.abs(
                  curPixelData[i] - uncompressedImagePixelData[i]
                );

                if (difference > threshold) {
                  const modalityPixelValue =
                    curPixelData[i] * rescaleSlope + rescaleIntercept;
                  const uncompressedModalityPixelValue =
                    uncompressedImagePixelData[i] * rescaleSlopeUncompressed +
                    rescaleInterceptUncompressed;

                  const differenceModality = Math.abs(
                    modalityPixelValue - uncompressedModalityPixelValue
                  );

                  if (differenceModality > threshold) {
                    const message = `difference: ${difference} 
                        differenceModality: ${differenceModality}, 
                        curPixelData: ${curPixelData[i]}
                        uncompressedImagePixelData: ${uncompressedImagePixelData[i]}
                        i: ${i}, 
                        transferSyntaxName: ${name}, 
                        transferSyntax: ${transferSyntaxUid}
                        transferSyntaxFromDicom: ${curTransferSyntax}, 
                        rescaleIntercept: ${rescaleIntercept}
                        rescaleUncompressed: ${rescaleInterceptUncompressed}
                        curModalityPixelValue: ${modalityPixelValue} 
                        uncompressedModalityPixelValue: ${uncompressedModalityPixelValue}`;

                    differenceModality.should(message).lessThan(threshold);

                    done();
                  }
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
