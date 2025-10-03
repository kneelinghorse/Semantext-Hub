// context_alerts.js
// Alert System with Escalation for Mission 3.1
// Provides intelligent alerting for critical anti-patterns requiring human intervention

class ContextAlerts {
  constructor(config = {}) {
    this.config = {
      // Alert thresholds
      thresholds: {
        lowSeverity: config.thresholds?.lowSeverity || 0.3,
        mediumSeverity: config.thresholds?.mediumSeverity || 0.6,
        highSeverity: config.thresholds?.highSeverity || 0.8,
        criticalSeverity: config.thresholds?.criticalSeverity || 0.9,
        ...config.thresholds
      },

      // Escalation settings
      escalation: {
        enableAutoEscalation: config.escalation?.enableAutoEscalation !== false,
        escalationDelayMs: config.escalation?.escalationDelayMs || 300000, // 5 minutes
        maxEscalationLevel: config.escalation?.maxEscalationLevel || 3,
        failureThresholdForEscalation: config.escalation?.failureThresholdForEscalation || 2,
        ...config.escalation
      },

      // Alert management
      management: {
        maxActiveAlerts: config.management?.maxActiveAlerts || 10,
        alertTimeoutMs: config.management?.alertTimeoutMs || 3600000, // 1 hour
        dedupWindowMs: config.management?.dedupWindowMs || 300000, // 5 minutes
        enableAlertHistory: config.management?.enableAlertHistory !== false,
        maxAlertHistory: config.management?.maxAlertHistory || 100,
        ...config.management
      },

      // Notification settings
      notifications: {
        enableConsoleNotifications: config.notifications?.enableConsoleNotifications !== false,
        enableEventNotifications: config.notifications?.enableEventNotifications !== false,
        notificationFormat: config.notifications?.notificationFormat || 'structured',
        includeRecoveryGuidance: config.notifications?.includeRecoveryGuidance !== false,
        ...config.notifications
      }
    };

    // Alert state
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.escalationTimers = new Map();
    this.alertCounts = new Map();

    // Alert statistics
    this.alertStats = {
      total: 0,
      byLevel: { info: 0, warning: 0, error: 0, critical: 0 },
      byPattern: {},
      escalated: 0,
      resolved: 0,
      timedOut: 0
    };

    // Event handling
    this.eventListeners = new Map();

    // Pattern-specific alert configurations
    this.patternConfigs = this.initializePatternConfigs();
  }

  /**
   * Process anti-pattern detection results and generate appropriate alerts
   * @param {Object} detectionResult - Results from anti-pattern detection
   * @param {Object} recoveryResults - Results from recovery attempts
   * @param {Object} options - Alert processing options
   * @returns {Object} Alert processing result
   */
  processDetectionResults(detectionResult, recoveryResults = [], options = {}) {
    const timestamp = Date.now();
    const generatedAlerts = [];

    try {
      // Process each detected pattern
      detectionResult.patterns.forEach(pattern => {
        const alert = this.generateAlert(pattern, detectionResult, recoveryResults, options);
        if (alert && this.shouldCreateAlert(alert)) {
          generatedAlerts.push(alert);
          this.createAlert(alert);
        }
      });

      // Check for meta-patterns (multiple related alerts)
      const metaAlert = this.checkForMetaPatterns(generatedAlerts, detectionResult);
      if (metaAlert) {
        generatedAlerts.push(metaAlert);
        this.createAlert(metaAlert);
      }

      // Update alert statistics
      this.updateAlertStatistics(generatedAlerts);

      return {
        success: true,
        alertsGenerated: generatedAlerts.length,
        alerts: generatedAlerts,
        activeAlertsCount: this.activeAlerts.size,
        timestamp
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        alertsGenerated: 0,
        alerts: [],
        timestamp
      };
    }
  }

