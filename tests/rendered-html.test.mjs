import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders 街角食堂 game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>街角食堂 · 1998经营模拟<\/title>/);
  assert.match(html, /class="game-shell"/);
  assert.match(html, /街角食堂/);
  assert.match(html, /开始营业|暂停营业/);
  assert.match(html, /木场/);
  assert.match(html, /corner-bistro-save|经营模拟/);
});

test("game modules and page wire GameState simulation", async () => {
  const [page, types, simulation, save, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/simulation.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/save.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from "\.\/game\/simulation"/);
  assert.match(page, /\btick\b/);
  assert.match(page, /\bcloseDay\b/);
  assert.match(page, /\brelocate\b/);
  assert.match(page, /className=\{`actor/);
  assert.match(page, /ambiance/);
  assert.match(types, /export type GameState/);
  assert.match(types, /SAVE_KEY = "corner-bistro-save"/);
  assert.match(simulation, /export function tick/);
  assert.match(save, /export function writeSave/);
  assert.match(css, /\.actor\b/);
  assert.match(css, /\.task-bubble\b/);
  assert.match(css, /\.ambiance-panel\b/);
});
