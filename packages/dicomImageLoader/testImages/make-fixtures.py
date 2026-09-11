#!/usr/bin/env python3
"""Transcode a testImages base image into the transfer syntaxes cs3d now decodes.

decoders_test.ts compares every variant against the decoded base image. A
lossless fixture has to be a re-encoding of that exact image and nothing else;
a lossy one has to stay inside the tolerance the test asserts. Every file
written here is read back, decoded, and compared with the source pixels; a file
that does not round-trip, or that exceeds its tolerance, is not left behind.

    python make-fixtures.py <testImages dir> [base.dcm ...]

Defaults to all three base images: CTImage.dcm (512x512 16 bit signed
grayscale), ColorImage.dcm (768x512 8 bit interleaved RGB) and GrayImage.dcm
(768x512 8 bit grayscale, derived here from ColorImage.dcm). The colour one
matters because three samples per pixel exercises the frame length arithmetic,
and because JPEG XL colour is a different code path in the codec from JPEG XL
grayscale. The grayscale one exists for JPEG Baseline; see GRAY_BASE below.

ColorImage.dcm is kodim23 from the Kodak True Color suite, released for
unrestricted use, wrapped in a synthetic Secondary Capture header - not medical
data, no human subject. Each file carries that attribution in (0008,2111)
DerivationDescription. Taken from viewer-testdata dcm/colorEncode.
"""

from __future__ import annotations

import sys
import zlib
from pathlib import Path

import numpy as np
import pydicom
from pydicom.encaps import encapsulate, generate_frames
from pydicom.uid import UID
from pydicom._uid_dict import UID_dictionary

# pydicom 3.0's UID dictionary predates these supplements, so it rejects them as
# "not a valid transfer syntax" when writing. Every is_* property on UID derives
# from this table, so registering the PS3.6 rows makes them first-class. This is
# the same registration viewer-testdata's encode-samples.py does.
for _uid, _name, _keyword in (
    ("1.2.840.10008.1.2.4.110", "JPEG XL Lossless", "JPEGXLLossless"),
    ("1.2.840.10008.1.2.4.111", "JPEG XL JPEG Recompression", "JPEGXLJPEGRecompression"),
    ("1.2.840.10008.1.2.4.112", "JPEG XL", "JPEGXL"),
    ("1.2.840.10008.1.2.8.1", "Deflated Image Frame Compression", "DeflatedImageFrameCompression"),
):
    UID_dictionary.setdefault(_uid, (_name, "Transfer Syntax", "", "", _keyword))

# name -> (uid, suffix used by decoders_test.ts)
TARGETS = {
    "1.2.840.10008.1.2.1.98": "EncapsulatedUncompressedExplicitVRLittleEndianTransferSyntax",
    "1.2.840.10008.1.2.8.1": "DeflatedImageFrameCompressionTransferSyntax",
    "1.2.840.10008.1.2.4.110": "JPEGXLLosslessTransferSyntax",
}

# Lossy targets, which cannot round-trip, so each carries the largest per sample
# difference the encode is allowed to produce. Kept apart from TARGETS because
# verify() checks them against a bound rather than for equality.
# The bound is 20 against a measured worst sample of 14 for this image at
# quality 90. The margin is deliberate: this check decodes with Pillow, while
# decoders_test.ts decodes with libjpeg-turbo, and two libjpeg derived decoders
# can land a sample or two apart on the same stream through their IDCT alone.
LOSSY_TARGETS = {
    "1.2.840.10008.1.2.4.50": ("JPEGProcess1TransferSyntax", 20),
}

# JPEG Baseline is an 8 bit process, and cs3d only routes it to libjpeg-turbo
# when the frame is single sample - decodeImageFrame.ts sends 8 bit .50 with
# three or four samples per pixel to the browser's own JPEG decoder instead. So
# the only fixture that exercises the codec is 8 bit grayscale, which neither
# base image is: CTImage.dcm is 16 bit, ColorImage.dcm is three sample. This
# derives that missing base from ColorImage.dcm rather than adding an unrelated
# third image, so the whole corpus still comes from kodim23 and the CT.
GRAY_BASE = "GrayImage.dcm"

