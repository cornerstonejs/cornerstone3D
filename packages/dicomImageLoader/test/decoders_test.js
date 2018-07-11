/* eslint import/extensions: 0 */
import { expect } from 'chai';
import { initializeJPEGLS } from '../src/shared/decoders/decodeJPEGLS.js';
import { initializeJPEG2000 } from '../src/shared/decoders/decodeJPEG2000.js';
import decodeImageFrame from '../src/imageLoader/decodeImageFrame.js';
import getImageFrame from '../src/imageLoader/getImageFrame.js';
import getPixelData from '../src/imageLoader/wadouri/getPixelData.js';
import xhrRequest from '../src/imageLoader/internal/xhrRequest.js';
import dataSetCacheManager from '../src/imageLoader/wadouri/dataSetCacheManager.js';
import parseImageId from '../src/imageLoader/wadouri/parseImageId.js';
import webWorkerManager from '../src/imageLoader/webWorkerManager.js';

const transferSyntaxes = {
  '1.2.840.10008.1.2': 'LittleEndianImplicitTransferSyntax',
  '1.2.840.10008.1.2.1': 'LittleEndianExplicitTransferSyntax',
  // TODO: dicomParser is failing with this.module in parseDicom
  // '1.2.840.10008.1.2.1.99': 'DeflatedExplicitVRLittleEndianTransferSyntax',

  '1.2.840.10008.1.2.2': 'BigEndianExplicitTransferSyntax', // Retired

  // TODO: These three are failing
  // '1.2.840.10008.1.2.4.50': 'JPEGProcess1TransferSyntax',
  // '1.2.840.10008.1.2.4.51': 'JPEGProcess2_4TransferSyntax',
  // '1.2.840.10008.1.2.4.53': 'JPEGProcess6_8TransferSyntax',

  '1.2.840.10008.1.2.4.55': 'JPEGProcess10_12TransferSyntax',
  '1.2.840.10008.1.2.4.57': 'JPEGProcess14TransferSyntax',
  '1.2.840.10008.1.2.4.70': 'JPEGProcess14SV1TransferSyntax',
  '1.2.840.10008.1.2.4.80': 'JPEGLSLosslessTransferSyntax',
  '1.2.840.10008.1.2.4.81': 'JPEGLSLossyTransferSyntax',
  '1.2.840.10008.1.2.4.90': 'JPEG2000LosslessOnlyTransferSyntax',
  '1.2.840.10008.1.2.4.91': 'JPEG2000TransferSyntax',
  '1.2.840.10008.1.2.5': 'RLELosslessTransferSyntax'
};

const base = 'CTImage.dcm';
const url = 'dicomweb://localhost:9876/base/testImages/';

describe('decodeImageFrame', function () {
  before(function () {
    // Initialize the web worker manager
    const config = {
      maxWebWorkers: 1,
      startWebWorkersOnDemand: true,
      webWorkerPath: '/base/dist/cornerstoneWADOImageLoaderWebWorker.js',
      taskConfiguration: {
        decodeTask: {
          loadCodecsOnStartup: true,
          initializeCodecsOnStartup: false,
          codecsPath: '/base/dist/cornerstoneWADOImageLoaderCodecs.js',
          usePDFJS: false
        }
      }
    };

    webWorkerManager.initialize(config);

    const decodeTask = {
      usePDFJS: false
    };

    initializeJPEG2000(decodeTask);
    initializeJPEGLS(decodeTask);
  });

  after(function () {
    dataSetCacheManager.purge();
  });

  Object.keys(transferSyntaxes).forEach((transferSyntaxUid) => {
    const name = transferSyntaxes[transferSyntaxUid];
    const filename = `${base}_${name}_${transferSyntaxUid}.dcm`;

    it(`should properly decode ${name}`, function (done) {
      const imageId = `${url}${filename}`;
      const parsedImageId = parseImageId(imageId);
      const dataSetPromise = dataSetCacheManager.load(parsedImageId.url, xhrRequest, imageId);

      dataSetPromise.then((dataSet) => {
        try {
          const canvas = document.createElement('canvas');
          const imageFrame = getImageFrame(imageId);
          const pixelData = getPixelData(dataSet);
          const transferSyntax = dataSet.string('x00020010');

          decodeImageFrame(imageFrame, transferSyntax, pixelData, canvas);

          // TODO: Compare against known correct pixel data
          expect(imageFrame).to.be.an('object');
          done();
        } catch (error) {
          done(error);
        }
      }, done);
    });
  });
});