  /**
   * Generate alert for specific anti-pattern
   */
  generateAlert(pattern, detectionResult, recoveryResults, options) {
    const patternConfig = this.patternConfigs[pattern.type] || this.patternConfigs.default;
    const alertLevel = this.determineAlertLevel(pattern, recoveryResults);

    // Skip if below alert threshold
    if (alertLevel === 'info' && !options.includeInfoAlerts) {
      return null;
    }

    const alertId = this.generateAlertId(pattern);
    const recoveryResult = recoveryResults.find(r => r.antiPattern === pattern.type);

    return {
      id: alertId,
      type: 'anti_pattern_alert',
      level: alertLevel,
      pattern: {
        type: pattern.type,
        severity: pattern.severity,
        metrics: pattern.metrics,
        description: pattern.description,
        recommendations: pattern.recommendations
      },
      recovery: recoveryResult ? {
        attempted: true,
        success: recoveryResult.success,
        strategy: recoveryResult.strategy,
        description: recoveryResult.description,
        error: recoveryResult.error
      } : {
        attempted: false,
        reason: 'Auto-recovery disabled or not attempted'
      },
      context: {
        detectionTime: detectionResult.detectionTime,
        contextSize: detectionResult.context?.size,
        domains: detectionResult.context?.domains,
        sessionCount: detectionResult.context?.sessionCount
      },
      escalation: {
        level: 0,
        canEscalate: patternConfig.escalatable,
        nextEscalationTime: null
      },
      guidance: this.generateRecoveryGuidance(pattern, recoveryResult),
      timestamp: Date.now(),
      expiresAt: Date.now() + this.config.management.alertTimeoutMs
    };
  }

  /**
   * Determine alert level based on pattern severity and recovery success
   */
  determineAlertLevel(pattern, recoveryResults) {
    const severity = pattern.severity;
    const recoveryResult = recoveryResults.find(r => r.antiPattern === pattern.type);
    const recoveryFailed = recoveryResult && !recoveryResult.success;

    // Escalate level if recovery failed
    const effectiveSeverity = recoveryFailed ? Math.min(1, severity + 0.2) : severity;

    if (effectiveSeverity >= this.config.thresholds.criticalSeverity) {
      return 'critical';
    } else if (effectiveSeverity >= this.config.thresholds.highSeverity) {
      return 'error';
    } else if (effectiveSeverity >= this.config.thresholds.mediumSeverity) {
      return 'warning';
    } else {
      return 'info';
    }
  }

  /**
   * Check if alert should be created (deduplication)
   */
  shouldCreateAlert(alert) {
    const patternType = alert.pattern.type;
    const now = Date.now();

    // Check deduplication window
    const recentSimilar = Array.from(this.activeAlerts.values()).find(existing =>
      existing.pattern.type === patternType &&
      (now - existing.timestamp) < this.config.management.dedupWindowMs
    );

    if (recentSimilar) {
      // Update existing alert instead of creating new one
      this.updateExistingAlert(recentSimilar.id, alert);
      return false;
    }

    // Check maximum active alerts limit
    if (this.activeAlerts.size >= this.config.management.maxActiveAlerts) {
      // Remove oldest non-critical alert
      this.removeOldestNonCriticalAlert();
    }

    return true;
  }

  /**
   * Create and activate new alert
   */
  createAlert(alert) {
    // Add to active alerts
    this.activeAlerts.set(alert.id, alert);

    // Set up escalation timer if applicable
    if (alert.escalation.canEscalate && this.config.escalation.enableAutoEscalation) {
      this.scheduleEscalation(alert.id);
    }

    // Send notifications
    this.sendNotification(alert, 'created');

    // Emit event
    this.emit('alert_created', alert);

    // Update counters
    this.incrementAlertCount(alert.pattern.type);

    return alert;
  }

  /**
   * Update existing alert with new information
   */
  updateExistingAlert(alertId, newAlert) {
    const existing = this.activeAlerts.get(alertId);
    if (!existing) return false;

    // Update key fields
    existing.pattern.severity = Math.max(existing.pattern.severity, newAlert.pattern.severity);
    existing.pattern.metrics = { ...existing.pattern.metrics, ...newAlert.pattern.metrics };
    existing.recovery = newAlert.recovery;
    existing.guidance = newAlert.guidance;
    existing.lastUpdated = Date.now();

    // Refresh expiration
    existing.expiresAt = Date.now() + this.config.management.alertTimeoutMs;

    // Send notification
    this.sendNotification(existing, 'updated');

    // Emit event
    this.emit('alert_updated', existing);

    return true;
  }

