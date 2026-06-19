import { createServer } from "http";

const port = Number(process.env.PORT ?? 10000);

const server = createServer((req, res) => {
  if (req.url === "/" || req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("veritas relay ready\n");
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found\n");
});

server.listen(port, () => {
  console.log(`Veritas relay web service listening on port ${port}`);

  try {
    const { startRelay } = require("./relay.ts") as typeof import("./relay");
    void startRelay().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
});

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
