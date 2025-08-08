import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
          <div className="max-w-lg w-full bg-white/10 border border-white/10 rounded-2xl p-6">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-300 mb-4">{this.state.error?.message || 'Unknown error'}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded bg-white/10 hover:bg-white/20">Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary

