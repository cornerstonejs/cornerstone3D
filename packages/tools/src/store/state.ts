import _cloneDeep from 'lodash.clonedeep';

import { IToolGroup, IToolClassReference } from '../types';
import Synchronizer from './SynchronizerManager/Synchronizer';
import svgNodeCache, { resetSvgNodeCache } from './svgNodeCache';

interface ICornerstoneTools3dState {
  isInteractingWithTool: boolean;
  isMultiPartToolActive: boolean;
  tools: Record<
    string,
    {
      toolClass: IToolClassReference;
    }
  >;
  toolGroups: Array<IToolGroup>;
  synchronizers: Array<Synchronizer>;
  svgNodeCache: Record<string, unknown>;
  enabledElements: Array<unknown>;
  handleRadius: number;
}

const defaultState: ICornerstoneTools3dState = {
  isInteractingWithTool: false,
  isMultiPartToolActive: false,
  tools: {},
  toolGroups: [],
  synchronizers: [],
  svgNodeCache: svgNodeCache,
  // Should this be named... canvases?
  enabledElements: [], // switch to Uids?
  handleRadius: 6,
};

let state: ICornerstoneTools3dState = {
  isInteractingWithTool: false,
  isMultiPartToolActive: false,
  tools: {},
  toolGroups: [],
  synchronizers: [],
  svgNodeCache: svgNodeCache,
  // Should this be named... canvases?
  enabledElements: [], // switch to Uids?
  handleRadius: 6,
};

function resetCornerstoneToolsState(): void {
  resetSvgNodeCache();
  state = _cloneDeep(defaultState);
}

export {
  ICornerstoneTools3dState,
  resetCornerstoneToolsState,
  state,
  state as default,
};
