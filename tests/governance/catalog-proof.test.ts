import path from 'path';
import fs from 'fs/promises';
import { describe, test, expect } from '@jest/globals';
import { spawnMCPWithA2AStub } from '../_helpers/mcp-spawn';

function parseMCPContent(result: any): any {
  const txt = result?.content?.[0]?.text;
  if (!txt) throw new Error('Missing MCP content text');
  return JSON.parse(txt);
}

describe('Governance catalog proof', () => {
  test('docs_mermaid and protocol_review succeed on curated sample set', async () => {
    const sampleSetDir = path.join(process.cwd(), 'examples', 'catalogs', 'sample-set');
    const manifestFiles = (await fs.readdir(sampleSetDir)).filter(name => name.endsWith('.json'));
    expect(manifestFiles.length).toBeGreaterThan(0);

    const manifestEntries = await Promise.all(
      manifestFiles.map(async file => {
        const fullPath = path.join(sampleSetDir, file);
        const raw = await fs.readFile(fullPath, 'utf8');
        const manifest = JSON.parse(raw);
        const urn = manifest.urn || manifest.metadata?.urn;
        if (!urn) {
          throw new Error(`Manifest ${file} missing urn`);
        }
        return { file, manifest, urn };
      })
    );

    const urns = manifestEntries.map(entry => entry.urn);
    const apiManifest = manifestEntries.find(entry => entry.manifest.metadata?.kind === 'api');
    if (!apiManifest) {
      throw new Error('Sample set missing API manifest for protocol_review validation.');
    }

    const { client, stop } = await spawnMCPWithA2AStub({ enableLogging: false });
    try {
      const mermaidRes = await client.executeTool('docs_mermaid', {
        manifest_dir: 'examples/catalogs/sample-set'
      });
      const mermaidObj = parseMCPContent(mermaidRes);

      expect(mermaidObj.success).toBe(true);
      expect(typeof mermaidObj.diagram).toBe('string');
      expect(mermaidObj.diagram).toContain('graph TD');
      expect(mermaidObj.nodeCount).toBe(urns.length);
      expect(mermaidObj.edgeCount).toBeGreaterThanOrEqual(0);
      urns.forEach(urn => {
        expect(mermaidObj.diagram).toContain(urn);
      });

      const artifactDir = path.join(process.cwd(), '.artifacts', 'governance');
      await fs.mkdir(artifactDir, { recursive: true });
      const diagramPath = path.join(artifactDir, 'sample-set.mmd');
      await fs.writeFile(diagramPath, mermaidObj.diagram, 'utf8');

      const reviewRes = await client.executeTool('protocol_review', {
        manifest_path: path.join('examples', 'catalogs', 'sample-set', apiManifest.file)
      });
      const reviewObj = parseMCPContent(reviewRes);
      expect(reviewObj.success).toBe(true);
      expect(reviewObj.valid).toBe(true);
      expect(reviewObj.totalIssues).toBe(0);
      expect(Array.isArray(reviewObj.issues?.errors)).toBe(true);
      expect(reviewObj.issues.errors.length).toBe(0);
      expect(Array.isArray(reviewObj.issues?.warnings)).toBe(true);
      expect(reviewObj.issues.warnings.length).toBe(0);

      const reviewPath = path.join(artifactDir, 'protocol-review-sample-set.json');
      await fs.writeFile(reviewPath, JSON.stringify(reviewObj, null, 2), 'utf8');

      const [diagramStat, reviewStat] = await Promise.all([
        fs.stat(diagramPath),
        fs.stat(reviewPath)
      ]);
      expect(diagramStat.size).toBeGreaterThan(0);
      expect(reviewStat.size).toBeGreaterThan(0);
    } finally {
      await stop();
    }
  }, 20000);
});
