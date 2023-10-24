import type { ColorBarProps } from './ColorBarProps';

export type ViewportColorBarProps = ColorBarProps & {
  element: HTMLDivElement;
  volumeId?: string;
};
