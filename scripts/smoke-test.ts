import { createServer } from "node:http";
import { spawn } from "node:child_process";

import extension from "../index.ts";

type ExecResult = {
  code: number | null;
  killed: boolean;
  stderr: string;
  stdout: string;
};

async function main() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
<html>
  <head><title>Token Saver Test</title></head>
  <body>
    <header><nav>Home About Contact</nav></header>
    <main>
      <article>
        <h1>Token Saver Test</h1>
        <p>This is the first paragraph of a test page.</p>
        <p>This is the second paragraph of a test page, included to verify truncation and extraction.</p>
        <p>This is the third paragraph of a test page, included to verify truncation and extraction.</p>
      </article>
    </main>
    <footer>Footer</footer>
  </body>
</html>`);
  });

  await new Promise<void>((resolve) => server.listen(8766, "127.0.0.1", () => resolve()));

  let readUrlTool: any;

  const fakePi = {
    exec(command: string, args: string[], options?: { signal?: AbortSignal; timeout?: number }) {
      return execCommand(command, args, options);
    },
    registerCommand() {
      return undefined;
    },
    registerTool(definition: any) {
      if (definition.name === "read_url") {
        readUrlTool = definition;
      }
    },
  };

  extension(fakePi as any);

  if (!readUrlTool) {
    throw new Error("Smoke test failed: read_url tool was not registered");
  }

  try {
    const result = await readUrlTool.execute(
      "tool-call-1",
      {
        url: "http://127.0.0.1:8766",
        maxChars: 1200,
      },
      undefined,
    );

    const text = result?.content?.find((item: { type: string }) => item.type === "text")?.text ?? "";
    console.log(text);

    if (!text.includes("Token Saver Test")) {
      throw new Error("Smoke test failed: expected output to contain 'Token Saver Test'");
    }

    console.log("Smoke test passed.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function execCommand(
  command: string,
  args: string[],
  options?: { signal?: AbortSignal; timeout?: number },
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timeoutId =
      options?.timeout != null
        ? setTimeout(() => {
            killed = true;
            child.kill("SIGTERM");
          }, options.timeout)
        : undefined;

    options?.signal?.addEventListener(
      "abort",
      () => {
        killed = true;
        child.kill("SIGTERM");
      },
      { once: true },
    );

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ code, killed, stderr, stdout });
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
