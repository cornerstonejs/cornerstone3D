import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
export class ImageVolume {
    constructor(props) {
        this.uid = props.uid;
        this.metadata = props.metadata;
        this.dimensions = props.dimensions;
        this.spacing = props.spacing;
        this.origin = props.origin;
        this.direction = props.direction;
        this.vtkImageData = props.vtkImageData;
        this.scalarData = props.scalarData;
        this.sizeInBytes = props.sizeInBytes;
        this.vtkOpenGLTexture = vtkStreamingOpenGLTexture.newInstance();
        this.numVoxels =
            this.dimensions[0] * this.dimensions[1] * this.dimensions[2];
        if (props.scaling) {
            this.scaling = props.scaling;
        }
    }
}
export default ImageVolume;
//# sourceMappingURL=ImageVolume.js.map