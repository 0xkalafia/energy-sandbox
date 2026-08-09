/**
 * The small bordered button used across the header toolbar — Scenarios, the
 * theme toggle, Share, the command-palette shortcut.
 *
 * It lived as the same 250-character class string copy-pasted into four files,
 * which is how the tap-target problem went unnoticed: at 11px text with
 * `py-1.5` these come out 26–31px tall, under the ~32px a fingertip reliably
 * hits, and there was no single place to say so. `pointer-coarse` only applies
 * on touch input, so phones and tablets get the taller box and a mouse-driven
 * desktop keeps the compact one.
 */
export const TOOLBAR_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] " +
  "bg-[var(--color-bg-elevated)]/60 px-2.5 py-1.5 text-[11px] font-medium " +
  "text-[var(--color-fg-muted)] backdrop-blur-md transition-all " +
  "hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)] " +
  "pointer-coarse:min-h-[36px] pointer-coarse:px-3";
