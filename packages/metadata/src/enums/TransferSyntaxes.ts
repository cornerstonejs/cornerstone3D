import { constants } from 'dcmjs';

/**
 * DICOM Transfer Syntax UIDs, keyed by name.
 *
 * Declared as a string-valued constant object (not a TypeScript `enum`) so each
 * UID stays a plain `string` that is freely assignable to and comparable with
 * the string UIDs flowing through dcmjs datasets and the metadata providers.
 *
 * UIDs that dcmjs already exposes as named constants are referenced from
 * `dcmjs.constants` rather than re-typing the literal here. dcmjs does not
 * export a named constant for RLE Lossless, so it is declared directly.
 */
export const TransferSyntaxes = {
  // Uncompressed / native
  IMPLICIT_VR_LITTLE_ENDIAN: constants.IMPLICIT_LITTLE_ENDIAN,
  EXPLICIT_VR_LITTLE_ENDIAN: constants.EXPLICIT_LITTLE_ENDIAN,
  DEFLATED_EXPLICIT_VR_LITTLE_ENDIAN: constants.DEFLATED_EXPLICIT_LITTLE_ENDIAN,
  EXPLICIT_VR_BIG_ENDIAN: constants.EXPLICIT_BIG_ENDIAN,

  // Run Length Encoding
  RLE_LOSSLESS: '1.2.840.10008.1.2.5',

  // MPEG-2
  MPEG2_MAIN_PROFILE_MAIN_LEVEL: '1.2.840.10008.1.2.4.100',
  MPEG2_MAIN_PROFILE_MAIN_LEVEL_FRAGMENTABLE: '1.2.840.10008.1.2.4.100.1',
  MPEG2_MAIN_PROFILE_HIGH_LEVEL: '1.2.840.10008.1.2.4.101',
  MPEG2_MAIN_PROFILE_HIGH_LEVEL_FRAGMENTABLE: '1.2.840.10008.1.2.4.101.1',

  // MPEG-4 AVC / H.264
  MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_1: '1.2.840.10008.1.2.4.102',
  MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_1_FRAGMENTABLE:
    '1.2.840.10008.1.2.4.102.1',
  MPEG4_AVC_H264_BD_COMPATIBLE_HIGH_PROFILE_LEVEL_4_1:
    '1.2.840.10008.1.2.4.103',
  MPEG4_AVC_H264_BD_COMPATIBLE_HIGH_PROFILE_LEVEL_4_1_FRAGMENTABLE:
    '1.2.840.10008.1.2.4.103.1',
  MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_2_FOR_2D_VIDEO: '1.2.840.10008.1.2.4.104',
  MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_2_FOR_2D_VIDEO_FRAGMENTABLE:
    '1.2.840.10008.1.2.4.104.1',
  MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_2_FOR_3D_VIDEO: '1.2.840.10008.1.2.4.105',
  MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_2_FOR_3D_VIDEO_FRAGMENTABLE:
    '1.2.840.10008.1.2.4.105.1',
  MPEG4_AVC_H264_STEREO_HIGH_PROFILE_LEVEL_4_2: '1.2.840.10008.1.2.4.106',
  MPEG4_AVC_H264_STEREO_HIGH_PROFILE_LEVEL_4_2_FRAGMENTABLE:
    '1.2.840.10008.1.2.4.106.1',

  // HEVC / H.265
  HEVC_H265_MAIN_PROFILE_LEVEL_5_1: '1.2.840.10008.1.2.4.107',
  HEVC_H265_MAIN_10_PROFILE_LEVEL_5_1: '1.2.840.10008.1.2.4.108',
} as const;

export type TransferSyntaxUID =
  (typeof TransferSyntaxes)[keyof typeof TransferSyntaxes];

export default TransferSyntaxes;
