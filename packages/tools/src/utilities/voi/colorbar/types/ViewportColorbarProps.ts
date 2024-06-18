import type { ColorbarProps } from './ColorbarProps.js';

export type ViewportColorbarProps = ColorbarProps & {
  element: HTMLDivElement;
  volumeId?: string;
};
