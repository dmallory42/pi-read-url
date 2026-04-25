import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

type CurlFetchResult = {
  body: string;
  contentType: string | null;
  finalUrl: string;
  statusCode: number;
};

type ArticleResult = {
  byline?: string;
  contentMarkdown: string;
  excerpt?: string;
  finalUrl: string;
  length?: number;
  siteName?: string;
  title?: string;
};

type ReadUrlParams = {
  includeMetadata?: boolean;
  maxChars?: number;
  objective?: string;
  url: string;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; pi-read-url/0.1; +https://github.com/dmallory42/pi-read-url)";
const SUPPORTED_HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];
const UNSUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".zip",
  ".gz",
  ".tar",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".mp3",
  ".mp4",
  ".mov",
]);

export default function (pi: ExtensionAPI) {
  pi.registerCommand("read_url_status", {
    description: "Check whether system curl is available for the read_url extension",
    handler: async (_args, ctx) => {
      const result = await pi.exec(process.platform === "win32" ? "where" : "which", ["curl"], {
        timeout: 5000,
      });

      if (result.code !== 0) {
        ctx.ui.notify("read_url: system curl not found on PATH", "error");
        return;
      }

      ctx.ui.notify(`read_url: using ${result.stdout.trim()}`, "info");
    },
  });

  pi.registerTool({
    name: "read_url",
    label: "Read URL",
    description:
      "Fetch an HTML page from a URL with system curl, extract the main readable content, and return markdown.",
    promptSnippet: "Extract the main content from a public HTML page URL via system curl and return cleaned markdown.",
    promptGuidelines: [
      "Use read_url when the user wants content extracted from a public web page URL such as a blog post, docs page, or article.",
      "Prefer read_url over ad-hoc bash scraping for readable webpage extraction.",
      "Do not use read_url for PDFs, images, videos, downloads, APIs, interactive browsing tasks, login flows, or form submission.",
      "If the page is likely JS-heavy, login-gated, or bot-protected, warn that read_url may fail or return partial content.",
      "Use maxChars when the user only needs a compact extract to save tokens.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "HTTP(S) URL for the HTML page to fetch" }),
      objective: Type.Optional(
        Type.String({
          description:
            "Optional focus hint for the returned extract, useful when the user only cares about one aspect of the page",
        }),
      ),
      maxChars: Type.Optional(
        Type.Integer({
          minimum: 200,
          description: "Optional cap on returned markdown characters to reduce token usage",
        }),
      ),
      includeMetadata: Type.Optional(
        Type.Boolean({
          description: "Include extra metadata such as site name, byline, excerpt, and HTTP status in the output",
        }),
      ),
    }),
    execute: async (_toolCallId, params: ReadUrlParams, signal) => {
      const normalizedUrl = normalizeUrl(params.url);
      ensureLikelyHtmlUrl(normalizedUrl);
      await ensureCurlAvailable(pi);
      const fetched = await fetchViaCurl(pi, normalizedUrl, signal);
      ensureSupportedContentType(fetched.contentType, fetched.finalUrl);
      const article = extractArticle(fetched);

      const truncated = truncateContent(article.contentMarkdown, params.maxChars);
      const content = formatToolContent({
        article: { ...article, contentMarkdown: truncated.text },
        includeMetadata: params.includeMetadata ?? false,
        objective: params.objective,
        statusCode: fetched.statusCode,
      });

      return {
        content: [{ type: "text", text: content }],
        details: {
          byline: article.byline,
          contentType: fetched.contentType,
          excerpt: article.excerpt,
          finalUrl: article.finalUrl,
          length: article.length,
          maxChars: params.maxChars,
          siteName: article.siteName,
          statusCode: fetched.statusCode,
          title: article.title,
          truncated: truncated.truncated,
        },
      };
    },
  });
}

