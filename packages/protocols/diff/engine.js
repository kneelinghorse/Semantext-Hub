/**
 * Manifest Diff Engine
 *
 * Compares protocol manifests to detect changes at structural and semantic levels.
 * Produces detailed diff reports with change classification and impact assessment.
 */

import { hash } from '../src/api_protocol_v_1_1_1.js';

/**
 * Change types
 */
const ChangeType = {
  ADDED: 'added',
  REMOVED: 'removed',
  MODIFIED: 'modified',
  RENAMED: 'renamed',
  MOVED: 'moved'
};

/**
 * Change impact levels
 */
const ImpactLevel = {
  BREAKING: 'breaking',
  NON_BREAKING: 'non_breaking',
  COMPATIBLE: 'compatible',
  INTERNAL: 'internal'
};

/**
 * Diff engine for protocol manifests
 */
class DiffEngine {
  constructor(options = {}) {
    this.options = {
      includeMetadata: options.includeMetadata !== false,
      detectMoves: options.detectMoves !== false,
      semanticDiff: options.semanticDiff !== false,
      ...options
    };
  }

  /**
   * Compare two manifests and generate a diff report
   * @param {Object} oldManifest - Previous version
   * @param {Object} newManifest - New version
   * @returns {Object} Diff report with changes categorized by impact
   */
  diff(oldManifest, newManifest) {
    const changes = [];

    // Compare metadata
    if (this.options.includeMetadata) {
      const metadataChanges = this._diffObject(
        oldManifest.metadata || {},
        newManifest.metadata || {},
        'metadata'
      );
      changes.push(...metadataChanges);
    }

    // Protocol-specific diffing
    const kind = newManifest.metadata?.kind || oldManifest.metadata?.kind;

    if (kind === 'api' || oldManifest.catalog || newManifest.catalog) {
      changes.push(...this._diffAPI(oldManifest, newManifest));
    } else if (kind === 'data' || oldManifest.service || newManifest.service) {
      changes.push(...this._diffData(oldManifest, newManifest));
    } else if (kind === 'event' || oldManifest.events || newManifest.events) {
      changes.push(...this._diffEvent(oldManifest, newManifest));
    } else if (kind === 'semantic' || oldManifest.schema || newManifest.schema) {
      changes.push(...this._diffSemantic(oldManifest, newManifest));
    }

    // Categorize by impact
    const categorized = this._categorizeChanges(changes);

    // Calculate summary statistics
    const summary = {
      totalChanges: changes.length,
      breaking: categorized.breaking.length,
      nonBreaking: categorized.nonBreaking.length,
      compatible: categorized.compatible.length,
      internal: categorized.internal.length,
      hasBreakingChanges: categorized.breaking.length > 0,
      changesByType: this._groupByType(changes)
    };

    return {
      summary,
      changes: categorized,
      oldVersion: oldManifest.metadata?.version,
      newVersion: newManifest.metadata?.version,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Diff API protocol manifests
   * @private
   */
  _diffAPI(oldManifest, newManifest) {
    const changes = [];
    const oldEndpoints = this._indexEndpoints(oldManifest.catalog?.endpoints || []);
    const newEndpoints = this._indexEndpoints(newManifest.catalog?.endpoints || []);

    // Check for removed endpoints
    for (const [key, oldEp] of oldEndpoints) {
      if (!newEndpoints.has(key)) {
        changes.push({
          type: ChangeType.REMOVED,
          impact: ImpactLevel.BREAKING,
          path: `catalog.endpoints[${oldEp.method} ${oldEp.path}]`,
          description: `Endpoint removed: ${oldEp.method} ${oldEp.path}`,
          oldValue: oldEp,
          newValue: null
        });
      }
    }

    // Check for added and modified endpoints
    for (const [key, newEp] of newEndpoints) {
      const oldEp = oldEndpoints.get(key);

      if (!oldEp) {
        changes.push({
          type: ChangeType.ADDED,
          impact: ImpactLevel.COMPATIBLE,
          path: `catalog.endpoints[${newEp.method} ${newEp.path}]`,
          description: `Endpoint added: ${newEp.method} ${newEp.path}`,
          oldValue: null,
          newValue: newEp
        });
      } else {
        // Compare endpoint details
        changes.push(...this._diffEndpoint(oldEp, newEp, key));
      }
    }

    return changes;
  }

  /**
   * Diff data protocol manifests
   * @private
   */
  _diffData(oldManifest, newManifest) {
    const changes = [];
    const oldTables = this._indexTables(oldManifest.service?.tables || []);
    const newTables = this._indexTables(newManifest.service?.tables || []);

    // Check for removed tables
    for (const [name, oldTable] of oldTables) {
      if (!newTables.has(name)) {
        changes.push({
          type: ChangeType.REMOVED,
          impact: ImpactLevel.BREAKING,
          path: `service.tables[${name}]`,
          description: `Table removed: ${name}`,
          oldValue: oldTable,
          newValue: null
        });
      }
    }

    // Check for added and modified tables
    for (const [name, newTable] of newTables) {
      const oldTable = oldTables.get(name);

      if (!oldTable) {
        changes.push({
          type: ChangeType.ADDED,
          impact: ImpactLevel.COMPATIBLE,
          path: `service.tables[${name}]`,
          description: `Table added: ${name}`,
          oldValue: null,
          newValue: newTable
        });
      } else {
        // Compare columns
        changes.push(...this._diffColumns(oldTable, newTable, name));
      }
    }

    return changes;
  }

  /**
   * Diff event protocol manifests
   * @private
   */
  _diffEvent(oldManifest, newManifest) {
    const changes = [];
    const oldEvents = this._indexEvents(oldManifest.events || []);
    const newEvents = this._indexEvents(newManifest.events || []);

    for (const [name, oldEvent] of oldEvents) {
      if (!newEvents.has(name)) {
        changes.push({
          type: ChangeType.REMOVED,
          impact: ImpactLevel.BREAKING,
          path: `events[${name}]`,
          description: `Event removed: ${name}`,
          oldValue: oldEvent,
          newValue: null
        });
      }
    }

    for (const [name, newEvent] of newEvents) {
      const oldEvent = oldEvents.get(name);

      if (!oldEvent) {
        changes.push({
          type: ChangeType.ADDED,
          impact: ImpactLevel.COMPATIBLE,
          path: `events[${name}]`,
          description: `Event added: ${name}`,
          oldValue: null,
          newValue: newEvent
        });
      } else {
        changes.push(...this._diffObject(oldEvent, newEvent, `events[${name}]`));
      }
    }

    return changes;
  }

  /**
   * Diff semantic protocol manifests
   * @private
   */
  _diffSemantic(oldManifest, newManifest) {
    const changes = [];
    const oldSchema = oldManifest.schema || {};
    const newSchema = newManifest.schema || {};

    changes.push(...this._diffObject(oldSchema, newSchema, 'schema'));

    return changes;
  }

  /**
   * Diff two endpoint definitions
   * @private
   */
  _diffEndpoint(oldEp, newEp, key) {
    const changes = [];

    // Check request schema changes
    if (JSON.stringify(oldEp.request) !== JSON.stringify(newEp.request)) {
      const requestChanges = this._diffSchema(
        oldEp.request || {},
        newEp.request || {},
        `catalog.endpoints[${key}].request`
      );
      changes.push(...requestChanges);
    }

    // Check response schema changes
    if (JSON.stringify(oldEp.response) !== JSON.stringify(newEp.response)) {
      const responseChanges = this._diffSchema(
        oldEp.response || {},
        newEp.response || {},
        `catalog.endpoints[${key}].response`
      );
      changes.push(...responseChanges);
    }

    // Check authentication changes
    if (oldEp.auth !== newEp.auth) {
      changes.push({
        type: ChangeType.MODIFIED,
        impact: ImpactLevel.BREAKING,
        path: `catalog.endpoints[${key}].auth`,
        description: `Authentication requirement changed`,
        oldValue: oldEp.auth,
        newValue: newEp.auth
      });
    }

    return changes;
  }

  /**
   * Diff table column definitions
   * @private
   */
  _diffColumns(oldTable, newTable, tableName) {
    const changes = [];
    const oldCols = new Map((oldTable.columns || []).map(c => [c.name, c]));
    const newCols = new Map((newTable.columns || []).map(c => [c.name, c]));

    // Check for removed columns
    for (const [name, oldCol] of oldCols) {
      if (!newCols.has(name)) {
        changes.push({
          type: ChangeType.REMOVED,
          impact: oldCol.nullable ? ImpactLevel.NON_BREAKING : ImpactLevel.BREAKING,
          path: `service.tables[${tableName}].columns[${name}]`,
          description: `Column removed: ${tableName}.${name}`,
          oldValue: oldCol,
          newValue: null
        });
      }
    }

    // Check for added and modified columns
    for (const [name, newCol] of newCols) {
      const oldCol = oldCols.get(name);

      if (!oldCol) {
        const impact = newCol.nullable || newCol.default_value
          ? ImpactLevel.COMPATIBLE
          : ImpactLevel.BREAKING;

        changes.push({
          type: ChangeType.ADDED,
          impact,
          path: `service.tables[${tableName}].columns[${name}]`,
          description: `Column added: ${tableName}.${name}`,
          oldValue: null,
          newValue: newCol
        });
      } else {
        // Check type changes
        if (oldCol.type !== newCol.type) {
          changes.push({
            type: ChangeType.MODIFIED,
            impact: ImpactLevel.BREAKING,
            path: `service.tables[${tableName}].columns[${name}].type`,
            description: `Column type changed: ${oldCol.type} → ${newCol.type}`,
            oldValue: oldCol.type,
            newValue: newCol.type
          });
        }

        // Check nullable changes
        if (oldCol.nullable && !newCol.nullable) {
          changes.push({
            type: ChangeType.MODIFIED,
            impact: ImpactLevel.BREAKING,
            path: `service.tables[${tableName}].columns[${name}].nullable`,
            description: `Column became non-nullable: ${tableName}.${name}`,
            oldValue: true,
            newValue: false
          });
        }
      }
    }

    return changes;
  }

  /**
   * Diff JSON schema definitions
   * @private
   */
  _diffSchema(oldSchema, newSchema, path) {
    const changes = [];

    // Required fields
    const oldRequired = new Set(oldSchema.required || []);
    const newRequired = new Set(newSchema.required || []);

    for (const field of newRequired) {
      if (!oldRequired.has(field)) {
        changes.push({
          type: ChangeType.ADDED,
          impact: ImpactLevel.BREAKING,
          path: `${path}.required`,
          description: `New required field: ${field}`,
          oldValue: null,
          newValue: field
        });
      }
    }

    for (const field of oldRequired) {
      if (!newRequired.has(field)) {
        changes.push({
          type: ChangeType.REMOVED,
          impact: ImpactLevel.COMPATIBLE,
          path: `${path}.required`,
          description: `Field no longer required: ${field}`,
          oldValue: field,
          newValue: null
        });
      }
    }

    // Properties
    const oldProps = oldSchema.properties || {};
    const newProps = newSchema.properties || {};

    for (const [name, oldProp] of Object.entries(oldProps)) {
      if (!newProps[name]) {
        changes.push({
          type: ChangeType.REMOVED,
          impact: oldRequired.has(name) ? ImpactLevel.BREAKING : ImpactLevel.NON_BREAKING,
          path: `${path}.properties.${name}`,
          description: `Property removed: ${name}`,
          oldValue: oldProp,
          newValue: null
        });
      } else if (oldProp.type !== newProps[name].type) {
        changes.push({
          type: ChangeType.MODIFIED,
          impact: ImpactLevel.BREAKING,
          path: `${path}.properties.${name}.type`,
          description: `Property type changed: ${oldProp.type} → ${newProps[name].type}`,
          oldValue: oldProp.type,
          newValue: newProps[name].type
        });
      }
    }

    for (const name of Object.keys(newProps)) {
      if (!oldProps[name]) {
        changes.push({
          type: ChangeType.ADDED,
          impact: ImpactLevel.COMPATIBLE,
          path: `${path}.properties.${name}`,
          description: `Property added: ${name}`,
          oldValue: null,
          newValue: newProps[name]
        });
      }
    }

    return changes;
  }

  /**
   * Generic object diff
   * @private
   */
  _diffObject(oldObj, newObj, path) {
    const changes = [];

    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const oldVal = oldObj[key];
      const newVal = newObj[key];

      if (oldVal === undefined && newVal !== undefined) {
        changes.push({
          type: ChangeType.ADDED,
          impact: ImpactLevel.INTERNAL,
          path: `${path}.${key}`,
          description: `Field added: ${key}`,
          oldValue: null,
          newValue: newVal
        });
      } else if (oldVal !== undefined && newVal === undefined) {
        changes.push({
          type: ChangeType.REMOVED,
          impact: ImpactLevel.INTERNAL,
          path: `${path}.${key}`,
          description: `Field removed: ${key}`,
          oldValue: oldVal,
          newValue: null
        });
      } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          type: ChangeType.MODIFIED,
          impact: ImpactLevel.INTERNAL,
          path: `${path}.${key}`,
          description: `Field modified: ${key}`,
          oldValue: oldVal,
          newValue: newVal
        });
      }
    }

    return changes;
  }

  /**
   * Index endpoints by method + path
   * @private
   */
  _indexEndpoints(endpoints) {
    const index = new Map();
    for (const ep of endpoints) {
      const key = `${ep.method} ${ep.path}`;
      index.set(key, ep);
    }
    return index;
  }

  /**
   * Index tables by name
   * @private
   */
  _indexTables(tables) {
    const index = new Map();
    for (const table of tables) {
      index.set(table.name, table);
    }
    return index;
  }

  /**
   * Index events by name
   * @private
   */
  _indexEvents(events) {
    const index = new Map();
    for (const event of events) {
      index.set(event.name, event);
    }
    return index;
  }

  /**
   * Categorize changes by impact level
   * @private
   */
  _categorizeChanges(changes) {
    return {
      breaking: changes.filter(c => c.impact === ImpactLevel.BREAKING),
      nonBreaking: changes.filter(c => c.impact === ImpactLevel.NON_BREAKING),
      compatible: changes.filter(c => c.impact === ImpactLevel.COMPATIBLE),
      internal: changes.filter(c => c.impact === ImpactLevel.INTERNAL)
    };
  }

  /**
   * Group changes by type
   * @private
   */
  _groupByType(changes) {
    const grouped = {};
    for (const change of changes) {
      if (!grouped[change.type]) {
        grouped[change.type] = 0;
      }
      grouped[change.type]++;
    }
    return grouped;
  }
}

export {
  DiffEngine,
  ChangeType,
  ImpactLevel
};
