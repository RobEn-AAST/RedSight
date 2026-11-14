import { Component, type ReactNode } from 'react'

/**
 * Keeps one failing part from blanking the whole app: a lazy chunk that fails to load (for example after a
 * redeploy replaced it) or a render error shows `fallback` instead of unmounting everything.
 */
export class ErrorBoundary extends Component<
  { fallback: (reset: () => void) => ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  reset = () => this.setState({ failed: false })

  render() {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children
  }
}
