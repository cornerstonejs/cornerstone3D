import type { IVolumeViewport } from '../../types';

type VolumeCompatibilityMethod = 'setVolumes' | 'addVolumes';

function supportsVolumeCompatibilityApi<
  TMethod extends VolumeCompatibilityMethod,
>(
  viewport: unknown,
  method: TMethod
): viewport is Pick<IVolumeViewport, TMethod> {
  return (
    typeof (viewport as Record<TMethod, unknown> | undefined)?.[method] ===
    'function'
  );
}

export default supportsVolumeCompatibilityApi;
