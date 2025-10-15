import React, { useMemo } from 'react';
import { useSemanticPanel } from '../hooks/useSemanticPanel.js';
import { useRegisterPanel } from '../contexts/SemanticRegistry.jsx';
import './HealthTab.css';

/**
 * Health Tab Component
 * Displays server health status and system information
 */
export function HealthTab({ data }) {
  const manifestCount = data?.manifest_count || data?.manifests?.count || 0;
  const status = data?.status || 'unknown';
  const registryStatus = data ? status : 'loading';
  const semanticAttrs = useSemanticPanel('urn:proto:viewer:health', {
    type: 'health-status',
    context: {
      status,
      manifestCount,
    }
  });

  const panelMetadata = useMemo(() => ({
    urn: 'urn:proto:viewer:health',
    type: 'health-panel',
    context: {
      status: registryStatus,
      manifestCount,
    },
  }), [registryStatus, manifestCount]);

  useRegisterPanel('health', panelMetadata);

  if (!data) {
    return (
      <div className="health-tab" {...semanticAttrs} data-semantic-state={registryStatus}>
        No health data available
      </div>
    );
  }

  const { uptime, manifests, timestamp } = data;
  const isHealthy = status === 'ok';

  return (
    <div className="health-tab" {...semanticAttrs} data-semantic-state={registryStatus}>
      <div className="health-header">
        <h2>System Health</h2>
        <div className={`health-badge ${isHealthy ? 'healthy' : 'unhealthy'}`}>
          <span className="badge-indicator" aria-hidden="true">●</span>
          <span className="badge-text">{isHealthy ? 'Healthy' : 'Unhealthy'}</span>
        </div>
      </div>

      <div className="health-cards">
        <HealthCard
          title="Server Status"
          value={status}
          icon="🖥️"
          description="API endpoint responding normally"
        />

        <HealthCard
          title="Uptime"
          value={formatUptime(uptime)}
          icon="⏱️"
          description="Time since server started"
        />

        <HealthCard
          title="Manifests"
          value={manifestCount}
          icon="📄"
          description="Protocol manifests discovered"
        />

        <HealthCard
          title="Last Updated"
          value={formatTimestamp(timestamp)}
          icon="🕒"
          description="Health check timestamp"
        />
      </div>

      {manifests?.formats && (
        <div className="health-section">
          <h3>Manifest Formats</h3>
          <div className="format-list">
            {Object.entries(manifests.formats).map(([format, count]) => (
              <div key={format} className="format-item" data-semantic-format={format}>
                <span className="format-name">{format}</span>
                <span className="format-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Health Card Component
 * Individual metric card
 */
function HealthCard({ title, value, icon, description }) {
  return (
    <div className="health-card">
      <div className="card-icon" aria-hidden="true">{icon}</div>
      <div className="card-content">
        <div className="card-title">{title}</div>
        <div className="card-value">{value}</div>
        <div className="card-description">{description}</div>
      </div>
    </div>
  );
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds) {
  if (typeof seconds !== 'number') return 'Unknown';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format timestamp in human-readable format
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleString();
  }
}
