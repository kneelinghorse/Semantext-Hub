import React, { useRef, useEffect } from 'react';
import './TabNav.css';

/**
 * Tab Navigation Component
 * Accessible tab bar with keyboard navigation support
 * @param {Array} tabs - Array of {id, label, count} objects
 * @param {string} activeTab - Currently active tab ID
 * @param {Function} onTabChange - Callback when tab changes
 */
export function TabNav({ tabs, activeTab, onTabChange }) {
  const tabListRef = useRef(null);

  useEffect(() => {
    // Focus active tab when component mounts
    const activeTabElement = tabListRef.current?.querySelector('[aria-selected="true"]');
    if (activeTabElement && document.activeElement === document.body) {
      activeTabElement.focus();
    }
  }, []);

  const handleKeyDown = (e, currentIndex) => {
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const nextTab = tabs[nextIndex];
    onTabChange(nextTab.id);

    // Focus the new tab button
    setTimeout(() => {
      const buttons = tabListRef.current?.querySelectorAll('[role="tab"]');
      buttons?.[nextIndex]?.focus();
    }, 0);
  };

  return (
    <div className="tab-nav">
      <div
        className="tab-list"
        role="tablist"
        aria-label="Protocol viewer sections"
        ref={tabListRef}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`tab-button ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              data-semantic-tab={tab.id}
            >
              <span className="tab-label">{tab.label}</span>
              {tab.count !== undefined && (
                <span className="tab-count" aria-label={`${tab.count} items`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