function normalizeUrl(rawUrl: string): string {
  const withScheme = rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`;
  const url = new URL(withScheme);

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("read_url only supports http and https URLs.");
  }

  return url.toString();
}

function ensureLikelyHtmlUrl(urlString: string): void {
  const url = new URL(urlString);
  const lowerPath = url.pathname.toLowerCase();

  for (const extension of UNSUPPORTED_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) {
      throw new Error(
        `read_url is for extracting content from HTML pages, not ${extension.slice(1).toUpperCase()} files. Try a page URL instead.`,
      );
    }
  }
}

async function ensureCurlAvailable(pi: ExtensionAPI): Promise<void> {
  const result = await pi.exec(process.platform === "win32" ? "where" : "which", ["curl"], {
    timeout: 5000,
  });

  if (result.code !== 0) {
    throw new Error("System curl was not found on PATH. Install curl or add it to PATH before using read_url.");
  }
}

async function fetchViaCurl(
  pi: ExtensionAPI,
  url: string,
  signal: AbortSignal | undefined,
): Promise<CurlFetchResult> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-read-url-"));
  const bodyPath = path.join(tempDir, "body.bin");
  const headerPath = path.join(tempDir, "headers.txt");
  const writeOut = [
    "status=%{http_code}",
    "url=%{url_effective}",
    "content_type=%{content_type}",
  ].join("\n");

  try {
    const args = [
      "--location",
      "--silent",
      "--show-error",
      "--compressed",
      "--connect-timeout",
      "10",
      "--max-time",
      "30",
      "--user-agent",
      USER_AGENT,
      "--header",
      "Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      "--dump-header",
      headerPath,
      "--output",
      bodyPath,
      "--write-out",
      writeOut,
      url,
    ];

    const result = await pi.exec("curl", args, { signal, timeout: 35000 });

    if (result.killed) {
      throw new Error("The request timed out or was cancelled while fetching the URL.");
    }

    if (result.code !== 0) {
      throw new Error(formatCurlError(result.code, result.stderr, result.stdout, url));
    }

    const metadata = parseWriteOut(result.stdout);
    const bodyBuffer = await readFile(bodyPath);
    const headersText = await readFile(headerPath, "utf8").catch(() => "");
    const contentType = metadata.content_type || extractContentType(headersText);
    const body = decodeBody(bodyBuffer, contentType);

    ensureSupportedHttpStatus(metadata.status, metadata.url || url);

    return {
      body,
      contentType,
      finalUrl: metadata.url || url,
      statusCode: metadata.status,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function formatCurlError(code: number, stderr: string, stdout: string, url: string): string {
  const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");

  switch (code) {
    case 6:
      return `Could not resolve the host for ${url}. Check the URL and your network connection.`;
    case 7:
      return `Could not connect to ${url}. The site may be down, blocked, or refusing connections.`;
    case 22:
      return detail || `curl reported an HTTP error while fetching ${url}.`;
    case 28:
      return `The request to ${url} timed out.`;
    case 35:
    case 60:
      return `TLS/SSL validation failed while connecting to ${url}.`;
    default:
      return detail || `curl failed with exit code ${code} while fetching ${url}.`;
  }
}

function ensureSupportedHttpStatus(status: number, url: string): void {
  if (status === 200) return;

  if (status === 401 || status === 403) {
    throw new Error(`The page at ${url} blocked access (HTTP ${status}). read_url works best with public pages.`);
  }

  if (status === 404) {
    throw new Error(`The page at ${url} was not found (HTTP 404).`);
  }

  if (status >= 300 && status < 400) {
    throw new Error(`The page at ${url} returned an unexpected redirect response (HTTP ${status}).`);
  }

  throw new Error(`The page at ${url} returned HTTP ${status}.`);
}

function parseWriteOut(output: string): { content_type: string | null; status: number; url: string | null } {
  const pairs = Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return index === -1 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
      }),
  );

  return {
    content_type: pairs.content_type || null,
    status: Number(pairs.status || 0),
    url: pairs.url || null,
  };
}

function extractContentType(headersText: string): string | null {
  const matches = Array.from(headersText.matchAll(/^content-type:\s*(.+)$/gim));
  return matches.length > 0 ? matches[matches.length - 1]?.[1]?.trim() ?? null : null;
}

function ensureSupportedContentType(contentType: string | null, url: string): void {
  if (!contentType) return;

  const mimeType = contentType.split(";")[0]?.trim().toLowerCase();
  if (!mimeType) return;

  if (!SUPPORTED_HTML_CONTENT_TYPES.includes(mimeType)) {
    throw new Error(`read_url expected an HTML page URL, but ${url} returned content type ${mimeType}.`);
  }
}

function decodeBody(body: Buffer, contentType: string | null): string {
  const charsetMatch = contentType?.match(/charset=([^;\s]+)/i);
  const charset = charsetMatch?.[1]?.trim().replace(/^"|"$/g, "") || "utf-8";

  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function extractArticle(fetched: CurlFetchResult): ArticleResult {
  const dom = new JSDOM(fetched.body, { url: fetched.finalUrl });
  const readability = new Readability(dom.window.document);
  const article = readability.parse();

  if (article?.content) {
    return {
      byline: article.byline || undefined,
      contentMarkdown: htmlToMarkdown(article.content),
      excerpt: article.excerpt || undefined,
      finalUrl: fetched.finalUrl,
      length: article.length || undefined,
      siteName: article.siteName || undefined,
      title: article.title || undefined,
    };
  }

  const fallbackHtml = fallbackContentHtml(dom.window.document);
  const fallbackMarkdown = htmlToMarkdown(fallbackHtml);

  if (!fallbackMarkdown.trim()) {
    throw new Error(
      "The page loaded, but read_url could not find enough readable HTML content to extract.",
    );
  }

  return {
    contentMarkdown: fallbackMarkdown,
    finalUrl: fetched.finalUrl,
    title: dom.window.document.title || undefined,
  };
}

function fallbackContentHtml(document: Document): string {
  const clone = document.cloneNode(true) as Document;
  clone
    .querySelectorAll("script, style, noscript, svg, canvas, form, iframe, header, footer, nav, aside")
    .forEach((node) => node.remove());

  const preferred = clone.querySelector("main") || clone.querySelector("article") || clone.body;
  return preferred?.innerHTML ?? "";
}

function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    codeBlockStyle: "fenced",
    headingStyle: "atx",
  });

  turndown.remove(["script", "style", "noscript"]);

  const markdown = turndown.turndown(html);
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

function truncateContent(content: string, maxChars?: number): { text: string; truncated: boolean } {
  if (!maxChars || content.length <= maxChars) {
    return { text: content, truncated: false };
  }

  const truncated = content.slice(0, maxChars).trimEnd();
  return {
    text: `${truncated}\n\n[truncated to ${maxChars} characters]`,
    truncated: true,
  };
}

function formatToolContent({
  article,
  includeMetadata,
  objective,
  statusCode,
}: {
  article: ArticleResult;
  includeMetadata: boolean;
  objective?: string;
  statusCode: number;
}): string {
  const headerLines = [article.title ? `# ${article.title}` : "# Untitled page", `- URL: ${article.finalUrl}`];

  if (objective) {
    headerLines.push(`- Focus: ${objective}`);
  }

  if (includeMetadata) {
    headerLines.push(
      ...[
        `- HTTP status: ${statusCode}`,
        article.siteName ? `- Site: ${article.siteName}` : null,
        article.byline ? `- Byline: ${article.byline}` : null,
        article.excerpt ? `- Excerpt: ${article.excerpt}` : null,
      ].filter((line): line is string => Boolean(line)),
    );
  }

  return `${headerLines.join("\n")}\n\n## Content\n\n${article.contentMarkdown}`.trim();
}
