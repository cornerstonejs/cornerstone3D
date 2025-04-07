import type { IGeometry, PublicMeshData } from '../../../types';
import { GeometryType, MeshType } from '../../../enums';
import { Mesh } from '../../../cache/classes/Mesh';
import { validateMesh } from './validateMesh';
import vtkMTLReader from '@kitware/vtk.js/IO/Misc/MTLReader';
import vtkTexture from '@kitware/vtk.js/Rendering/Core/Texture';

export function createMesh(
  geometryId: string,
  meshData: PublicMeshData
): Promise<IGeometry> {
  // validate the data to make sure it is a valid mesh
  validateMesh(meshData);

  const mesh = new Mesh({
    ...meshData,
  });

  const geometry: IGeometry = {
    id: geometryId,
    type: GeometryType.MESH,
    data: mesh,
    sizeInBytes: mesh.sizeInBytes,
  };

  switch (meshData.format) {
    case MeshType.PLY:
      if (meshData.materialUrl) {
        const img = new Image();
        return new Promise<IGeometry>((resolve, reject) => {
          img.onload = () => {
            try {
              const texture = vtkTexture.newInstance();
              texture.setInterpolate(true);
              texture.setImage(img);
              mesh.defaultActor.addTexture(texture);
              resolve(geometry);
            } catch (error) {
              reject(error);
            }
          };
          img.onerror = (error) => reject(error);
          img.src = meshData.materialUrl;
        });
      }
      return Promise.resolve(geometry);
    case MeshType.OBJ:
      if (meshData.materialUrl) {
        const reader = vtkMTLReader.newInstance();
        return reader
          .setUrl(meshData.materialUrl)
          .then(() => {
            for (let i = 0; i < mesh.actors.length; i++) {
              const actor = mesh.actors[i];
              const mapper = actor.getMapper();
              if (mapper) {
                const inputData = mapper.getInputData();
                if (inputData) {
                  const name = inputData.get('name').name;
                  reader.applyMaterialToActor(name, actor);
                }
              }
            }
            return geometry;
          })
          .catch((error) => {
            throw new Error(`Failed to load material: ${error}`);
          });
      }
      return Promise.resolve(geometry);
    case MeshType.STL:
    case MeshType.VTP:
      return Promise.resolve(geometry);
    default:
      return Promise.reject(
        new Error(`Unsupported format: ${meshData.format}`)
      );
  }
}
