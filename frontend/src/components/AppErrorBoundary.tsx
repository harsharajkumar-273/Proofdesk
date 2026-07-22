import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { PRODUCT_NAME } from '../utils/brand';
import { reportClientMonitoringEvent } from '../utils/monitoring';

type Props = {
  children: React.ReactNode;
};

const FallbackComponent = ({ resetErrorBoundary }: { resetErrorBoundary: () => void }) => {
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
            onClick={() => {
               window.location.reload();
               resetErrorBoundary();
            }}
          >
            Reload the app
          </button>
        </div>
      </div>
    </div>
  );
};

const handleError = (error: Error, info: { componentStack?: string }) => {
  reportClientMonitoringEvent({
    category: 'frontend_route_crash',
    message: error.message || 'The React application crashed while rendering a route.',
    stack: error.stack || '',
    componentStack: info.componentStack || '',
  });
};

const AppErrorBoundary = ({ children }: Props) => {
  return (
    <ErrorBoundary FallbackComponent={FallbackComponent} onError={handleError}>
      {children}
    </ErrorBoundary>
  );
};

export default AppErrorBoundary;
