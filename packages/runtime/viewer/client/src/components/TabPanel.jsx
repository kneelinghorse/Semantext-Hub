import React from 'react';
import { useSemanticPanel } from '../hooks/useSemanticPanel.js';
import './TabPanel.css';

/**
 * Tab Panel Component
 * Container for tab content with loading and error states
 * @param {string} tabId - Tab identifier
 * @param {boolean} active - Whether this panel is currently active
 * @param {boolean} loading - Loading state
 * @param {Error} error - Error object if request failed
 * @param {ReactNode} children - Panel content
 */
export function TabPanel({ tabId, active, loading, error, children }) {
  const panelState = loading ? 'loading' : error ? 'error' : 'ready';
  const panelSemanticAttrs = useSemanticPanel(`urn:proto:viewer:${tabId}:panel`, {
    type: 'tab-panel',
    context: {
      tabId,
      state: panelState,
    }
  });

  if (!active) return null;

  return (
    <div
      className="tab-panel"
      role="tabpanel"
      id={`panel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      tabIndex={0}
      data-semantic-panel={tabId}
      data-semantic-state={panelState}
      {...panelSemanticAttrs}
    >
      {loading && (
        <div className="panel-state">
          <div className="loading-spinner" aria-label="Loading content">
            <div className="loading"></div>
          </div>
          <p className="state-message">Loading {tabId} data...</p>
        </div>
      )}

      {error && !loading && (
        <div className="panel-state error">
          <div className="error-icon" aria-hidden="true">⚠️</div>
          <p className="state-message error-message">
            Failed to load {tabId} data
          </p>
          <p className="error-details">{error.message}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="panel-content">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Empty State Component
 * Shows when no data is available
 */
export function EmptyState({ icon = '📭', message = 'No data available' }) {
  return (
    <div className="panel-state empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <p className="state-message">{message}</p>
    </div>
  );
}
