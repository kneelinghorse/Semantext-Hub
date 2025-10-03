const { ProtocolViewerServer } = require('../../viewer/server.js');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/manifests');

function mockListen(serverInstance) {
  const stubServer = {
    listening: false,
    close: jest.fn((callback) => {
      stubServer.listening = false;
      if (callback) callback();
    }),
  };

  return jest.spyOn(serverInstance.app, 'listen').mockImplementation((port, callback) => {
    stubServer.listening = true;
    if (callback) callback();
    return stubServer;
  });
}

describe('ProtocolViewerServer', () => {

  describe('Lifecycle', () => {

    test('starts and stops cleanly', async () => {
      const server = new ProtocolViewerServer(FIXTURES_DIR, { port: 3001 });
      const listenSpy = mockListen(server);

      await server.start();
      expect(listenSpy).toHaveBeenCalledWith(3001, expect.any(Function));
      expect(server.server).toBeDefined();
      expect(server.server.listening).toBe(true);

      await server.stop();
      expect(server.server.listening).toBe(false);

      listenSpy.mockRestore();
    });

    test('startup time is under 500ms', async () => {
      const server = new ProtocolViewerServer(FIXTURES_DIR, { port: 3002 });
      const listenSpy = mockListen(server);

      const start = Date.now();
      await server.start();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);

      await server.stop();

      listenSpy.mockRestore();
    });

    test('handles multiple start/stop cycles', async () => {
      const server = new ProtocolViewerServer(FIXTURES_DIR, { port: 3003 });
      const listenSpy = mockListen(server);

      // First cycle
      await server.start();
      await server.stop();

      // Second cycle
      await server.start();
      expect(server.server.listening).toBe(true);
      await server.stop();

      listenSpy.mockRestore();
    });

  });

  describe('Configuration', () => {

    test('uses default port 3000', () => {
      const server = new ProtocolViewerServer(FIXTURES_DIR);
      expect(server.port).toBe(3000);
    });

    test('accepts custom port', () => {
      const server = new ProtocolViewerServer(FIXTURES_DIR, { port: 4000 });
      expect(server.port).toBe(4000);
    });

    test('resolves artifacts directory path', () => {
      const server = new ProtocolViewerServer('./test');
      expect(path.isAbsolute(server.artifactsDir)).toBe(true);
    });

    test('enables CORS in development by default', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const server = new ProtocolViewerServer(FIXTURES_DIR);
      expect(server.enableCors).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    test('disables CORS in production by default', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const server = new ProtocolViewerServer(FIXTURES_DIR);
      expect(server.enableCors).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });

  });

});
