import { type Types } from "@cornerstonejs/core";

type Point3 = Types.Point3;

export interface Contour {
    type?:
        | "POINT"
        | "OPEN_PLANAR"
        | "OPEN_NONPLANAR"
        | "CLOSED_PLANAR"
        | "CLOSED_PLANAR_XOR";
    contourPoints?: number[];
}

export interface SliceContour {
    referencedImageId: string;
    polyData: {
        points: Point3[];
    };
    contours: Contour[];
}

export interface ContourSet {
    sliceContours: SliceContour[];
    label?: string;
    color?: number[];
    metadata: {
        referencedImageId: string;
        FrameOfReferenceUID: string;
    };
}
/*
{
  "segmentationId": "aafc6816-f385-4e8a-808f-ec914e757302",
  "label": "Segmentation 1",
  "cachedStats": {
    "info": "S1: trufi_singleshot_LOC 3 PLANES"
  },
  "segments": {
    "1": {
      "segmentIndex": 1,
      "label": "Segment 1",
      "locked": false,
      "cachedStats": {},
      "active": true,
      "color": [
        221,
        84,
        84,
        255
      ]
    }
  },

  "representationData": {
    "Contour": {
      "imageIds": [
        "derived:afdf57b3-92c5-498e-abb2-c5ad80ed76e2",
        "derived:b66f7dbb-eb2d-45c2-9b1c-281d5a880b6a",
        "derived:348cd2f0-78e9-4bc0-a4b3-05017f0efefb",
        "derived:4e96a2eb-46ef-485f-8ae6-6f5abb630099",
        "derived:5049b9cd-7dda-4bbc-ad0f-b61bb938c3f6",
        "derived:85ba7bfa-cd1f-4c8b-8ef4-202561afd5da"
      ],
      "referencedImageIds": [
        "wadors:http://localhost:5000/dicomweb/studies/2.16.124.113643.100.10.2.97089913110630123934763297639331145050/series/2.16.124.113643.100.10.2.155856277268220698066534013894957100163/instances/2.16.124.113643.100.10.2.279768069063306903906870352051231763935/frames/1",
        "wadors:http://localhost:5000/dicomweb/studies/2.16.124.113643.100.10.2.97089913110630123934763297639331145050/series/2.16.124.113643.100.10.2.155856277268220698066534013894957100163/instances/2.16.124.113643.100.10.2.279768069063306903906870352051231763935/frames/2",
        "wadors:http://localhost:5000/dicomweb/studies/2.16.124.113643.100.10.2.97089913110630123934763297639331145050/series/2.16.124.113643.100.10.2.155856277268220698066534013894957100163/instances/2.16.124.113643.100.10.2.279768069063306903906870352051231763935/frames/3",
        "wadors:http://localhost:5000/dicomweb/studies/2.16.124.113643.100.10.2.97089913110630123934763297639331145050/series/2.16.124.113643.100.10.2.155856277268220698066534013894957100163/instances/2.16.124.113643.100.10.2.279768069063306903906870352051231763935/frames/4",
        "wadors:http://localhost:5000/dicomweb/studies/2.16.124.113643.100.10.2.97089913110630123934763297639331145050/series/2.16.124.113643.100.10.2.155856277268220698066534013894957100163/instances/2.16.124.113643.100.10.2.279768069063306903906870352051231763935/frames/5",
        "wadors:http://localhost:5000/dicomweb/studies/2.16.124.113643.100.10.2.97089913110630123934763297639331145050/series/2.16.124.113643.100.10.2.155856277268220698066534013894957100163/instances/2.16.124.113643.100.10.2.279768069063306903906870352051231763935/frames/6"
      ],
      "geometryIds": [],
      "annotationUIDsMap": {
        1: "798f59a6-bfc7-47a0-8f44-b0e57d74a3ac",
      }
    }
  }
}


*/
