import React from 'react';
import { PRODUCT_NAME } from '../utils/brand';
import { reportClientMonitoringEvent } from '../utils/monitoring';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportClientMonitoringEvent({
      category: 'frontend_route_crash',
      message: error.message || 'The React application crashed while rendering a route.',
      stack: error.stack || '',
      componentStack: info.componentStack || '',
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="simple-shell">
          <div className="simple-page">
            <div className="simple-panel simple-panel-tight text-center">
              <p className="simple-eyebrow">Unexpected error</p>
              <h1 className="simple-title">{PRODUCT_NAME} hit a page error.</h1>
              <p className="simple-subtitle">
                The failure was reported so we can inspect it after deployment. Refresh once to reopen the workspace.
              </p>
              <button
                type="button"
                className="simple-button simple-button-primary mx-auto mt-6"
                onClick={this.handleReload}
              >
                Reload the app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
