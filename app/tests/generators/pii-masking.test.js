/**
 * Tests for PII Masking Utility Generator
 */

const { generatePIIMaskingUtil } = require('../../generators/consumers/utils/pii-masking-generator');

describe('PII Masking Utility Generator', () => {
  describe('generatePIIMaskingUtil', () => {
    it('should generate PII masking utility', () => {
      const code = generatePIIMaskingUtil();

      expect(code).toContain('export function maskPII');
      expect(code).toContain('export function isPIIFieldName');
      expect(code).toContain('Utility to mask PII fields for safe logging');
    });

    it('should include email masking logic', () => {
      const code = generatePIIMaskingUtil();

      expect(code).toContain("if (value.includes('@'))");
      expect(code).toContain("const [local, domain] = value.split('@')");
    });

    it('should include number masking logic', () => {
      const code = generatePIIMaskingUtil();

      expect(code).toContain("typeof value === 'number'");
      expect(code).toContain("show last 4 digits only");
    });

    it('should include field name heuristic check', () => {
      const code = generatePIIMaskingUtil();

      expect(code).toContain('isPIIFieldName');
      expect(code).toContain("'email'");
      expect(code).toContain("'phone'");
      expect(code).toContain("'ssn'");
      expect(code).toContain("'password'");
    });

    it('should generate TypeScript by default', () => {
      const code = generatePIIMaskingUtil();

      expect(code).toContain(': any');
      expect(code).toContain(': string[]');
      expect(code).toContain(': string');
      expect(code).toContain(': boolean');
    });

    it('should generate JavaScript when typescript option is false', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).not.toContain(': any');
      expect(code).not.toContain(': string[]');
      expect(code).not.toContain(': string');
      expect(code).not.toContain(': boolean');
      // Should still have function bodies
      expect(code).toContain('export function maskPII');
      expect(code).toContain('export function isPIIFieldName');
    });

    it('should include usage examples in comments', () => {
      const code = generatePIIMaskingUtil();

      expect(code).toContain('Usage:');
      expect(code).toContain('const event =');
      expect(code).toContain('const safe = maskPII');
    });
  });

  describe('Generated code content verification', () => {
    it('should include email masking logic in generated code', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).toContain("if (value.includes('@'))");
      expect(code).toContain("const [local, domain] = value.split('@')");
      expect(code).toContain('local[0]');
    });

    it('should include string masking logic in generated code', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).toContain("value[0] + '*'.repeat");
      expect(code).toContain('[REDACTED]');
    });

    it('should include number masking logic in generated code', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).toContain("typeof value === 'number'");
      expect(code).toContain("'***' + numStr.slice(-4)");
    });

    it('should include array handling logic in generated code', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).toContain('Array.isArray(obj)');
      expect(code).toContain('[...obj]');
    });

    it('should include null/undefined checks in generated code', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).toContain("if (!obj || typeof obj !== 'object') return obj");
    });
  });

  describe('Generated isPIIFieldName logic', () => {
    it('should include email pattern detection in generated code', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).toContain("'email'");
      expect(code).toContain('isPIIFieldName');
    });

    it('should include phone pattern detection in generated code', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).toContain("'phone'");
      expect(code).toContain("'mobile'");
    });

    it('should include name pattern detection in generated code', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).toContain("'name'");
      expect(code).toContain("'firstname'");
      expect(code).toContain("'lastname'");
    });

    it('should include sensitive pattern detection in generated code', () => {
      const code = generatePIIMaskingUtil({ typescript: false });

      expect(code).toContain("'ssn'");
      expect(code).toContain("'password'");
      expect(code).toContain("'credit'");
    });
  });
});
