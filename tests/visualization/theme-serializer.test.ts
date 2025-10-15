import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  createThemeService,
  listThemes,
  getDrawioTheme,
  getCytoscapeTheme
} from '../../src/visualization/theme/serializer.js';
import type { CanonicalGraphNode } from '../../src/visualization/drawio/exporter.ts';

describe('theme serializer', () => {
  it('lists available themes and resolves draw.io styling tokens', () => {
    const themes = listThemes();
    expect(themes.length).toBeGreaterThan(0);
    expect(themes.map((entry) => entry.id)).toContain('light');

    const drawioTheme = getDrawioTheme('light');
    const node: CanonicalGraphNode = {
      id: 'svc-1',
      label: 'Service One',
      type: 'service',
      domain: 'platform'
    };

    const resolved = drawioTheme.resolveNodeStyle(node);
    expect(resolved.width).toBeGreaterThan(0);
    expect(resolved.style.shape).toBe('swimlane');
    expect(resolved.style.fillColor).toBe('#E0F2FE');
    expect(resolved.style.strokeColor).toBe('#0284C7');
  });

  it('produces Cytoscape style definitions with layout defaults', () => {
    const theme = getCytoscapeTheme('light');
    const nodeStyle = theme.style.find((entry) => entry.selector === 'node');
    const edgeStyle = theme.style.find((entry) => entry.selector === 'edge');

    expect(nodeStyle).toBeDefined();
    expect(nodeStyle?.style['background-color']).toBe('#E6F4F1');
    expect(edgeStyle?.style['line-color']).toBe('#0B7285');
    expect(theme.layout.name).toBe('cola');
    expect(theme.hasNodeType('protocol')).toBe(true);
  });

  it('writes active theme metadata for a supplied workspace root', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-service-'));
    const configDir = path.join(tempRoot, 'config');
    const themesDir = path.join(configDir, 'themes');

    try {
      await fs.mkdir(themesDir, { recursive: true });

      const repoRoot = process.cwd();
      await fs.copyFile(
        path.join(repoRoot, 'config', 'theme-style-schema.json'),
        path.join(configDir, 'theme-style-schema.json')
      );
      await fs.copyFile(
        path.join(repoRoot, 'config', 'themes', 'light.json'),
        path.join(themesDir, 'light.json')
      );

      const service = createThemeService({ root: tempRoot });
      const payload = service.setActiveThemeId('light');
      expect(payload.id).toBe('light');

      const contents = await fs.readFile(path.join(themesDir, 'active.json'), 'utf8');
      const parsed = JSON.parse(contents);
      expect(parsed).toMatchObject({ id: 'light' });
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
