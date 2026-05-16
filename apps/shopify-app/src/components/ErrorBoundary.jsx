import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    // Puedes loguear el error aquí
  }
  render() {
    if (this.state.hasError) {
      return <h2>Ocurrió un error en el dashboard.</h2>;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
