import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import { GeometryType, ViewportType } from '../../../enums';
import type {
  IGeometry,
  IMesh,
  ISurface,
  Point2,
  Point3,
} from '../../../types';
import {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from '../../helpers/vtkCanvasCoordinateTransforms';
import type {
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type {
  Volume3DGeometryPayload,
  Volume3DGeometryRendering,
  Volume3DCamera,
  Volume3DDataPresentation,
  Volume3DViewportRenderContext,
  Volume3DVtkGeometryAdapterContext,
} from './3dViewportTypes';
import applyVolume3DCamera from './applyVolume3DCamera';

export class VtkGeometry3DRenderPath
  implements RenderPath<Volume3DVtkGeometryAdapterContext>
{
  async addData(
    ctx: Volume3DVtkGeometryAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<Volume3DDataPresentation>> {
    const payload: Volume3DGeometryPayload =
      data as unknown as LoadedData<Volume3DGeometryPayload>;
    const actors = createActorEntries(payload.geometry);
    const hadVisibleProps = hasVisibleProps(ctx);

    actors.forEach((actorEntry) => {
      ctx.vtk.renderer.addActor(actorEntry.actor as vtkActor);
    });

    if (!hadVisibleProps) {
      ctx.vtk.renderer.resetCamera();
    }

    ctx.vtk.renderer.resetCameraClippingRange();

    const rendering: Volume3DGeometryRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'vtkGeometry3d',
      actors,
      frameOfReferenceUID:
        payload.geometry.type === GeometryType.SURFACE
          ? (payload.geometry.data as ISurface).frameOfReferenceUID
          : undefined,
    };

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(ctx, camera);
      },
      canvasToWorld: (canvasPos) => {
        return this.canvasToWorld(ctx, canvasPos);
      },
      worldToCanvas: (worldPos) => {
        return this.worldToCanvas(ctx, worldPos);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      render: () => {
        this.render(ctx);
      },
      resize: () => {
        this.resize(ctx);
      },
      removeData: () => {
        this.removeData(ctx, rendering);
      },
    };
  }

  private updateDataPresentation(
    rendering: Volume3DGeometryRendering,
    props: unknown
  ): void {
    applyDataPresentation(
      rendering,
      props as Volume3DDataPresentation | undefined
    );
  }

  private updateCamera(
    ctx: Volume3DVtkGeometryAdapterContext,
    camera: unknown
  ): void {
    applyVolume3DCamera(ctx, camera as Partial<Volume3DCamera> | undefined, {
      resetClippingRange: true,
    });
  }

  private canvasToWorld(
    ctx: Volume3DVtkGeometryAdapterContext,
    canvasPos: Point2
  ): Point3 {
    return canvasToWorldContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      canvasPos,
    });
  }

  private worldToCanvas(
    ctx: Volume3DVtkGeometryAdapterContext,
    worldPos: Point3
  ): Point2 {
    return worldToCanvasContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      worldPos,
    });
  }

  private getFrameOfReferenceUID(
    rendering: Volume3DGeometryRendering
  ): string | undefined {
    return rendering.frameOfReferenceUID;
  }

  private render(ctx: Volume3DVtkGeometryAdapterContext): void {
    ctx.display.requestRender();
  }

  private resize(ctx: Volume3DVtkGeometryAdapterContext): void {
    ctx.display.requestRender();
  }

  private removeData(
    ctx: Volume3DVtkGeometryAdapterContext,
    rendering: Volume3DGeometryRendering
  ): void {
    rendering.actors.forEach((actorEntry) => {
      ctx.vtk.renderer.removeActor(actorEntry.actor as vtkActor);
    });
  }
}

export class VtkGeometry3DPath
  implements
    RenderPathDefinition<
      Volume3DViewportRenderContext,
      Volume3DVtkGeometryAdapterContext
    >
{
  readonly id = 'volume3d:vtk-geometry';
  readonly type = ViewportType.VOLUME_3D_V2;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'geometry' && options.renderMode === 'vtkGeometry3d';
  }

  createRenderPath() {
    return new VtkGeometry3DRenderPath();
  }

  selectContext(
    rootContext: Volume3DViewportRenderContext
  ): Volume3DVtkGeometryAdapterContext {
    return rootContext;
  }
}

function createActorEntries(geometry: IGeometry) {
  if (geometry.type === GeometryType.SURFACE) {
    const surface = geometry.data as ISurface;
    const polyData = vtkPolyData.newInstance();
    polyData.getPoints().setData(surface.points, 3);
    polyData.setPolys(
      vtkCellArray.newInstance({
        values: Float32Array.from(surface.polys),
      })
    );

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.setVisibility(surface.visible !== false);
    actor
      .getProperty()
      .setColor(
        surface.color[0] / 255,
        surface.color[1] / 255,
        surface.color[2] / 255
      );

    return [
      {
        actor,
        referencedId: geometry.id,
        uid: geometry.id,
      },
    ];
  }

  if (geometry.type === GeometryType.MESH) {
    const mesh = geometry.data as IMesh;

    return mesh.actors.map((sourceActor, index) => {
      return {
        actor: sourceActor,
        referencedId: geometry.id,
        uid: `${geometry.id}:${index}`,
      };
    });
  }

  throw new Error(
    `[VolumeViewport3DV2] Geometry type ${geometry.type} is not supported in 3D V2 rendering`
  );
}

function applyDataPresentation(
  rendering: Volume3DGeometryRendering,
  props?: Volume3DDataPresentation
): void {
  rendering.actors.forEach((actorEntry) => {
    const actor = actorEntry.actor as vtkActor;

    actor.setVisibility(props?.visible === false ? false : true);

    if (props?.opacity !== undefined) {
      actor.getProperty().setOpacity(props.opacity);
    }

    if (props?.color) {
      actor
        .getProperty()
        .setColor(
          props.color[0] / 255,
          props.color[1] / 255,
          props.color[2] / 255
        );
    }
  });
}

function hasVisibleProps(ctx: Volume3DVtkGeometryAdapterContext): boolean {
  const renderer = ctx.vtk.renderer as unknown as {
    getActors?: () => { length: number };
    getVolumes?: () => { length: number };
  };

  return Boolean(
    renderer.getActors?.().length || renderer.getVolumes?.().length
  );
}
