/**
 * Popover — minimal accessible dialog used by AiSummaryButton.
 *
 * Implements focus management per _workspace/02_api_spec.md §D:
 *   - On open: focus the first focusable element inside.
 *   - On close: return focus to the trigger.
 *   - ESC closes.
 *   - Tab is trapped (last → first wrap, Shift+Tab first → last).
 *   - role="dialog", aria-modal="true".
 *
 * No portal: rendered inline. Consumers wanting a portal should compose with
 * their own primitives (compound pattern).
 */

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** Element that opened the popover; focus returns here on close. */
  triggerRef: RefObject<HTMLElement | null>;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}

export function Popover({
  open,
  onClose,
  triggerRef,
  className,
  ariaLabel = '결과',
  children,
}: PopoverProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null);

  // Focus first focusable on open; restore on close.
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    // Snapshot the trigger at effect-setup time so the cleanup below uses the
    // element that owned the popover when it opened (per
    // react-hooks/exhaustive-deps guidance for ref values).
    const trigger = triggerRef.current;
    const focusables = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusables[0];
    if (first) first.focus();
    return () => {
      if (trigger && typeof trigger.focus === 'function') trigger.focus();
    };
  }, [open, triggerRef]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = ref.current;
      if (!root) return;
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((n) => !n.hasAttribute('disabled'));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    // role="dialog" is interactive per ARIA, but eslint-plugin-jsx-a11y
    // treats <div role="dialog"> as non-interactive in older rule presets.
    // We add `tabIndex={-1}` so the dialog itself is focusable (used by
    // focus-restoration) and add an explicit lint suppression for the
    // keyboard listener which IS the documented dialog behaviour (ESC + Tab
    // trap, see _workspace/02_api_spec.md §D).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-aireact-popover="true"
      className={className}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}
