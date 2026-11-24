import { describe, it, expect } from '@jest/globals';
import { Events } from '../src/enums';

/**
 * The events of 5.x that no 6.0 viewport fires are gone from `Enums.Events`,
 * so that a listener of one fails to compile instead of never running.
 *
 * Measured on commit 58914567b, the legacy tree:
 * - ACTORS_CHANGED fired on the element from the actor list of the legacy
 *   viewports: `setActors`, `addActor`, `addActors`, `removeActors` and
 *   `removeAllActors`, and so from `setStack` (four times), `setVolumes`
 *   (four times), `addVolumes` (twice) and `removeVolumeActors`. No 6.0
 *   viewport has an actor list to change: a display set is shown with
 *   `setDisplaySets`, which fires DISPLAY_SETS_CHANGED;
 * - CLIPPING_PLANES_UPDATED fired on the element for each actor when a
 *   legacy stack, volume or 3D viewport set the two slab clipping planes of
 *   the vtk mapper of the actor to the camera: on a mount, on each new image
 *   or slice, on a slab or an orientation change, on a turn of the 3D camera.
 *   No 6.0 viewport sets such planes: CAMERA_MODIFIED reports those changes;
 * - DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED and DYNAMIC_VOLUME_TIME_POINT_LOADED
 *   were deprecated in 4.0 and nothing fired them in 5.x. A dynamic volume
 *   fires DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED and
 *   DYNAMIC_VOLUME_DIMENSION_GROUP_LOADED;
 * - VIEWPORT_NEW_IMAGE_SET and VOLUME_VIEWPORT_NEW_VOLUME, the mount events
 *   of a stack and of a volume, are one event of every viewport family:
 *   DISPLAY_SETS_CHANGED, which fires for an overlay too (EV1).
 *
 * The others were removed earlier in 6.0 (stage 5, O9).
 */
describe('Events that 6.0 removed', () => {
  it.each([
    'ACTORS_CHANGED',
    'CLIPPING_PLANES_UPDATED',
    'DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED',
    'DYNAMIC_VOLUME_TIME_POINT_LOADED',
    'PRESET_MODIFIED',
    'STACK_VIEWPORT_SCROLL',
    'PRE_STACK_NEW_IMAGE',
    'STACK_NEW_IMAGE',
    'VOLUME_NEW_IMAGE',
    'VIEWPORT_NEW_IMAGE_SET',
    'VOLUME_VIEWPORT_NEW_VOLUME',
  ])('has no %s in Enums.Events', (name) => {
    expect(Events[name]).toBeUndefined();
  });

  it('has DISPLAY_SETS_CHANGED and keeps the string of NEW_IMAGE', () => {
    expect(Events.DISPLAY_SETS_CHANGED).toBe(
      'CORNERSTONE_DISPLAY_SETS_CHANGED'
    );
    expect(Events.NEW_IMAGE).toBe('CORNERSTONE_NEW_IMAGE');
  });

  it('keeps the scroll events that a planar viewport fires', () => {
    expect(Events.STACK_SCROLL_OUT_OF_BOUNDS).toBe(
      'STACK_SCROLL_OUT_OF_BOUNDS'
    );
    expect(Events.VOLUME_VIEWPORT_SCROLL).toBe('VOLUME_VIEWPORT_SCROLL');
    expect(Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS).toBe(
      'VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS'
    );
  });
});
