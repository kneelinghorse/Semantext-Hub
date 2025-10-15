import type { CanonicalGraphEdge, CanonicalGraphNode } from '../drawio/exporter.ts';
import type { CytoscapeLayoutOptions, CytoscapeStyleDefinition } from '../cytoscape/exporter.ts';

import {
  createThemeService as createThemeServiceJs,
  listThemes as listThemesJs,
  getTheme as getThemeJs,
  getActiveThemeId as getActiveThemeIdJs,
  setActiveThemeId as setActiveThemeIdJs,
  getDrawioTheme as getDrawioThemeJs,
  getCytoscapeTheme as getCytoscapeThemeJs,
  styleObjectToString as styleObjectToStringJs
} from './serializer.js';

export type ThemeStyleValue = string | number | boolean;

export interface ThemeStyleMap {
  [key: string]: ThemeStyleValue;
}

export interface ThemeStyleEntry {
  style: ThemeStyleMap;
}

export interface DrawioThemeDefinition {
  defaults: {
    node: {
      width: number;
      height: number;
      style: ThemeStyleMap;
    };
    edge: ThemeStyleEntry;
  };
  nodeTypes?: Record<string, ThemeStyleEntry>;
  domains?: Record<string, ThemeStyleEntry>;
  edgeTypes?: Record<string, ThemeStyleEntry>;
}

export interface CytoscapeThemeDefinition {
  defaults: {
    node: ThemeStyleEntry;
    edge: ThemeStyleEntry;
    layout: CytoscapeLayoutOptions;
  };
  nodeTypes?: Record<string, ThemeStyleEntry>;
  domains?: Record<string, ThemeStyleEntry>;
  edgeTypes?: Record<string, ThemeStyleEntry>;
}

export interface ResolvedTheme {
  id: string;
  name: string;
  description?: string;
  metadata: Record<string, unknown>;
  palette: Record<string, unknown>;
  drawio: DrawioThemeDefinition;
  cytoscape: CytoscapeThemeDefinition;
  sourcePath: string;
}

export interface ThemeSummary {
  id: string;
  name: string;
  description?: string;
}

export interface DrawioThemeAdapter {
  resolveNodeStyle(node: CanonicalGraphNode): { width: number; height: number; style: ThemeStyleMap };
  resolveEdgeStyle(edge: CanonicalGraphEdge): { style: ThemeStyleMap };
  hasNodeType(type: string): boolean;
  hasDomain(domain: string): boolean;
  hasEdgeType(type: string): boolean;
}

export interface CytoscapeThemeAdapter {
  style: CytoscapeStyleDefinition[];
  layout: CytoscapeLayoutOptions;
  hasNodeType(type: string): boolean;
  hasDomain(domain: string): boolean;
  hasEdgeType(type: string): boolean;
}

export interface ThemeService {
  root: string;
  themesDir: string;
  activePath: string;
  listThemes(): ThemeSummary[];
  getTheme(themeId?: string): ResolvedTheme;
  getActiveThemeId(): string;
  setActiveThemeId(themeId: string): { id: string; updatedAt: string };
  getDrawioTheme(themeId?: string): DrawioThemeAdapter;
  getCytoscapeTheme(themeId?: string): CytoscapeThemeAdapter;
  styleObjectToString(style: ThemeStyleMap): string;
}

export const createThemeService = createThemeServiceJs as (options?: { root?: string }) => ThemeService;

export const listThemes = listThemesJs as () => ThemeSummary[];

export const getTheme = getThemeJs as (themeId?: string) => ResolvedTheme;

export const getActiveThemeId = getActiveThemeIdJs as () => string;

export const setActiveThemeId = setActiveThemeIdJs as (themeId: string) => { id: string; updatedAt: string };

export const getDrawioTheme = getDrawioThemeJs as (themeId?: string) => DrawioThemeAdapter;

export const getCytoscapeTheme = getCytoscapeThemeJs as (themeId?: string) => CytoscapeThemeAdapter;

export const styleObjectToString = styleObjectToStringJs as (style: ThemeStyleMap) => string;

export default {
  createThemeService,
  listThemes,
  getTheme,
  getActiveThemeId,
  setActiveThemeId,
  getDrawioTheme,
  getCytoscapeTheme,
  styleObjectToString
};
