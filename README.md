# @dmallory42/pi-read-url

A Pi extension package that adds a `read_url` tool for extracting content from public **HTML page URLs** with the user's **system `curl`** and converting the main content to markdown locally.

## Goals

- Use the machine's existing `curl`
- Avoid third-party fetch services
- Work well for blogs, docs, and public article pages
- Stay packageable for npm and GitHub distribution

## Install in Pi

From a local checkout:

```bash
pi install /Users/mal/projects/pi-read-url
```

Once published to npm:

```bash
pi install npm:@dmallory42/pi-read-url
```

From GitHub once the repo exists:

```bash
pi install git:github.com/dmallory42/pi-read-url
```

## What it does

`read_url`:
- validates an `http(s)` URL
- rejects obviously non-page URLs like PDFs and common downloads
- shells out to system `curl`
- extracts the readable content with Mozilla Readability
- converts it to markdown with Turndown
- returns compact markdown by default, with optional extra metadata
- supports `maxChars` to cap output and save tokens

## Limitations

This first version is intended for:
- blogs
- docs
- static content pages
- article-like HTML pages reachable by URL

It is not intended for:
- PDFs or office documents
- images, media, and downloadable files
- login-gated pages
- JS-heavy SPAs
- aggressively bot-protected sites

## Usage

Inside Pi:

- `Read https://example.com`
- `Use read_url to extract the main content from https://example.com`
- `Use read_url on https://example.com with maxChars 4000`
- `Use read_url on https://example.com and includeMetadata true`

## Requirement

The target machine must have `curl` available on `PATH`.

## Development

Typecheck:

```bash
npm run typecheck
```

Run the local smoke test:

```bash
npm test
```
