import { setOptions } from './internal/index';
import type { LoaderOptions } from '../types';
import external from '../externalModules';

function configure(options: LoaderOptions): void {
  if (!options.cornerstone || !options.dicomParser) {
    throw new Error(
      'cornerstoneWADOImageLoader.configure: Options object must contain the keys "cornerstone" and "dicomParser".'
    );
  }

  // setting options should happen first, since we use the options in the
  // cornerstone set
  // DO NOT CHANGE THE ORDER OF THESE TWO LINES!
  setOptions(options);

  external.cornerstone = options.cornerstone;
  external.dicomParser = options.dicomParser;
}

export default configure;
