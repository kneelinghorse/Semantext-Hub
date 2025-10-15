import React, { useState, useEffect } from 'react';
import { useSemanticRegistry } from '../contexts/SemanticRegistry.jsx';
import './SemanticDebugPanel.css';

/**
 * Semantic Debug Panel
 * Developer tool for visualizing semantic instrumentation
 * Activated via Ctrl+Shift+D or Cmd+Shift+D
 */
export function SemanticDebugPanel() {
  const { registry, debugMode, toggleDebugMode, getSnapshot } = useSemanticRegistry();
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState('registry'); // 'registry' | 'history' | 'attributes'

  if (!debugMode) {
    return null;
  }

  const handleCopySnapshot = () => {
    const snapshot = getSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      console.log('[SemanticDebugPanel] Registry snapshot copied to clipboard');
    });
  };

  const handleExportSnapshot = () => {
    const snapshot = getSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `semantic-registry-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`semantic-debug-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="debug-header">
        <div className="debug-title">
          <span className="debug-icon">🔍</span>
          <span>Semantic Registry</span>
          <span className="debug-badge">Debug</span>
        </div>
        <div className="debug-actions">
          <button
            className="debug-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▲' : '▼'}
          </button>
          <button
            className="debug-btn"
            onClick={toggleDebugMode}
            title="Close (Ctrl+Shift+D)"
          >
            ✕
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="debug-content">
          <div className="debug-tabs">
            <button
              className={`debug-tab ${activeView === 'registry' ? 'active' : ''}`}
              onClick={() => setActiveView('registry')}
            >
              Registry
            </button>
            <button
              className={`debug-tab ${activeView === 'history' ? 'active' : ''}`}
              onClick={() => setActiveView('history')}
            >
              History
            </button>
            <button
              className={`debug-tab ${activeView === 'attributes' ? 'active' : ''}`}
              onClick={() => setActiveView('attributes')}
            >
              Attributes
            </button>
          </div>

          <div className="debug-view">
            {activeView === 'registry' && (
              <RegistryView registry={registry} />
            )}
            {activeView === 'history' && (
              <HistoryView history={registry.history} />
            )}
            {activeView === 'attributes' && (
              <AttributesView />
            )}
          </div>

          <div className="debug-footer">
            <button className="debug-btn-small" onClick={handleCopySnapshot}>
              📋 Copy Snapshot
            </button>
            <button className="debug-btn-small" onClick={handleExportSnapshot}>
              💾 Export JSON
            </button>
            <span className="debug-hint">Ctrl+Shift+D to toggle</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Registry View - Shows active panels and metadata
 */
function RegistryView({ registry }) {
  const { activeTab, selectedManifest, activePanels, metadata } = registry;

  return (
    <div className="debug-section">
      <div className="debug-row">
        <span className="debug-label">Active Tab:</span>
        <span className="debug-value">{activeTab || 'none'}</span>
      </div>

      <div className="debug-row">
        <span className="debug-label">Selected Manifest:</span>
        <span className="debug-value">{selectedManifest || 'none'}</span>
      </div>

      <div className="debug-subsection">
        <h4>Active Panels ({Object.keys(activePanels).length})</h4>
        {Object.keys(activePanels).length === 0 ? (
          <p className="debug-empty">No active panels</p>
        ) : (
          <div className="debug-list">
            {Object.entries(activePanels).map(([panelId, data]) => (
              <div key={panelId} className="debug-item">
                <div className="debug-item-header">
                  <strong>{panelId}</strong>
                  <span className="debug-timestamp">
                    {new Date(data.registeredAt).toLocaleTimeString()}
                  </span>
                </div>
                <pre className="debug-code">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="debug-subsection">
        <h4>Metadata ({Object.keys(metadata).length})</h4>
        {Object.keys(metadata).length === 0 ? (
          <p className="debug-empty">No metadata</p>
        ) : (
          <pre className="debug-code">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * History View - Shows recent registry transitions
 */
function HistoryView({ history }) {
  if (!history || history.length === 0) {
    return <p className="debug-empty">No history recorded</p>;
  }

  return (
    <div className="debug-section">
      <div className="debug-list">
        {history.slice().reverse().map((entry, index) => (
          <div key={index} className="debug-history-item">
            <div className="debug-history-header">
              <span className="debug-history-type">{entry.type}</span>
              <span className="debug-timestamp">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="debug-history-details">
              {entry.tabId && <span>Tab: {entry.tabId}</span>}
              {entry.manifestId && <span>Manifest: {entry.manifestId}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Attributes View - Shows semantic attributes in the DOM
 */
function AttributesView() {
  const [attributes, setAttributes] = useState([]);

  useEffect(() => {
    const collectAttributes = () => {
      const elements = document.querySelectorAll('[data-semantic-urn], [data-semantic-type], [data-semantic-panel], [data-semantic-tab]');
      const collected = Array.from(elements).map((el) => {
        const attrs = {};
        Array.from(el.attributes).forEach((attr) => {
          if (attr.name.startsWith('data-semantic-')) {
            attrs[attr.name] = attr.value;
          }
        });
        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id,
          className: el.className,
          attributes: attrs,
        };
      });
      setAttributes(collected);
    };

    collectAttributes();

    // Re-collect on DOM mutations
    const observer = new MutationObserver(collectAttributes);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-semantic-urn', 'data-semantic-type', 'data-semantic-panel', 'data-semantic-tab'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="debug-section">
      <p className="debug-info">
        Found {attributes.length} element(s) with semantic attributes
      </p>
      {attributes.length === 0 ? (
        <p className="debug-empty">No semantic attributes in DOM</p>
      ) : (
        <div className="debug-list">
          {attributes.map((item, index) => (
            <div key={index} className="debug-item">
              <div className="debug-item-header">
                <code>&lt;{item.tagName}&gt;</code>
                {item.id && <span className="debug-id">#{item.id}</span>}
              </div>
              <pre className="debug-code">
                {JSON.stringify(item.attributes, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
