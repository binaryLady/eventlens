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
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
          <div className="text-center">
            <h2 className="font-heading text-2xl font-bold text-zinc-100">
              Something went wrong
            </h2>
            <p className="mt-2 text-zinc-400">
              There was an error loading the photos. Please try again.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="mt-4 rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
