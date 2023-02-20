import { default as xhrRequest } from './xhrRequest.js';
import { setOptions, getOptions } from './options.js';

const internal = {
  xhrRequest,
  setOptions,
  getOptions,
};

export { setOptions, getOptions, xhrRequest, internal };
