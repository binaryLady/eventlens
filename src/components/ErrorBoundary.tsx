// @TheTechMargin 2026
"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-black px-4 grid-bg">
          <div className="text-center border border-[#ff000033] bg-black p-8">
            <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-red-500">
              &#9888; SYSTEM ERROR
            </h2>
            <p className="mt-2 text-xs font-mono uppercase tracking-wider text-[var(--el-green-55)]">
              FAILED TO LOAD PHOTO INTERFACE — RETRY RECOMMENDED
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="mt-4 border border-[var(--el-green-99)] px-6 py-2 text-xs font-mono uppercase tracking-wider text-[var(--el-green-99)] hover:bg-[var(--el-magenta-28)] hover:border-[var(--el-magenta)] hover:text-[var(--el-magenta)] transition-all"
            >
              [REBOOT]
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
