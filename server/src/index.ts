import { createApp } from "./app.js";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535.");
const host = process.env.HOST || "127.0.0.1";
const frontendDir = fileURLToPath(
  new URL("../../client/dist/", import.meta.url),
);
const server = createApp({ frontendDir }).listen(port, host, () =>
  console.log(`EchoGuide listening at http://${host}:${port}`),
);
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
