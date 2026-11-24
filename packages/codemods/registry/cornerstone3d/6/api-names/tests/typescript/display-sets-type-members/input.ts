import { Types as CoreTypes } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

/** The viewport as the adapter of the application sees it. */
type NativeViewport = CoreTypes.IViewport & {
  getSourceDataId?: () => string | undefined;
  removeData?(displaySetId: string): void;
  getActiveDataId?(): string | undefined;
  setDisplaySetPresentation?: (displaySetId: string, props: object) => void;
};

/** A saved view reference of the application. */
interface SavedReference extends Types.ViewReference {
  dataId?: string;
  savedAt: number;
}

/** An object of the application alone: its names stay unreported. */
type Shape = { dataId: string; getSourceDataId(): string };

export async function capture(target: CoreTypes.IViewport, shape: Shape) {
  const targetViewport = target as NativeViewport;
  const saved: SavedReference = { savedAt: Date.now() };

  return [targetViewport.getSourceDataId?.(), saved, shape.dataId];
}
