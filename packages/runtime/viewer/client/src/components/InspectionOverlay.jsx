import React, { useEffect, useMemo, useState } from 'react';
import { useInspectionOverlay } from '../contexts/InspectionOverlay.jsx';
import './InspectionOverlay.css';

/**
 * Inspection Overlay Component
 * Renders the inspection UI when alt+click is triggered on semantic elements
 *
 * Mission B3.4: Alt-Click Inspection UI
 */
export function InspectionOverlay() {
  const { enabled, inspectionState, deactivate, getInspectionData } = useInspectionOverlay();
  const { position, targetElement, active } = inspectionState;
  const rect = useElementRect(active ? targetElement : null);
  const shouldRender = enabled && active;

  const overlayStyle = useMemo(() => {
    const overlayWidth = 400;
    const overlayHeightEstimate = 320;
    const padding = 16;
    const gap = 16;

    if (shouldRender && rect) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const rightSpace = viewportWidth - rect.right - padding;
      const leftSpace = rect.left - padding;

      let left;
      if (rightSpace >= overlayWidth + gap) {
        left = rect.right + gap;
      } else if (leftSpace >= overlayWidth + gap) {
        left = rect.left - overlayWidth - gap;
      } else {
        left = rect.left + rect.width / 2 - overlayWidth / 2;
      }

      left = Math.min(Math.max(left, padding), viewportWidth - overlayWidth - padding);

      let top = rect.top;
      if (top + overlayHeightEstimate > viewportHeight - padding) {
        top = viewportHeight - overlayHeightEstimate - padding;
      }
      top = Math.max(top, padding);

      return { left, top };
    }

    return {
      left: Math.min(position.x + 20, window.innerWidth - overlayWidth - padding),
      top: Math.min(position.y + 20, window.innerHeight - overlayHeightEstimate),
    };
  }, [position.x, position.y, rect, shouldRender]);

  if (!shouldRender) {
    return null;
  }

  const data = getInspectionData();

  return (
    <>
      {/* Element Highlight */}
      {targetElement && rect && <ElementHighlight element={targetElement} rect={rect} />}

      {/* Inspection Panel */}
      <div className="inspection-overlay" style={overlayStyle}>
        <div className="inspection-overlay__header">
          <span className="inspection-overlay__title">🔍 Semantic Inspector</span>
          <button
            className="inspection-overlay__close"
            onClick={deactivate}
            aria-label="Close inspector"
          >
            ×
          </button>
        </div>

        <div className="inspection-overlay__content">
          {data.element.attributes && (
            <InspectionSection title="Element Attributes">
              <AttributeList attributes={data.element.attributes} />
            </InspectionSection>
          )}

          <InspectionSection title="Registry Context">
            <div className="inspection-field">
              <span className="inspection-field__label">Active Tab:</span>
              <span className="inspection-field__value">{data.registry.activeTab || 'none'}</span>
            </div>
            {data.registry.selectedManifest && (
              <div className="inspection-field">
                <span className="inspection-field__label">Selected Manifest:</span>
                <span className="inspection-field__value">{data.registry.selectedManifest}</span>
              </div>
            )}
            <div className="inspection-field">
              <span className="inspection-field__label">Active Panels:</span>
              <span className="inspection-field__value">
                {Object.keys(data.registry.activePanels).length}
              </span>
            </div>
          </InspectionSection>

          <InspectionSection title="Panel Metadata">
            {Object.keys(data.registry.activePanels).length > 0 ? (
              <PanelMetadataList panels={data.registry.activePanels} />
            ) : (
              <div className="inspection-empty">No active panels</div>
            )}
          </InspectionSection>

          {data.registry.metadata.selectedManifest && (
            <InspectionSection title="Manifest Details">
              <ManifestDetails manifest={data.registry.metadata.selectedManifest} />
            </InspectionSection>
          )}
        </div>

        <div className="inspection-overlay__footer">
          <span className="inspection-overlay__hint">
            Press <kbd>Esc</kbd> to close • <kbd>Alt+Click</kbd> another element
          </span>
        </div>
      </div>

      {/* Backdrop */}
      <div className="inspection-overlay-backdrop" onClick={deactivate} />
    </>
  );
}

/**
 * Element Highlight Component
 * Draws an outline around the inspected element
 */