  /**
   * Resolve alert (manually or automatically)
   */
  resolveAlert(alertId, reason = 'resolved', resolvedBy = 'system') {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    // Mark as resolved
    alert.resolved = {
      timestamp: Date.now(),
      reason,
      resolvedBy
    };

    // Remove from active alerts
    this.activeAlerts.delete(alertId);

    // Cancel escalation timer
    this.cancelEscalation(alertId);

    // Add to history
    this.addToHistory(alert);

    // Send notification
    this.sendNotification(alert, 'resolved');

    // Emit event
    this.emit('alert_resolved', alert);

    // Update statistics
    this.alertStats.resolved++;

    return true;
  }

  /**
   * Escalate alert to next level
   */
  escalateAlert(alertId, reason = 'auto_escalation') {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    // Check escalation limits
    if (alert.escalation.level >= this.config.escalation.maxEscalationLevel) {
      return false;
    }

    // Escalate
    alert.escalation.level++;
    alert.escalation.escalatedAt = Date.now();
    alert.escalation.reason = reason;

    // Update alert level
    const escalationLevels = ['info', 'warning', 'error', 'critical'];
    const currentIndex = escalationLevels.indexOf(alert.level);
    if (currentIndex < escalationLevels.length - 1) {
      alert.level = escalationLevels[currentIndex + 1];
    }

    // Schedule next escalation if not at max level
    if (alert.escalation.level < this.config.escalation.maxEscalationLevel) {
      this.scheduleEscalation(alertId);
    }

    // Send escalation notification
    this.sendNotification(alert, 'escalated');

    // Emit event
    this.emit('alert_escalated', alert);

    // Update statistics
    this.alertStats.escalated++;

    return true;
  }