JPEG_QUALITY = 90


def even(data: bytes) -> bytes:
    """DICOM items must be an even number of bytes."""
    return data if len(data) % 2 == 0 else data + b"\x00"


def encode_encapsulated_uncompressed(frame: bytes) -> bytes:
    # PS3.5 A.4.11: the fragment holds the frame's native little endian pixel
    # data, padded to an even length. Nothing is compressed.
    return even(frame)


def encode_deflated_frame(frame: bytes) -> bytes:
    # PS3.5 A.4.13: raw DEFLATE per RFC 1951 - no zlib header or Adler-32
    # trailer, hence wbits=-15 - with a trailing NULL if the result is odd.
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    return even(compressor.compress(frame) + compressor.flush())


def encode_jpegxl(pixels: np.ndarray) -> bytes:
    import imagecodecs

    # JPEG XL has no signed sample type, so the two's complement bit pattern is
    # encoded as unsigned and the reader reinterprets it per
    # PixelRepresentation. This is the convention the released corpus uses.
    unsigned = np.ascontiguousarray(pixels).view(
        np.uint16 if pixels.dtype.itemsize == 2 else np.uint8
    )
    # Colour arrives as (rows, columns, samples) and is encoded as such, so the
    # codec writes a three channel image rather than a wider grayscale one.
    return even(imagecodecs.jpegxl_encode(unsigned, lossless=True))


def encode_jpeg_baseline(pixels: np.ndarray) -> bytes:
    """JPEG Baseline process 1, the syntax libjpeg-turbo decodes for .50."""
    import io

    from PIL import Image

    if pixels.ndim != 2 or pixels.dtype != np.uint8:
        raise SystemExit("JPEG Baseline needs an 8 bit single sample frame")

    buffer = io.BytesIO()
    Image.fromarray(pixels, mode="L").save(
        buffer, format="JPEG", quality=JPEG_QUALITY
    )
    return even(buffer.getvalue())


def ensure_gray_base(test_images: Path) -> Path:
    """Derive the 8 bit grayscale base from ColorImage.dcm, once.

    kodim23 converted to luminance with the ITU-R BT.601 weights, which is what
    a JPEG encoder uses for its own Y channel, so the image stays natural rather
    than becoming a synthetic gradient. The header is ColorImage.dcm's, changed
    to one sample of MONOCHROME2 and given its own SOP Instance UID.
    """
    out = test_images / GRAY_BASE
    if out.exists():
        return out

    ds = pydicom.dcmread(test_images / "ColorImage.dcm")
    rgb = ds.pixel_array.astype(np.float64)
    gray = np.rint(
        0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    ).clip(0, 255).astype(np.uint8)

    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    if "PlanarConfiguration" in ds:
        del ds.PlanarConfiguration
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PixelData = even(gray.tobytes())
    ds.SOPInstanceUID = pydicom.uid.generate_uid()
    ds.file_meta.MediaStorageSOPInstanceUID = ds.SOPInstanceUID
    ds.file_meta.TransferSyntaxUID = UID("1.2.840.10008.1.2.1")
    ds.DerivationDescription = (
        "kodim23 from the Kodak True Color suite, released for unrestricted "
        "use, converted to BT.601 luminance. Not medical data, no human "
        "subject."
    )
    ds.save_as(out, implicit_vr=False, little_endian=True, enforce_file_format=True)

    print(f"  {out.name}  derived from ColorImage.dcm, {gray.shape[1]}x{gray.shape[0]} 8 bit grayscale")
    return out