function ElementHighlight({ element, rect }) {
  if (!element || !rect) return null;
  const style = {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: 'none',
    zIndex: 999998,
  };

  return (
    <div className="inspection-highlight" style={style}>
      <div className="inspection-highlight__badge">
        {element.getAttribute('data-semantic-type') || 'element'}
      </div>
    </div>
  );
}

/**
 * Track element bounding rect with animation frame + resize observers
 */
function useElementRect(element) {
  const [rect, setRect] = useState(() => (element ? toRectObject(element.getBoundingClientRect()) : null));

  useEffect(() => {
    if (!element) {
      setRect(null);
      return undefined;
    }

    const schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame
      : (cb) => setTimeout(() => cb(Date.now()), 16);

    const cancel = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame
      : clearTimeout;

    let frameId;
    let lastRect = toRectObject(element.getBoundingClientRect());
    setRect(lastRect);

    const tick = () => {
      const next = toRectObject(element.getBoundingClientRect());
      if (!rectsAreEqual(lastRect, next)) {
        lastRect = next;
        setRect(next);
      }
      frameId = schedule(tick);
    };

    frameId = schedule(tick);

    return () => {
      if (frameId !== undefined) {
        cancel(frameId);
      }
    };
  }, [element]);

  useEffect(() => {
    if (!element || typeof ResizeObserver !== 'function') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const next = toRectObject(element.getBoundingClientRect());
      setRect((current) => (current && rectsAreEqual(current, next) ? current : next));
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [element]);

  return rect;
}

function toRectObject(domRect) {
  if (!domRect) return null;

  const { top, left, right, bottom, width, height } = domRect;
  return { top, left, right, bottom, width, height };
}

function rectsAreEqual(a, b) {
  if (!a || !b) return false;
  const threshold = 0.5;
  return (
    Math.abs(a.top - b.top) < threshold &&
    Math.abs(a.left - b.left) < threshold &&
    Math.abs(a.right - b.right) < threshold &&
    Math.abs(a.bottom - b.bottom) < threshold &&
    Math.abs(a.width - b.width) < threshold &&
    Math.abs(a.height - b.height) < threshold
  );
}

/**
 * Inspection Section Component
 */
function InspectionSection({ title, children }) {
  return (
    <div className="inspection-section">
      <h3 className="inspection-section__title">{title}</h3>
      <div className="inspection-section__body">{children}</div>
    </div>
  );
}

/**
 * Attribute List Component
 */
function AttributeList({ attributes }) {
  const filteredAttrs = Object.entries(attributes).filter(([_, value]) => value != null);

  if (filteredAttrs.length === 0) {
    return <div className="inspection-empty">No attributes</div>;
  }

  return (
    <div className="inspection-attributes">
      {filteredAttrs.map(([key, value]) => (
        <div key={key} className="inspection-field">
          <span className="inspection-field__label">{key}:</span>
          <span className="inspection-field__value" title={value}>
            {typeof value === 'string' && value.length > 40
              ? `${value.substring(0, 40)}...`
              : value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Panel Metadata List Component
 */
function PanelMetadataList({ panels }) {
  return (
    <div className="inspection-panels">
      {Object.entries(panels).map(([panelId, metadata]) => (
        <div key={panelId} className="inspection-panel-item">
          <div className="inspection-panel-item__header">
            <span className="inspection-panel-item__id">{panelId}</span>
            <span className="inspection-panel-item__type">{metadata.type}</span>
          </div>
          {metadata.urn && (
            <div className="inspection-panel-item__urn" title={metadata.urn}>
              {metadata.urn}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Manifest Details Component
 */
function ManifestDetails({ manifest }) {
  return (
    <div className="inspection-manifest">
      <div className="inspection-field">
        <span className="inspection-field__label">ID:</span>
        <span className="inspection-field__value">{manifest.id}</span>
      </div>
      <div className="inspection-field">
        <span className="inspection-field__label">URN:</span>
        <span className="inspection-field__value" title={manifest.urn}>
          {manifest.urn}
        </span>
      </div>
      {manifest.format && (
        <div className="inspection-field">
          <span className="inspection-field__label">Format:</span>
          <span className="inspection-field__value">{manifest.format}</span>
        </div>
      )}
      {manifest.path && (
        <div className="inspection-field">
          <span className="inspection-field__label">Path:</span>
          <span className="inspection-field__value" title={manifest.path}>
            {manifest.path.length > 35 ? `...${manifest.path.slice(-35)}` : manifest.path}
          </span>
        </div>
      )}
    </div>
  );
}
