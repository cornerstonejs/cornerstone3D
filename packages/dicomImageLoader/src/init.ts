import type { InitConfiguration } from './types';
import registerLoaders from './imageLoader/registerLoaders';
import externalModule from './externalModules';
import { configure } from './imageLoader';
import webWorkerManager from './imageLoader/webWorkerManager';

type Init = {
  cornerstone: any;
  dicomParser: any;
  configuration: InitConfiguration;
};

function init({ cornerstone, dicomParser, configuration }: Init) {
  externalModule.cornerstone = cornerstone;
  externalModule.dicomParser = dicomParser;
  configure(configuration);
  webWorkerManager.initialize(configuration.webWorkers);
  registerLoaders(cornerstone);
}

export { init };