  /**
   * Schedule automatic escalation
   */
  scheduleEscalation(alertId) {
    // Cancel existing timer
    this.cancelEscalation(alertId);

    // Schedule new escalation
    const timer = setTimeout(() => {
      this.escalateAlert(alertId, 'timeout');
    }, this.config.escalation.escalationDelayMs);

    this.escalationTimers.set(alertId, timer);

    // Update alert with next escalation time
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.escalation.nextEscalationTime = Date.now() + this.config.escalation.escalationDelayMs;
    }
  }

  /**
   * Cancel escalation timer
   */
  cancelEscalation(alertId) {
    const timer = this.escalationTimers.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(alertId);
    }

    // Clear next escalation time
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.escalation.nextEscalationTime = null;
    }
  }

  /**
   * Check for meta-patterns across multiple alerts
   */
  checkForMetaPatterns(alerts, detectionResult) {
    if (alerts.length < 2) return null;

    // Pattern: Multiple high-severity alerts (system degradation)
    const highSeverityAlerts = alerts.filter(a => a.level === 'error' || a.level === 'critical');
    if (highSeverityAlerts.length >= 2) {
      return this.createMetaAlert('system_degradation', {
        description: 'Multiple high-severity anti-patterns detected simultaneously',
        affectedPatterns: highSeverityAlerts.map(a => a.pattern.type),
        severity: Math.max(...highSeverityAlerts.map(a => a.pattern.severity)),
        recommendation: 'Immediate system intervention required - multiple critical issues detected'
      });
    }

    // Pattern: Cascading failures (context explosion + memory leak)
    const hasExplosion = alerts.some(a => a.pattern.type === 'context_explosion');
    const hasMemoryLeak = alerts.some(a => a.pattern.type === 'memory_leak');
    if (hasExplosion && hasMemoryLeak) {
      return this.createMetaAlert('cascading_failure', {
        description: 'Cascading failure pattern detected: context explosion leading to memory leak',
        affectedPatterns: ['context_explosion', 'memory_leak'],
        severity: 0.9,
        recommendation: 'Emergency recovery required - cascading system failure in progress'
      });
    }

    return null;
  }

  /**
   * Create meta-alert for complex patterns
   */
  createMetaAlert(type, config) {
    return {
      id: this.generateAlertId({ type: `meta_${type}` }),
      type: 'meta_pattern_alert',
      level: 'critical',
      pattern: {
        type: `meta_${type}`,
        severity: config.severity,
        description: config.description,
        affectedPatterns: config.affectedPatterns,
        recommendations: [config.recommendation]
      },
      recovery: {
        attempted: false,
        reason: 'Meta-pattern requires manual intervention'
      },
      escalation: {
        level: 1, // Start escalated
        canEscalate: true,
        nextEscalationTime: Date.now() + this.config.escalation.escalationDelayMs
      },
      guidance: {
        priority: 'immediate',
        actions: [
          'Stop automated processes if possible',
          'Assess system state manually',
          'Consider rolling back to last known good state',
          'Implement emergency containment measures'
        ]
      },
      timestamp: Date.now(),
      expiresAt: Date.now() + this.config.management.alertTimeoutMs * 2 // Extended timeout for meta-alerts
    };
  }

  /**
   * Generate recovery guidance based on pattern and recovery result
   */
  generateRecoveryGuidance(pattern, recoveryResult) {
    const guidance = {
      priority: this.determinePriority(pattern.severity),
      actions: [],
      manualSteps: [],
      preventionMeasures: []
    };

    // Add pattern-specific guidance
    const patternConfig = this.patternConfigs[pattern.type];
    if (patternConfig) {
      guidance.actions.push(...patternConfig.immediateActions);
      guidance.manualSteps.push(...patternConfig.manualSteps);
      guidance.preventionMeasures.push(...patternConfig.preventionMeasures);
    }

    // Add recovery-specific guidance
    if (recoveryResult && !recoveryResult.success) {
      guidance.actions.unshift('Automated recovery failed - manual intervention required');
      guidance.manualSteps.unshift(`Review failed recovery: ${recoveryResult.error || recoveryResult.reason}`);
    }

    return guidance;
  }

  /**
   * Send notification for alert event
   */
  sendNotification(alert, eventType) {
    if (!this.config.notifications.enableConsoleNotifications &&
        !this.config.notifications.enableEventNotifications) {
      return;
    }

    const notification = this.formatNotification(alert, eventType);

    // Console notification
    if (this.config.notifications.enableConsoleNotifications) {
      this.sendConsoleNotification(notification, alert.level);
    }

    // Event notification
    if (this.config.notifications.enableEventNotifications) {
      this.emit('alert_notification', { alert, eventType, notification });
    }
  }

  /**
   * Format notification message
   */
  formatNotification(alert, eventType) {
    const timestamp = new Date(alert.timestamp).toISOString();

    if (this.config.notifications.notificationFormat === 'structured') {
      return {
        timestamp,
        eventType,
        level: alert.level,
        pattern: alert.pattern.type,
        severity: alert.pattern.severity,
        description: alert.pattern.description,
        recovery: alert.recovery,
        guidance: this.config.notifications.includeRecoveryGuidance ? alert.guidance : undefined
      };
    } else {
      // Simple text format
      const recoveryStatus = alert.recovery.attempted ?
        (alert.recovery.success ? 'Recovery successful' : 'Recovery failed') :
        'No recovery attempted';

      return `[${timestamp}] ${alert.level.toUpperCase()}: ${alert.pattern.type} - ${alert.pattern.description} (${recoveryStatus})`;
    }
  }

  /**
   * Send console notification with appropriate styling
   */
  sendConsoleNotification(notification, level) {
    const prefix = `[CONTEXT-ALERT]`;

    switch (level) {
      case 'critical':
        console.error(`${prefix} CRITICAL:`, notification);
        break;
      case 'error':
        console.error(`${prefix} ERROR:`, notification);
        break;
      case 'warning':
        console.warn(`${prefix} WARNING:`, notification);
        break;
      default:
        console.log(`${prefix} INFO:`, notification);
    }
  }

  /**
   * Clean up expired alerts
   */
  cleanupExpiredAlerts() {
    const now = Date.now();
    const expiredAlerts = [];

    this.activeAlerts.forEach((alert, alertId) => {
      if (alert.expiresAt && now > alert.expiresAt) {
        expiredAlerts.push(alertId);
      }
    });

    expiredAlerts.forEach(alertId => {
      const alert = this.activeAlerts.get(alertId);
      this.activeAlerts.delete(alertId);
      this.cancelEscalation(alertId);

      if (alert) {
        alert.expired = {
          timestamp: now,
          reason: 'timeout'
        };
        this.addToHistory(alert);
        this.alertStats.timedOut++;
        this.emit('alert_expired', alert);
      }
    });

    return expiredAlerts.length;
  }

  /**
   * Helper methods
   */

  generateAlertId(pattern) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 5);
    return `alert_${pattern.type}_${timestamp}_${random}`;
  }

  determinePriority(severity) {
    if (severity >= 0.9) return 'immediate';
    if (severity >= 0.7) return 'high';
    if (severity >= 0.5) return 'medium';
    return 'low';
  }

  removeOldestNonCriticalAlert() {
    let oldestAlert = null;
    let oldestTime = Date.now();

    this.activeAlerts.forEach((alert, alertId) => {
      if (alert.level !== 'critical' && alert.timestamp < oldestTime) {
        oldestTime = alert.timestamp;
        oldestAlert = alertId;
      }
    });

    if (oldestAlert) {
      this.resolveAlert(oldestAlert, 'space_limit', 'system');
    }
  }

  addToHistory(alert) {
    if (!this.config.management.enableAlertHistory) return;

    this.alertHistory.push(alert);

    // Maintain history size limit
    if (this.alertHistory.length > this.config.management.maxAlertHistory) {
      this.alertHistory.shift();
    }
  }

  incrementAlertCount(patternType) {
    this.alertCounts.set(patternType, (this.alertCounts.get(patternType) || 0) + 1);
  }

  updateAlertStatistics(alerts) {
    this.alertStats.total += alerts.length;

    alerts.forEach(alert => {
      this.alertStats.byLevel[alert.level]++;

      if (!this.alertStats.byPattern[alert.pattern.type]) {
        this.alertStats.byPattern[alert.pattern.type] = 0;
      }
      this.alertStats.byPattern[alert.pattern.type]++;
    });
  }

  /**
   * Initialize pattern-specific configurations
   */
  initializePatternConfigs() {
    return {
      context_rot: {
        escalatable: true,
        immediateActions: [
          'Apply state compression',
          'Archive stable domains',
          'Monitor temporal hysteresis'
        ],
        manualSteps: [
          'Review context structure for redundancy',
          'Check for circular references',
          'Validate state vector calculations'
        ],
        preventionMeasures: [
          'Implement regular compression schedules',
          'Monitor hysteresis trends',
          'Set up early warning thresholds'
        ]
      },

      context_explosion: {
        escalatable: true,
        immediateActions: [
          'Apply emergency compression',
          'Deactivate non-critical domains',
          'Monitor memory usage'
        ],
        manualSteps: [
          'Identify explosion source',
          'Review recent operations',
          'Check for infinite loops or recursion'
        ],
        preventionMeasures: [
          'Set strict memory limits',
          'Implement circuit breakers',
          'Monitor growth patterns'
        ]
      },

      memory_leak: {
        escalatable: true,
        immediateActions: [
          'Perform garbage collection',
          'Clean up orphaned references',
          'Monitor memory growth'
        ],
        manualSteps: [
          'Profile memory usage by domain',
          'Check for resource cleanup',
          'Review reference management'
        ],
        preventionMeasures: [
          'Implement automatic cleanup',
          'Add memory monitoring',
          'Use weak references where appropriate'
        ]
      },

      state_oscillation: {
        escalatable: false,
        immediateActions: [
          'Apply state dampening',
          'Stabilize oscillating dimensions',
          'Monitor state vector variance'
        ],
        manualSteps: [
          'Identify oscillation source',
          'Review feedback loops',
          'Check calculation algorithms'
        ],
        preventionMeasures: [
          'Add state smoothing filters',
          'Implement variance monitoring',
          'Use dampening coefficients'
        ]
      },

      domain_bloat: {
        escalatable: false,
        immediateActions: [
          'Split large domains',
          'Compress domain content',
          'Archive completed domains'
        ],
        manualSteps: [
          'Review domain structure',
          'Identify consolidation opportunities',
          'Plan domain reorganization'
        ],
        preventionMeasures: [
          'Set domain size limits',
          'Implement automatic splitting',
          'Monitor domain growth'
        ]
      },

      compression_degradation: {
        escalatable: false,
        immediateActions: [
          'Reset compression system',
          'Retune compression parameters',
          'Monitor compression effectiveness'
        ],
        manualSteps: [
          'Analyze compression performance',
          'Review compression strategies',
          'Update compression algorithms'
        ],
        preventionMeasures: [
          'Regular compression tuning',
          'Performance monitoring',
          'Strategy validation'
        ]
      },

      default: {
        escalatable: true,
        immediateActions: [
          'Apply general compression',
          'Monitor system state',
          'Review recent changes'
        ],
        manualSteps: [
          'Analyze specific pattern',
          'Consult documentation',
          'Contact system administrator'
        ],
        preventionMeasures: [
          'Implement monitoring',
          'Regular system health checks',
          'Update prevention strategies'
        ]
      }
    };
  }

  /**
   * Event handling
   */
  on(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.warn(`Alert event listener error for ${event}:`, error);
      }
    });
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alerts by level
   */
  getAlertsByLevel(level) {
    return Array.from(this.activeAlerts.values()).filter(alert => alert.level === level);
  }

  /**
   * Get alerts by pattern type
   */
  getAlertsByPattern(patternType) {
    return Array.from(this.activeAlerts.values()).filter(alert => alert.pattern.type === patternType);
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics() {
    const active = this.activeAlerts.size;
    const escalationPending = Array.from(this.escalationTimers.keys()).length;

    return {
      ...this.alertStats,
      active,
      escalationPending,
      byPatternCount: Object.fromEntries(this.alertCounts),
      recentHistory: this.alertHistory.slice(-10)
    };
  }

  /**
   * Get comprehensive diagnostics
   */
  getDiagnostics() {
    const now = Date.now();
    const activeAlerts = Array.from(this.activeAlerts.values());

    return {
      configuration: this.config,
      statistics: this.getAlertStatistics(),
      activeAlerts: {
        count: activeAlerts.length,
        byLevel: {
          info: activeAlerts.filter(a => a.level === 'info').length,
          warning: activeAlerts.filter(a => a.level === 'warning').length,
          error: activeAlerts.filter(a => a.level === 'error').length,
          critical: activeAlerts.filter(a => a.level === 'critical').length
        },
        oldestTimestamp: activeAlerts.length > 0 ? Math.min(...activeAlerts.map(a => a.timestamp)) : null,
        escalationsPending: this.escalationTimers.size
      },
      patternConfigs: Object.keys(this.patternConfigs),
      health: {
        alertsNearExpiry: activeAlerts.filter(a => a.expiresAt && (a.expiresAt - now) < 300000).length, // 5 minutes
        criticalAlertsActive: activeAlerts.filter(a => a.level === 'critical').length,
        escalatedAlerts: activeAlerts.filter(a => a.escalation.level > 0).length
      }
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    // Clear all escalation timers
    this.escalationTimers.forEach(timer => clearTimeout(timer));
    this.escalationTimers.clear();

    // Clear all active alerts
    this.activeAlerts.clear();

    // Clear event listeners
    this.eventListeners.clear();

    this.emit('context_alerts_destroyed', { timestamp: Date.now() });
  }
}

module.exports = ContextAlerts;