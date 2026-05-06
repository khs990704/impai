/**
 * <AiSummaryButton> — Click → summarise → popover with result.
 *
 * Per _workspace/02_api_spec.md §A.3 + spec/05_wireframe.md §2.
 *
 * Behaviour:
 *   - `input === ''` → button disabled, `data-state="disabled"`.
 *   - In-flight click → ignored (no double dispatch).
 *   - Default render: built-in Popover with Copy + Re-summarise actions.
 *   - render-prop overrides the popover entirely; consumer is responsible
 *     for layout / positioning.
 *   - aria-haspopup="dialog", aria-expanded reflects popover state.
 */

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAiSummary, type UseAiSummaryOptions } from '@/hooks/useAiSummary';
import { Popover } from './parts/Popover';

export interface AiSummaryButtonProps {
  input: string;
  /** default: '다음 텍스트를 3줄로 요약해줘.' */
  prompt?: string;
  trigger?: 'click' | 'hover' | 'manual';
  /** Render-prop. Replaces default popover when provided. */
  render?: (s: { result: string; loading: boolean; error?: Error }) => ReactNode;
  onResult?: (result: string) => void;
  className?: string;
  /** Button label. default: '✨ 요약하기' */
  children?: ReactNode;
  /** Hook for tests. */
  'data-testid'?: string;
}

export function AiSummaryButton(props: AiSummaryButtonProps): JSX.Element {
  const {
    input,
    prompt,
    trigger = 'click',
    render,
    onResult,
    className,
    children,
    'data-testid': testId,
  } = props;

  const summaryOpts: UseAiSummaryOptions = {};
  if (prompt !== undefined) summaryOpts.prompt = prompt;
  const { summarize, loading, error, result } = useAiSummary(summaryOpts);

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const isDisabled = input.length === 0 || loading;
  const dataState = isDisabled
    ? loading
      ? 'loading'
      : 'disabled'
    : error
      ? 'error'
      : open
        ? 'open'
        : 'idle';

  const run = useCallback(async () => {
    if (loading || input.length === 0) return;
    try {
      const res = await summarize(input);
      onResult?.(res);
      setOpen(true);
    } catch {
      // error surfaces via `error` field; popover stays closed.
    }
  }, [loading, input, summarize, onResult]);

  const handleClick = useCallback(() => {
    if (trigger === 'manual') return;
    void run();
  }, [run, trigger]);

  const handleMouseEnter = useCallback(() => {
    if (trigger !== 'hover') return;
    void run();
  }, [run, trigger]);

  const handleClose = useCallback(() => setOpen(false), []);

  const renderProps: { result: string; loading: boolean; error?: Error } = {
    result: result ?? '',
    loading,
  };
  if (error) renderProps.error = error;

  return (
    <div
      data-aireact-summary="true"
      data-state={dataState}
      className={className}
      data-testid={testId ?? 'aireact-summary'}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        data-aireact-button="summary-trigger"
      >
        {children ?? (loading ? '⏳ 요약 중…' : '✨ 요약하기')}
      </button>
      {render ? (
        render(renderProps)
      ) : (
        <Popover open={open} onClose={handleClose} triggerRef={triggerRef} ariaLabel="요약 결과">
          <div data-aireact-popover-header="true">
            <span>요약 결과</span>
            <button
              type="button"
              onClick={handleClose}
              aria-label="닫기"
              data-aireact-button="close"
            >
              ×
            </button>
          </div>
          <div data-aireact-popover-body="true">{result ?? ''}</div>
          <div data-aireact-popover-actions="true">
            <button
              type="button"
              onClick={() => {
                if (result) void navigator.clipboard?.writeText(result);
              }}
              data-aireact-button="copy"
            >
              복사
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void run();
              }}
              data-aireact-button="resummarize"
            >
              다시 요약
            </button>
          </div>
        </Popover>
      )}
    </div>
  );
}
