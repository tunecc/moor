import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { AlertTriangle, Loader2, Play, Square, Terminal, Trash2, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Server } from "@moor/types";
import type { ServerAction } from "@/hooks/server-patch-utils";
import { cn, getErrorMessage } from "@/lib/utils";

type RemoveFeedback =
  | { kind: "confirm"; message: string }
  | { kind: "removing"; message: string }
  | { kind: "error"; message: string }
  | null;

function getRemoveFeedback({
  serverName,
  confirmingRemove,
  isRemoving,
  removeError,
}: {
  serverName: string;
  confirmingRemove: boolean;
  isRemoving: boolean;
  removeError: string | null;
}): RemoveFeedback {
  if (isRemoving) return { kind: "removing", message: `Removing ${serverName}...` };
  if (removeError) return { kind: "error", message: removeError };
  if (confirmingRemove)
    return { kind: "confirm", message: `Remove "${serverName}"? This cannot be undone.` };
  return null;
}

interface ServerCardProps {
  server: Server;
  action?: ServerAction;
  variant?: "full" | "compact";
  dragHandle?: ReactNode;
  isSorting?: boolean;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

function getCommandPreview(server: Server): string {
  return server.connectionType === "stdio"
    ? `${server.command || ""} ${(server.args || []).join(" ")}`.trim()
    : server.url || "";
}

function ServerAvatar({
  isRunning,
  isError,
  compact = false,
}: {
  isRunning: boolean;
  isError: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200",
        compact ? "h-8 w-8" : "h-10 w-10",
        isRunning
          ? "bg-success-muted/10 text-success-muted border border-success-muted/20"
          : isError
            ? "bg-error-warm/10 text-error-warm border border-error-warm/20"
            : "bg-surface-300 text-[var(--fg-35)] border border-[var(--fg-08)]",
      )}
    >
      <Terminal className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} />
    </div>
  );
}

function ServerIdentity({
  server,
  commandPreview,
  displayStatus,
  compact = false,
}: {
  server: Server;
  commandPreview: string;
  displayStatus: string;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="font-headline text-sm font-medium text-cursor-dark truncate">
          {server.name}
        </span>
        {server.autoStart && (
          <span title="Auto Start" className="inline-flex shrink-0">
            <Zap className="h-3 w-3 text-gold" />
          </span>
        )}
        {!compact && <StatusBadge status={displayStatus} />}
      </div>
      {commandPreview && (
        <p
          className={cn(
            "font-mono text-[var(--fg-40)] truncate",
            compact ? "text-[10px]" : "text-[11px]",
          )}
        >
          {commandPreview}
        </p>
      )}
    </div>
  );
}

