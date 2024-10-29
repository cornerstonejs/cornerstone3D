import wadouriRegister from './wadouri/register';
import wadorsRegister from './wadors/register';

/**
 * Register the WADO-URI and WADO-RS image loaders and metaData providers
 * with an instance of Cornerstone Core.
 *
 * @param cornerstone The Cornerstone Core library to register the image loaders with
 */
function registerLoaders(): void {
  wadorsRegister();
  wadouriRegister();
}

export default registerLoaders;
