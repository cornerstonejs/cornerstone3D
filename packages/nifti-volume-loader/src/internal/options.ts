import type { LoaderOptions } from '../types';

let options: LoaderOptions = {
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend() {
    // before send code
  },
};

export function setOptions(newOptions: LoaderOptions): void {
  options = Object.assign(options, newOptions);
}

export function getOptions(): LoaderOptions {
  return options;
}
