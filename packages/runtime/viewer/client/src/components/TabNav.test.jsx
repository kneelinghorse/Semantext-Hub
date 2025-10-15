import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabNav } from './TabNav.jsx';

describe('TabNav', () => {
  const mockTabs = [
    { id: 'health', label: 'Health', count: 1 },
    { id: 'manifests', label: 'Manifests', count: 5 },
    { id: 'validation', label: 'Validation' },
  ];

  it('renders all tabs', () => {
    const onTabChange = vi.fn();
    render(<TabNav tabs={mockTabs} activeTab="health" onTabChange={onTabChange} />);

    expect(screen.getByRole('tab', { name: /health/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /manifests/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /validation/i })).toBeInTheDocument();
  });

  it('marks active tab as selected', () => {
    const onTabChange = vi.fn();
    render(<TabNav tabs={mockTabs} activeTab="manifests" onTabChange={onTabChange} />);

    const manifestsTab = screen.getByRole('tab', { name: /manifests/i });
    expect(manifestsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onTabChange when tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<TabNav tabs={mockTabs} activeTab="health" onTabChange={onTabChange} />);

    const manifestsTab = screen.getByRole('tab', { name: /manifests/i });
    fireEvent.click(manifestsTab);

    expect(onTabChange).toHaveBeenCalledWith('manifests');
  });

  it('displays tab counts when provided', () => {
    const onTabChange = vi.fn();
    render(<TabNav tabs={mockTabs} activeTab="health" onTabChange={onTabChange} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('handles keyboard navigation with arrow keys', () => {
    const onTabChange = vi.fn();
    render(<TabNav tabs={mockTabs} activeTab="health" onTabChange={onTabChange} />);

    const healthTab = screen.getByRole('tab', { name: /health/i });

    // Press ArrowRight to move to next tab
    fireEvent.keyDown(healthTab, { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('manifests');
  });

  it('adds semantic attributes to tabs', () => {
    const onTabChange = vi.fn();
    render(<TabNav tabs={mockTabs} activeTab="health" onTabChange={onTabChange} />);

    const healthTab = screen.getByRole('tab', { name: /health/i });
    expect(healthTab).toHaveAttribute('data-semantic-tab', 'health');
  });
});
