/* eslint import/extensions: 0 */
import * as cornerstone from '@cornerstonejs/core';
import { expect } from 'chai';
import external from '../../../src/externalModules';
import configure from '../../../src/imageLoader/configure';
import { loadImage } from '../../../src/imageLoader/wadouri/loadImage';
import webWorkerManager from '../../../src/imageLoader/webWorkerManager';

external.cornerstone = cornerstone;

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

  const imageId = `dicomweb://${window.location.host}/testImages/no-pixel-spacing.dcm`;

  it('should return columnPixelSpacing undefined if pixelSpacing is undefined', function (done) {
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
  }, 5000);

  it('should return columnPixelSpacing undefined if pixelSpacing is undefined', function (done) {
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
  }, 5000);
});
