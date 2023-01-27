import {data} from 'dcmjs';

const {Colors, BitArray} = data;

// TODO: Is there a better name for this? RGBAInt?
// Should we move it to Colors.js
function dicomlab2RGBA(cielab) {
    const rgba = Colors.dicomlab2RGB(cielab).map(x => Math.round(x * 255));
    rgba.push(255);

    return rgba;
}

// TODO: Copied these functions in from VTK Math so we don't need a dependency.
// I guess we should put them somewhere
// https://github.com/Kitware/vtk-js/blob/master/Sources/Common/Core/Math/index.js
function cross(x, y, out) {
    const Zx = x[1] * y[2] - x[2] * y[1];
    const Zy = x[2] * y[0] - x[0] * y[2];
    const Zz = x[0] * y[1] - x[1] * y[0];
    out[0] = Zx;
    out[1] = Zy;
    out[2] = Zz;
}

function norm(x, n = 3) {
    switch (n) {
        case 1:
            return Math.abs(x);
        case 2:
            return Math.sqrt(x[0] * x[0] + x[1] * x[1]);
        case 3:
            return Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]);
        default: {
            let sum = 0;
            for (let i = 0; i < n; i++) {
                sum += x[i] * x[i];
            }
            return Math.sqrt(sum);
        }
    }
}

function normalize(x) {
    const den = norm(x);
    if (den !== 0.0) {
        x[0] /= den;
        x[1] /= den;
        x[2] /= den;
    }
    return den;
}

function subtract(a, b, out) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
}

// TODO: This is a useful utility on its own. We should move it somewhere?
// dcmjs.adapters.vtk.Multiframe? dcmjs.utils?
function geometryFromFunctionalGroups(dataset, PerFrameFunctionalGroups) {
    const geometry = {};
    const pixelMeasures =
        dataset.SharedFunctionalGroupsSequence.PixelMeasuresSequence;
    const planeOrientation =
        dataset.SharedFunctionalGroupsSequence.PlaneOrientationSequence;

    // Find the origin of the volume from the PerFrameFunctionalGroups' ImagePositionPatient values
    //
    // TODO: assumes sorted frames. This should read the ImagePositionPatient from each frame and
    // sort them to obtain the first and last position along the acquisition axis.
    const firstFunctionalGroup = PerFrameFunctionalGroups[0];
    const lastFunctionalGroup =
        PerFrameFunctionalGroups[PerFrameFunctionalGroups.length - 1];
    const firstPosition =
        firstFunctionalGroup.PlanePositionSequence.ImagePositionPatient.map(
            Number
        );
    const lastPosition =
        lastFunctionalGroup.PlanePositionSequence.ImagePositionPatient.map(
            Number
        );

    geometry.origin = firstPosition;

    // NB: DICOM PixelSpacing is defined as Row then Column,
    // unlike ImageOrientationPatient
    geometry.spacing = [
        pixelMeasures.PixelSpacing[1],
        pixelMeasures.PixelSpacing[0],
        pixelMeasures.SpacingBetweenSlices
    ].map(Number);

    geometry.dimensions = [
        dataset.Columns,
        dataset.Rows,
        PerFrameFunctionalGroups.length
    ].map(Number);

    const orientation = planeOrientation.ImageOrientationPatient.map(Number);
    const columnStepToPatient = orientation.slice(0, 3);
    const rowStepToPatient = orientation.slice(3, 6);

    geometry.planeNormal = [];

    cross(columnStepToPatient, rowStepToPatient, geometry.planeNormal);

    geometry.sliceStep = [];
    subtract(lastPosition, firstPosition, geometry.sliceStep);
    normalize(geometry.sliceStep);
    geometry.direction = columnStepToPatient
        .concat(rowStepToPatient)
        .concat(geometry.sliceStep);

    return geometry;
}

export default class Segmentation {
    constructor() {}

    /**
     * Produces an array of Segments from an input DICOM Segmentation dataset
     *
     * Segments are returned with Geometry values that can be used to create
     * VTK Image Data objects.
     *
     * @example Example usage to create VTK Volume actors from each segment:
     *
     * const actors = [];
     * const segments = generateToolState(dataset);
     * segments.forEach(segment => {
     *   // now make actors using the segment information
     *   const scalarArray = vtk.Common.Core.vtkDataArray.newInstance({
     *        name: "Scalars",
     *        numberOfComponents: 1,
     *        values: segment.pixelData,
     *    });
     *
     *    const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
     *    imageData.getPointData().setScalars(scalarArray);
     *    imageData.setDimensions(geometry.dimensions);
     *    imageData.setSpacing(geometry.spacing);
     *    imageData.setOrigin(geometry.origin);
     *    imageData.setDirection(geometry.direction);
     *
     *    const mapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
     *    mapper.setInputData(imageData);
     *    mapper.setSampleDistance(2.);
     *
     *    const actor = vtk.Rendering.Core.vtkVolume.newInstance();
     *    actor.setMapper(mapper);
     *
     *    actors.push(actor);
     * });
     *
     * @param dataset
     * @return {{}}
     */
    static generateSegments(dataset) {
        if (dataset.SegmentSequence.constructor.name !== "Array") {
            dataset.SegmentSequence = [dataset.SegmentSequence];
        }

        dataset.SegmentSequence.forEach(segment => {
            // TODO: other interesting fields could be extracted from the segment
            // TODO: Read SegmentsOverlay field
            // http://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.20.2.html

            // TODO: Looks like vtkColor only wants RGB in 0-1 values.
            // Why was this example converting to RGBA with 0-255 values?
            const color = dicomlab2RGBA(segment.RecommendedDisplayCIELabValue);

            segments[segment.SegmentNumber] = {
                color,
                functionalGroups: [],
                offset: null,
                size: null,
                pixelData: null
            };
        });

        // make a list of functional groups per segment
        dataset.PerFrameFunctionalGroupsSequence.forEach(functionalGroup => {
            const segmentNumber =
                functionalGroup.SegmentIdentificationSequence
                    .ReferencedSegmentNumber;

            segments[segmentNumber].functionalGroups.push(functionalGroup);
        });

        // determine per-segment index into the pixel data
        // TODO: only handles one-bit-per pixel
        const frameSize = Math.ceil((dataset.Rows * dataset.Columns) / 8);
        let nextOffset = 0;

        Object.keys(segments).forEach(segmentNumber => {
            const segment = segments[segmentNumber];

            segment.numberOfFrames = segment.functionalGroups.length;
            segment.size = segment.numberOfFrames * frameSize;
            segment.offset = nextOffset;

            nextOffset = segment.offset + segment.size;

            const packedSegment = dataset.PixelData.slice(
                segment.offset,
                nextOffset
            );

            segment.pixelData = BitArray.unpack(packedSegment);

            const geometry = geometryFromFunctionalGroups(
                dataset,
                segment.functionalGroups
            );

            segment.geometry = geometry;
        });

        return segments;
    }
}
