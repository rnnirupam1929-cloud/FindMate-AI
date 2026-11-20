import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI error:", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center" role="alert">
        <h1 className="text-2xl font-extrabold">Something went wrong</h1>
        <p className="mt-2 text-sm text-stone">The page hit an unexpected problem. Your data is safe. Try reloading.</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>Reload page</Button>
      </div>
    );
  }
}
