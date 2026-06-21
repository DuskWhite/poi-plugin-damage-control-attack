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
