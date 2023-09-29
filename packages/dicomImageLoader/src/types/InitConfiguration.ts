import type { WebWorkerOptions, WebWorkerTaskOptions } from './WebWorkerTypes';

import type { LoaderDecodeOptions } from './LoaderDecodeOptions';

interface InitConfiguration {
  useWebWorkers: boolean;
  decodeConfig: LoaderDecodeOptions;
  webWorkers: WebWorkerOptions & { taskConfiguration: WebWorkerTaskOptions };
}

export type { InitConfiguration };
