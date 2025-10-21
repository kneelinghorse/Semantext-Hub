export class BaseImporter {
  async detect(_context) {
    return false;
  }

  async import(_context) {
    return { type: 'data', metadata: {} };
  }

  async validate(_context) {
    return { valid: true, errors: [] };
  }
}

export default BaseImporter;
