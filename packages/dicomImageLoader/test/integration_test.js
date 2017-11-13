import { expect } from 'chai';
import { external } from '../src/externalModules.js';
import { loadImage } from '../src/imageLoader/wadouri/loadImage.js';
import webWorkerManager from '../src/imageLoader/webWorkerManager.js';

external.cornerstone = window.cornerstone;

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

  // TODO: Need dcmcjp2k to create these
  // '1.2.840.10008.1.2.4.90': 'JPEG2000LosslessOnlyTransferSyntax',
  // '1.2.840.10008.1.2.4.91': 'JPEG2000TransferSyntax',
  '1.2.840.10008.1.2.5': 'RLELosslessTransferSyntax'
};

const base = 'CTImage.dcm';
const url = 'dicomweb://localhost:9876/base/testImages/';

describe('loadImage', function () {
  this.timeout(0);

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
  });

  Object.keys(transferSyntaxes).forEach((transferSyntaxUid) => {
    const name = transferSyntaxes[transferSyntaxUid];
    const filename = `${base}_${name}_${transferSyntaxUid}.dcm`;

    it(`should properly load ${name}`, function (done) {
      const imageId = `${url}${filename}`;

      console.time(name);

      let promise;

      try {
        promise = loadImage(imageId);  
      } catch (error) {
        done(error);
      }

      promise.then((image) => {
        console.timeEnd(name);
        // TODO: Compare against known correct pixel data
        expect(image).to.be.an('object');
        done();
      }, done);
    });
  });
});
