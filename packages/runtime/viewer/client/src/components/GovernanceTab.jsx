import React from 'react';
import { EmptyState } from './TabPanel.jsx';
import './GovernanceTab.css';

const ISSUE_MESSAGES = {
  missing_owner: 'Owner is not set',
  missing_classification: 'Classification or visibility is missing',
};

function renderBreakdown(map) {
  const entries = Object.entries(map || {});
  if (!entries.length) {
    return <p className="governance-empty-breakdown">No data captured yet</p>;
  }

  return (
    <ul className="governance-breakdown-list">
      {entries
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, value]) => (
          <li key={key}>
            <span>{key}</span>
            <span>{value}</span>
          </li>
        ))}
    </ul>
  );
}

export function GovernanceTab({ data }) {
  const manifests = Array.isArray(data?.manifests) ? data.manifests : [];

  if (!manifests.length) {
    return (
      <div className="governance-tab">
        <EmptyState
          icon="🗂️"
          message="No governance records available. Run the showcase pipeline to generate curated manifests, then refresh."
        />
      </div>
    );
  }

  const summary = data.summary || {};
  const alerts = Array.isArray(data.alerts) ? data.alerts : summary.alerts || [];
  const generatedAt = data.generatedAt || data.generated_at || null;

  const metrics = [
    { label: 'Protocols', value: summary.total ?? manifests.length },
    { label: 'Assigned Owners', value: summary.withOwner ?? 0 },
    { label: 'Missing Owners', value: summary.missingOwner ?? 0 },
    { label: 'PII Flags', value: summary.pii ?? 0 },
  ];

  const breakdowns = [
    { title: 'By Kind', map: summary.byKind },
    { title: 'By Classification', map: summary.byClassification },
    { title: 'By Status', map: summary.byStatus },
    { title: 'Owners', map: summary.owners },
  ];

  return (
    <div className="governance-tab">
      <section className="governance-summary" data-semantic-section="governance-summary">
        <div className="governance-summary-header">
          <h2>Governance Overview</h2>
          {generatedAt ? (
            <span className="governance-generated-at" title="Report generated at">
              {generatedAt}
            </span>
          ) : null}
        </div>

        <div className="governance-stat-grid">
          {metrics.map(({ label, value }) => (
            <div className="governance-stat-card" key={label}>
              <span className="governance-stat-label">{label}</span>
              <span
                className="governance-stat-value"
                data-semantic-metric={label.toLowerCase().replace(/\s+/g, '-')}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="governance-breakdowns">
          {breakdowns.map(({ title, map }) => (
            <div className="governance-breakdown" key={title}>
              <h3>{title}</h3>
              {renderBreakdown(map)}
            </div>
          ))}
        </div>
      </section>

      {alerts.length > 0 && (
        <section className="governance-alerts" aria-live="polite">
          <strong>Attention required:</strong>
          <ul>
            {alerts.map((alert) => (
              <li key={alert.urn}>
                <span className="governance-urn">{alert.urn}</span>
                <span>
                  {alert.issues
                    .map((code) => ISSUE_MESSAGES[code] || code)
                    .join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="governance-table-wrapper" data-semantic-section="governance-table">
        <table className="governance-table">
          <thead>
            <tr>
              <th scope="col">Protocol</th>
              <th scope="col">Kind</th>
              <th scope="col">Owner</th>
              <th scope="col">Classification</th>
              <th scope="col">Status</th>
              <th scope="col">PII</th>
              <th scope="col">Tags</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {manifests.map((manifest) => (
              <tr key={manifest.urn} data-semantic-governance-row={manifest.urn}>
                <td>
                  <div className="governance-name">{manifest.name || manifest.urn}</div>
                  <div className="governance-urn">{manifest.urn}</div>
                </td>
                <td>{manifest.kind || 'unknown'}</td>
                <td>{manifest.owner || '—'}</td>
                <td>
                  <span className="governance-pill">
                    {manifest.classification || 'unknown'}
                  </span>
                </td>
                <td>{manifest.status || 'unknown'}</td>
                <td>
                  <span
                    className="governance-pii-flag"
                    data-state={manifest.pii ? 'true' : 'false'}
                  >
                    {manifest.pii ? 'Yes' : 'No'}
                  </span>
                </td>
                <td>
                  <div className="governance-tags">
                    {(manifest.tags || []).length
                      ? manifest.tags.map((tag) => (
                          <span className="governance-tag" key={`${manifest.urn}-tag-${tag}`}>
                            {tag}
                          </span>
                        ))
                      : '—'}
                  </div>
                </td>
                <td>{manifest.source || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
