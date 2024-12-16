import { setOptions } from './internal';
import type { LoaderOptions } from './types';

function init(options: LoaderOptions = {}): void {
  setOptions(options);
}

export default init;
