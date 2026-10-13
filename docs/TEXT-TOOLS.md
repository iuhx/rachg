# Text converter and Notes

Tools has one **Text converter** tab with two directions:

- **Markdown → Plain text:** removes formatting while retaining paragraphs, lists,
  code content and link addresses. Copy, download TXT or send the result to Universal QR.
- **Rich text → Markdown:** paste formatted content from a web page or document into
  the left editor. Headings, emphasis, lists, links, fenced code and tables become
  Markdown on the right. Copy, download MD or send that Markdown to Universal QR.

Switching directions, tools or workspace tabs keeps the current inputs in memory.
Reloading clears tool drafts. Conversion remains local and does not require API sign-in.

## Saving either result

Click **Save to Notes**, review the prefilled title and body, then confirm. You can edit
both before saving. This explicit confirmation calls the existing private note API and
adds the returned record to the shared Notes list. No new database table or API is used.
Plain-text output is saved as the note body; rich-text output is saved as Markdown.

Saving requires workspace sign-in. Failed saves keep the review form and its input;
the existing submission lock prevents duplicate clicks. Hiding the form by switching
tabs preserves edits. Each direction remembers its last saved result during this visit
and disables Save until the converted output changes. **Open Notes** opens the list.

Saved Markdown is rendered through a bounded token renderer: working Markdown links,
nested lists, tables and code without executing HTML or loading remote images. Very
large or complex notes fall back to readable plain text; the stored body remains intact.

## Rich-text boundaries

HTML is parsed into a JavaScript syntax tree before anything is inserted in the editor.
An allowlist removes scripts, active embeds, event handlers, styles, IDs and unsafe URLs.
Only basic style information such as bold/italic/strike is translated into formatting.
Sanitized HTML is then serialized for editing and converted into Markdown.

Images become text links to their HTTP(S) source; embedded/data/file images are omitted
with a label. Images and other remote resources are never fetched by the converter.
Relative links lack a reliable clipboard source origin and retain their label only.
Colors, fonts, complex page layouts and merged-cell presentation are not preserved.

Rich-text clipboard input, safe editor HTML and its output are bounded at 200 KB.
Document imports support 30 MB and Markdown → TXT supports 10 MB (see DOCUMENT-CONVERTER.md); overly deep/complex
trees are rejected. Plain clipboard content is escaped before rich-text processing.
There is no automatic upload or automatic note creation. Long QR content still uses
the existing separate text-share review before uploading.

## Verification and release

- Focused conversion, save, failure, draft and existing workspace tests pass, along
  with frontend type checking, production build and the dependency audit.
- Browser acceptance uses the real production UI and generated Worker with isolated
  local D1: both results save to Notes, formatting/links render correctly, and saved
  records remain after refresh. HTML script/media elements are absent from the editor.
- Release the frontend from `main`; no Worker deployment or migration is needed.

The sidebar keeps Overview, Projects, Notes, Files, Mail, Tools, Settings in that order
without the Workspace/Utilities group headings.
