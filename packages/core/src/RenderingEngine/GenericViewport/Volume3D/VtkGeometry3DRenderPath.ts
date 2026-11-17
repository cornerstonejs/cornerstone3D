import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import { GeometryType, ViewportType } from '../../../enums';
import uuidv4 from '../../../utilities/uuidv4';
import type {
  ActorEntry,
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
} from './viewport3DTypes';
import applyVolume3DCamera from './applyVolume3DCamera';

/** @internal */
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
    const actors = createActorEntries(payload);
    const hadVisibleProps = hasVisibleProps(ctx);

    actors.forEach((actorEntry) => {
      ctx.vtk.renderer.addActor(actorEntry.actor as vtkActor);
    });

    if (!hadVisibleProps) {
      ctx.vtk.renderer.resetCamera();
    }

    ctx.vtk.renderer.resetCameraClippingRange();

    const surface = getSurface(payload.geometry);
    const rendering: Volume3DGeometryRendering = {
      renderMode: 'vtkGeometry3d',
      actors,
      frameOfReferenceUID: surface?.frameOfReferenceUID,
      shownSurface: surface && {
        points: surface.points,
        polys: surface.polys,
      },
    };

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      applyViewState: (camera) => {
        this.applyViewState(ctx, camera);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      render: () => {
        this.render(ctx, rendering, payload.geometry);
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

  private applyViewState(
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

  /**
   * Asks for a render. A surface is drawn as it is in its geometry now: when
   * its points or its polys are other arrays than at the last render, the
   * actor gets new poly data first, and keeps its place in the scene.
   */
  private render(
    ctx: Volume3DVtkGeometryAdapterContext,
    rendering: Volume3DGeometryRendering,
    geometry: IGeometry
  ): void {
    const surface = getSurface(geometry);
    const { shownSurface } = rendering;

    if (
      surface &&
      shownSurface &&
      (shownSurface.points !== surface.points ||
        shownSurface.polys !== surface.polys)
    ) {
      (rendering.actors[0].actor as vtkActor)
        .getMapper()
        .setInputData(createSurfacePolyData(surface));
      rendering.shownSurface = {
        points: surface.points,
        polys: surface.polys,
      };
      ctx.vtk.renderer.resetCameraClippingRange();
    }

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

/** @internal */
export class VtkGeometry3DPath
  implements
    RenderPathDefinition<
      Volume3DViewportRenderContext,
      Volume3DVtkGeometryAdapterContext
    >
{
  readonly id = 'volume3d:vtk-geometry';
  readonly type = ViewportType.VOLUME_3D_NEXT;

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

/** The surface of a geometry, when the geometry is a surface. */
function getSurface(geometry: IGeometry): ISurface | undefined {
  return geometry.type === GeometryType.SURFACE
    ? (geometry.data as ISurface)
    : undefined;
}

/** The poly data of the points and the polys of a surface. */
function createSurfacePolyData(surface: ISurface): vtkPolyData {
  const polyData = vtkPolyData.newInstance();

  polyData.getPoints().setData(surface.points, 3);
  polyData.setPolys(
    vtkCellArray.newInstance({
      values: Uint32Array.from(surface.polys),
    })
  );

  return polyData;
}

/**
 * The actor entries of a geometry: one actor for a surface, the actors of a
 * mesh. Each names the geometry as its `referencedId`, and carries the
 * representation UID when the geometry shows a segmentation representation.
 */
function createActorEntries(payload: Volume3DGeometryPayload): ActorEntry[] {
  const { geometry, reference } = payload;
  const surface = getSurface(geometry);
  const representation =
    reference?.kind === 'segmentation' && reference.representationUID
      ? { representationUID: reference.representationUID }
      : {};

  if (surface) {
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(createSurfacePolyData(surface));

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
        uid: uuidv4(),
        ...representation,
      },
    ];
  }

  if (geometry.type === GeometryType.MESH) {
    const mesh = geometry.data as IMesh;

    return mesh.actors.map((sourceActor, index) => {
      return {
        actor: sourceActor,
        referencedId: geometry.id,
        uid: uuidv4(),
        ...representation,
      };
    });
  }

  throw new Error(
    `[VolumeViewport3D] Geometry type ${geometry.type} is not supported in 3D Next rendering`
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
