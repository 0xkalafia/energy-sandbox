import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw, Home } from "lucide-react";
import { classifyError, errorMessage, hasScenarioInUrl } from "@/lib/errorKind";

interface Props {
  children: ReactNode;
  /** Change this to clear a caught error — e.g. the active tab id, so moving
   *  to a different tab gets you out of a broken one. */
  resetKey?: string;
  /** Named in the fallback so it's obvious how much broke. */
  label?: string;
}

interface State {
  error: unknown | null;
  /** Bumped on reset so the subtree remounts rather than re-rendering the
   *  same failed component instances. */
  attempt: number;
  /** The resetKey in force when the error was caught. Reset happens on a move
   *  *away* from this, never on the change that arrived with the crash. */
  keyAtError: string | undefined;
}

/**
 * Catches render errors so one failure doesn't take the whole page with it.
 *
 * Still a class: React has no hook equivalent, in 19 or otherwise.
 *
 * Two of these are mounted. One wraps the tab panels *inside* `<Tabs>` — the
 * tab strip stays outside it, so when a panel dies the tabs are still there to
 * click, and switching tabs changes `resetKey` and clears the error. The other
 * sits at the root as a backstop for everything else. Without either, a crash
 * anywhere leaves React with an empty tree: a blank white page, no message,
 * nothing to click.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0, keyAtError: undefined };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  /**
   * Clear the error when the caller moves to a different resetKey.
   *
   * The comparison is against the key captured *with* the error, not against
   * the previous props, and that distinction is the whole point. Clicking a
   * tab changes `resetKey` and mounts the panel that throws in one go; a
   * previous-props check sees "the key changed" and wipes the error it has
   * just caught, re-renders the same doomed panel, catches again, and loops
   * until React gives up and unmounts the subtree — leaving exactly the blank
   * panel this component exists to prevent. Verified in a browser: the first
   * crash on a tab showed nothing at all, only the second one showed the
   * fallback.
   *
   * Derived from props rather than done in componentDidUpdate so it resolves
   * during render, with no intermediate commit that could flash the fallback.
   */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.keyAtError === props.resetKey) return null;
    return state.error
      ? { error: null, attempt: state.attempt + 1, keyAtError: props.resetKey }
      : { keyAtError: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // No error reporting service here, so the console is the record. Keep the
    // component stack — it's the only thing that says *where*.
    console.error(
      `[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`,
      error,
      info.componentStack,
    );
  }

  private retry = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  /** For a stale chunk, an ordinary reload can be answered from the same
   *  service-worker cache that caused it. Clear the caches and drop the
   *  registration first, best-effort, then reload. */
  private hardReload = async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs ?? []).map((r) => r.unregister()));
    } catch {
      // Private mode, an unsupported browser — reloading is still worth a try.
    }
    window.location.reload();
  };

  private startFresh = () => {
    window.location.href = window.location.pathname;
  };

  render() {
    const { error, attempt } = this.state;
    if (!error) {
      return <div key={attempt}>{this.props.children}</div>;
    }

    const kind = classifyError(error);
    const stale = kind === "stale-chunk";

    return (
      <div
        role="alert"
        className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/60 p-5"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-amber-glow,#e0a33e)]"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--color-fg)]">
              {stale
                ? "มีเวอร์ชันใหม่ — โหลดส่วนนี้ไม่สำเร็จ"
                : this.props.label
                  ? `ส่วน "${this.props.label}" แสดงผลไม่ได้`
                  : "หน้านี้แสดงผลไม่ได้"}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
              {stale
                ? "เว็บถูกอัปเดตระหว่างที่เปิดค้างไว้ ไฟล์ที่หน้านี้เรียกจึงไม่มีแล้ว กดโหลดใหม่แล้วใช้ต่อได้ตามปกติ ไม่ใช่ความผิดพลาดของข้อมูล"
                : "ส่วนอื่นของหน้ายังใช้ได้ กดลองใหม่ หรือสลับไปแท็บอื่นก่อนก็ได้"}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {stale ? (
                <button onClick={this.hardReload} className={BTN_PRIMARY}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  โหลดเวอร์ชันใหม่
                </button>
              ) : (
                <button onClick={this.retry} className={BTN_PRIMARY}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  ลองใหม่
                </button>
              )}
              {hasScenarioInUrl() && (
                <button onClick={this.startFresh} className={BTN}>
                  <Home className="h-3.5 w-3.5" aria-hidden="true" />
                  เริ่มจากค่าเริ่มต้น
                </button>
              )}
            </div>

            {/* The message itself is only useful to whoever is debugging, so
                it's folded away rather than shown as a wall of stack text. */}
            <details className="mt-4">
              <summary className="cursor-pointer text-[11px] text-[var(--color-fg-subtle)] select-none">
                รายละเอียดทางเทคนิค
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--color-bg-hover)]/50 p-3 text-[10px] leading-relaxed text-[var(--color-fg-muted)]">
                {errorMessage(error)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
}

const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] " +
  "bg-[var(--color-bg-elevated)]/60 px-3 py-1.5 text-[11px] font-medium " +
  "text-[var(--color-fg-muted)] transition-all hover:bg-[var(--color-bg-hover)] " +
  "hover:text-[var(--color-fg)] pointer-coarse:min-h-[36px]";

const BTN_PRIMARY =
  BTN +
  " border-[var(--color-emerald-glow)]/50 bg-[var(--color-emerald-glow)]/10 text-[var(--color-fg)]";
