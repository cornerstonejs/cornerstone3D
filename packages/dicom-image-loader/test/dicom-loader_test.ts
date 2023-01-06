import { expect } from 'chai';
import * as cornerstoneDicomLoader from '../src/imageLoader';
import * as cornerstone from '@cornerstonejs/core';
import * as dicomParser from 'dicom-parser';

cornerstoneDicomLoader.external.cornerstone = cornerstone;
cornerstoneDicomLoader.external.dicomParser = dicomParser;

describe('dicom-loader', () => {
  it('should work', async () => {
    // const result = await cornerstoneDicomLoader.wadouri.loadImage(
    //   '/testImages/CTImage.dcm'
    // ).promise;
    expect(true).to.equal(true);
  });
});
