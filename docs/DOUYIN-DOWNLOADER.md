# Douyin Downloader

The Tools page proxies requests through the existing Access-protected
`rachg-file-service` Worker. The browser never receives the upstream API key.

## Upstream requirements

The configured upstream is `https://dou.air1.cn:28080`. Its OpenAPI document
was reachable over TLS and confirmed `/api/info` and `/api/download`. The Worker
deliberately rejects HTTP so the API key cannot be sent in clear text.

## Worker configuration

On the `rachg-file-service` Worker, add:

- Variable `DOUYIN_API_BASE_URL`: the HTTPS origin only, with no path, query,
  or fragment. `wrangler.jsonc` currently sets it to `https://dou.air1.cn:28080`.
- Secret `DOUYIN_API_KEY`: a rotated API key for the upstream service.

Because the earlier key was shared in chat, treat it as exposed: rotate it on
the Douyin service before enabling production use, then store only the new value
as the Worker Secret.

The secret can be entered with Wrangler from the repository root:

```powershell
pnpm --filter @rachg/file-service exec wrangler secret put DOUYIN_API_KEY --config wrangler.jsonc
```

Wrangler prompts for the value without placing it in shell history. Alternatively,
add it under Workers & Pages > `rachg-file-service` > Settings > Variables and
Secrets. Do not put the key in `wrangler.jsonc`, Pages variables, browser code,
or a URL query parameter.

After both values are configured, deploy the Worker. The private routes are:

- `GET /v1/tools/douyin/info?url=...` for video metadata.
- `GET /v1/tools/douyin/download?url=...` for a streamed MP4 or photo ZIP.

Both routes require the existing Cloudflare Access JWT validation. Downloads
are limited to 500 MB and only HTTPS redirects are followed. The upstream key
is sent in `X-Api-Key` to the configured API origin and is not forwarded to a
redirected CDN host.

After reading video details, the Tools page can also save the video directly to
Files. The default destination is WebDAV; Cloudflare R2 can be selected when
desired. Saving uses the existing upload route and stores the item permanently.
Files uploads are limited to 99 MB, so larger items remain downloadable to the
device but cannot be saved into Files.
