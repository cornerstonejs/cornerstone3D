/**
 * What the compiler must accept and refuse at the edges of the viewport
 * contract. This file is compiled and never run: the test
 * `nextViewportTypes.jest.js` runs the compiler on it and expects no error,
 * so each `@ts-expect-error` here must meet an error.
 */
import { registerViewportType } from '../../src';
import type {
  PlanarDisplaySetAppearance,
  PlanarViewport,
  Types,
  VolumeViewport3D,
} from '../../src';

declare const viewport: Types.IViewport;

/** A viewport class with only the public interface of a viewport. */
declare const PublicInterfaceViewport: new (
  viewportInput: Types.ViewportInput
) => Types.IViewport;

/** A viewport class with the members that the rendering engine calls too. */
declare const EngineReadyViewport: new (
  viewportInput: Types.ViewportInput
) => Types.IViewport & {
  readonly canvas: HTMLCanvasElement;
  getUseCustomRenderingPipeline(): boolean;
};

registerViewportType({
  type: 'contractEngineReady',
  ViewportClass: EngineReadyViewport,
});

registerViewportType({
  type: 'contractPublicInterface',
  // @ts-expect-error The rendering engine reads `canvas` and calls `getUseCustomRenderingPipeline()`.
  ViewportClass: PublicInterfaceViewport,
});

declare const planarViewport: PlanarViewport;
declare const viewport3D: VolumeViewport3D;

/**
 * One opacity: the appearance has `opacity`, its colormap `opacityMapping`
 * and `threshold`, and a colormap has no `opacity` any more.
 */
const fusionMapping = [
  { value: 0, opacity: 0 },
  { value: 5, opacity: 0.9 },
] as const;

planarViewport.setDisplaySetAppearance('pt', {
  opacity: 0.5,
  colormap: { name: 'hsv', opacityMapping: fusionMapping, threshold: null },
});
viewport3D.setDisplaySetAppearance('ct', {
  opacity: 0.5,
  colormap: { opacityMapping: fusionMapping, threshold: 100 },
});

const planarAppearance: PlanarDisplaySetAppearance = {
  // @ts-expect-error A number in `colormap.opacity` is the `opacity` of the appearance.
  colormap: { name: 'hsv', opacity: 0.5 },
};

const appearanceColormap: Types.AppearanceColormap = {
  name: 'hsv',
  // @ts-expect-error A list in `colormap.opacity` is `colormap.opacityMapping`.
  opacity: [{ value: 0, opacity: 0 }],
};

planarViewport.setDisplaySetAppearance('pt', {
  // @ts-expect-error `colormap.opacity` is gone on a planar viewport.
  colormap: { opacity: 0.5 },
});
viewport3D.setDisplaySetAppearance('ct', {
  // @ts-expect-error `colormap.opacity` is gone on a 3D viewport.
  colormap: { opacity: 0.5 },
});

export { planarAppearance, appearanceColormap };
