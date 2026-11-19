import ViewportType from '../../enums/ViewportType';
import ViewportTypes, {
  registerViewportTypesConstant,
} from '../../enums/ViewportTypes';
import type { ViewportType as ViewportTypeWire } from '../../types/ViewportTypeRegistry';
import ECGViewport from '../GenericViewport/ECG/ECGViewport';
import PlanarViewport from '../GenericViewport/Planar/PlanarViewport';
import NextVideoViewport from '../GenericViewport/Video/VideoViewport';
import VolumeViewport3D from '../GenericViewport/Volume3D/viewport3D';
import NextWSIViewport from '../GenericViewport/WSI/WSIViewport';
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
  'type'
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
 * The viewport type strings that Cornerstone3D 6.0 removed, each with the
 * message that names what an application uses instead. The library
 * registers no class under them, and the rendering engine throws this
 * message when it is asked for one of them.
 */
const removedViewportTypeMessages: Record<string, string> = {
  stack:
    "ViewportType 'stack' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR_NEXT (a planar viewport shows a stack or a volume)",
  orthographic:
    "ViewportType 'orthographic' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR_NEXT with an orientation in defaultOptions, for example OrientationAxis.AXIAL (a planar viewport shows a stack or a volume)",
  perspective:
    "ViewportType 'perspective' was removed in Cornerstone3D 6.0: use ViewportType.VOLUME_3D_NEXT with parallelProjection: false in defaultOptions",
};

/**
 * Registers the viewport types of the library: the five next viewports
 * under their `*Next` strings, and the strings `'volume3d'`, `'video'`,
 * `'wholeSlide'` and `'ecg'` as aliases of the next 3D, video, whole slide
 * and ECG viewports.
 */
function registerCoreViewportTypes() {
  if (hasRegisteredCoreViewportTypes) {
    return;
  }
  hasRegisteredCoreViewportTypes = true;

  registerViewportType({
    type: ViewportType.PLANAR_NEXT,
    ViewportClass: PlanarViewport,
  });
  registerViewportType({
    type: ViewportType.VOLUME_3D_NEXT,
    ViewportClass: VolumeViewport3D,
  });
  registerViewportType({
    type: ViewportType.VIDEO_NEXT,
    ViewportClass: NextVideoViewport,
  });
  registerViewportType({
    type: ViewportType.WHOLE_SLIDE_NEXT,
    ViewportClass: NextWSIViewport as unknown as ViewportConstructor,
  });
  registerViewportType({
    type: ViewportType.ECG_NEXT,
    ViewportClass: ECGViewport,
  });

  registerViewportTypeAlias(
    ViewportType.VOLUME_3D,
    ViewportType.VOLUME_3D_NEXT
  );
  registerViewportTypeAlias(ViewportType.VIDEO, ViewportType.VIDEO_NEXT);
  registerViewportTypeAlias(
    ViewportType.WHOLE_SLIDE,
    ViewportType.WHOLE_SLIDE_NEXT
  );
  registerViewportTypeAlias(ViewportType.ECG, ViewportType.ECG_NEXT);
}

/**
 * Registers `alias` as one more type string of the class that `type` has.
 * The viewport that the alias makes is the viewport of `type`, with the
 * `type` of its class. A second registration of the same alias for the same
 * class does nothing; an alias that already gives another class throws.
 */
function registerViewportTypeAlias(alias: string, type: string): void {
  const ViewportClass = viewportConstructors.get(type);

  if (!ViewportClass) {
    throw new Error(`Viewport type "${type}" is not registered`);
  }

  const registeredClass = viewportConstructors.get(alias);

  if (registeredClass === ViewportClass) {
    return;
  }

  if (registeredClass) {
    throw new Error(`Viewport type "${alias}" is already registered`);
  }

  viewportConstructors.set(alias, ViewportClass);
  viewportTypeToViewportClass[alias] = ViewportClass;
  registeredViewportTypes.add(alias);
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

/**
 * Throws the message of a viewport type string that Cornerstone3D 6.0
 * removed (`'stack'`, `'orthographic'`, `'perspective'`), which names the
 * type to use instead. A string that an application registered itself is
 * not removed. Any other string passes.
 */
export function throwIfRemovedViewportType(type: string): void {
  registerCoreViewportTypes();

  if (
    !registeredViewportTypes.has(type) &&
    Object.prototype.hasOwnProperty.call(removedViewportTypeMessages, type)
  ) {
    throw new Error(removedViewportTypeMessages[type]);
  }
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
    throwIfRemovedViewportType(input.type);
    throw new Error(`Unknown viewport type: ${input.type}`);
  }

  return viewportClass;
}
