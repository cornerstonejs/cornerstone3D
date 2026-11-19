import type { IViewport, ViewportContentMode } from './IViewport';

/**
 * The interface of a viewport under its 5.x name.
 *
 * @deprecated Use `Types.IViewport`, which is the same interface in 6.0.
 */
type IGenericViewport<
  TViewState extends object = object,
  TDataPresentation = unknown,
> = IViewport<TViewState, TDataPresentation>;

export type { ViewportContentMode };
export type { IGenericViewport as default };
