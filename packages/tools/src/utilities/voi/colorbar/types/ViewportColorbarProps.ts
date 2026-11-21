import type { ColorbarProps } from './ColorbarProps';

export type ViewportColorbarProps = ColorbarProps & {
  element: HTMLDivElement;
  /**
   * The data of the colorbar on the viewport: the id of its volume, or the id
   * of the display set that shows the volume.
   */
  volumeId?: string;
};
