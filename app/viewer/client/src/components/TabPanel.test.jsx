import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabPanel, EmptyState } from './TabPanel.jsx';

describe('TabPanel', () => {
  it('renders children when active and not loading', () => {
    render(
      <TabPanel tabId="test" active={true} loading={false}>
        <div>Test Content</div>
      </TabPanel>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('does not render when not active', () => {
    render(
      <TabPanel tabId="test" active={false} loading={false}>
        <div>Test Content</div>
      </TabPanel>
    );

    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <TabPanel tabId="test" active={true} loading={true}>
        <div>Test Content</div>
      </TabPanel>
    );

    expect(screen.getByText(/loading test data/i)).toBeInTheDocument();
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  });

  it('shows error state', () => {
    const error = new Error('Failed to load');
    render(
      <TabPanel tabId="test" active={true} loading={false} error={error}>
        <div>Test Content</div>
      </TabPanel>
    );

    expect(screen.getByText(/failed to load test data/i)).toBeInTheDocument();
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  });

  it('adds semantic attributes', () => {
    const { container } = render(
      <TabPanel tabId="health" active={true} loading={false}>
        <div>Content</div>
      </TabPanel>
    );

    const panel = container.querySelector('[data-semantic-panel="health"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('data-semantic-urn', 'urn:proto:viewer:health:panel');
    expect(panel).toHaveAttribute('data-semantic-state', 'ready');
  });
});

describe('EmptyState', () => {
  it('renders with default props', () => {
    render(<EmptyState />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders with custom message', () => {
    render(<EmptyState message="No manifests found" />);

    expect(screen.getByText('No manifests found')).toBeInTheDocument();
  });
});
