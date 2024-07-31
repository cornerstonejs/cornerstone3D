/* eslint import/extensions: 0 */
import { expect } from 'chai';
import getVOI from '../../../src/imageLoader/wadouri/metaData/getVOI.js';
import xhrRequest from '../../../src/imageLoader/internal/xhrRequest.js';
import dataSetCacheManager from '../../../src/imageLoader/wadouri/dataSetCacheManager.js';
import parseImageId from '../../../src/imageLoader/wadouri/parseImageId.js';

describe('getVOI', function () {
  it('should parse window center and width from frame voi lut sequence', (done) => {
    this.timeout(5000);
    const imageId =
      'dicomweb://localhost:9876/base/testImages/frame-voi-lut-sequence-image.dcm';

    const parsedImageId = parseImageId(imageId);
    const dataSetPromise = dataSetCacheManager.load(
      parsedImageId.url,
      xhrRequest,
      imageId
    );

    dataSetPromise.then((dataSet) => {
      try {
        const voi = getVOI(dataSet);

        expect(voi.windowCenter).to.eql([2098, 2073, 2130]);
        expect(voi.windowWidth).to.eql([567, 509, 640]);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('should return undefined window center and width if no frame voi lut sequence present', (done) => {
    this.timeout(5000);
    const imageId = 'dicomweb://localhost:9876/base/testImages/CTImage.dcm';

    const parsedImageId = parseImageId(imageId);
    const dataSetPromise = dataSetCacheManager.load(
      parsedImageId.url,
      xhrRequest,
      imageId
    );

    dataSetPromise.then((dataSet) => {
      try {
        const voi = getVOI(dataSet);

        expect(voi.windowCenter).to.equal(undefined);
        expect(voi.windowWidth).to.equal(undefined);
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});