def build(source: pydicom.Dataset, uid: str, out: Path) -> None:
    frame = source.PixelData
    pixels = source.pixel_array

    if uid == "1.2.840.10008.1.2.1.98":
        fragment = encode_encapsulated_uncompressed(frame)
    elif uid == "1.2.840.10008.1.2.8.1":
        fragment = encode_deflated_frame(frame)
    elif uid == "1.2.840.10008.1.2.4.110":
        fragment = encode_jpegxl(pixels)
    elif uid == "1.2.840.10008.1.2.4.50":
        fragment = encode_jpeg_baseline(pixels)
    else:
        raise SystemExit(f"no encoder for {uid}")

    ds = pydicom.dcmread(source.filename)
    ds.file_meta.TransferSyntaxUID = UID(uid)
    ds.PixelData = encapsulate([fragment])
    ds["PixelData"].is_undefined_length = True
    ds.save_as(out, implicit_vr=False, little_endian=True, enforce_file_format=True)

    verify(out, uid, pixels)


def verify(path: Path, uid: str, expected: np.ndarray) -> None:
    ds = pydicom.dcmread(path)
    if str(ds.file_meta.TransferSyntaxUID) != uid:
        raise SystemExit(f"{path.name}: wrote {ds.file_meta.TransferSyntaxUID}, not {uid}")

    frame = next(generate_frames(ds.PixelData, number_of_frames=1))
    dtype = expected.dtype

    if uid in LOSSY_TARGETS:
        import io

        from PIL import Image

        _, tolerance = LOSSY_TARGETS[uid]
        got = np.asarray(Image.open(io.BytesIO(frame)))
        if got.shape != expected.shape:
            raise SystemExit(f"{path.name}: decoded {got.shape}, expected {expected.shape}")

        worst = int(np.abs(got.astype(np.int32) - expected.astype(np.int32)).max())
        if worst > tolerance:
            raise SystemExit(
                f"{path.name}: worst sample differs by {worst}, over the "
                f"tolerance of {tolerance} that decoders_test.ts asserts"
            )

        print(f"  {path.name}  {len(frame)} frame bytes, worst sample differs by {worst} (tolerance {tolerance})")
        return

    if uid == "1.2.840.10008.1.2.1.98":
        raw = frame[: expected.nbytes]
    elif uid == "1.2.840.10008.1.2.8.1":
        raw = zlib.decompress(frame, -15)[: expected.nbytes]
    else:
        import imagecodecs

        decoded = np.squeeze(imagecodecs.jpegxl_decode(frame))
        raw = np.ascontiguousarray(decoded).tobytes()[: expected.nbytes]

    got = np.frombuffer(raw, dtype=dtype).reshape(expected.shape)
    if not np.array_equal(got, expected):
        raise SystemExit(f"{path.name}: pixels do not round-trip")

    print(f"  {path.name}  {len(frame)} frame bytes, round-trips")


def main() -> None:
    test_images = Path(sys.argv[1])
    bases = sys.argv[2:] or ["CTImage.dcm", "ColorImage.dcm", GRAY_BASE]

    for base in bases:
        if base == GRAY_BASE:
            ensure_gray_base(test_images)

        source = pydicom.dcmread(test_images / base)
        print(
            f"source {base}: {source.Rows}x{source.Columns} "
            f"{source.BitsAllocated}bit spp={source.SamplesPerPixel} "
            f"pi={source.PhotometricInterpretation} "
            f"pr={source.PixelRepresentation}"
        )

        if base == GRAY_BASE:
            # This base exists only for the JPEG Baseline case. The lossless
            # syntaxes are already covered by the other two bases, and a third
            # copy of each would add run time without adding coverage.
            targets = {uid: name for uid, (name, _) in LOSSY_TARGETS.items()}
        else:
            targets = dict(TARGETS)

        for uid, name in targets.items():
            build(source, uid, test_images / f"{base}_{name}_{uid}.dcm")


if __name__ == "__main__":
    main()
