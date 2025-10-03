import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout.jsx';
import { TabNav } from './components/TabNav.jsx';
import { TabPanel } from './components/TabPanel.jsx';
import { HealthTab } from './components/HealthTab.jsx';
import { ManifestsTab } from './components/ManifestsTab.jsx';
import { ValidationTab, GraphTab, GovernanceTab } from './components/PlaceholderTab.jsx';
import { SemanticDebugPanel } from './components/SemanticDebugPanel.jsx';
import { InspectionOverlay } from './components/InspectionOverlay.jsx';
import { SemanticRegistryProvider, useSemanticRegistry } from './contexts/SemanticRegistry.jsx';
import { InspectionOverlayProvider } from './contexts/InspectionOverlay.jsx';
import { api } from './lib/api.js';
import './App.css';

/**
 * Main Application Component (Inner)
 * Orchestrates tab navigation and data fetching
 */
function AppInner() {
  const [activeTab, setActiveTab] = useState('health');
  const { setActiveTab: setRegistryTab } = useSemanticRegistry();
  const [healthData, setHealthData] = useState(null);
  const [manifestsData, setManifestsData] = useState(null);
  const [validationData, setValidationData] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [governanceData, setGovernanceData] = useState(null);

  const [loading, setLoading] = useState({
    health: true,
    manifests: true,
    validation: false,
    graph: false,
    governance: false,
  });

  const [errors, setErrors] = useState({
    health: null,
    manifests: null,
    validation: null,
    graph: null,
    governance: null,
  });

  // Fetch health and manifests data on mount
  useEffect(() => {
    fetchHealth();
    fetchManifests();
  }, []);

  // Fetch additional data when tabs are activated
  useEffect(() => {
    if (activeTab === 'validation' && !validationData && !loading.validation) {
      fetchValidation();
    } else if (activeTab === 'graph' && !graphData && !loading.graph) {
      fetchGraph();
    } else if (activeTab === 'governance' && !governanceData && !loading.governance) {
      fetchGovernance();
    }
  }, [activeTab]);

  const fetchHealth = async () => {
    try {
      setLoading((prev) => ({ ...prev, health: true }));
      setErrors((prev) => ({ ...prev, health: null }));
      const data = await api.getHealth();
      setHealthData(data);
    } catch (error) {
      setErrors((prev) => ({ ...prev, health: error }));
      console.error('Failed to fetch health:', error);
    } finally {
      setLoading((prev) => ({ ...prev, health: false }));
    }
  };

  const fetchManifests = async () => {
    try {
      setLoading((prev) => ({ ...prev, manifests: true }));
      setErrors((prev) => ({ ...prev, manifests: null }));
      const data = await api.getManifests();
      setManifestsData(data);
    } catch (error) {
      setErrors((prev) => ({ ...prev, manifests: error }));
      console.error('Failed to fetch manifests:', error);
    } finally {
      setLoading((prev) => ({ ...prev, manifests: false }));
    }
  };

  const fetchValidation = async () => {
    try {
      setLoading((prev) => ({ ...prev, validation: true }));
      setErrors((prev) => ({ ...prev, validation: null }));
      const data = await api.getValidation();
      setValidationData(data);
    } catch (error) {
      setErrors((prev) => ({ ...prev, validation: error }));
      console.error('Failed to fetch validation:', error);
    } finally {
      setLoading((prev) => ({ ...prev, validation: false }));
    }
  };

  const fetchGraph = async () => {
    try {
      setLoading((prev) => ({ ...prev, graph: true }));
      setErrors((prev) => ({ ...prev, graph: null }));
      const data = await api.getGraph();
      setGraphData(data);
    } catch (error) {
      setErrors((prev) => ({ ...prev, graph: error }));
      console.error('Failed to fetch graph:', error);
    } finally {
      setLoading((prev) => ({ ...prev, graph: false }));
    }
  };

  const fetchGovernance = async () => {
    try {
      setLoading((prev) => ({ ...prev, governance: true }));
      setErrors((prev) => ({ ...prev, governance: null }));
      const data = await api.getGovernance();
      setGovernanceData(data);
    } catch (error) {
      setErrors((prev) => ({ ...prev, governance: error }));
      console.error('Failed to fetch governance:', error);
    } finally {
      setLoading((prev) => ({ ...prev, governance: false }));
    }
  };

  const tabs = [
    { id: 'health', label: 'Health', count: healthData ? 1 : undefined },
    { id: 'manifests', label: 'Manifests', count: manifestsData?.length || 0 },
    { id: 'validation', label: 'Validation' },
    { id: 'graph', label: 'Graph' },
    { id: 'governance', label: 'Governance' },
  ];

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  useEffect(() => {
    setRegistryTab(activeTab);
  }, [activeTab, setRegistryTab]);

  return (
    <Layout>
      <TabNav tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

      <TabPanel
        tabId="health"
        active={activeTab === 'health'}
        loading={loading.health}
        error={errors.health}
      >
        <HealthTab data={healthData} />
      </TabPanel>

      <TabPanel
        tabId="manifests"
        active={activeTab === 'manifests'}
        loading={loading.manifests}
        error={errors.manifests}
      >
        <ManifestsTab data={manifestsData} />
      </TabPanel>

      <TabPanel
        tabId="validation"
        active={activeTab === 'validation'}
        loading={loading.validation}
        error={errors.validation}
      >
        <ValidationTab data={validationData} />
      </TabPanel>

      <TabPanel
        tabId="graph"
        active={activeTab === 'graph'}
        loading={loading.graph}
        error={errors.graph}
      >
        <GraphTab data={graphData} />
      </TabPanel>

      <TabPanel
        tabId="governance"
        active={activeTab === 'governance'}
        loading={loading.governance}
        error={errors.governance}
      >
        <GovernanceTab data={governanceData} />
      </TabPanel>

      <SemanticDebugPanel />
      <InspectionOverlay />
    </Layout>
  );
}

/**
 * Main Application Component (Wrapper)
 * Provides semantic registry and inspection overlay contexts
 */
function App() {
  return (
    <SemanticRegistryProvider>
      <InspectionOverlayProvider>
        <AppInner />
      </InspectionOverlayProvider>
    </SemanticRegistryProvider>
  );
}

export default App;

export { AppInner };
