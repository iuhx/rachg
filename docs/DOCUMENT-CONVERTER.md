# Text and document converter

Tools → Text converter combines three input sources with three output choices.
Choose Markdown, pasted rich text, or a local document. Choose Markdown, plain
text, or Word / HTML as the output. Each input is kept when switching sources.

Document input accepts DOCX, MD/Markdown, TXT and HTML/HTM. TXT is treated as
literal text, including characters that resemble Markdown syntax; UTF-8 and
BOM-marked UTF-16 are supported. Imported documents become editable Markdown.
The old binary DOC format and PDF/OCR are not supported.

Word output is a real DOCX with headings, styled text, nested lists, links,
code and tables. HTML output is a standalone document with safe content and
basic print styles. Copy formatted provides HTML and plain-text clipboard
representations when supported. Other outputs copy/download as MD or TXT.
Save to Notes retains the existing review dialog and explicit confirmation;
Word / HTML results are saved as Markdown. QR uses text or Markdown and keeps
the existing long-text confirmation before any upload.

## Limits and fidelity

- One input file at a time, at most 30 MB; imported Markdown is bounded at 30 MB.
- Markdown → TXT accepts at most 10 MB of input and output. Above 200 KB, conversion
  runs in a cancellable browser Worker after a short typing debounce.
- Rich-text paste and Word/HTML exports retain their 200 KB limit. Notes are at
  most 1 MB and QR text shares 200 KB; larger results can still be copied/downloaded.
- MB limits are decimal UTF-8 bytes. Complex documents may reach structural limits
  before byte limits, and format conversion can expand the source text.
- DOCX packages are checked before parsing: at most 500 entries and 60 MB
  declared uncompressed size. Corrupt/non-DOCX packages fail without replacing
  the previous input.
- Embedded images become placeholders; external images become links. No remote
  image is fetched. Page layout, headers/footers, equations and advanced Word
  formatting are not reproduced. Word import may restart list numbering at 1;
  an imported numbered list displays a review warning.
- Word tables support at most 20 columns and 500 rows. Complex documents should
  be split into smaller sections. This is a content converter, not a lossless
  Word layout round trip.

## Implementation and verification

Mammoth imports DOCX and docx creates DOCX. Markdown → TXT uses micromark
and MDAST to avoid recursive regular expressions failing on long paragraphs. Processing runs in a short-lived
module Worker, terminated on completion, cancellation, leaving the tool, or a
30-second deadline. These dependencies load only when document conversion is
requested; they do not add work to Notes loading or the backend.

Mammoth external-file access and embedded style maps are disabled. Imported HTML
passes through the existing AST sanitizer before it can reach the page. The
named-entity decoder uses the existing entities library instead of a DOM-backed
decoder so the same sanitization works inside a Worker. Conversion makes no API
writes; only a confirmed Save to Notes calls the existing notes endpoint.

Tests exercise actual browser builds of both engines, Word/Markdown content
round trips, literal TXT, HTML sanitization, corrupt and over-limit packages,
source preservation, cancellation and note review. Browser checks exercise the
production asset build, native file selection, the actual conversion Worker,
Word/HTML downloads, note saving, rich-text paste and mobile layout. A generated
Word sample is independently rendered with docx-preview for layout inspection.
