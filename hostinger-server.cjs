const http = require("node:http");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

let handlerPromise;
function getHandler() {
  handlerPromise ||= import("./.output/server/index.mjs").then((mod) => {
    const candidate = mod.default || mod;
    if (typeof candidate === "function") return candidate;
    if (candidate && typeof candidate.fetch === "function") {
      return async (req, res) => {
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const authority = req.headers.host || "localhost";
        const url = new URL(req.url || "/", protocol + "://" + authority);
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
          else if (value != null) headers.set(key, String(value));
        }
        const init = { method: req.method, headers };
        if (req.method !== "GET" && req.method !== "HEAD") {
          init.body = req;
          init.duplex = "half";
        }
        const response = await candidate.fetch(new Request(url, init), process.env, {});
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (!response.body) return res.end();
        const { Readable } = require("node:stream");
        Readable.fromWeb(response.body).pipe(res);
      };
    }
    throw new Error("Nitro server entry does not expose a compatible handler");
  });
  return handlerPromise;
}

const server = http.createServer(async (req, res) => {
  try {
    const handler = await getHandler();
    await handler(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`Vendas Estaduais listening on ${host}:${port}`);
});
