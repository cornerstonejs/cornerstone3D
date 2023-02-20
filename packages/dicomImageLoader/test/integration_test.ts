/* eslint import/extensions: 0 */
import { expect } from 'chai';
import { loadImage } from '../src/imageLoader/wadouri/loadImage.js';
import configure from '../src/imageLoader/configure.js';
import webWorkerManager from '../src/imageLoader/webWorkerManager.js';

// See https://www.dicomlibrary.com/dicom/transfer-syntax/
const transferSyntaxes = {
  '1.2.840.10008.1.2': 'LittleEndianImplicitTransferSyntax',
  '1.2.840.10008.1.2.1': 'LittleEndianExplicitTransferSyntax',
  '1.2.840.10008.1.2.1.99': 'DeflatedExplicitVRLittleEndianTransferSyntax',
  '1.2.840.10008.1.2.2': 'BigEndianExplicitTransferSyntax',

  '1.2.840.10008.1.2.4.50': 'JPEGProcess1TransferSyntax',
  // '1.2.840.10008.1.2.4.51': 'JPEGProcess2_4TransferSyntax', // broken

  // Retired, not tested at all and not implemented...
  // '1.2.840.10008.1.2.4.53': 'JPEGProcess6_8TransferSyntax',
  // '1.2.840.10008.1.2.4.55': 'JPEGProcess10_12TransferSyntax',

  '1.2.840.10008.1.2.4.57': 'JPEGProcess14TransferSyntax',
  '1.2.840.10008.1.2.4.70': 'JPEGProcess14SV1TransferSyntax',
  '1.2.840.10008.1.2.4.80': 'JPEGLSLosslessTransferSyntax',
  '1.2.840.10008.1.2.4.81': 'JPEGLSLossyTransferSyntax',
  '1.2.840.10008.1.2.4.90': 'JPEG2000LosslessOnlyTransferSyntax',
  '1.2.840.10008.1.2.4.91': 'JPEG2000TransferSyntax',
  '1.2.840.10008.1.2.5': 'RLELosslessTransferSyntax',
};

const base = 'CTImage.dcm';
const url = 'dicomweb://localhost:9876/base/testImages/';

describe('loadImage', function () {
  before(function () {
    // Initialize the web worker manager
    const config = {
      maxWebWorkers: 1,
      startWebWorkersOnDemand: true,
      taskConfiguration: {
        decodeTask: {
          initializeCodecsOnStartup: true,
        },
      },
    };

    webWorkerManager.initialize(config);

    configure({
      strict: false,
      decodeConfig: {},
    });
  });

  Object.keys(transferSyntaxes).forEach((transferSyntaxUid) => {
    const name = transferSyntaxes[transferSyntaxUid];
    const filename = `${base}_${name}_${transferSyntaxUid}.dcm`;

    it(`should properly load ${name}`, function (done) {
      this.timeout(5000);
      const imageId = `${url}${filename}`;

      console.time(name);

      let loadObject;

      try {
        loadObject = loadImage(imageId);
      } catch (error) {
        done(error);
      }

      loadObject.promise.then(
        (image) => {
          console.timeEnd(name);
          // TODO: Compare against known correct pixel data
          expect(image).to.be.an('object');
          done();
        },
        (error) => {
          done(error.error);
        }
      );
    });
  });

  it('should result in an error when the DICOM file has no pixelData', (done) => {
    this.timeout(5000);
    const imageId = `${url}no-pixel-data.dcm`;

    let loadObject;

    try {
      loadObject = loadImage(imageId);
    } catch (error) {
      done(error);
    }

    loadObject.promise.then(
      () => {
        done(new Error('Should not have succeeded'));
      },
      (error) => {
        expect(error.error.message === 'The file does not contain image data.');
        done();
      }
    );
  });
});
