import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error?: Error;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Erro de renderização do KanPlayer", error, errorInfo);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "var(--black-200)",
          color: "var(--white)",
          fontFamily: "Montserrat, sans-serif",
        }}
      >
        <section style={{ maxWidth: 600, textAlign: "center" }}>
          <h1 style={{ color: "var(--red-100)" }}>Ocorreu um erro</h1>
          <p>{error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: undefined })}
          >
            Tentar novamente
          </button>
        </section>
      </main>
    );
  }
}
