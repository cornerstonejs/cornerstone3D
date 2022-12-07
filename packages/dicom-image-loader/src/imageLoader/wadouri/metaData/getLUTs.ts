import { DataSet, Element } from 'dicom-parser';

export interface CornerstoneWadoLoaderLut {
  id: string;
  firstValueMapped: number;
  numBitsPerEntry: number;
  lut: number[];
}

function getLUT(
  pixelRepresentation: number,
  lutDataSet: DataSet
): CornerstoneWadoLoaderLut {
  let numLUTEntries = lutDataSet.uint16('x00283002', 0);

  if (numLUTEntries === 0) {
    numLUTEntries = 65535;
  }
  let firstValueMapped = 0;

  if (pixelRepresentation === 0) {
    firstValueMapped = lutDataSet.uint16('x00283002', 1);
  } else {
    firstValueMapped = lutDataSet.int16('x00283002', 1);
  }
  const numBitsPerEntry = lutDataSet.uint16('x00283002', 2);
  // console.log('LUT(', numLUTEntries, ',', firstValueMapped, ',', numBitsPerEntry, ')');
  const lut = {
    id: '1',
    firstValueMapped,
    numBitsPerEntry,
    lut: [],
  };

  // console.log("minValue=", minValue, "; maxValue=", maxValue);
  for (let i = 0; i < numLUTEntries; i++) {
    if (pixelRepresentation === 0) {
      lut.lut[i] = lutDataSet.uint16('x00283006', i);
    } else {
      lut.lut[i] = lutDataSet.int16('x00283006', i);
    }
  }

  return lut;
}

function getLUTs(
  pixelRepresentation: number,
  lutSequence: Element
): CornerstoneWadoLoaderLut[] {
  if (!lutSequence || !lutSequence.items || !lutSequence.items.length) {
    return;
  }
  const luts: CornerstoneWadoLoaderLut[] = [];

  for (let i = 0; i < lutSequence.items.length; i++) {
    const lutDataSet = lutSequence.items[i].dataSet;
    const lut = getLUT(pixelRepresentation, lutDataSet);

    if (lut) {
      luts.push(lut);
    }
  }

  return luts;
}

export default getLUTs;
