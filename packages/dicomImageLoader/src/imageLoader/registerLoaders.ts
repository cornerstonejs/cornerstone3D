import wadouriRegister from './wadouri/register';
import wadorsRegister from './wadors/register';

/**
 * Register the WADO-URI and WADO-RS image loaders.
 *
 * @param options.useLegacyMetadataProvider - When true, registers the
 *   legacy wadouri/wadors metadata providers. Default is false (new design).
 */
function registerLoaders(options?: {
  useLegacyMetadataProvider?: boolean;
}): void {
  wadorsRegister(options);
  wadouriRegister(options);
}

export default registerLoaders;
