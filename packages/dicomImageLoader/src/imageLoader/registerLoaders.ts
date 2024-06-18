console.debug("dicom loader: link: init: 61D6BD83-8191-47A6-8049-67277CED2B48");
import wadors from './wadors/index';
import wadouri from './wadouri/index';

/**
 * Register the WADO-URI and WADO-RS image loaders and metaData providers
 * with an instance of Cornerstone Core.
 *
 * @param cornerstone The Cornerstone Core library to register the image loaders with
 */
function registerLoaders(cornerstone: any): void {
  wadors.register(cornerstone);
  wadouri.register(cornerstone);
}

export default registerLoaders;
