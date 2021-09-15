/* eslint import/extensions: 0 */
import { expect } from 'chai';
import external from '../../../src/externalModules.js';
import { loadImage } from '../../../src/imageLoader/wadouri/loadImage.js';
import configure from '../../../src/imageLoader/configure.js';
import webWorkerManager from '../../../src/imageLoader/webWorkerManager.js';

external.cornerstone = window.cornerstone;

describe('#wadouri > metadataProvider', function () {
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

  const imageId =
    'dicomweb://localhost:9876/base/testImages/no-pixel-spacing.dcm';

  it('should return columnPixelSpacing undefined if pixelSpacing is undefined', function (done) {
    this.timeout(5000);
    loadImage(imageId).promise.then(() => {
      const imagePlaneModule = external.cornerstone.metaData.get(
        'imagePlaneModule',
        imageId
      );
      const { columnPixelSpacing } = imagePlaneModule;

      try {
        expect(columnPixelSpacing).to.be.equal(null);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('should return columnPixelSpacing undefined if pixelSpacing is undefined', function (done) {
    this.timeout(5000);
    loadImage(imageId).promise.then(() => {
      const imagePlaneModule = external.cornerstone.metaData.get(
        'imagePlaneModule',
        imageId
      );
      const { rowPixelSpacing } = imagePlaneModule;

      try {
        expect(rowPixelSpacing).to.be.equal(null);
        done();
      } catch (error) {
        console.log(error);
        done(error);
      }
    });
  });
});
