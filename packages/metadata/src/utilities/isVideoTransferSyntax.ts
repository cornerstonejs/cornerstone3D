import TransferSyntaxes from '../enums/TransferSyntaxes';

export const videoUIDs = new Set<string>([
  TransferSyntaxes.MPEG2_MAIN_PROFILE_MAIN_LEVEL,
  TransferSyntaxes.MPEG2_MAIN_PROFILE_MAIN_LEVEL_FRAGMENTABLE,
  TransferSyntaxes.MPEG2_MAIN_PROFILE_HIGH_LEVEL,
  TransferSyntaxes.MPEG2_MAIN_PROFILE_HIGH_LEVEL_FRAGMENTABLE,
  TransferSyntaxes.MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_1,
  TransferSyntaxes.MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_1_FRAGMENTABLE,
  TransferSyntaxes.MPEG4_AVC_H264_BD_COMPATIBLE_HIGH_PROFILE_LEVEL_4_1,
  TransferSyntaxes.MPEG4_AVC_H264_BD_COMPATIBLE_HIGH_PROFILE_LEVEL_4_1_FRAGMENTABLE,
  TransferSyntaxes.MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_2_FOR_2D_VIDEO,
  TransferSyntaxes.MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_2_FOR_2D_VIDEO_FRAGMENTABLE,
  TransferSyntaxes.MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_2_FOR_3D_VIDEO,
  TransferSyntaxes.MPEG4_AVC_H264_HIGH_PROFILE_LEVEL_4_2_FOR_3D_VIDEO_FRAGMENTABLE,
  TransferSyntaxes.MPEG4_AVC_H264_STEREO_HIGH_PROFILE_LEVEL_4_2,
  TransferSyntaxes.MPEG4_AVC_H264_STEREO_HIGH_PROFILE_LEVEL_4_2_FRAGMENTABLE,
  TransferSyntaxes.HEVC_H265_MAIN_PROFILE_LEVEL_5_1,
  TransferSyntaxes.HEVC_H265_MAIN_10_PROFILE_LEVEL_5_1,
]);

export default function isVideoTransferSyntax(uidOrUids: string | string[]) {
  if (!uidOrUids) {
    return false;
  }
  const uids = Array.isArray(uidOrUids) ? uidOrUids : [uidOrUids];
  return uids.find((uid) => videoUIDs.has(uid));
}
