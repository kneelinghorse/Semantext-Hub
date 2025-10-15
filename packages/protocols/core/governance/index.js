/**
 * Governance Module - Main Entry Point
 *
 * Automated GOVERNANCE.md generation from protocol graph,
 * override rules, and system metrics.
 */

const { GovernanceGenerator, SectionGenerators } = require('./generator');

module.exports = {
  GovernanceGenerator,
  SectionGenerators
};
