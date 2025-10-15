/**
 * InspectionOverlay Component Tests
 * Mission B3.4: Alt-Click Inspection UI
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InspectionOverlay } from './InspectionOverlay.jsx';
import { InspectionOverlayProvider } from '../contexts/InspectionOverlay.jsx';
import { SemanticRegistryProvider, useSemanticRegistry } from '../contexts/SemanticRegistry.jsx';

// Test wrapper with all required providers
function TestWrapper({ children }) {
  return (
    <SemanticRegistryProvider>
      <InspectionOverlayProvider>{children}</InspectionOverlayProvider>
    </SemanticRegistryProvider>
  );
}

// Test component that triggers inspection
function InspectionTrigger() {
  return (
    <div>
      <div
        data-testid="semantic-element"
        data-semantic-urn="urn:proto:manifest:test"
        data-semantic-type="manifest"
        data-semantic-format="json"
      >
        Semantic Element
      </div>
      <InspectionOverlay />
    </div>
  );
}

describe('InspectionOverlay Component', () => {
  beforeEach(() => {
    vi.stubGlobal('import', {
      meta: {
        env: {
          DEV: true,
        },
      },
    });

    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));

    class MockResizeObserver {
      constructor() {}
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not render when inactive', () => {
    render(
      <TestWrapper>
        <InspectionOverlay />
      </TestWrapper>
    );

    expect(screen.queryByText(/Semantic Inspector/i)).not.toBeInTheDocument();
  });

  it('renders inspection panel when active', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/Semantic Inspector/i)).toBeInTheDocument();
  });

  it('displays element attributes', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/Element Attributes/i)).toBeInTheDocument();
    expect(screen.getByText(/urn:proto:manifest:test/i)).toBeInTheDocument();
    // Use getAllByText since "manifest" appears multiple times
    const manifestTexts = screen.getAllByText(/manifest/i);
    expect(manifestTexts.length).toBeGreaterThan(0);
  });

  it('displays registry context section', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/Registry Context/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Tab:/i)).toBeInTheDocument();
  });

  it('displays panel metadata section', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/Panel Metadata/i)).toBeInTheDocument();
  });

  it('closes overlay when close button is clicked', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/Semantic Inspector/i)).toBeInTheDocument();

    const closeButton = screen.getByLabelText(/Close inspector/i);
    fireEvent.click(closeButton);

    expect(screen.queryByText(/Semantic Inspector/i)).not.toBeInTheDocument();
  });

  it('closes overlay when backdrop is clicked', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/Semantic Inspector/i)).toBeInTheDocument();

    const backdrop = document.querySelector('.inspection-overlay-backdrop');
    fireEvent.click(backdrop);

    expect(screen.queryByText(/Semantic Inspector/i)).not.toBeInTheDocument();
  });

  it('displays keyboard hints in footer', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/Esc/i)).toBeInTheDocument();
    expect(screen.getByText(/Alt\+Click/i)).toBeInTheDocument();
  });

  it('renders element highlight when target exists', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    const highlight = document.querySelector('.inspection-highlight');
    expect(highlight).toBeInTheDocument();
  });

  it('positions overlay adjacent to the inspected element', async () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    const rect = { top: 100, left: 120, width: 180, height: 60, right: 300, bottom: 160 };
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect);

    fireEvent.click(element, { altKey: true, clientX: 150, clientY: 200 });

    await waitFor(() => {
      const overlay = document.querySelector('.inspection-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay.style.left).toBe('316px');
      expect(overlay.style.top).toBe('100px');
    });
  });

  it('keeps element highlight and overlay anchored as the target moves', async () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    let currentRect = { top: 80, left: 150, width: 120, height: 50, right: 270, bottom: 130 };
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({ ...currentRect }));

    fireEvent.click(element, { altKey: true });

    await waitFor(() => {
      const highlight = document.querySelector('.inspection-highlight');
      expect(highlight?.style.top).toBe('80px');
    });

    currentRect = { ...currentRect, top: 200, bottom: 250 };

    await waitFor(() => {
      const highlight = document.querySelector('.inspection-highlight');
      const overlay = document.querySelector('.inspection-overlay');
      expect(highlight?.style.top).toBe('200px');
      expect(overlay?.style.top).toBe('200px');
    });
  });
});

describe('InspectionOverlay - Registry Integration', () => {
  beforeEach(() => {
    vi.stubGlobal('import', {
      meta: {
        env: {
          DEV: true,
        },
      },
    });

    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));

    class MockResizeObserver {
      constructor() {}
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('displays active tab from registry', () => {
    function TestWithActiveTab() {
      const { setActiveTab } = useSemanticRegistry();

      React.useEffect(() => {
        setActiveTab('manifests');
      }, [setActiveTab]);

      return <InspectionTrigger />;
    }

    render(
      <TestWrapper>
        <TestWithActiveTab />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/manifests/i)).toBeInTheDocument();
  });

  it('displays selected manifest when available', () => {
    function TestWithManifest() {
      const { setSelectedManifest } = useSemanticRegistry();

      React.useEffect(() => {
        setSelectedManifest('api-test', { format: 'json' });
      }, [setSelectedManifest]);

      return <InspectionTrigger />;
    }

    render(
      <TestWrapper>
        <TestWithManifest />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/Manifest Details/i)).toBeInTheDocument();
    // Use getAllByText since "api-test" may appear multiple times
    const apiTestTexts = screen.getAllByText(/api-test/i);
    expect(apiTestTexts.length).toBeGreaterThan(0);
  });

  it('shows active panels count', () => {
    function TestWithPanels() {
      const { registerPanel } = useSemanticRegistry();

      React.useEffect(() => {
        registerPanel('health', { urn: 'urn:proto:health', type: 'health' });
        registerPanel('manifests', { urn: 'urn:proto:manifests', type: 'manifests' });
      }, [registerPanel]);

      return <InspectionTrigger />;
    }

    render(
      <TestWrapper>
        <TestWithPanels />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/Active Panels:/i)).toBeInTheDocument();
    // Should show count of 2 (look for the specific field value)
    const panelCountField = screen.getByText(/Active Panels:/i).nextSibling;
    expect(panelCountField?.textContent).toBe('2');
  });
});

describe('InspectionOverlay - Empty States', () => {
  beforeEach(() => {
    vi.stubGlobal('import', {
      meta: {
        env: {
          DEV: true,
        },
      },
    });

    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));

    class MockResizeObserver {
      constructor() {}
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows empty state for panels when none active', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    expect(screen.getByText(/No active panels/i)).toBeInTheDocument();
  });

  it('does not show manifest details when none selected', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    // Manifest Details section should not appear
    expect(screen.queryByText(/Manifest Details/i)).not.toBeInTheDocument();
  });
});

describe('InspectionOverlay - Accessibility', () => {
  beforeEach(() => {
    vi.stubGlobal('import', {
      meta: {
        env: {
          DEV: true,
        },
      },
    });

    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));

    class MockResizeObserver {
      constructor() {}
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has accessible close button', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    const closeButton = screen.getByLabelText(/Close inspector/i);
    expect(closeButton).toHaveAttribute('aria-label');
  });

  it('uses semantic kbd elements for keyboard shortcuts', () => {
    render(
      <TestWrapper>
        <InspectionTrigger />
      </TestWrapper>
    );

    const element = screen.getByTestId('semantic-element');
    fireEvent.click(element, { altKey: true });

    const kbdElements = document.querySelectorAll('kbd');
    expect(kbdElements.length).toBeGreaterThan(0);
  });
});
