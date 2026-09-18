import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="app__bg" />
          <main
            className="app__main app__main--narrow"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 16,
              minHeight: '60vh',
            }}
          >
            <h1 className="t-title">Awkward…</h1>
            <p className="t-body">
              Something glitched. No worries — it resets itself.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => this.setState({ error: null })}
              >
                Back to home
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}