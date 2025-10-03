import React, { useMemo, useState } from 'react';
import { useSemanticPanel, manifestSemanticAttrs } from '../hooks/useSemanticPanel.js';
import { useSemanticRegistry, useRegisterPanel } from '../contexts/SemanticRegistry.jsx';
import './ManifestsTab.css';

/**
 * Manifests Tab Component
 * Displays list of manifests with detail view and download functionality
 */
export function ManifestsTab({ data }) {
  const [selectedManifest, setSelectedManifest] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const { setSelectedManifest: setRegistryManifest, clearSelectedManifest } = useSemanticRegistry();
  const manifestCount = data?.length || 0;
  const selectedManifestId = selectedManifest?.filename || selectedManifest?.id || null;

  const panelSemanticAttrs = useSemanticPanel('urn:proto:viewer:manifests', {
    type: 'manifest-panel',
    context: {
      manifestCount,
      selectedManifest: selectedManifestId,
    }
  });

  const panelMetadata = useMemo(() => ({
    urn: 'urn:proto:viewer:manifests',
    type: 'manifest-panel',
    context: {
      manifestCount,
      selectedManifest: selectedManifestId,
    }
  }), [manifestCount, selectedManifestId]);

  useRegisterPanel('manifests', panelMetadata);

  if (!data || data.length === 0) {
    return (
      <div className="manifests-tab" {...panelSemanticAttrs} data-semantic-state="empty">
        <div className="empty-manifests">
          <span className="empty-icon">📭</span>
          <p>No manifests found</p>
        </div>
      </div>
    );
  }

  const handleManifestClick = async (manifest) => {
    setSelectedManifest(manifest);
    setLoadingDetail(true);

    // Update semantic registry
    const manifestId = manifest.filename?.replace('.json', '') || manifest.id;
    setRegistryManifest(manifestId, manifest);

    try {
      // Fetch manifest detail from API using filename
      const apiId = manifest.filename || manifest.id;
      const response = await fetch(`/api/manifest/${encodeURIComponent(apiId)}`);
      if (!response.ok) throw new Error('Failed to fetch manifest');
      const detail = await response.json();
      setDetailData(detail);
    } catch (error) {
      console.error('Error fetching manifest detail:', error);
      setDetailData({ error: error.message });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleClose = () => {
    setSelectedManifest(null);
    setDetailData(null);
    clearSelectedManifest();
  };

  return (
    <div className="manifests-tab" {...panelSemanticAttrs} data-semantic-state="loaded">
      <div className="manifests-header">
        <h2>Protocol Manifests</h2>
        <div className="manifests-count">{data.length} manifests</div>
      </div>

      <div className="manifests-list">
        {data.map((manifest) => {
          const manifestKey = manifest.filename || manifest.id;
          const selectedKey = selectedManifest?.filename || selectedManifest?.id;
          return (
            <ManifestListItem
              key={manifestKey}
              manifest={manifest}
              isSelected={selectedKey === manifestKey}
              onClick={() => handleManifestClick(manifest)}
            />
          );
        })}
      </div>

      {selectedManifest && (
        <ManifestDetail
          manifest={selectedManifest}
          data={detailData}
          loading={loadingDetail}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

/**
 * Manifest List Item Component
 */
function ManifestListItem({ manifest, isSelected, onClick }) {
  // Create semantic attrs using filename as ID
  const manifestId = manifest.filename?.replace('.json', '') || manifest.id || 'unknown';
  const semanticAttrs = manifestSemanticAttrs({
    id: manifestId,
    format: manifest.kind || manifest.format,
    path: manifest.filename
  }, {
    view: 'list-item',
    role: 'manifest-list-item',
    state: isSelected ? 'selected' : 'idle',
    context: {
      size: manifest.size || 0,
      modified: manifest.modified || null,
    }
  });

  return (
    <div
      className={`manifest-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      {...semanticAttrs}
    >
      <div className="manifest-item-header" data-semantic-section="header">
        <span className="manifest-id" data-semantic-field="manifest-id">{manifestId}</span>
        <span
          className={`manifest-format ${manifest.kind || manifest.format || 'unknown'}`}
          data-semantic-field="manifest-format"
        >
          {manifest.kind || manifest.format || 'unknown'}
        </span>
      </div>
      <div className="manifest-item-meta" data-semantic-section="meta">
        {manifest.urn && (
          <span
            className="manifest-urn"
            title={manifest.urn}
            data-semantic-field="manifest-urn"
          >
            {manifest.urn}
          </span>
        )}
        <span className="manifest-size" data-semantic-field="manifest-size">
          {formatBytes(manifest.size)} • Modified {formatDate(manifest.modified)}
        </span>
      </div>
    </div>
  );
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
}

/**
 * Format date to relative time
 */
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Manifest Detail Component
 * Modal/drawer showing full manifest content
 */
function ManifestDetail({ manifest, data, loading, onClose }) {
  if (!manifest) {
    return null;
  }

  const manifestId = manifest.filename?.replace('.json', '') || manifest.id || 'unknown';
  const manifestFilename = manifest.filename || `${manifestId}.json`;
  const manifestUrn = manifest.urn || `urn:proto:manifest:${manifestId}`;
  const detailState = loading ? 'loading' : data?.error ? 'error' : 'ready';
  const detailSemanticAttrs = manifestSemanticAttrs({
    id: manifestId,
    format: manifest.kind || manifest.format,
    path: manifest.filename
  }, {
    view: 'detail',
    role: 'manifest-detail',
    state: detailState,
    context: {
      filename: manifestFilename,
      urn: manifestUrn,
    }
  });

  const detailMetadata = useMemo(() => ({
    urn: manifestUrn,
    type: 'manifest-detail',
    context: {
      state: detailState,
      filename: manifestFilename,
    }
  }), [manifestUrn, detailState, manifestFilename]);

  useRegisterPanel('manifest-detail', detailMetadata);

  const highlightedContent = useMemo(() => {
    if (!data || data.error) {
      return '';
    }

    return highlightJson(data);
  }, [data]);

  const handleDownload = () => {
    if (!data || data.error) return;

    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = manifestFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="manifest-detail-overlay"
      onClick={onClose}
      data-semantic-role="manifest-detail-overlay"
    >
      <div
        className="manifest-detail"
        onClick={(e) => e.stopPropagation()}
        {...detailSemanticAttrs}
      >
        <div className="detail-header" data-semantic-section="header">
          <div className="detail-title">
            <h3 data-semantic-field="manifest-id">{manifestId}</h3>
            <span
              className={`manifest-format ${manifest.kind || manifest.format || 'unknown'}`}
              data-semantic-field="manifest-format"
            >
              {manifest.kind || manifest.format || 'unknown'}
            </span>
          </div>
          <div className="detail-actions">
            <button
              className="btn-download"
              onClick={handleDownload}
              disabled={loading || data?.error}
              title="Download manifest"
              data-semantic-action="download-manifest"
              data-semantic-target={manifestId}
            >
              ⬇ Download
            </button>
            <button
              className="btn-close"
              onClick={onClose}
              title="Close"
              data-semantic-action="close-manifest-detail"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="detail-meta" data-semantic-section="meta">
          <div className="meta-item">
            <span className="meta-label">File:</span>
            <span className="meta-value" data-semantic-field="manifest-file">{manifestFilename}</span>
          </div>
          {manifest.urn && (
            <div className="meta-item">
              <span className="meta-label">URN:</span>
              <span className="meta-value" data-semantic-field="manifest-urn">{manifest.urn}</span>
            </div>
          )}
        </div>

        <div className="detail-content" data-semantic-section="content" data-semantic-state={detailState}>
          {loading && (
            <div className="detail-loading">
              <div className="loading"></div>
              <p>Loading manifest content...</p>
            </div>
          )}

          {!loading && data?.error && (
            <div className="detail-error">
              <p>⚠️ Failed to load manifest</p>
              <pre>{data.error}</pre>
            </div>
          )}

          {!loading && data && !data.error && (
            <pre
              className="manifest-content"
              aria-live="polite"
              data-semantic-section="body"
              data-semantic-format={manifest.kind || manifest.format || 'unknown'}
            >
              <code dangerouslySetInnerHTML={{ __html: highlightedContent }} />
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Lightweight JSON syntax highlighter for manifest content
 */
function highlightJson(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'number';

      if (match.startsWith('"')) {
        cls = match.endsWith(':') ? 'key' : 'string';
      } else if (/true|false/.test(match)) {
        cls = 'boolean';
      } else if (/null/.test(match)) {
        cls = 'null';
      }

      return `<span class="token ${cls}">${match}</span>`;
    }
  );
}
