import { Component, type ReactNode, type ErrorInfo } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  /** 表示用ラベル。"○○を表示できませんでした" の○○に入る */
  label?: string;
  className?: string;
};

type State = { hasError: boolean };

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[SectionErrorBoundary]', this.props.label, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={cn(
            'rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground',
            this.props.className,
          )}
        >
          {this.props.label ?? 'この項目'}を表示できませんでした
        </div>
      );
    }
    return this.props.children;
  }
}
