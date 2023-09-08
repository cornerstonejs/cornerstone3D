import {
  enable,
  disable,
  setConfiguration,
  getConfiguration,
} from './stackPrefetch';

import * as stackContextPrefetch from './stackContextPrefetch';

const stackPrefetch = { enable, disable, setConfiguration, getConfiguration };

export { stackPrefetch, stackContextPrefetch };
