import wadouriRegister from './wadouri/register';
import wadorsRegister from './wadors/register';

/**
 * Register the WADO-URI and WADO-RS image loaders.
 *
 * @param options.useMetadataProvider - When true, skips registering the
 *   legacy metadata providers. Use addBinaryDicomInstance /
 *   addDicomwebInstance from @cornerstonejs/metadata instead.
 */
function registerLoaders(options?: { useMetadataProvider?: boolean }): void {
  wadorsRegister(options);
  wadouriRegister(options);
}

export default registerLoaders;
