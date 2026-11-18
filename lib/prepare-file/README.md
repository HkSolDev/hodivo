# Prepare a file

The route uses the shared Aptus layout. The Client Component owns the file picker,
settings, and blob URLs. The fitting functions run in the browser and receive an
abort signal so replaced files and settings cannot produce a stale preview.
Size checks use 1,000 bytes per KB.

The prototype's PDF worker and reader (PDF.js 3.11.174), PDF writer (pdf-lib),
and jSquash/MozJPEG 1.6.0 encoder live in
`public/prepare-file/<fingerprint>`. They load only for the operations that
need them. Keep the PDF.js reader and worker paired. PDF.js receives
`isEvalSupported: false` as required by the
[upstream advisory for the reference release](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq).

Before changing any of these immutable files, generate a new fingerprint.
Hash each relative path and file's bytes in sorted relative path order using
SHA-256, take the first 16 hex characters, and update `vendorRoot` along with
the directory name.

HEIC and HEIF use the browser decoder when available. The prototype decoder is
excluded due to the [upstream licensing issue](https://github.com/alexcorvi/heic2any/issues/59).
When a browser cannot open the file, the tool suggests using a JPG or PNG copy.

To run the production browser test after building and starting Next, set
`APTUS_PREPARE_FILE_TEST_ORIGIN` to the local production origin and run
`node --import tsx --test tests/prepare-file-browser.test.ts`.