function LifecycleButton({
  serverId,
  isRunning,
  isStarting,
  isStopping,
  isBusy,
  onStart,
  onStop,
}: {
  serverId: string;
  isRunning: boolean;
  isStarting: boolean;
  isStopping: boolean;
  isBusy: boolean;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
}) {
  if (isRunning) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="text-[var(--fg-45)] hover:text-error-warm hover:bg-error-warm/10 active:bg-error-warm/20 transition-all duration-150"
        disabled={isBusy}
        onClick={() => void onStop(serverId)}
        title={isStopping ? "Stopping server" : "Stop server"}
      >
        {isStopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-[var(--fg-45)] hover:text-success-muted hover:bg-success-muted/10 active:bg-success-muted/20 transition-all duration-150"
      disabled={isBusy}
      onClick={() => void onStart(serverId)}
      title={isStarting ? "Starting server" : "Start server"}
    >
      {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}

function ServerControls({
  server,
  isStarting,
  isStopping,
  isBusy,
  isRemoving,
  onStart,
  onStop,
  onRequestRemove,
}: {
  server: Server;
  isStarting: boolean;
  isStopping: boolean;
  isBusy: boolean;
  isRemoving: boolean;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRequestRemove: () => void;
}) {
  const controlsDisabled = isBusy || isRemoving;

  return (
    <div
      className="flex items-center gap-1 shrink-0 bg-surface-300/50 rounded-lg p-1"
      onClick={(e) => e.stopPropagation()}
      // 阻止容器捕获键盘事件冒泡到卡片(避免触发卡片 Enter/Space 跳转)。
      onKeyDown={(e) => e.stopPropagation()}
    >
      <LifecycleButton
        serverId={server.id}
        isRunning={server.status === "running"}
        isStarting={isStarting}
        isStopping={isStopping}
        isBusy={controlsDisabled}
        onStart={onStart}
        onStop={onStop}
      />
      <Button
        variant="ghost"
        size="icon"
        className="text-[var(--fg-45)] hover:text-error-warm hover:bg-error-warm/10 active:bg-error-warm/20 transition-all duration-150"
        disabled={controlsDisabled}
        onClick={onRequestRemove}
        title="Remove server"
        aria-label={`Remove ${server.name}`}
      >
        {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function RemoveFeedbackRow({
  feedback,
  onCancel,
  onConfirm,
}: {
  feedback: NonNullable<RemoveFeedback>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isError = feedback.kind === "error";
  const isRemoving = feedback.kind === "removing";

  return (
    <div
      className={cn(
        "mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 animate-fade-in",
        isError ? "border-error-warm/15 bg-error-warm/8" : "border-gold/15 bg-gold/8",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isRemoving ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gold" />
        ) : (
          <AlertTriangle
            className={cn("h-3.5 w-3.5 shrink-0", isError ? "text-error-warm" : "text-gold")}
          />
        )}
        <p
          className={cn(
            "truncate font-body text-xs",
            isError ? "text-error-warm" : "text-[var(--fg-55)]",
          )}
          title={feedback.message}
        >
          {feedback.message}
        </p>
      </div>
      {feedback.kind === "confirm" && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-error-warm hover:bg-error-warm/10 hover:text-error-warm"
            onClick={onConfirm}
          >
            Remove
          </Button>
        </div>
      )}
      {feedback.kind === "error" && (
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Dismiss
        </Button>
      )}
    </div>
  );
}

export function ServerCard({
  server,
  action,
  variant = "full",
  dragHandle,
  isSorting,
  onStart,
  onStop,
  onRemove,
}: ServerCardProps) {
  const isCompact = variant === "compact";
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const navigate = useNavigate();
  const isRunning = server.status === "running";
  const isError = server.status === "error";
  const isStarting = server.status === "starting" || action === "starting";
  const isStopping = action === "stopping";
  const commandPreview = getCommandPreview(server);
  const displayStatus = isStopping ? "stopping" : server.status;
  const removeFeedback = getRemoveFeedback({
    serverName: server.name,
    confirmingRemove,
    isRemoving,
    removeError,
  });

  const navigationBlocked = removeFeedback !== null;

  const handleCardClick = () => {
    if (navigationBlocked) return;
    navigate(`/servers/${server.id}`);
  };

  // Only handle card-level keys when the card itself is focused; inner controls own their key events.
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return; // inner controls handle their own keys
    if (navigationBlocked) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate(`/servers/${server.id}`);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    setRemoveError(null);
    try {
      await onRemove(server.id);
      setConfirmingRemove(false);
    } catch (err) {
      setRemoveError(getErrorMessage(err, "Unable to remove server"));
    } finally {
      setIsRemoving(false);
    }
  };

  const clearRemoveFeedback = () => {
    setConfirmingRemove(false);
    setRemoveError(null);
  };

  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={`Open ${server.name}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={cn(
        "group cursor-pointer transition-all duration-200 hover:shadow-[rgba(0,0,0,0.04)_0px_12px_40px,rgba(0,0,0,0.02)_0px_0px_16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cursor-orange/60",
        !isCompact &&
          isSorting &&
          "shadow-[rgba(0,0,0,0.08)_0px_18px_44px] ring-1 ring-cursor-orange/20",
        isRunning && !isStopping && "bg-success-muted/[0.02] border-success-muted/10",
        isError && "bg-error-warm/[0.02] border-error-warm/10",
        isStarting && "bg-gold/[0.02] border-gold/10",
        isStopping && "bg-gold/[0.02] border-gold/10",
      )}
    >
      <CardContent className={isCompact ? "p-3" : "p-4"}>
        <div>
          <div className={cn("flex items-center justify-between", isCompact ? "gap-2" : "gap-3")}>
            <div className={cn("flex items-center min-w-0 flex-1", isCompact ? "gap-2" : "gap-3")}>
              {!isCompact && (
                <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                  {dragHandle}
                </span>
              )}
              <ServerAvatar isRunning={isRunning} isError={isError} compact={isCompact} />
              <ServerIdentity
                server={server}
                commandPreview={commandPreview}
                displayStatus={displayStatus}
                compact={isCompact}
              />
            </div>
            <ServerControls
              server={server}
              isStarting={isStarting}
              isStopping={isStopping}
              isBusy={isStarting || isStopping}
              isRemoving={isRemoving}
              onStart={onStart}
              onStop={onStop}
              onRequestRemove={() => {
                setConfirmingRemove(true);
                setRemoveError(null);
              }}
            />
          </div>
          {removeFeedback && (
            <RemoveFeedbackRow
              feedback={removeFeedback}
              onCancel={clearRemoveFeedback}
              onConfirm={() => void handleRemove()}
            />
          )}
          {isError && server.errorMessage && (
            <ErrorBanner message={server.errorMessage} variant="mono" className="mt-3" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
