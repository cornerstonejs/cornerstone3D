/* eslint-disable no-unused-expressions */
import { expect } from 'chai';

import * as cornerstoneWADOImageLoader from '../src/imageLoader/index';
import * as cornerstoneWADOImageLoaderWebWorker from '../src/webWorker/index';

describe('A test that pulls in all modules', function () {
  it('pulls in all modules', function () {
    expect(cornerstoneWADOImageLoader).to.exist;
    expect(cornerstoneWADOImageLoaderWebWorker).to.exist;
  });
});
