import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import {
  SemanticRegistryProvider,
  useSemanticRegistry,
  useRegisterPanel
} from './SemanticRegistry.jsx';

describe('SemanticRegistry', () => {
  describe('SemanticRegistryProvider', () => {
    it('provides registry context to children', () => {
      const TestComponent = () => {
        const { registry } = useSemanticRegistry();
        return <div data-testid="registry-status">{registry.activeTab || 'none'}</div>;
      };

      render(
        <SemanticRegistryProvider>
          <TestComponent />
        </SemanticRegistryProvider>
      );

      expect(screen.getByTestId('registry-status')).toHaveTextContent('none');
    });

    it('initializes with empty registry state', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      expect(result.current.registry.activeTab).toBeNull();
      expect(result.current.registry.selectedManifest).toBeNull();
      expect(result.current.registry.activePanels).toEqual({});
      expect(result.current.registry.metadata).toEqual({});
      expect(result.current.registry.history).toEqual([]);
    });
  });

  describe('setActiveTab', () => {
    it('updates active tab in registry', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      act(() => {
        result.current.setActiveTab('health');
      });

      expect(result.current.registry.activeTab).toBe('health');
    });

    it('records tab change in history', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      act(() => {
        result.current.setActiveTab('manifests');
      });

      expect(result.current.registry.history).toHaveLength(1);
      expect(result.current.registry.history[0].type).toBe('tab-change');
      expect(result.current.registry.history[0].tabId).toBe('manifests');
    });

    it('maintains history limit of 20 entries', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      act(() => {
        for (let i = 0; i < 25; i++) {
          result.current.setActiveTab(`tab-${i}`);
        }
      });

      expect(result.current.registry.history).toHaveLength(20);
    });
  });

  describe('setSelectedManifest', () => {
    it('updates selected manifest in registry', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      const manifestData = {
        id: 'api-test',
        format: 'proto',
        path: 'api-test.json'
      };

      act(() => {
        result.current.setSelectedManifest('api-test', manifestData);
      });

      expect(result.current.registry.selectedManifest).toBe('api-test');
      expect(result.current.registry.metadata.selectedManifest.id).toBe('api-test');
      expect(result.current.registry.metadata.selectedManifest.urn).toBe('urn:proto:manifest:api-test');
    });

    it('records manifest selection in history', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      act(() => {
        result.current.setSelectedManifest('api-test', {});
      });

      expect(result.current.registry.history).toHaveLength(1);
      expect(result.current.registry.history[0].type).toBe('manifest-selected');
      expect(result.current.registry.history[0].manifestId).toBe('api-test');
    });

    it('clears selected manifest', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      act(() => {
        result.current.setSelectedManifest('api-test', {});
      });

      expect(result.current.registry.selectedManifest).toBe('api-test');

      act(() => {
        result.current.clearSelectedManifest();
      });

      expect(result.current.registry.selectedManifest).toBeNull();
    });
  });

  describe('registerPanel', () => {
    it('registers a panel with metadata', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      const metadata = {
        urn: 'urn:proto:viewer:health',
        type: 'health-status'
      };

      act(() => {
        result.current.registerPanel('health', metadata);
      });

      expect(result.current.registry.activePanels.health).toBeDefined();
      expect(result.current.registry.activePanels.health.urn).toBe('urn:proto:viewer:health');
      expect(result.current.registry.activePanels.health.registeredAt).toBeDefined();
    });

    it('stores metadata separately', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      const metadata = {
        urn: 'urn:proto:viewer:manifests',
        type: 'manifest-list'
      };

      act(() => {
        result.current.registerPanel('manifests', metadata);
      });

      expect(result.current.registry.metadata.manifests).toEqual(metadata);
    });
  });

  describe('unregisterPanel', () => {
    it('removes panel from active panels', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      act(() => {
        result.current.registerPanel('health', { urn: 'urn:proto:viewer:health' });
      });

      expect(result.current.registry.activePanels.health).toBeDefined();

      act(() => {
        result.current.unregisterPanel('health');
      });

      expect(result.current.registry.activePanels.health).toBeUndefined();
    });
  });

  describe('useRegisterPanel', () => {
    const PanelHarness = ({ visible, metadata }) => (
      <SemanticRegistryProvider>
        <RegistryProbe />
        {visible ? <TestPanel metadata={metadata} /> : null}
      </SemanticRegistryProvider>
    );

    const RegistryProbe = () => {
      const { registry } = useSemanticRegistry();
      const panels = Object.keys(registry.activePanels);
      return (
        <div data-testid="active-panels">
          {panels.length ? panels.join(',') : 'none'}
        </div>
      );
    };

    const TestPanel = ({ metadata }) => {
      useRegisterPanel('test-panel', metadata);
      return null;
    };

    it('registers panel on mount and unregisters on unmount', () => {
      const metadata = {
        urn: 'urn:proto:viewer:test',
        type: 'test-panel'
      };

      const { rerender } = render(
        <PanelHarness visible={true} metadata={metadata} />
      );

      expect(screen.getByTestId('active-panels')).toHaveTextContent('test-panel');

      rerender(<PanelHarness visible={false} metadata={metadata} />);

      expect(screen.getByTestId('active-panels')).toHaveTextContent('none');
    });
  });

  describe('debugMode', () => {
    it('initializes with debug mode disabled', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      expect(result.current.debugMode).toBe(false);
    });

    it('toggles debug mode', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      act(() => {
        result.current.toggleDebugMode();
      });

      expect(result.current.debugMode).toBe(true);

      act(() => {
        result.current.toggleDebugMode();
      });

      expect(result.current.debugMode).toBe(false);
    });

    it('logs when debug mode is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      act(() => {
        result.current.toggleDebugMode();
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SemanticRegistry] Debug mode enabled')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getSnapshot', () => {
    it('returns complete registry snapshot', () => {
      const { result } = renderHook(() => useSemanticRegistry(), {
        wrapper: SemanticRegistryProvider
      });

      act(() => {
        result.current.setActiveTab('health');
        result.current.registerPanel('health', { urn: 'urn:proto:viewer:health' });
      });

      const snapshot = result.current.getSnapshot();

      expect(snapshot.activeTab).toBe('health');
      expect(snapshot.activePanels.health).toBeDefined();
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.debugMode).toBe(false);
    });
  });
});
