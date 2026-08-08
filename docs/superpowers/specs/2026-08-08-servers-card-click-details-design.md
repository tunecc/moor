# Servers 卡片整卡点击进详情 + 精简操作按钮

日期：2026-08-08
状态：已确认，待实现

## 背景

Servers 页面的服务器卡片目前进详情页只能点右上角的「详情」图标按钮（`PanelRightOpen`），操作区有 3 个图标：启动/停止、详情、删除。空间利用率低，且与参考项目 mcp-router-main（`ServerCardCompact`）的交互模型不一致——参考项目中整张卡片可点击进入详情，卡片上只保留运行控制与删除。

## 目标

- 点击卡片任意位置即可进入该服务器的详情页 `/servers/:id`。
- 卡片操作区只保留「启动/停止」与「删除」两个图标，去掉「详情」按钮，节省空间。
- 交互按钮与拖拽手柄点击时不触发卡片跳转。

## 设计

### 1. 整卡可点击进入详情

在 `ServerCard.tsx` 的根 `Card` 上挂 `onClick`，导航到 `/servers/${server.id}`：

- 卡片加 `cursor-pointer` 与 hover 视觉反馈（已有 hover 阴影，补充 `cursor-pointer` 与 hover 边框提亮）。
- 键盘可达性：根 `Card` 加 `role="link"`、`tabIndex={0}`，`onKeyDown` 中 Enter / Space 触发同一跳转（参考项目未做，此处补齐）。
- 跳转逻辑原在 `ServerControls` 的 `useNavigate`（详情按钮），上移到 `ServerCard` 根节点；`ServerControls` 不再需要 `useNavigate`。

### 2. 操作区只留「启动/停止」+「删除」

`ServerControls` 中移除 `PanelRightOpen` 详情按钮，仅保留：

- `LifecycleButton`（Play / Square，含 starting/stopping 加载态，不改为 Switch——用户确认保留图标按钮）。
- 删除按钮（Trash2），现有确认行流程（`RemoveFeedbackRow`）不变。

### 3. 防误触跳转（stopPropagation）

以下交互元素的点击事件需 `stopPropagation`，避免冒泡触发卡片跳转：

- `LifecycleButton` 的启动/停止点击。
- 删除按钮点击（`onRequestRemove`）。
- `RemoveFeedbackRow` 中的 Cancel / Remove / Dismiss 按钮。
- 列表视图的拖拽手柄（`ServerListView` 传入的 `dragHandle` 已由 `SortableServerCard` 包装；若手柄未自身阻止冒泡，在 `ServerCard` 渲染 dragHandle 处包一层 `stopPropagation`）。

### 4. 删除确认期间禁止跳转

当 `RemoveFeedbackRow` 处于可见状态（`confirmingRemove` / `isRemoving` / `removeError` 任一非空）时，卡片点击不触发跳转，避免打断破坏性确认流程。用户取消/确认/关闭反馈后恢复可跳转。

## 涉及文件

| 文件                                         | 改动                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/components/servers/ServerCard.tsx`      | 根 Card 加可点击导航与键盘可达性；移除详情按钮；为操作区与拖拽手柄加 stopPropagation；删除确认期间禁用跳转 |
| `src/components/servers/ServerCard.test.tsx` | 补充测试：整卡跳转、详情按钮不再渲染、操作按钮不触发跳转                                                   |

## 不改动

- `ServerGridView` / `ServerListView` / `Servers.tsx` 的逻辑与数据流（卡片跳转全部收口在 `ServerCard`）。
- Play/Stop 图标按钮与 starting/stopping 加载态、删除确认行流程。
- 状态→颜色的映射规则、搜索、排序、视图偏好持久化等既有功能。
- 不引入删除确认弹窗；不做返回时的滚动位置恢复（用户确认不需要）。

## 验收

- 点击卡片任意位置（含标题、命令预览、头像等非交互区域）跳转到 `/servers/:id` 详情页。
- 卡片上不再出现 `PanelRightOpen` 详情按钮；操作区仅剩启动/停止与删除。
- 点击启动/停止、删除、删除确认行的 Cancel/Remove/Dismiss，均不触发跳转。
- 列表视图拖动排序手柄时正常拖动，单击手柄不触发跳转。
- 显示删除确认行期间，点击卡片其他区域不跳转。
- 键盘 Tab 聚焦卡片后按 Enter / Space 可进入详情。
