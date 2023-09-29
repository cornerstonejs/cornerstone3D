import registerWadors from './wadors/register';
import registerWadouri from './wadouri/register';

/**
 * Register the WADO-URI and WADO-RS image loaders and metaData providers
 * with an instance of Cornerstone Core.
 *
 * @param cornerstone The Cornerstone Core library to register the image loaders with
 */
function registerLoaders(cornerstone: any): void {
  registerWadors(cornerstone);
  registerWadouri(cornerstone);
}

export default registerLoaders;
