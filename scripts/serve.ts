/** dist/ を配信する開発用の最小静的ファイルサーバ (jsr が使えない環境向け) */

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".svg": "image/svg+xml",
};

Deno.serve({ port: 8000 }, async (req) => {
  const path = decodeURIComponent(new URL(req.url).pathname);
  const file = path === "/" ? "/index.html" : path;
  if (file.includes("..")) return new Response("bad request", { status: 400 });
  try {
    const data = await Deno.readFile(`dist${file}`);
    const ext = file.slice(file.lastIndexOf("."));
    return new Response(data, {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
});
