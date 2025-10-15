import { catalogListCommand as catalogListCommandJs } from './catalog-list.js';

export interface CatalogListOptions {
  workspace?: string;
  format?: 'table' | 'json';
}

export interface CatalogListEntry {
  name: string;
  version: string;
  description: string;
  urn: string;
  path: string;
}

export interface CatalogListResult {
  workspace: string;
  protocols: CatalogListEntry[];
}

export const catalogListCommand = catalogListCommandJs as (options?: CatalogListOptions) => Promise<CatalogListResult>;

export default {
  catalogListCommand
};
