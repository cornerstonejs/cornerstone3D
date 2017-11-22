import * as dicomParser from '../../dicomParser/src/index.js';
import registerLoaders from './imageLoader/registerLoaders.js';

const $ = window.$;
let cornerstone = window.cornerstone;

const external = {
  set cornerstone (cs) {
    cornerstone = cs;

    registerLoaders(cornerstone);
  },
  get cornerstone () {
    return cornerstone;
  }
};

export { $, dicomParser, external };

