import React, { useMemo } from 'react';
import { useSemanticPanel } from '../hooks/useSemanticPanel.js';
import { useRegisterPanel } from '../contexts/SemanticRegistry.jsx';
import './PlaceholderTab.css';

/**
 * Placeholder Tab Component
 * Used for tabs that will be implemented in future missions
 * @param {string} tabId - Tab identifier
 * @param {string} title - Tab title
 * @param {string} description - Description of what this tab will contain
 * @param {string} icon - Emoji icon
 * @param {object} data - Optional data to display
 */
export function PlaceholderTab({ tabId, title, description, icon = '🔨', data }) {
  const semanticAttrs = useSemanticPanel(`urn:proto:viewer:${tabId}`, {
    type: 'placeholder',
    context: { status: 'not-implemented' }
  });

  return (
    <div className="placeholder-tab" {...semanticAttrs}>
      <div className="placeholder-content">
        <div className="placeholder-icon" aria-hidden="true">{icon}</div>
        <h2 className="placeholder-title">{title}</h2>
        <p className="placeholder-description">{description}</p>

        {data && (
          <div className="placeholder-data">
            <h3>Preview Data</h3>
            <pre className="data-preview">
              <code>{JSON.stringify(data, null, 2)}</code>
            </pre>
          </div>
        )}

        <div className="placeholder-status">
          <span className="status-badge">Coming Soon</span>
          <p className="status-text">This feature will be implemented in an upcoming mission</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Validation Tab - Enhanced with semantic rendering
 */
export function ValidationTab({ data }) {
  const status = data ? 'loaded' : 'loading';
  const manifestCount = data?.summary?.total || data?.manifests?.length || 0;
  const semanticAttrs = useSemanticPanel('urn:proto:viewer:validation', {
    type: 'validation-panel',
    context: { status, manifestCount }
  });

  const registryMetadata = useMemo(() => ({
    urn: 'urn:proto:viewer:validation',
    type: 'validation-panel',
    context: {
      status,
      manifestCount,
    },
  }), [status, manifestCount]);

  useRegisterPanel('validation', registryMetadata);

  if (!data) {
    return (
      <PlaceholderTab
        tabId="validation"
        title="Manifest Validation"
        description="View validation results for protocol manifests, including schema compliance, breaking changes, and governance policy checks."
        icon="✓"
        data={null}
      />
    );
  }

  return (
    <div className="validation-tab" {...semanticAttrs} data-semantic-state={status}>
      <div className="placeholder-content">
        <div className="placeholder-icon" aria-hidden="true">✓</div>
        <h2 className="placeholder-title">Manifest Validation</h2>
        <p className="placeholder-description">
          Validation results generated via the viewer API with semantic instrumentation
        </p>

        {data.summary && (
          <div className="data-summary" data-semantic-urn="urn:proto:validation:summary">
            <h3>Validation Summary</h3>
            <div className="summary-stats">
              <div className="stat" data-semantic-type="validation-stat">
                <span className="stat-label">Total:</span>
                <span className="stat-value">{data.summary.total}</span>
              </div>
              <div className="stat" data-semantic-type="validation-stat">
                <span className="stat-label">Passed:</span>
                <span className="stat-value pass">{data.summary.passed}</span>
              </div>
              <div className="stat" data-semantic-type="validation-stat">
                <span className="stat-label">Warnings:</span>
                <span className="stat-value warning">{data.summary.warnings}</span>
              </div>
              <div className="stat" data-semantic-type="validation-stat">
                <span className="stat-label">Failed:</span>
                <span className="stat-value fail">{data.summary.failed}</span>
              </div>
            </div>
          </div>
        )}

        {data.manifests && (
          <div className="manifest-validations">
            <h3>Manifest Checks</h3>
            {data.manifests.map((manifest) => (
              <div
                key={manifest.id}
                className="validation-item"
                data-semantic-urn={manifest.urn}
                data-semantic-type="validation-result"
              >
                <strong>{manifest.id}</strong>
                <span className={`status ${manifest.validationStatus}`}>
                  {manifest.validationStatus}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="placeholder-status">
          <span className="status-badge">Live Data</span>
          <p className="status-text">Powered by POST /api/validate</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Graph Tab - Enhanced with semantic rendering
 */
export function GraphTab({ data }) {
  const status = data ? 'loaded' : 'loading';
  const nodeCount = data?.metadata?.nodeCount || data?.nodes?.length || 0;
  const edgeCount = data?.metadata?.edgeCount || data?.edges?.length || 0;
  const semanticAttrs = useSemanticPanel('urn:proto:viewer:graph', {
    type: 'graph-panel',
    context: { status, nodeCount, edgeCount }
  });

  const registryMetadata = useMemo(() => ({
    urn: 'urn:proto:viewer:graph',
    type: 'graph-panel',
    context: {
      status,
      nodeCount,
      edgeCount,
    },
  }), [status, nodeCount, edgeCount]);

  useRegisterPanel('graph', registryMetadata);

  if (!data) {
    return (
      <PlaceholderTab
        tabId="graph"
        title="Protocol Graph"
        description="Visualize protocol dependencies, service relationships, and data flow across your distributed system."
        icon="🕸️"
        data={null}
      />
    );
  }

  return (
    <div className="graph-tab" {...semanticAttrs} data-semantic-state={status}>
      <div className="placeholder-content">
        <div className="placeholder-icon" aria-hidden="true">🕸️</div>
        <h2 className="placeholder-title">Protocol Graph</h2>
        <p className="placeholder-description">
          Graph index and chunks served from the viewer API with semantic instrumentation
        </p>

        {data.metadata && (
          <div className="data-summary" data-semantic-urn="urn:proto:graph:metadata">
            <h3>Graph Metrics</h3>
            <div className="summary-stats">
              <div className="stat" data-semantic-type="graph-stat">
                <span className="stat-label">Nodes:</span>
                <span className="stat-value">{data.metadata.nodeCount}</span>
              </div>
              <div className="stat" data-semantic-type="graph-stat">
                <span className="stat-label">Edges:</span>
                <span className="stat-value">{data.metadata.edgeCount}</span>
              </div>
              <div className="stat" data-semantic-type="graph-stat">
                <span className="stat-label">Depth:</span>
                <span className="stat-value">{data.metadata.depth}</span>
              </div>
            </div>
          </div>
        )}

        {data.nodes && (
          <div className="graph-nodes">
            <h3>Protocol Nodes</h3>
            {data.nodes.map((node) => (
              <div
                key={node.id}
                className="graph-node-item"
                data-semantic-urn={node.urn}
                data-semantic-type="graph-node"
                data-semantic-node-type={node.type}
              >
                <strong>{node.id}</strong>
                <span className="node-format">{node.format}</span>
              </div>
            ))}
          </div>
        )}

        <div className="placeholder-status">
          <span className="status-badge">Live Data</span>
          <p className="status-text">Powered by POST /api/graph</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Governance Tab - Enhanced with semantic rendering
 */
export function GovernanceTab({ data }) {
  const status = data ? 'loaded' : 'loading';
  const policyCount = data?.compliance?.totalPolicies || data?.policies?.length || 0;
  const semanticAttrs = useSemanticPanel('urn:proto:viewer:governance', {
    type: 'governance-panel',
    context: { status, policyCount }
  });

  const registryMetadata = useMemo(() => ({
    urn: 'urn:proto:viewer:governance',
    type: 'governance-panel',
    context: {
      status,
      policyCount,
    },
  }), [status, policyCount]);

  useRegisterPanel('governance', registryMetadata);

  if (!data) {
    return (
      <PlaceholderTab
        tabId="governance"
        title="Governance Insights"
        description="Track governance policies, compliance status, ownership information, and protocol evolution over time."
        icon="📊"
        data={null}
      />
    );
  }

  return (
    <div className="governance-tab" {...semanticAttrs} data-semantic-state={status}>
      <div className="placeholder-content">
        <div className="placeholder-icon" aria-hidden="true">📊</div>
        <h2 className="placeholder-title">Governance Insights</h2>
        <p className="placeholder-description">
          Preview of governance data with semantic instrumentation
        </p>

        {data.compliance && (
          <div className="data-summary" data-semantic-urn="urn:proto:governance:compliance">
            <h3>Compliance Overview</h3>
            <div className="summary-stats">
              <div className="stat" data-semantic-type="governance-stat">
                <span className="stat-label">Policies:</span>
                <span className="stat-value">{data.compliance.totalPolicies}</span>
              </div>
              <div className="stat" data-semantic-type="governance-stat">
                <span className="stat-label">Passing:</span>
                <span className="stat-value pass">{data.compliance.passing}</span>
              </div>
              <div className="stat" data-semantic-type="governance-stat">
                <span className="stat-label">Violations:</span>
                <span className="stat-value fail">{data.compliance.violations}</span>
              </div>
              <div className="stat" data-semantic-type="governance-stat">
                <span className="stat-label">Rate:</span>
                <span className="stat-value">{Math.round(data.compliance.complianceRate * 100)}%</span>
              </div>
            </div>
          </div>
        )}

        {data.policies && (
          <div className="governance-policies">
            <h3>Active Policies</h3>
            {data.policies.map((policy) => (
              <div
                key={policy.id}
                className="policy-item"
                data-semantic-urn={policy.urn}
                data-semantic-type="governance-policy"
              >
                <strong>{policy.name}</strong>
                <span className={`violations ${policy.violations > 0 ? 'has-violations' : 'clean'}`}>
                  {policy.violations} violations
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="placeholder-status">
          <span className="status-badge">Preview Data</span>
          <p className="status-text">Backend endpoint pending - showing semantic sample data</p>
        </div>
      </div>
    </div>
  );
}
