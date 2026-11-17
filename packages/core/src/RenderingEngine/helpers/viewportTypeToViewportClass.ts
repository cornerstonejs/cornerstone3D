import ViewportType from '../../enums/ViewportType';
import ViewportTypes, {
  registerViewportTypesConstant,
} from '../../enums/ViewportTypes';
import type { ViewportType as ViewportTypeWire } from '../../types/ViewportTypeRegistry';
import ECGViewport from '../GenericViewport/ECG/ECGViewport';
import PlanarViewport from '../GenericViewport/Planar/PlanarViewport';
import PlanarViewportLegacyAdapter from '../GenericViewport/Planar/PlanarViewportLegacyAdapter';
import NextVideoViewport from '../GenericViewport/Video/VideoViewport';
import VideoViewportLegacyAdapter from '../GenericViewport/Video/VideoViewportLegacyAdapter';
import VolumeViewport3D from '../GenericViewport/Volume3D/viewport3D';
import VolumeViewport3DLegacyAdapter from '../GenericViewport/Volume3D/VolumeViewport3DLegacyAdapter';
import NextWSIViewport from '../GenericViewport/WSI/WSIViewport';
import WSIViewportLegacyAdapter from '../GenericViewport/WSI/WSIViewportLegacyAdapter';
import ECGViewportLegacyAdapter from '../GenericViewport/ECG/ECGViewportLegacyAdapter';
import type { ViewportTypeConstants } from '../../types/ViewportTypeRegistry';
import type {
  ViewportInput,
  IViewport,
  InternalViewportInput,
  NormalizedViewportInput,
} from '../../types/IViewport';

interface ViewportConstructor {
  new (
    viewportInput: ViewportInput
  ):
    | IViewport
    | PlanarViewport
    | NextVideoViewport
    | VolumeViewport3D
    | ECGViewport;
  useCustomRenderingPipeline?: boolean;
}

type ViewportClassInput = Pick<
  ViewportInput | InternalViewportInput | NormalizedViewportInput,
  'type' | 'requestedType'
>;

type ViewportClassResolver = (
  input: ViewportClassInput
) => ViewportConstructor | undefined;

type RegisterViewportTypeBaseOptions = {
  ViewportClass: ViewportConstructor;
  resolveClass?: ViewportClassResolver;
};

type RegisterViewportTypeNamedOptions<
  Name extends keyof ViewportTypeConstants,
> = RegisterViewportTypeBaseOptions & {
  name: Name;
  type: ViewportTypeConstants[Name];
};

type RegisterViewportTypeUnnamedOptions = RegisterViewportTypeBaseOptions & {
  type: ViewportTypeWire | string;
  name?: never;
};

type RegisterViewportTypeOptions =
  | RegisterViewportTypeUnnamedOptions
  | RegisterViewportTypeNamedOptions<keyof ViewportTypeConstants>;

const viewportConstructors = new Map<string, ViewportConstructor>();
const viewportTypeToViewportClass: Record<string, ViewportConstructor> = {};
const resolvers: ViewportClassResolver[] = [];
const registeredViewportTypes = new Set<string>();
let hasRegisteredCoreViewportTypes = false;

/**
 * Registers the viewport types of the library. A legacy type has the legacy
 * adapter of its next viewport as its class. The rendering engine remaps a
 * legacy type to its next type before it makes the viewport, and the
 * `resolveClass` of that next type then gives the same adapter.
 * `ViewportType.PERSPECTIVE` has no class: its only class was the legacy
 * volume viewport.
 */
