import type { DataSet, Element } from 'dicom-parser';
import type { LutType } from '../../../types';

function getLUT(pixelRepresentation: number, lutDataSet: DataSet): LutType {
  let numLUTEntries = lutDataSet.uint16('x00283002', 0);

  // Value 1 of LUT Descriptor is a US, which cannot hold 65536, so 0 means
  // 65536 entries (PS3.3 C.11.1.1). Reading it as 65535 dropped the last entry
  // of every full size LUT.
  if (numLUTEntries === 0) {
    numLUTEntries = 65536;
  }
  let firstValueMapped = 0;

  // Only value 2, First Value Mapped, is interpreted with the pixel
  // representation: it lives in the same space as the pixel data it maps.
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

  // The descriptor cannot be trusted beyond the data actually received - a
  // short LUT Data would otherwise fill the tail of the table with undefined
  const lutDataElement = lutDataSet.elements.x00283006;

  if (lutDataElement) {
    numLUTEntries = Math.min(
      numLUTEntries,
      Math.floor(lutDataElement.length / 2)
    );
  }

  // LUT Data is always unsigned, whatever the pixel representation says: it
  // holds output values, not pixel values. Reading it as int16 turned every
  // entry above 32767 negative, which also broke the "largest entry decides the
  // bit depth" heuristic the renderers use.
  for (let i = 0; i < numLUTEntries; i++) {
    lut.lut[i] = lutDataSet.uint16('x00283006', i);
  }

  return lut;
}

function getLUTs(pixelRepresentation: number, lutSequence: Element): LutType[] {
  if (!lutSequence || !lutSequence.items || !lutSequence.items.length) {
    return;
  }
  const luts: LutType[] = [];

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
