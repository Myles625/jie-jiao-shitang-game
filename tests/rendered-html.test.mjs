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

test("server-renders 蓝宝石餐厅 game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>蓝宝石餐厅 · 1998梦幻经营物语<\/title>/);
  assert.match(html, /class="game-shell[^"]*"/);
  assert.match(html, /蓝宝石餐厅/);
  assert.match(html, /开始营业|暂停营业/);
  assert.match(html, /木场/);
  assert.match(html, /梦幻经营物语|本日经营目标/);
});

test("game modules and page wire GameState simulation + R3F scene", async () => {
  const [page, types, simulation, save, css, scene, characters, building, pkg] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/simulation.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/save.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/game/scene/RestaurantScene.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/scene/characters.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/scene/building.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from "\.\/game\/simulation"/);
  assert.match(page, /\btick\b/);
  assert.match(page, /\bcloseDay\b/);
  assert.match(page, /\brelocate\b/);
  assert.match(page, /RestaurantSceneClient|simSpeed|panelOpen|seated/);
  assert.match(page, /ambiance/);
  assert.match(page, /settings|一般设定|float-status/);
  assert.match(page, /dailyGoalFor|developDish|trainStaff|advisor-card/);
  assert.match(page, /cutaway-stage|building-cutaway|scene-host/);
  assert.match(page, /panel-backdrop|is-modal|is-drawer|panel-close|closePanel/);
  assert.match(types, /export type GameState/);
  assert.match(types, /SAVE_KEY = "sapphire-restaurant-save"/);
  assert.match(types, /LEGACY_SAVE_KEY = "corner-bistro-save"/);
  assert.match(types, /GameSettings|pairDrink|floorStyle/);
  assert.match(simulation, /export function tick/);
  assert.match(save, /export function writeSave/);
  assert.match(save, /defaultSettings|pairDrink|oiliness/);
  assert.match(css, /\.actor\b|\.task-bubble\b/);
  assert.match(css, /\.iso-world\b|\.r3f-stage\b/);
  assert.match(css, /\.furn-iso\b|\.building-cutaway\b/);
  assert.match(css, /\.ambiance-panel\b/);
  assert.match(css, /\.float-status\b/);
  assert.match(css, /\.advisor-card\b|\.menu-register\b|\.staff-portrait\b/);
  assert.match(css, /\.building-cutaway\b/);
  assert.match(css, /\.zone-kitchen\b/);
  assert.match(css, /\.kanban\b/);
  assert.match(css, /\.panel-backdrop\b|\.control-panel\.is-modal\b|\.panel-body\b/);
  assert.match(css, /100dvh|overflow:\s*hidden/);
  assert.match(scene, /@react-three\/fiber|orthographic|directionalLight/);
  assert.match(scene, /castShadow|OrbitControls/);
  assert.match(scene, /className="r3f-stage/);
  assert.match(scene, /floorStyle|wallStyle|showBubbles/);
  assert.match(scene, /expansionLevel/);
  assert.match(characters, /staff-walk-atlas\.png|guest-walk-atlas\.png/);
  assert.match(characters, /AnimatedPersonSprite|WALK_COLUMNS/);
  assert.match(building, /料理间|化粧室|扩建预留区|ServiceRooms/);
  assert.match(pkg, /"@react-three\/fiber"/);
  assert.match(pkg, /"three"/);
});
