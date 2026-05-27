import type { Types } from '@cornerstonejs/core';
import type { LabelmapSegmentationData } from '../../../../types/LabelmapTypes';
import type { LabelmapRepresentation } from '../../../../types/SegmentationStateTypes';
import type { ViewportLabelmapRenderMode } from '../../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';

type LabelmapRenderPlanKind =
  | 'legacy-volume'
  | 'legacy-stack-image'
  | 'volume-slice-image-mapper'
  | 'unsupported';

type LabelmapRenderPlanRepresentation = Pick<
  LabelmapRepresentation,
  'segmentationId' | 'config'
>;

type LabelmapRenderPlanMountResult = void | { uid: string; actor };

type LabelmapRenderPlanReconcileArgs = {
  actorEntries?: Types.ActorEntry[];
  labelMapData: LabelmapSegmentationData;
};

type LabelmapRenderPlanMountArgs = {
  labelMapData: LabelmapSegmentationData;
};

type LabelmapRenderPlanUpdateArgs = {
  actorEntries?: Types.ActorEntry[];
};

type LabelmapRenderPlan = {
  kind: LabelmapRenderPlanKind;
  renderMode: ViewportLabelmapRenderMode;
  useSliceRendering: boolean;
  isVolumeImageMapper: boolean;
  unsupportedStateKey?: string;
  getExpectedRepresentationUIDs: () => string[];
  mount: (
    args: LabelmapRenderPlanMountArgs
  ) => Promise<LabelmapRenderPlanMountResult>;
  needsRemount: (actorEntries?: Types.ActorEntry[]) => boolean;
  reconcile: (
    args: LabelmapRenderPlanReconcileArgs
  ) => Promise<Types.ActorEntry[] | undefined>;
  remove: () => void;
  update: (args: LabelmapRenderPlanUpdateArgs) => void;
};

type CreateLabelmapRenderPlanArgs = {
  isVolumeImageMapper: boolean;
  kind: LabelmapRenderPlanKind;
  renderMode: ViewportLabelmapRenderMode;
  segmentationId: string;
  unsupportedStateKey?: string;
  updateAfterMount?: boolean;
  useSliceRendering: boolean;
  viewport: Types.IViewport;
  canRenderCurrentViewport?: () => boolean;
  getExpectedRepresentationUIDs?: () => string[];
  mount?: (
    args: LabelmapRenderPlanMountArgs
  ) => Promise<LabelmapRenderPlanMountResult>;
  update?: (args: LabelmapRenderPlanUpdateArgs) => void;
};

export type {
  CreateLabelmapRenderPlanArgs,
  LabelmapRenderPlan,
  LabelmapRenderPlanKind,
  LabelmapRenderPlanMountArgs,
  LabelmapRenderPlanMountResult,
  LabelmapRenderPlanRepresentation,
  LabelmapRenderPlanReconcileArgs,
  LabelmapRenderPlanUpdateArgs,
};
