# 蓝宝石餐厅 — Agent 交接文档

给 Codex / Cursor 等 agent 的可执行交接。先读本文，再改代码。

---

## 1. 项目是什么

| 项 | 值 |
|---|---|
| 品牌 | **蓝宝石餐厅**（已从「街角食堂」改名；勿恢复旧名） |
| 品类 | 浏览器餐厅经营模拟 |
| 玩法对齐 | 1998《梦幻西餐厅》**一代**系统 |
| 本地路径 | `/Users/myles/Projects/jie-jiao-shitang-game` |
| GitHub | https://github.com/Myles625/sapphire-restaurant |
| 可玩 Pages | https://myles625.github.io/sapphire-restaurant/ |
| 当前工作分支 | `cursor/depth-management`（相对 `main` **超前 4 commit**，无落后） |
| `main` HEAD | `7ca916f` — 深度经营（寻路、任务链、人事氛围、迁店存档），仍是旧「街角食堂」叙事 |
| 功能分支相对 main 的关键增量 | R3F 3D、品牌改名、弹窗 UI、日结事件、Pages 静态导出与部署脚本 |

**红线：** 禁止把原作商标、exe、贴图、音频等素材拷进仓库。菜名/文案用原创（如「蓝宝石汉堡排」），气质对齐一代即可。二代资料只作 UI 参考。

---

## 2. 怎么跑

### Node PATH（本机常见坑）

Cursor/精简 shell 里经常没有 `node`。Codex 运行时常见路径：

```bash
export PATH="/Users/myles/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
# 当前约为 v24.x；项目 engines 要求 >=22.13.0
node -v
```

也可用项目内：`export PATH="$PWD/node_modules/.bin:$PATH"`（需已 `npm install`）。

### 命令

```bash
cd /Users/myles/Projects/jie-jiao-shitang-game
npm install

# 开发（用户习惯固定端口）
npx vinext dev --port 3456
# 或：npm run dev  （脚本未写死 port；要 3456 请显式传）

npm run build
npm test
npm run build:pages          # build + prepare-pages（BASE_PATH=/sapphire-restaurant）
npm run deploy:pages         # 推到 gh-pages 分支（需 git push 权限）
```

Pages 手动部署脚本：`scripts/deploy-gh-pages.sh`（clone `gh-pages` → 拷 `dist/client` → push）。  
自动化 workflow：`.github/workflows/deploy-pages.yml`（push `main` / `cursor/depth-management` 或 `workflow_dispatch`）；若未进远端，先 commit 该文件。

### 存档

- 当前 key：`sapphire-restaurant-save`（`SAVE_VERSION = 4`）
- 旧 key：`corner-bistro-save` — `loadSave()` 会读一次并迁移，店名「街角食堂」→「蓝宝石餐厅」，旧菜名会 remap
- 定义见 `app/game/types.ts`、`app/game/save.ts`

---

## 3. 技术栈与目录

**栈：** vinext（Vite + Next 兼容层）+ React 19 + R3F / Three / drei + Tailwind 4。静态导出（`next.config.ts` → `output: "export"`）。D1/Drizzle 在 starter 里，游戏逻辑不依赖。

| 路径 | 职责（一句话） |
|---|---|
| `app/page.tsx` | 主 UI：HUD、管理弹窗/抽屉、日结、迁店、把 state 喂给场景 |
| `app/globals.css` | 品牌 UI、弹窗布局；注释里有「勿叠旧 cutaway / Html」坑 |
| `app/game/types.ts` | 全游戏类型、网格 12×8、存档常量、地点/菜单/员工字段 |
| `app/game/save.ts` | 初始家具/菜单、存读档与旧品牌迁移 |
| `app/game/simulation.ts` | 主循环 `tick`、任务链、日结/次日、迁店、清扫 |
| `app/game/economy.ts` | 点餐权重、满意度、日成本、星级、迁店门槛、月结奖金、安保等级 |
| `app/game/locations.ts` | 东京 16 地点参数、日历、时段客流 |
| `app/game/events.ts` | 日结随机事件（强盗/火灾/卫检/评论家/霸王餐等） |
| `app/game/pathfinding.ts` | 网格寻路、站位邻格、门口/排队格 |
| `app/game/scene/RestaurantScene.tsx` | R3F Canvas、灯光、**OrbitControls 旋转相机** |
| `app/game/scene/RestaurantSceneClient.tsx` | 客户端包装入口 |
| `app/game/scene/building.tsx` | 建筑外壳、邻楼、窗/招牌等 low-poly |
| `app/game/scene/furniture.tsx` | 桌椅厨卫等家具 mesh |
| `app/game/scene/characters.tsx` | 员工/客人像素方块人（手脚脸有，但弱） |
| `app/game/scene/labels.tsx` | **sprite 标签**（已弃用 drei `Html`，防 ortho 撑裂） |
| `app/game/scene/coords.ts` / `tableFood.ts` | 格坐标 ↔ 世界坐标；桌上食物状态 |
| `scripts/prepare-pages.mjs` | 静态资源 base path 改写（vinext 不宜直接设 next `basePath`） |
| `scripts/deploy-gh-pages.sh` | 发到 `gh-pages` |
| `.tmp-compare/` | 本地截图对比缓存，**已 gitignore**，勿提交 |

