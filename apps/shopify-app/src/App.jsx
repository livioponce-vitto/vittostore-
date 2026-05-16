import React from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardView from './components/DashboardView';

function App() {
  return (
    <ErrorBoundary>
      <DashboardView />
    </ErrorBoundary>
  );
}

export default App;
