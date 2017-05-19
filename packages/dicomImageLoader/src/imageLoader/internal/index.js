import { default as xhrRequest } from './xhrRequest';
import { setOptions, getOptions } from './options';

const internal = {
  xhrRequest,
  setOptions,
  getOptions
};

export { setOptions, getOptions, xhrRequest, internal };
