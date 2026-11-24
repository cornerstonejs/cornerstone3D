import ViewportType from '../../enums/ViewportType';
import ViewportTypes, {
  registerViewportTypesConstant,
} from '../../enums/ViewportTypes';
import type { ViewportType as ViewportTypeWire } from '../../types/ViewportTypeRegistry';
import ECGViewport from '../Viewports/ECG/ECGViewport';
import PlanarViewport from '../Viewports/Planar/PlanarViewport';
import VideoViewport from '../Viewports/Video/VideoViewport';
import VolumeViewport3D from '../Viewports/Volume3D/viewport3D';
import WSIViewport from '../Viewports/WSI/WSIViewport';
import type { ViewportTypeConstants } from '../../types/ViewportTypeRegistry';
import type {
  ViewportInput,
  IViewport,
  InternalViewportInput,
  NormalizedViewportInput,
} from '../../types/IViewport';

/**
 * A viewport class that the rendering engine can drive: its viewports have
 * the public interface and the members that the engine reads and calls
 * without a check, `canvas` and `getUseCustomRenderingPipeline()`.
 */
interface ViewportConstructor {
  new (viewportInput: ViewportInput): IViewport & {
    readonly canvas: HTMLCanvasElement;
    getUseCustomRenderingPipeline(): boolean;
  };
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
    "ViewportType 'stack' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR (a planar viewport shows a stack or a volume)",
  orthographic:
    "ViewportType 'orthographic' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR with an orientation in defaultOptions, for example OrientationAxis.AXIAL (a planar viewport shows a stack or a volume)",
  perspective:
    "ViewportType 'perspective' was removed in Cornerstone3D 6.0: use ViewportType.VOLUME_3D with parallelProjection: false in defaultOptions",
  planarNext:
    "ViewportType 'planarNext' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR ('planar')",
  volume3dNext:
    "ViewportType 'volume3dNext' was removed in Cornerstone3D 6.0: use ViewportType.VOLUME_3D ('volume3d')",
  videoNext:
    "ViewportType 'videoNext' was removed in Cornerstone3D 6.0: use ViewportType.VIDEO ('video')",
  wholeSlideNext:
    "ViewportType 'wholeSlideNext' was removed in Cornerstone3D 6.0: use ViewportType.WHOLE_SLIDE ('wholeSlide')",
  ecgNext:
    "ViewportType 'ecgNext' was removed in Cornerstone3D 6.0: use ViewportType.ECG ('ecg')",
};

/**
 * Registers the viewport types of the library: the five viewports under
 * their plain strings (`'planar'`, `'volume3d'`, `'video'`, `'wholeSlide'`,
 * `'ecg'`).
 */
function registerCoreViewportTypes() {
  if (hasRegisteredCoreViewportTypes) {
    return;
  }
  hasRegisteredCoreViewportTypes = true;

  registerViewportType({
    type: ViewportType.PLANAR,
    ViewportClass: PlanarViewport,
  });
  registerViewportType({
    type: ViewportType.VOLUME_3D,
    ViewportClass: VolumeViewport3D,
  });
  registerViewportType({
    type: ViewportType.VIDEO,
    ViewportClass: VideoViewport,
  });
  registerViewportType({
    type: ViewportType.WHOLE_SLIDE,
    ViewportClass: WSIViewport as unknown as ViewportConstructor,
  });
  registerViewportType({
    type: ViewportType.ECG,
    ViewportClass: ECGViewport,
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

/**
 * Throws the message of a viewport type string that Cornerstone3D 6.0
 * removed (`'stack'`, `'orthographic'`, `'perspective'`, and the 5.x
 * strings `'planarNext'`, `'volume3dNext'`, `'videoNext'`,
 * `'wholeSlideNext'`, `'ecgNext'`), which names the type to use instead. A string that an application registered itself is
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
