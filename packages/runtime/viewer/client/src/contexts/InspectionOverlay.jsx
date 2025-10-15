import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useSemanticRegistry } from './SemanticRegistry.jsx';

/**
 * Inspection Overlay Context
 * Manages alt-click inspection UI for semantic annotations
 *
 * Mission B3.4: Alt-Click Inspection UI
 * - Activates via alt+click on elements with data-semantic-urn
 * - Displays semantic metadata from registry
 * - Highlights target element with outline
 * - Keyboard shortcuts: Escape to close, Ctrl/Cmd+Shift+I to toggle
 * - Feature-flagged for development environments
 */

const InspectionOverlayContext = createContext(null);

/**
 * Feature flag check - overlay only available in development
 */
function isInspectionEnabled() {
  // Check environment variable or localStorage override
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_ENABLE_INSPECTION === 'true' ||
    localStorage.getItem('ossProto:inspectionEnabled') === 'true'
  );
}

/**
 * Extract semantic attributes from an element
 * @param {HTMLElement} element - Target element
 * @returns {object|null} Semantic attributes or null
 */
function extractSemanticAttrs(element) {
  if (!element) return null;

  const urn = element.getAttribute('data-semantic-urn');
  if (!urn) return null;

  return {
    urn,
    type: element.getAttribute('data-semantic-type') || 'unknown',
    version: element.getAttribute('data-semantic-version'),
    format: element.getAttribute('data-semantic-format'),
    path: element.getAttribute('data-semantic-path'),
    view: element.getAttribute('data-semantic-view'),
    role: element.getAttribute('data-semantic-role'),
    section: element.getAttribute('data-semantic-section'),
    state: element.getAttribute('data-semantic-state'),
    context: element.getAttribute('data-semantic-context'),
    validationType: element.getAttribute('data-semantic-validation-type'),
    nodeType: element.getAttribute('data-semantic-node-type'),
  };
}

/**
 * Find nearest parent element with semantic URN
 * @param {HTMLElement} target - Starting element
 * @returns {HTMLElement|null} Element with semantic-urn or null
 */
function findSemanticTarget(target) {
  let current = target;
  const maxDepth = 10; // Prevent infinite loop
  let depth = 0;

  while (current && depth < maxDepth) {
    if (current.getAttribute?.('data-semantic-urn')) {
      return current;
    }
    current = current.parentElement;
    depth++;
  }

  return null;
}

export function InspectionOverlayProvider({ children }) {
  const [inspectionState, setInspectionState] = useState({
    active: false,
    targetElement: null,
    semanticAttrs: null,
    position: { x: 0, y: 0 },
  });

  const { registry, getSnapshot } = useSemanticRegistry();
  const previousFocusRef = useRef(null);
  const enabled = isInspectionEnabled();

  /**
   * Activate inspection overlay
   * @param {HTMLElement} element - Target element
   * @param {object} attrs - Semantic attributes
   * @param {number} x - Mouse X position
   * @param {number} y - Mouse Y position
   */
  const activate = useCallback((element, attrs, x, y) => {
    if (!enabled) return;

    // Store current focus for restoration
    previousFocusRef.current = document.activeElement;

    setInspectionState({
      active: true,
      targetElement: element,
      semanticAttrs: attrs,
      position: { x, y },
    });
  }, [enabled]);

  /**
   * Deactivate inspection overlay
   */
  const deactivate = useCallback(() => {
    setInspectionState({
      active: false,
      targetElement: null,
      semanticAttrs: null,
      position: { x: 0, y: 0 },
    });

    // Restore previous focus
    if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      try {
        previousFocusRef.current.focus();
      } catch (e) {
        // Element may have been removed from DOM
      }
    }
    previousFocusRef.current = null;
  }, []);

  /**
   * Handle alt+click on semantic elements
   */
  const handleAltClick = useCallback((event) => {
    if (!enabled) return;

    // Check for alt key (or option on Mac)
    if (!event.altKey) return;

    const target = findSemanticTarget(event.target);
    if (!target) return;

    // Prevent default behavior and propagation
    event.preventDefault();
    event.stopPropagation();

    const attrs = extractSemanticAttrs(target);
    if (!attrs) return;

    // If already inspecting this element, deactivate
    if (inspectionState.active && inspectionState.targetElement === target) {
      deactivate();
    } else {
      activate(target, attrs, event.clientX, event.clientY);
    }
  }, [enabled, inspectionState.active, inspectionState.targetElement, activate, deactivate]);

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    // Escape to close
    if (event.key === 'Escape' && inspectionState.active) {
      event.preventDefault();
      deactivate();
      return;
    }

    // Ctrl/Cmd+Shift+I to toggle (without selecting element)
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'I') {
      event.preventDefault();

      if (inspectionState.active) {
        deactivate();
      } else {
        // Show overlay without specific target (shows registry snapshot only)
        setInspectionState({
          active: true,
          targetElement: null,
          semanticAttrs: null,
          position: { x: window.innerWidth / 2, y: 100 },
        });
      }
    }
  }, [enabled, inspectionState.active, deactivate]);

  /**
   * Set up event listeners
   */
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('click', handleAltClick, true); // Capture phase
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleAltClick, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleAltClick, handleKeyDown]);

  /**
   * Get enriched inspection data with registry context
   */
  const getInspectionData = useCallback(() => {
    if (!inspectionState.active) return null;

    const snapshot = getSnapshot();

    return {
      element: {
        tag: inspectionState.targetElement?.tagName,
        className: inspectionState.targetElement?.className,
        attributes: inspectionState.semanticAttrs,
      },
      registry: {
        activeTab: snapshot.activeTab,
        selectedManifest: snapshot.selectedManifest,
        activePanels: snapshot.activePanels,
        metadata: snapshot.metadata,
      },
      timestamp: snapshot.timestamp,
    };
  }, [inspectionState, getSnapshot]);

  const contextValue = {
    enabled,
    inspectionState,
    activate,
    deactivate,
    getInspectionData,
  };

  return (
    <InspectionOverlayContext.Provider value={contextValue}>
      {children}
    </InspectionOverlayContext.Provider>
  );
}

/**
 * Hook to access inspection overlay context
 */
export function useInspectionOverlay() {
  const context = useContext(InspectionOverlayContext);
  if (!context) {
    throw new Error('useInspectionOverlay must be used within InspectionOverlayProvider');
  }
  return context;
}