---

## 4. 已完成（按代码实话）

- **深度经营：** 16 地点 + 迁店门槛；菜单字段（份量/浓淡/油度/酒水搭配/上架）；员工属性（速度/接待/魅力/习得/忍耐/调理）与任务链（带位→点单→传菜→烹饪→上菜→结账→清扫）；氛围（温湿度/音乐/制服/清洁/高级感/流行 + 地板墙门样式）；安保；日结随机事件；月结奖金与年奖钩子；常客记忆；营业时段/定休/难度设定。
- **R3F 主场景 + OrbitControls 旋转镜头**（用户明确喜欢，**不要擅自去掉**）。
- **管理用弹窗/抽屉**，主场景始终可见（建造偏抽屉，其它偏居中 modal）。
- **角色匀速移动**（渲染层吃 `simSpeed`）。
- **品牌全面改为蓝宝石餐厅** + 存档迁移。
- **GitHub Pages：** `build:pages` / `deploy:pages`，线上 base `/sapphire-restaurant/`；近期也用过 `gh-pages` 分支发布。
- **像素方块人 / 邻楼 exterior：** 有，但可读性与一代像素差很远（用户结论见下节）。

---

## 5. 未完成 / 与一代差距

- **画面：** 远不如一代。用户结论：**要像素精灵/贴图管线**，不要继续堆 low-poly 细节假装接近一代。
- 玩法缺口（对照知识库一代资料）：负责桌区、更真实站位/服务动线、真实 BGM（现多半是设定值）、外装改建深度、一代级 UI 信息密度等。
- **Vite HMR** 偶发 `send before connect` 噪音（可忽略或以后治）。
- **drei `Html` 曾撑裂画面** → 已改为 `labels.tsx` 的 sprite；不要退回 Html 标签方案。
- Pages **Actions workflow** 可能尚未合入远端（本地有 `.github/workflows/deploy-pages.yml`）；scope/权限需确认后才能稳定自动部署。
- `cursor/depth-management` **尚未 merge 进 main**；`main` 仍是旧品牌深度经营 commit。

---

## 6. 资料位置（给 Codex 读）

Obsidian：

`/Users/myles/Documents/myles的知识库/myles的知识库/游戏设计/梦幻西餐厅资料/`

优先读：

- `梦幻西餐厅-一代资料整理.md` — **玩法对齐主源**
- `梦幻西餐厅-资料来源清单.md`
- 二代系列（`梦幻西餐厅2-*`）— **仅 UI/界面参考**，不要当玩法主线

不要把原作 exe/资源导入本仓库。

---

## 7. 用户偏好与红线

- 沟通：**简体中文**。
- 主场景始终可见；经营/人事/菜单等用弹窗，不要整页盖死场景。
- **喜欢 3D 旋转镜头**；可另做「固定经营主视角」，旋转作附加，不要删 OrbitControls。
- 人物要有手脚脸、像人；建筑要有窗/招牌（现有方向对，观感还不够）。
- **不要盗版资源**；**不要恢复「街角食堂」品牌**。
- 提交前确认：不要把 `.tmp-compare/`、密钥、原作素材推进 git。

---

## 8. 建议 Codex 下一步（优先级）

1. **像素风角色 / 桌椅贴图或精灵**，固定可读的经营主视角（旋转镜头保留为附加）。
2. **按知识库补玩法缺口**（负责桌、站位、BGM、外装改建等），对齐一代而不是二代。
3. **稳定 Pages 自动部署**（把 workflow 推上远端、检查 GitHub Pages 环境与 `BASE_PATH`）。
4. **需要时再 merge PR 到 `main`**（当前功能都在 `cursor/depth-management`）。

---

## 9. 近期 commit / 部署备注

`git log -5 --oneline`（交接时）：

```
7e2bba8 Rename GitHub Pages base path to sapphire-restaurant.
23a9bc0 Add GitHub Pages redeploy helper for 蓝宝石餐厅.
690ffc1 Enable static export prep for 蓝宝石餐厅 GitHub Pages.
43ed613 升级为蓝宝石餐厅：接入 R3F 3D 场景与像素角色，完善弹窗 UI、日结事件与存档迁移。
7ca916f 实现街角食堂深度经营：寻路、任务链、人事氛围与迁店存档。
```

- 线上发布 historically 走 **`gh-pages` 分支**（`npm run deploy:pages`）。
- Actions 路线：artifact → `actions/deploy-pages`（见 workflow）；与手动 gh-pages 二选一理清，避免互相覆盖。
- `.tmp-compare/` 已在 `.gitignore`。

---

## 开场建议（可复制给用户确认）

读完 `HANDOFF.md` 后，先 `vinext dev --port 3456` 跑通，再按第 8 节优先级 1 开工；改画面前对照 Obsidian 一代资料，不要导入原作资源。
