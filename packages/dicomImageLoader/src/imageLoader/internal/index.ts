import { default as xhrRequest } from './xhrRequest';
import { default as streamRequest } from './streamRequest';
import { setOptions, getOptions } from './options';

const internal = {
  xhrRequest,
  streamRequest,
  setOptions,
  getOptions,
};

export { setOptions, getOptions, xhrRequest, internal, streamRequest };
