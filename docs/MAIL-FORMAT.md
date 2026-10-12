# Mail composition and reply formatting

Replies start with an empty **Your reply** field. The original message appears in a
separate, collapsed reference section and is **not sent by default**. Its Reply-To
address, Re: subject and available In-Reply-To/References headers are preserved.

Enable **Include original message in this reply** to attach the original below the
new text. HTML recipients see a divider and gray quote block with sender, received
time and subject; plain-text recipients see an `Original message` separator and `>`
quote prefixes. New text is required even when quoting. A quote belongs to the draft's
original reply target, so later inbox selections cannot substitute a different message.

All outgoing messages receive restrained HTML typography and line spacing, plus a
plain-text alternative. No automatic salutation, signature, tracking image or branding
is inserted. The Worker builds HTML from validated plain text and escapes body,
subject and sender fields; it never accepts client-provided HTML. Rendering can vary
between mail clients, while the plain-text separator remains available.

The sent-mail record stores the actual plain-text payload, including an explicitly
selected quote, and its preview starts with the new text. Existing API clients that
send only `text` remain compatible. The optional `quote` object contains `from`,
`subject`, `receivedAt` and `text`; quotations are capped at 200 KB and the combined
plain-text message at 1,000,000 UTF-8 bytes. Long reply subjects/reference chains are
bounded without losing the immediate parent ID.

Release the frontend and file-service Worker together. Old Worker versions ignore
the optional quotation and do not generate the new HTML layout. No schema migration
or additional secret is required. No real mail was sent during verification; tests
intercept the provider call and also run the generated Worker in local workerd.

Validation on 2026-10-13: all 78 regression tests, 6 workerd integration scenarios,
typechecks and the production build passed. The generated HTML was previewed locally
with and without the optional quotation. No message was sent to a real recipient.
