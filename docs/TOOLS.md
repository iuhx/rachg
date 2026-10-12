# Workspace tools

The Image converter tab supports local batch conversion to PNG, JPEG, WebP, BMP
and AVIF, including HEIC/HEIF inputs. See [Image tools](IMAGE-TOOLS.md) for limits,
downloads and codec details.

## Universal QR

- Open **Tools → Universal QR** and enter text or a URL. Generation is local, with
  no external QR service or upload. Wi-Fi/vCard strings can be entered as ordinary text.
- **Copy QR** copies a PNG image when the browser permits clipboard image writes.
  **PNG** downloads the image; **Copy link/text** copies the exact encoded content.
  Clipboard failures are reported, with download/manual-copy alternatives.
- Under **Upload a file**, paste an image into the card, drag in one file, or use the
  file picker. Choose its expiry, then click **Upload & generate QR**. Selecting or
  pasting alone does not upload. Failed uploads keep the selected file for retry.
- Under **Workspace files**, select an available recent file. Its existing URL is
  encoded without a second upload. The QR button on a Files row opens this selection.
- Uploads use the same parent file state and existing upload service as Files.
  A late initial list response cannot discard an upload made from Tools. Deleting
  a selected file removes its QR result; expired/deleted files cannot be selected.

Text QR codes use medium error correction and a conservative **2,200 UTF-8 byte**
limit. PNGs have a white background, a four-module quiet zone and integer pixel scaling.
They remain black on white in dark mode.

## Long text shares

When text exceeds the local QR limit, **Review text share** opens a confirmation with
the complete text and chosen expiry. Cancellation performs no upload. Confirmation
uploads a normal UTF-8 TXT file to the existing R2 bucket; the file also appears in Files.
The QR points to `/t/:fileId`, a readable text page. `/f/:fileId` remains its download URL.

Text pages reuse the file's Cloudflare Access authentication, quota, expiry and deletion.
They accept plain-text files up to **200,000 bytes**, escape all title/body HTML, disable
scripts through CSP and prohibit caching. No public access policy or new database
table is introduced. Uploading or creating a text share requires workspace sign-in.

## Markdown to text

Paste Markdown to see plain text immediately. Paragraphs, nested/ordered/task lists,
code content, link addresses, image labels/addresses and table cells are retained.
Reference links are expanded; HTML is displayed literally, never executed.

Use **Copy text**, **Download TXT**, or **Turn into QR**. The latter passes the current
result to the QR tool locally; overflow uses the same explicit text-share confirmation.
Input and expanded output are limited to **200,000 UTF-8 bytes**. Oversized or deeply
nested documents show an error while retaining the input. Reference expansion is
bounded incrementally so a small input cannot create an enormous output.

Tool drafts stay in memory when navigating between workspace tabs. Reloading the page
clears them. QR/Markdown dependencies load only when Tools is first opened.

## Release and validation

Release the frontend and file-service Worker from the same revision so `/t/:fileId`
is available for long-text shares. Existing bindings and permissions are sufficient;
there is no migration, extra secret, weather/QR API, bucket or public sharing setup.
The generated Worker editor artifact is rebuilt by `pnpm check`.

Validation completed on 2026-10-13:

- Full `pnpm check`: typechecks, existing retention suite, 54 regression cases,
  production build and 5 workerd/D1/R2 integration scenarios passed.
- Dependency audit: zero known vulnerabilities.
- QR decoding tests cover Unicode, emoji, whitespace, URLs and dense text.
  A PNG downloaded from the real browser was independently decoded successfully.
- Browser checks cover live Markdown preview, TXT download contents, conversion to QR,
  clipboard-image success feedback, a 375px viewport and dark mode; no console errors.
- Local fault tests cover upload failure, no upload before confirmation, duplicate
  clicks, file reuse, late responses, and revoked/expired text pages.

These are local tests. No production upload, public exposure or cloud deployment was
performed. Existing list limits and the earlier audit's unrelated open items remain.
