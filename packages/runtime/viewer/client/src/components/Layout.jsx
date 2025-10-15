import React from 'react';
import './Layout.css';

/**
 * Main Layout Component
 * Provides header, main content area, and consistent spacing
 */
export function Layout({ children }) {
  return (
    <div className="layout">
      <header className="layout-header">
        <div className="header-content">
          <h1 className="header-title">Protocol Viewer</h1>
          <p className="header-subtitle">OSS Protocol Discovery & Governance</p>
        </div>
      </header>
      <main className="layout-main">
        {children}
      </main>
    </div>
  );
}
