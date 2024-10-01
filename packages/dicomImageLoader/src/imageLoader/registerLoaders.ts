console.debug("dicom loader: link: init: 3DA675F2-86A1-41A1-9E15-A7019E085C0F");
import wadouriRegister from './wadouri/register';
import wadorsRegister from './wadors/register';

/**
 * Register the WADO-URI and WADO-RS image loaders and metaData providers
 * with an instance of Cornerstone Core.
 *
 * @param cornerstone The Cornerstone Core library to register the image loaders with
 */
function registerLoaders(cornerstone): void {
  wadorsRegister(cornerstone);
  wadouriRegister(cornerstone);
}

export default registerLoaders;
