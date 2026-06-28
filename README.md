# poi-plugin-damage-control-attack

## 中文

适用于 poi 的损管进击提醒插件。

当出击舰队只有一艘船，并且这艘船装备了「応急修理要員」（id=42）或「応急修理女神」（id=43），
同时下一个进击点位为泊地修理点（F / H / I）时，弹出确认弹窗：

> 继续进击将消耗损管或者女神 请确认是否继续进击

点击「确认」关闭弹窗，点击「取消」刷新游戏页面（即放弃进击）。

下一进击点位的判定方式与 poi-plugin-prophet 一致：通过 poi 的 `fcd.map` 路线数据，
根据当前 `sortie.currentNode` 在 `route[currentNode][1]` 取得目标节点的字母编号。

刷新游戏页面复用 poi 自带的 `gameReload()` 逻辑，加载失败时回退到 webview 内联重载。

在插件设置页可以一键启用/停用本提醒。

仓库地址：https://github.com/DuskWhite/poi-plugin-damage-control-attack

## 油猴脚本版

仓库同时提供不依赖 poi 浏览器的 Tampermonkey / Violentmonkey 脚本：

- 脚本文件：`userscript/damage-control-attack.user.js`
- 在舰 C 游戏页通过注入页面上下文监听 `XMLHttpRequest` / `fetch`。
- 自行维护舰娘、装备、舰队与当前出击状态。
- 使用 KC3Kai 的 `edges.json` 将 `/kcsapi/api_req_map/start` 与 `/kcsapi/api_req_map/next`
  返回的 `api_no` 映射为节点字母，再判断是否为 F / H / I。
- 内置触摸友好的「重新载入游戏」悬浮窗，显示在 DMM 外层页面，可拖到游戏 frame 外，
  支持缩放、关闭，并记住位置和尺寸。
- 通过油猴菜单「切换损管进击提醒」启用或停用提醒。
- 关闭刷新悬浮窗后，可通过油猴菜单「显示刷新悬浮窗」重新打开。
- 如果没有触发，先确认控制台出现 `damage-control-attack userscript loaded`。
- 油猴菜单「切换损管进击提醒调试日志」可打开 API 处理日志；刷新游戏后在控制台查看
  `window.__damageControlAttack.state.lastDecision`。

地图边数据来自 KC3Kai（MIT License）：https://github.com/KC3Kai/KC3Kai

## English

A damage-control advance warning plugin for poi.

When the sortie fleet has a single ship carrying an Emergency Repair Personnel (id=42) or
Emergency Repair Goddess (id=43), and the next node is an anchorage repair point (F / H / I),
a confirmation dialog appears:

> Continuing will consume your Emergency Repair Personnel/Goddess. Confirm to advance.

Click "Confirm" to close the dialog, or "Cancel" to reload the game page (i.e. abort the advance).

The next-node lookup mirrors poi-plugin-prophet: using poi's `fcd.map` route data, the target
node letter is read from `route[currentNode][1]` based on `sortie.currentNode`.

Game reload reuses poi's built-in `gameReload()` helper, falling back to inline webview reload.

The warning can be toggled on/off from the plugin settings page.

Repository: https://github.com/DuskWhite/poi-plugin-damage-control-attack

## Userscript

This repository also ships a Tampermonkey / Violentmonkey userscript that does not depend on poi:

- Script file: `userscript/damage-control-attack.user.js`
- It injects into the game page and watches `XMLHttpRequest` / `fetch`.
- It keeps a minimal local state for ships, equipment, fleets, and the current sortie.
- It uses KC3Kai's `edges.json` to map `api_no` from `/kcsapi/api_req_map/start` and
  `/kcsapi/api_req_map/next` to node letters, then checks F / H / I.
- It includes a touch-friendly floating "Reload Game" panel on the outer DMM page, so it can be
  moved outside the game frame, resized, closed, and persisted.
- Toggle the warning from the userscript manager menu.
- If the reload panel is closed, use the userscript manager menu to show it again.
- If it does not trigger, first check the console for `damage-control-attack userscript loaded`.
- Use the userscript manager menu to enable debug logs, reload the game, then inspect
  `window.__damageControlAttack.state.lastDecision` in the console.

Map edge data comes from KC3Kai (MIT License): https://github.com/KC3Kai/KC3Kai
