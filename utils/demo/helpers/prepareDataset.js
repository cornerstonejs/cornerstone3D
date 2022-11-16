import dcmjs from 'dcmjs';
const { DicomMetaDictionary } = dcmjs.data;


/**
 * Should be used whenever you have imageIds referring to multiframe data.
 * It uses dcmjs library to normalize metadata from different multiframe sopclassuids
 * some of them did not have the dicom tags 52009229 (SharedFunctionalGroupsSequence)
 * and 52009230 (PerFrameFunctionalGroupsSequence). It returns the metadata normalized,
 * if it was a multiframe metadata or the input metadata untouched.
 *
 * @returns metadata information with normalized multiframe dicom tags 52009229, 52009230, if possible
 */

 export default function prepareDataset(instanceMetaData)
 {
   if (instanceMetaData['00280008'])
   {
     let instance = DicomMetaDictionary.naturalizeDataset(instanceMetaData);
     const normalizedInstance = dcmjs.normalizers.Normalizer.normalizeToDataset([instance]);
     if (normalizedInstance)
        instance = normalizedInstance;

     let perFrame = undefined;
     if (instance.PerFrameFunctionalGroupsSequence)
     {
        perFrame = instance.PerFrameFunctionalGroupsSequence.map(
            (frameInfo) =>
            {
                return DicomMetaDictionary.denaturalizeDataset(frameInfo);
            }
      )
     }

     let shared = undefined;
     if (instance.SharedFunctionalGroupsSequence)
     {
        shared = instance.SharedFunctionalGroupsSequence.map(
            (sharedInfo) =>
            {
                return DicomMetaDictionary.denaturalizeDataset(sharedInfo);
            }
      )

     }
      
     const metadata = instanceMetaData;
     if (perFrame)
        metadata['52009230'] = perFrame;

     if (shared)
        metadata['52009229'] = shared;

     if (instance.NumberOfFrames)
        metadata['00280008'] = instance.NumberOfFrames;
     return metadata;
   }
   return instanceMetaData;
 }
