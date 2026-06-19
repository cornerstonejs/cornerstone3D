import ViewportType from './ViewportType';
import type {
  CoreViewportTypeConstants,
  ViewportTypeConstants,
} from '../types/ViewportTypeRegistry';

/**
 * Shape of `Enums.ViewportTypes`. Augment {@link ViewportTypeConstants} in your
 * extension `.d.ts`; property types on `Enums.ViewportTypes` follow that interface.
 */
export type ViewportTypesMap = ViewportTypeConstants;

const builtInViewportTypes: CoreViewportTypeConstants = {
  STACK: ViewportType.STACK,
  ORTHOGRAPHIC: ViewportType.ORTHOGRAPHIC,
  PERSPECTIVE: ViewportType.PERSPECTIVE,
  VOLUME_3D: ViewportType.VOLUME_3D,
  VOLUME_3D_NEXT: ViewportType.VOLUME_3D_NEXT,
  PLANAR_NEXT: ViewportType.PLANAR_NEXT,
  VIDEO: ViewportType.VIDEO,
  VIDEO_NEXT: ViewportType.VIDEO_NEXT,
  WHOLE_SLIDE: ViewportType.WHOLE_SLIDE,
  WHOLE_SLIDE_NEXT: ViewportType.WHOLE_SLIDE_NEXT,
  ECG: ViewportType.ECG,
  ECG_NEXT: ViewportType.ECG_NEXT,
};

/**
 * Runtime viewport type constants: built-in names map to wire-type strings.
 *
 * Built-ins are available immediately. Extension types are added when you call
 * `registerViewportType({ name: 'PET', type: 'myOrg:pet', ... })`.
 *
 * Prefer this over the deprecated `ViewportType` enum. For compile-time names,
 * augment `ViewportTypeConstants` only — `Enums.ViewportTypes` is typed from it.
 */
const ViewportTypes = builtInViewportTypes as ViewportTypesMap;

export function registerViewportTypesConstant<
  Name extends keyof ViewportTypeConstants,
>(name: Name, type: ViewportTypeConstants[Name]): void {
  if (Object.prototype.hasOwnProperty.call(ViewportTypes, name)) {
    throw new Error(`Viewport type constant "${String(name)}" already exists`);
  }

  (ViewportTypes as Record<keyof ViewportTypeConstants, string>)[name] = type;
}

export default ViewportTypes;
