import { createServer } from "http";
import { relayStatus, startRelay } from "./relay";

const port = Number(process.env.PORT ?? 10000);

const server = createServer((req, res) => {
  if (req.url === "/" || req.url === "/healthz") {
    // The relay is only unhealthy once startRelay() has actually failed (fatalError set).
    // While it is still wiring up we report "starting" with a 200 so the platform's deploy
    // health check does not flap during the normal ~15s init window.
    const status = relayStatus.fatalError ? "error" : relayStatus.ready ? "ok" : "starting";
    const httpStatus = relayStatus.fatalError ? 503 : 200;
    res.writeHead(httpStatus, { "content-type": "application/json; charset=utf-8" });
    res.end(`${JSON.stringify({ status, ...relayStatus }, null, 2)}\n`);
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found\n");
});

server.listen(port, () => {
  console.log(`Veritas relay web service listening on port ${port}`);

  void startRelay().catch((error) => {
    relayStatus.fatalError = error instanceof Error ? error.message : String(error);
    console.error(error);
    process.exitCode = 1;
  });
});

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
