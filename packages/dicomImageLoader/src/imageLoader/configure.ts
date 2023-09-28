import { setOptions } from './internal/index';
import type { LoaderOptions } from '../types';

function configure(options: LoaderOptions): void {
  setOptions(options);
}

export default configure;
