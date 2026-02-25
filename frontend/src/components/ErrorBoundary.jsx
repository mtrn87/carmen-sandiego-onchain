import { Component } from 'react'
import styles from './ErrorBoundary.module.css'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className={styles.container}>
          <div className={styles.box}>
            <div className={styles.header}>
              <span className={styles.icon}>[!</span>
              <span className={styles.title}>SYSTEM ERROR</span>
              <span className={styles.icon}>!]</span>
            </div>
            <div className={styles.body}>
              <p className={styles.message}>
                {this.props.name
                  ? `Module "${this.props.name}" encountered a critical failure.`
                  : 'An unexpected error occurred.'}
              </p>
              {this.state.error && (
                <pre className={styles.errorDetail}>
                  {this.state.error.message || 'Unknown error'}
                </pre>
              )}
              <button className={styles.retryBtn} onClick={this.handleRetry}>
                RETRY
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
