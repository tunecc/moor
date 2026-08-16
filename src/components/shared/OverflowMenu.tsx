import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface OverflowMenuItem {
  /** 稳定 key,用作 React key。 */
  key: string;
  /** 菜单项可读标签。 */
  label: ReactNode;
  /** 是否选中态(渲染前导勾)。 */
  selected?: boolean;
  /** 是否禁用。 */
  disabled?: boolean;
  /** 选择该项时触发。 */
  onSelect: () => void;
}

interface OverflowMenuProps {
  /** 触发按钮的 aria-label / title。 */
  triggerLabel: string;
  /** 触发按钮图标。 */
  triggerIcon: ReactNode;
  /** 菜单项集合。 */
  items: OverflowMenuItem[];
  /** 是否禁用整组触发器(如正在提交)。 */
  disabled?: boolean;
  /** 透传到触发按钮的 className。 */
  triggerClassName?: string;
}

/**
 * 受控的最小溢出菜单:不引入新依赖,基于 click/outside-close + 键盘可达。
 * 触发器为 <button>;菜单用 role="menu",项用 role="menuitemradio" + aria-checked。
 */
export function OverflowMenu({
  triggerLabel,
  triggerIcon,
  items,
  disabled = false,
  triggerClassName,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  // 外部点击 / Esc 关闭。
  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // 打开时聚焦第一项。
  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  const handleItemSelect = (item: OverflowMenuItem) => {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(event.currentTarget as HTMLElement, 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(event.currentTarget as HTMLElement, -1);
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerLabel}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        // 触发器不触发卡片 click 跳转;键盘 Enter 由 button 自身处理,不冒泡到卡片。
        onKeyDown={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--fg-45)] transition-all duration-150",
          "hover:bg-[var(--fg-06)] hover:text-cursor-dark active:scale-[0.97]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cursor-orange/60",
          "disabled:pointer-events-none disabled:opacity-50",
          triggerClassName,
        )}
      >
        {triggerIcon}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={triggerLabel}
          aria-orientation="vertical"
          onKeyDown={handleMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute right-0 z-50 mt-1 min-w-[12rem] max-h-72 overflow-auto rounded-xl border border-[var(--fg-10)] bg-surface-100 p-1",
            "shadow-[rgba(0,0,0,0.14)_0px_28px_70px,rgba(0,0,0,0.1)_0px_14px_32px,var(--fg-10)_0px_0px_0px_1px]",
            "animate-fade-in",
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={item.selected ?? false}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                handleItemSelect(item);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-body text-sm text-cursor-dark transition-colors duration-150",
                "hover:bg-surface-300/70 focus:bg-surface-300 focus:outline-none",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-cursor-orange">
                {item.selected ? "✓" : ""}
              </span>
              <span className="min-w-0 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function moveFocus(menu: HTMLElement, direction: 1 | -1) {
  const itemEls = Array.from(
    menu.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]'),
  ).filter((el) => !el.disabled);
  if (itemEls.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const currentIndex = active ? itemEls.indexOf(active as HTMLButtonElement) : -1;
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = itemEls.length - 1;
  if (nextIndex >= itemEls.length) nextIndex = 0;
  itemEls[nextIndex]?.focus();
}
