/* eslint-disable no-unused-expressions */
/* eslint import/extensions: 0 */
import { expect } from 'chai';
import * as dicomImageLoader from '../src/imageLoader/index.js';
import * as dicomImageLoaderWebWorker from '../src/webWorker/index.worker.js';

describe('A test that pulls in all modules', function () {
  it('pulls in all modules', function () {
    expect(dicomImageLoader).to.exist;
    expect(dicomImageLoaderWebWorker).to.exist;
  });
});
