import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * Semantic Registry Context
 * Tracks active UI panels and their semantic metadata for inspection overlay integration
 *
 * This registry enables:
 * - Real-time tracking of which panels are active and their URN identifiers
 * - Metadata exposure for inspection tooling (B3.4)
 * - Debug visualization of semantic instrumentation
 * - Analytics correlation between UI state and ProtocolGraph insights
 */

const SemanticRegistryContext = createContext(null);

/**
 * Semantic Registry Provider
 * Wraps the application to provide semantic context tracking
 */
export function SemanticRegistryProvider({ children }) {
  const [registry, setRegistry] = useState({
    activeTab: null,
    selectedManifest: null,
    activePanels: {},
    metadata: {},
    history: [],
  });

  const [debugMode, setDebugMode] = useState(false);

  /**
   * Register an active panel with semantic metadata
   * @param {string} panelId - Panel identifier (e.g., 'health', 'manifests')
   * @param {object} metadata - Semantic metadata (urn, type, context, etc.)
   */
  const registerPanel = useCallback((panelId, metadata) => {
    setRegistry((prev) => ({
      ...prev,
      activePanels: {
        ...prev.activePanels,
        [panelId]: {
          ...metadata,
          registeredAt: new Date().toISOString(),
        },
      },
      metadata: {
        ...prev.metadata,
        [panelId]: metadata,
      },
    }));

    if (debugMode) {
      console.log('[SemanticRegistry] Panel registered:', panelId, metadata);
    }
  }, [debugMode]);

  /**
   * Unregister a panel (when unmounted or inactive)
   * @param {string} panelId - Panel identifier
   */
  const unregisterPanel = useCallback((panelId) => {
    setRegistry((prev) => {
      const { [panelId]: removed, ...remainingPanels } = prev.activePanels;
      return {
        ...prev,
        activePanels: remainingPanels,
      };
    });

    if (debugMode) {
      console.log('[SemanticRegistry] Panel unregistered:', panelId);
    }
  }, [debugMode]);

  /**
   * Set the active tab
   * @param {string} tabId - Tab identifier
   * @param {object} metadata - Optional metadata about the tab
   */
  const setActiveTab = useCallback((tabId, metadata = {}) => {
    setRegistry((prev) => ({
      ...prev,
      activeTab: tabId,
      history: [
        ...prev.history.slice(-19), // Keep last 20 transitions
        {
          type: 'tab-change',
          tabId,
          timestamp: new Date().toISOString(),
        },
      ],
    }));

    if (debugMode) {
      console.log('[SemanticRegistry] Active tab changed:', tabId, metadata);
    }
  }, [debugMode]);

  /**
   * Set the selected manifest
   * @param {string} manifestId - Manifest identifier
   * @param {object} manifest - Full manifest object
   */
  const setSelectedManifest = useCallback((manifestId, manifest = {}) => {
    setRegistry((prev) => ({
      ...prev,
      selectedManifest: manifestId,
      metadata: {
        ...prev.metadata,
        selectedManifest: {
          id: manifestId,
          urn: `urn:proto:manifest:${manifestId}`,
          ...manifest,
        },
      },
      history: [
        ...prev.history.slice(-19),
        {
          type: 'manifest-selected',
          manifestId,
          timestamp: new Date().toISOString(),
        },
      ],
    }));

    if (debugMode) {
      console.log('[SemanticRegistry] Manifest selected:', manifestId, manifest);
    }
  }, [debugMode]);

  /**
   * Clear selected manifest
   */
  const clearSelectedManifest = useCallback(() => {
    setRegistry((prev) => ({
      ...prev,
      selectedManifest: null,
    }));

    if (debugMode) {
      console.log('[SemanticRegistry] Manifest selection cleared');
    }
  }, [debugMode]);

  /**
   * Toggle debug mode
   */
  const toggleDebugMode = useCallback(() => {
    setDebugMode((prev) => {
      const newMode = !prev;
      console.log(`[SemanticRegistry] Debug mode ${newMode ? 'enabled' : 'disabled'}`);
      return newMode;
    });
  }, []);

  /**
   * Get snapshot of current registry state
   */
  const getSnapshot = useCallback(() => {
    return {
      ...registry,
      timestamp: new Date().toISOString(),
      debugMode,
    };
  }, [registry, debugMode]);

  // Keyboard shortcut for debug mode: Ctrl+Shift+D or Cmd+Shift+D
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggleDebugMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebugMode]);

  const contextValue = {
    registry,
    debugMode,
    registerPanel,
    unregisterPanel,
    setActiveTab,
    setSelectedManifest,
    clearSelectedManifest,
    toggleDebugMode,
    getSnapshot,
  };

  return (
    <SemanticRegistryContext.Provider value={contextValue}>
      {children}
    </SemanticRegistryContext.Provider>
  );
}

/**
 * Hook to access semantic registry
 * @returns {object} Registry context
 */
export function useSemanticRegistry() {
  const context = useContext(SemanticRegistryContext);
  if (!context) {
    throw new Error('useSemanticRegistry must be used within SemanticRegistryProvider');
  }
  return context;
}

/**
 * Hook to register a panel on mount and unregister on unmount
 * @param {string} panelId - Panel identifier
 * @param {object} metadata - Semantic metadata
 */
export function useRegisterPanel(panelId, metadata) {
  const { registerPanel, unregisterPanel } = useSemanticRegistry();

  useEffect(() => {
    if (panelId && metadata) {
      registerPanel(panelId, metadata);
    }

    return () => {
      if (panelId) {
        unregisterPanel(panelId);
      }
    };
  }, [panelId, registerPanel, unregisterPanel, metadata]);
}
