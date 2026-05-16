import React from 'react';
import { TrendingUp } from 'lucide-react';

const DashboardView = () => (
  <div style={{ padding: 24 }}>
    <h2>Dashboard</h2>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <TrendingUp size={32} color="green" />
      <span>¡Tus métricas van en aumento!</span>
    </div>
  </div>
);

export default DashboardView;