function registerCoreViewportTypes() {
  if (hasRegisteredCoreViewportTypes) {
    return;
  }
  hasRegisteredCoreViewportTypes = true;

  registerViewportType({
    type: ViewportType.ORTHOGRAPHIC,
    ViewportClass:
      PlanarViewportLegacyAdapter as unknown as ViewportConstructor,
  });
  registerViewportType({
    type: ViewportType.STACK,
    ViewportClass:
      PlanarViewportLegacyAdapter as unknown as ViewportConstructor,
  });
  registerViewportType({
    type: ViewportType.VOLUME_3D,
    ViewportClass:
      VolumeViewport3DLegacyAdapter as unknown as ViewportConstructor,
  });
  registerViewportType({
    type: ViewportType.WHOLE_SLIDE,
    ViewportClass: WSIViewportLegacyAdapter as unknown as ViewportConstructor,
  });
  registerViewportType({
    type: ViewportType.ECG,
    ViewportClass: ECGViewportLegacyAdapter as unknown as ViewportConstructor,
  });
  registerViewportType({
    type: ViewportType.VIDEO,
    ViewportClass: VideoViewportLegacyAdapter as unknown as ViewportConstructor,
  });

  // next viewports below
  registerViewportType({
    type: ViewportType.VOLUME_3D_NEXT,
    ViewportClass: VolumeViewport3D,
    resolveClass: ({ type, requestedType }) =>
      type === ViewportType.VOLUME_3D_NEXT &&
      requestedType === ViewportType.VOLUME_3D
        ? (VolumeViewport3DLegacyAdapter as unknown as ViewportConstructor)
        : undefined,
  });
  registerViewportType({
    type: ViewportType.PLANAR_NEXT,
    ViewportClass: PlanarViewport,
    resolveClass: ({ type, requestedType }) =>
      type === ViewportType.PLANAR_NEXT &&
      (requestedType === ViewportType.STACK ||
        requestedType === ViewportType.ORTHOGRAPHIC)
        ? (PlanarViewportLegacyAdapter as unknown as ViewportConstructor)
        : undefined,
  });
  registerViewportType({
    type: ViewportType.VIDEO_NEXT,
    ViewportClass: NextVideoViewport,
    resolveClass: ({ type, requestedType }) =>
      type === ViewportType.VIDEO_NEXT && requestedType === ViewportType.VIDEO
        ? (VideoViewportLegacyAdapter as unknown as ViewportConstructor)
        : undefined,
  });
  registerViewportType({
    type: ViewportType.ECG_NEXT,
    ViewportClass: ECGViewport,
    resolveClass: ({ type, requestedType }) =>
      type === ViewportType.ECG_NEXT && requestedType === ViewportType.ECG
        ? (ECGViewportLegacyAdapter as unknown as ViewportConstructor)
        : undefined,
  });
  registerViewportType({
    type: ViewportType.WHOLE_SLIDE_NEXT,
    ViewportClass: NextWSIViewport as unknown as ViewportConstructor,
    resolveClass: ({ type, requestedType }) =>
      type === ViewportType.WHOLE_SLIDE_NEXT &&
      requestedType === ViewportType.WHOLE_SLIDE
        ? (WSIViewportLegacyAdapter as unknown as ViewportConstructor)
        : undefined,
  });
}

export function registerViewportType<Name extends keyof ViewportTypeConstants>(
  options: RegisterViewportTypeNamedOptions<Name>
): void;
export function registerViewportType(
  options: RegisterViewportTypeUnnamedOptions
): void;
export function registerViewportType({
  type,
  name,
  ViewportClass,
  resolveClass,
}: RegisterViewportTypeOptions): void {
  if (viewportConstructors.has(type)) {
    throw new Error(`Viewport type "${type}" is already registered`);
  }

  if (name && Object.prototype.hasOwnProperty.call(ViewportTypes, name)) {
    throw new Error(`Viewport type constant "${name}" already exists`);
  }

  viewportConstructors.set(type, ViewportClass);
  viewportTypeToViewportClass[type] = ViewportClass;
  registeredViewportTypes.add(type);

  if (name) {
    registerViewportTypesConstant(
      name,
      type as ViewportTypeConstants[typeof name]
    );
  }

  if (resolveClass) {
    resolvers.push(resolveClass);
  }
}

export function isRegisteredViewportType(type: string): boolean {
  registerCoreViewportTypes();
  return registeredViewportTypes.has(type);
}

export default viewportTypeToViewportClass;

export function getViewportClassForInput(
  input: ViewportClassInput
): ViewportConstructor {
  registerCoreViewportTypes();

  for (const resolveClass of resolvers) {
    const resolved = resolveClass(input);
    if (resolved) {
      return resolved;
    }
  }

  const viewportClass = viewportConstructors.get(input.type);
  if (!viewportClass) {
    throw new Error(`Unknown viewport type: ${input.type}`);
  }

  return viewportClass;
}
