import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`ErrorBoundary [${this.props.label || 'unknown'}]:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-display">
          <div className="error-display__title">
            Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}
          </div>
          <div className="error-display__message">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </div>
          {this.state.showDetails && this.state.error?.stack && (
            <pre style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
              {this.state.error.stack}
            </pre>
          )}
          <div className="error-display__actions">
            <button className="btn btn--primary btn--sm" onClick={this.handleRetry}>
              Retry
            </button>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
            >
              {this.state.showDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
