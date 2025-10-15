import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppInner } from './App.jsx';
import { SemanticRegistryProvider, useSemanticRegistry } from './contexts/SemanticRegistry.jsx';
import { InspectionOverlayProvider } from './contexts/InspectionOverlay.jsx';

const healthPayload = {
  status: 'ok',
  uptime: 120,
  manifest_count: 2,
  manifests: {
    count: 2,
    formats: {
      proto: 1,
      openapi: 1,
    },
  },
  timestamp: new Date().toISOString(),
};

const manifestsPayload = [
  {
    id: 'api-test',
    filename: 'api-test.json',
    kind: 'proto',
    size: 1024,
    modified: new Date().toISOString(),
    urn: 'urn:proto:manifest:api-test',
  },
  {
    id: 'openapi-sample',
    filename: 'openapi-sample.json',
    kind: 'openapi',
    size: 2048,
    modified: new Date().toISOString(),
    urn: 'urn:proto:manifest:openapi-sample',
  },
];

const manifestDetailPayload = {
  metadata: {
    version: '1.0.0',
  },
  protocol: {
    name: 'API Test',
  },
};

const jsonResponse = (data) => ({
  ok: true,
  status: 200,
  headers: {
    get: () => 'application/json',
  },
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

const createFetchMock = () =>
  vi.fn((input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/health')) {
      return Promise.resolve(jsonResponse(healthPayload));
    }

    if (url.endsWith('/api/manifests')) {
      return Promise.resolve(jsonResponse(manifestsPayload));
    }

    if (url.includes('/api/manifest/')) {
      return Promise.resolve(jsonResponse(manifestDetailPayload));
    }

    return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
  });

function RegistryProbe() {
  const { registry } = useSemanticRegistry();
  const activePanels = Object.keys(registry.activePanels);

  return (
    <div data-testid="registry-probe">
      <span data-testid="registry-active-tab">{registry.activeTab || 'none'}</span>
      <span data-testid="registry-active-panels">
        {activePanels.length ? activePanels.join(',') : 'none'}
      </span>
      <span data-testid="registry-selected-manifest">
        {registry.selectedManifest || 'none'}
      </span>
    </div>
  );
}

const renderWithRegistry = () =>
  render(
    <SemanticRegistryProvider>
      <InspectionOverlayProvider>
        <RegistryProbe />
        <AppInner />
      </InspectionOverlayProvider>
    </SemanticRegistryProvider>
  );

describe('App semantic instrumentation', () => {
  beforeEach(() => {
    global.fetch = createFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = undefined;
  });

  it('registers health tab on initial render', async () => {
    renderWithRegistry();

    await waitFor(() =>
      expect(screen.getByTestId('registry-active-tab')).toHaveTextContent('health')
    );

    await waitFor(() =>
      expect(screen.getByTestId('registry-active-panels')).toHaveTextContent('health')
    );

    const healthPanel = await screen.findByRole('tabpanel');
    expect(healthPanel).toHaveAttribute('data-semantic-urn', 'urn:proto:viewer:health:panel');
    expect(healthPanel).toHaveAttribute('data-semantic-state', 'ready');
  });

  it('updates registry when switching tabs', async () => {
    renderWithRegistry();

    await screen.findByText('System Health');

    const validationTab = screen.getByRole('tab', { name: /validation/i });
    fireEvent.click(validationTab);

    await screen.findByText('Manifest Validation');

    await waitFor(() =>
      expect(screen.getByTestId('registry-active-tab')).toHaveTextContent('validation')
    );

    expect(screen.getByTestId('registry-active-panels')).toHaveTextContent('validation');
  });

  it('tracks manifest detail selection with semantic attributes', async () => {
    renderWithRegistry();

    await screen.findByText('System Health');

    const manifestsTab = screen.getByRole('tab', { name: /manifests/i });
    fireEvent.click(manifestsTab);

    await screen.findByText('Protocol Manifests');

    const manifestRow = (await screen.findAllByText(/api-test/i))[0];
    fireEvent.click(manifestRow.closest('[role="button"]'));

    await screen.findByTitle('Download manifest');

    const detailOverlay = screen.getByTitle('Close').closest('.manifest-detail');
    expect(detailOverlay).toHaveAttribute('data-semantic-view', 'detail');
    expect(detailOverlay).toHaveAttribute('data-semantic-role', 'manifest-detail');
    expect(detailOverlay).toHaveAttribute('data-semantic-state', 'ready');

    expect(screen.getByTestId('registry-active-panels')).toHaveTextContent('manifest-detail');
    expect(screen.getByTestId('registry-selected-manifest')).toHaveTextContent('api-test');

    const downloadButton = screen.getByTitle('Download manifest');
    expect(downloadButton).toHaveAttribute('data-semantic-action', 'download-manifest');
    expect(downloadButton).toHaveAttribute('data-semantic-target', 'api-test');
  });
});
