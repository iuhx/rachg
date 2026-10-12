# Local image conversion

Open **Tools → Image converter**, choose or drop images, select an output format
and click **Convert all**. No sign-in, file upload, R2 storage or backend API is used.
Images stay in this browser tab. Normal application JavaScript and codec assets are
served from the workspace origin; the image data is never sent to those endpoints.

## Formats and controls

| Input | Output |
| --- | --- |
| PNG, JPEG/JPG, WebP, BMP, AVIF, HEIC/HEIF | PNG, JPEG, WebP, BMP, AVIF |

- Quality applies to JPEG, WebP and AVIF. PNG and BMP do not use that setting.
- JPEG and 24-bit BMP flatten transparency onto white. PNG, WebP and AVIF preserve
  supported transparency. Dimensions and normal JPEG EXIF orientation are applied
  to the pixels; EXIF/GPS and other source metadata are not copied.
- Each file shows its own progress, error, thumbnail, dimensions and output size.
  One invalid image does not stop the rest of the batch.
- Download files individually or use **Download ZIP** for completed results.
  Duplicate base names receive numeric suffixes; ZIP entries cannot contain paths.
- **Cancel** terminates active processing, leaving completed results available.
  Change settings and click Convert all to regenerate the batch. Clear/remove releases
  previews. Switching tools/workspace tabs keeps the queue; reload clears it.

HEIC/HEIF is input-only. For image collections or animated images, only the first
image/frame is converted. Live Photo motion, animation and HDR/high-bit-depth metadata
are not preserved. Unusual HEIF compression variants may be rejected by the decoder.

## Limits and compatibility

Use a current Chrome, Edge, Firefox or Safari with Web Workers, OffscreenCanvas and
createImageBitmap. Encoding support is checked by the returned MIME type, so an
unsupported WebP encoder cannot silently return PNG bytes with a `.webp` name.

- Up to 20 images per batch, 25 MiB per input and 100 MiB total input.
- Up to 24 megapixels and 16,384 pixels on either side.
- Up to 100 MiB of completed output per batch; use smaller batches for large BMPs.
- Two-minute timeout per worker operation; cancellation is immediate.

Conversions run sequentially in a fresh dedicated worker per image, with signatures
and available header dimensions checked before decode, and final dimensions checked
before encoding. Completed workers and image bitmaps are released. ZIP assembly also
runs in a worker. Thumbnails are bounded at 256 pixels on their longest side.

## Dependencies and release

Native browser codecs handle PNG/JPEG/WebP and ordinary image inputs. BMP encoding is
implemented locally. AVIF uses the single-threaded `@jsquash/avif` codec so it does not
require cross-origin isolation headers. HEIC falls back to `heic-to/next` (libheif).
The large codecs are loaded on demand and bundled as local assets; no CDN is required.
ZIP uses `fflate` with stored entries to avoid recompressing already compressed images.

License notices and source references ship at `/image-codec-licenses.txt`. Dependencies
are pinned in the workspace manifest/lockfile. Build and publish the frontend from
`main`; no Worker service deployment, migration or new secret is needed.

## Validation on 2026-10-13

- Full `pnpm check` passed: typechecks, retention checks, 104 regression tests,
  production build and 7 workerd/D1/R2 integration scenarios (8 Node test records
  including their parent). Dependency audit reported no known vulnerabilities.
- Seven new regression tests cover BMP binary layout/transparency, signatures and
  dimensions, ZIP names, explicit conversion, batch failure isolation, cancellation,
  input caps, cleanup and worker abort on unmount.
- The actual production build converted six inputs (including EXIF-rotated JPEG and
  a HEIC sample from libheif) into all five output formats. All 30 downloaded images
  were independently decoded/parsed from their ZIPs and checked for correct format,
  dimensions, alpha/white background, metadata removal and distinct names.
- Real browser checks cover cancellation of a large AVIF conversion and a corrupt
  input alongside valid files, individual downloads, retained results on navigation,
  dark mode and a 375px viewport without horizontal overflow. The console reported
  no errors or warnings. No production user data was involved.

HEIC test source: https://github.com/strukturag/libheif/blob/master/tests/data/rainbow-451x461.heic
