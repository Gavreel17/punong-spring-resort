export function renderErrorPage(error?: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error != null
          ? JSON.stringify(error)
          : "Something went wrong on our end.";

  const stack = error instanceof Error ? error.stack : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #060d10; color: #f8fafc; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 36rem; width: 100%; text-align: center; padding: 2rem; background: #0f172a; border: 1px solid #1e293b; border-radius: 1rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
      h1 { font-size: 1.5rem; margin: 0 0 0.5rem; color: #f43f5e; font-weight: 700; }
      p { color: #94a3b8; margin: 0 0 1rem; font-size: 0.9rem; }
      .err-msg { background: #1e1b4b; border: 1px solid #3730a3; color: #a5b4fc; padding: 0.875rem; border-radius: 0.75rem; font-family: monospace; font-size: 0.8rem; text-align: left; word-break: break-word; white-space: pre-wrap; margin-bottom: 1.5rem; overflow-x: auto; max-height: 12rem; }
      .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.625rem 1.25rem; border-radius: 0.75rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; font-weight: 600; font-size: 0.875rem; }
      .primary { background: #e11d48; color: #fff; }
      .secondary { background: #1e293b; color: #e2e8f0; border-color: #334155; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>An error occurred during server render:</p>
      <div class="err-msg">${escapeHtml(message)}${stack ? `\n\n${escapeHtml(stack)}` : ""}</div>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
