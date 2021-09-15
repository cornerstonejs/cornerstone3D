/* eslint-disable no-unused-expressions */
/* eslint import/extensions: 0 */
import { expect } from 'chai';
import * as cornerstoneWADOImageLoader from '../src/imageLoader/index.js';
import * as cornerstoneWADOImageLoaderWebWorker from '../src/webWorker/index.worker.js';

describe('A test that pulls in all modules', function () {
  it('pulls in all modules', function () {
    expect(cornerstoneWADOImageLoader).to.exist;
    expect(cornerstoneWADOImageLoaderWebWorker).to.exist;
  });
});
