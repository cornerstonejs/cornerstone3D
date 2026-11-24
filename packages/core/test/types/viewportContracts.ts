/**
 * What the compiler must accept and refuse at the edges of the viewport
 * contract. This file is compiled and never run: the test
 * `nextViewportTypes.jest.js` runs the compiler on it and expects no error,
 * so each `@ts-expect-error` here must meet an error.
 */
import { registerViewportType } from '../../src';
import type { Types } from '../../src';

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
