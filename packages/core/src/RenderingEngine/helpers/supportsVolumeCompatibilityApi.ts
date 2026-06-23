import type { IVolumeViewport } from '../../types';

export type ICompatibleVolumeViewport = Pick<
  IVolumeViewport,
  'setVolumes' | 'addVolumes'
>;

function isVolumeCompatible(
  viewport: unknown
): viewport is ICompatibleVolumeViewport {
  return Boolean(
    viewport &&
      typeof (viewport as ICompatibleVolumeViewport).setVolumes ===
        'function' &&
      typeof (viewport as ICompatibleVolumeViewport).addVolumes === 'function'
  );
}

export default isVolumeCompatible;
