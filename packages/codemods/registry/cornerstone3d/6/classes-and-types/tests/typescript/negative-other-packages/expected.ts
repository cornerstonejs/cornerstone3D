import type { Types } from '@cornerstonejs/tools';
import { StackViewport } from './viewports/StackViewport';
import { VolumeViewport as AppVolumeViewport } from '../app/viewports';

const tool: Types.IStackViewport | undefined = undefined;

function isStack(value: unknown): value is StackViewport {
  return value instanceof StackViewport || value instanceof AppVolumeViewport;
}

console.log(tool, isStack);
