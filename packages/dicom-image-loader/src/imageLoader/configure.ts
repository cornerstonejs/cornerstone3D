import { setOptions } from './internal/index';
import { CornerstoneWadoLoaderOptions } from './internal/options';

function configure(options: CornerstoneWadoLoaderOptions): void {
  setOptions(options);
}

export default configure;
