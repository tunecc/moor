# Servers 界面视图切换与状态徽章优化

日期：2026-08-08
状态：已确认，待实现

## 背景

Servers 页面近期加入了列表/网格视图切换与名称搜索（见 `2026-08-06-servers-view-search-design.md`）。上线后存在两处体验问题：

1. **视图切换按钮不显眼**：工具栏右侧是两个独立的图标按钮（`List` / `LayoutGrid`），活动项用浅灰底、非活动项用淡描边，两者对比很弱，图标仅 16px，用户反馈「像一个点，完全看不出来」是个切换器。
2. **网格视图状态文字冗余**：网格视图（`variant="compact"`）的每张卡片已经用底色区分运行状态（运行=绿、错误=红、启动/停止=金、停止=中性），同时 `ServerAvatar` 的边框/底色也参与表达，但 `StatusBadge` 仍始终显示「圆点 + Running/Stopped」文字，信息重复。

## 目标

- 让视图切换控件一眼能被识别为「切换器」，并清楚指示当前视图。
- 网格视图去掉冗余的状态文字，状态判断完全交给卡片底色与头像。
- 列表视图保持现有信息密度，不受影响。

## 设计

### 1. 视图切换改为连体分段控件

**位置**：搜索框右侧，与现状一致。

**结构**：把 `ServersToolbar.tsx` 中两个独立的图标按钮合并为一个连体分段控件（segmented control）：

- 一个圆角胶囊容器（`h-9`，与搜索框等高），内含两个等宽的图标格。
- 左格图标 `List`（≡），右格图标 `LayoutGrid`（▦）。
- 两格之间无间隙，仅外层统一圆角，形成「连体」外观。

**活动项样式**：实心填充，使用项目品牌色 `cursor-orange` 系（与 `Button` 的 `default` 变体 hover 态、`Badge` 的 `accent` 变体同色系）。`cursor-orange` 为亮橙，图标用深色（`text-surface-200` 或近黑）保证对比度。

**非活动项样式**：透明背景，图标用 `--fg-40` 弱化色；hover 时轻微底色提示。

**可达性**：保留 `aria-pressed`（活动项为 `true`）、`title`（"List view" / "Grid view"）、`aria-label`。键盘 Tab 可达、Enter/Space 可激活，行为与现状一致。

**视觉对比**：从「两个孤立的淡描边小图标」变为「一个明显的连体切换器」，活动项实心高亮，一眼可辨当前视图。

### 2. 网格视图去掉状态徽章

在 `ServerCard.tsx` 的 `ServerIdentity` 组件中，`StatusBadge` 仅在非 compact（列表视图）时渲染：

```tsx
{
  !compact && <StatusBadge status={displayStatus} />;
}
```

网格视图（`variant="compact"`）完全不显示状态徽章。状态判断交给：

- 卡片底色（`ServerCard` 根 `Card` 的 `bg-success-muted/[0.02]` / `bg-error-warm/[0.02]` / `bg-gold/[0.02]` 等条件类）。
- `ServerAvatar` 的边框与底色（运行=绿、错误=红、停止=中性）。

列表视图（`variant="full"`）保持现状，`StatusBadge` 照常显示「圆点 + 文字」。

## 涉及文件

| 文件                                        | 改动                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| `src/components/servers/ServersToolbar.tsx` | 重写视图切换部分为连体分段控件；保留搜索框与清空按钮逻辑不变 |
| `src/components/servers/ServerCard.tsx`     | `ServerIdentity` 中给 `StatusBadge` 加 `!compact` 渲染条件   |

## 不改动

- `StatusBadge` 组件本身（列表视图仍在使用）。
- `ServerGridView` / `ServerListView` / `Servers.tsx` 的逻辑与数据流。
- 状态→颜色的映射规则（`StatusBadge` 的 `statusConfig`、`ServerCard` 的底色条件类）。
- 搜索、排序、视图偏好持久化等既有功能。

## 验收

- 视图切换控件呈现为连体分段控件，活动项实心高亮，一眼可辨当前是列表还是网格视图。
- 在列表视图与网格视图间切换，分段控件活动项正确跟随 `viewMode`。
- 网格视图中卡片不显示 `StatusBadge`；运行/错误/启动/停止/停止态仍可通过卡片底色与头像边框区分。
- 列表视图中 `StatusBadge` 照常显示，文字与圆点不变。
- 搜索框、清空按钮、键盘可达性、`aria-pressed`/`title` 行为不受影响。
