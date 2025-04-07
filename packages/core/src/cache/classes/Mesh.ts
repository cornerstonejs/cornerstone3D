import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPLYReader from '@kitware/vtk.js/IO/Geometry/PLYReader';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';
import vtkOBJReader from '@kitware/vtk.js/IO/Misc/OBJReader';
import vtkProperty from '@kitware/vtk.js/Rendering/Core/Property';
import vtkPolyDataNormals from '@kitware/vtk.js/Filters/Core/PolyDataNormals';

import type { MeshData, RGB } from '../../types';
import { MeshType } from '../../enums';

type MeshProps = MeshData;

/**
 * Mesh class for storing mesh data
 * Each Mesh represents a single actor a 3D mesh.
 */
export class Mesh {
  readonly id: string;
  readonly sizeInBytes: number;
  private _color: RGB = [255, 255, 255];
  private _actors: vtkActor[] = [];
  private _format: string;

  /**
   * Creates an instance of Mesh.
   * @param {MeshProps} props - The properties to initialize the Mesh with.
   */
  constructor(props: MeshProps) {
    this.id = props.id;
    this._color = props.color ?? this._color;
    this._format = props.format;

    const textDecoder = new TextDecoder();
    const normals = vtkPolyDataNormals.newInstance();

    const createActorWithMapper = (mapper: vtkMapper) => {
      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      const property = vtkProperty.newInstance();
      property.setColor(
        this._color[0] / 255,
        this._color[1] / 255,
        this._color[2] / 255
      );
      actor.setProperty(property);
      return actor;
    };

    if (this._format === MeshType.PLY) {
      const mapper = vtkMapper.newInstance();
      const reader = vtkPLYReader.newInstance();
      reader.parseAsArrayBuffer(props.arrayBuffer);
      mapper.setInputConnection(reader.getOutputPort());
      this._actors.push(createActorWithMapper(mapper));
    } else if (this._format === MeshType.STL) {
      const mapper = vtkMapper.newInstance();
      const reader = vtkSTLReader.newInstance();
      reader.parseAsArrayBuffer(props.arrayBuffer);
      normals.setInputConnection(reader.getOutputPort());
      mapper.setInputConnection(normals.getOutputPort());
      this._actors.push(createActorWithMapper(mapper));
    } else if (this._format === MeshType.OBJ) {
      const reader = vtkOBJReader.newInstance({
        splitMode: props.materialUrl ? 'usemtl' : null,
      });
      reader.parseAsText(textDecoder.decode(props.arrayBuffer));
      const size = reader.getNumberOfOutputPorts();
      for (let i = 0; i < size; i++) {
        const source = reader.getOutputData(i);
        const mapper = vtkMapper.newInstance();
        mapper.setInputData(source);
        this._actors.push(createActorWithMapper(mapper));
      }
    } else if (this._format === MeshType.VTP) {
      const mapper = vtkMapper.newInstance();
      const reader = vtkXMLPolyDataReader.newInstance();
      reader.parseAsArrayBuffer(props.arrayBuffer);
      mapper.setInputConnection(reader.getOutputPort());
      this._actors.push(createActorWithMapper(mapper));
    }

    this.sizeInBytes = this._getSizeInBytes();
  }

  /**
   * Calculates the size of the surface in bytes.
   * @returns {number} The size of the surface in bytes.
   * @private
   */
  private _getSizeInBytes(): number {
    let size = 0;
    for (let i = 0; i < this._actors.length; i++) {
      const actor = this._actors[i];
      const mapper = actor.getMapper();
      const pd = mapper.getInputData();
      const points = pd.getPoints();
      const polys = pd.getPolys();
      const pointsLength = points.getData().length;
      const polysLength = polys.getData().length;
      size += pointsLength * 4 + polysLength * 4;
    }
    return size;
  }

  /**
   * Gets the default actor of the mesh.
   * @returns {vtkActor} The points of the surface.
   */
  get defaultActor(): vtkActor {
    return this._actors[0];
  }

  /**
   * Gets the actors of the mesh.
   * @returns {vtkActor[]} The actors of the mesh.
   */
  get actors(): vtkActor[] {
    return this._actors;
  }

  /**
   * Gets the color of the mesh.
   * @returns {RGB} The color of the mesh.
   */
  get color(): RGB {
    return this._color;
  }

  get format(): string {
    return this._format;
  }
}
