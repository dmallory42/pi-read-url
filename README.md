# @dmallory42/pi-read-url

A small [pi](https://github.com/badlogic/pi-mono) extension that adds a `read_url` tool for turning public HTML page URLs into clean, readable markdown using the machine's system `curl`.

Fast, local, and lightweight — built for content extraction, not browser automation.

## What it does

- fetches public HTML page URLs via the user's system `curl`
- extracts the main readable content with Mozilla Readability
- converts extracted HTML to markdown with Turndown
- keeps output compact by default to save tokens
- supports `maxChars` for even smaller extracts
- optionally includes metadata like site name, byline, excerpt, and HTTP status
- rejects obvious non-page URLs like PDFs, media files, and common downloads
- returns friendlier errors for DNS issues, blocked pages, timeouts, and unsupported content types

## Install

### From npm

```bash
pi install npm:@dmallory42/pi-read-url
```

### From git

```bash
pi install git:github.com/dmallory42/pi-read-url
```

Then reload pi:

```text
/reload
```

## Usage

Ask pi naturally:

```text
Read https://example.com
Use read_url to extract the main content from https://example.com
Use read_url on https://example.com with maxChars 4000
Use read_url on https://example.com and includeMetadata true
Use read_url on https://example.com and focus on the author bio
```

## Tool behavior

`read_url` is built for extracting content from public HTML pages by URL.

It works best for:

- blogs
- docs
- static content pages
- article-like HTML pages

It is not intended for:

- PDFs or office documents
- images, media, and downloadable files
- login-gated pages
- JS-heavy SPAs
- aggressively bot-protected sites
- interactive browsing tasks like clicking, login flows, or form submission

## Parameters

### `url`

The HTTP(S) page URL to fetch.

### `objective`

An optional focus hint to help frame what the caller cares about in the returned extract.

### `maxChars`

Optional character cap for the returned markdown. Useful when you want to save tokens.

### `includeMetadata`

Optional boolean. When enabled, the output also includes metadata like HTTP status, site name, byline, and excerpt.

## Why

Sometimes you just want the content of a page URL in a form the model can use:

- without sending it through a third-party fetch service
- without hand-rolling `curl | grep | sed` pipelines
- without jumping to a full browser automation stack

## Development

Typecheck:

```bash
npm run typecheck
```

Run the local smoke test:

```bash
npm test
```

Release notes and workflow live in [`RELEASING.md`](./RELEASING.md).

## License

MIT
