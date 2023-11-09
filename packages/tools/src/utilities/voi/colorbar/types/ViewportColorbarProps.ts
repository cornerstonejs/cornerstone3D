import type { ColorbarProps } from './ColorbarProps';

export type ViewportColorbarProps = ColorbarProps & {
  element: HTMLDivElement;
  volumeId?: string;
};
