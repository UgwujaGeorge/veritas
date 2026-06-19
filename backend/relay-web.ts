import { createServer } from "http";
import { startRelay } from "./relay";

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
});

void startRelay().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
