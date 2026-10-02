import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createApp } from "../src/app.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "echoguide-frontend-"));
  await writeFile(
    join(directory, "index.html"),
    "<!doctype html><title>EchoGuide test</title>",
  );
  await writeFile(join(directory, "model.bin"), "model test");
});
afterEach(async () => {
  const target = resolve(directory);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith("echoguide-frontend-")
  )
    throw new Error("Refusing to remove an unexpected test path");
  await rm(target, { recursive: true, force: true });
});

it("serves the local UI, SPA routes and real assets with WASM-compatible CSP", async () => {
  const app = createApp({ env: {}, frontendDir: directory });
  for (const route of ["/", "/probe", "/examples?runtime=wasm"])
    expect((await request(app).get(route)).text).toContain("EchoGuide test");
  const asset = await request(app).get("/model.bin");
  expect(asset.status).toBe(200);
  const home = await request(app).get("/");
  expect(home.headers["content-security-policy"]).toContain(
    "'wasm-unsafe-eval'",
  );
  expect(home.headers["content-security-policy"]).not.toContain(
    "'unsafe-eval'",
  );
});
it("keeps missing APIs, assets and private files out of the SPA fallback", async () => {
  const app = createApp({ env: {}, frontendDir: directory });
  for (const route of [
    "/api/unknown",
    "/assets/missing.js",
    "/server/.env",
    "/.env",
  ])
    expect((await request(app).get(route)).status).toBe(404);
  expect((await request(app).get("/api/health")).body.status).toBe("ok");
  expect((await request(app).post("/probe")).status).toBe(404);
});
it("retains API-only behavior when there is no built frontend", async () => {
  const app = createApp({ env: {}, frontendDir: join(directory, "missing") });
  expect((await request(app).get("/")).status).toBe(404);
  expect((await request(app).get("/api/health")).status).toBe(200);
});
