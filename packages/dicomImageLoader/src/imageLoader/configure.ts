import { setOptions } from './internal/index';
import { LoaderOptions } from '../types';

function configure(options: LoaderOptions): void {
  setOptions(options);
}

export default configure;
