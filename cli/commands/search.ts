import { searchCommand as searchCommandJs } from './search.js';

export interface SearchCommandOptions {
  workspace?: string;
  limit?: number | string;
  json?: boolean;
  activate?: boolean;
}

export interface SearchResultEntry {
  rank?: number;
  tool_id?: string | null;
  urn?: string | null;
  name?: string | null;
  summary?: string | null;
  capabilities?: string[];
  schema_uri?: string | null;
  schemaUri?: string | null;
  score?: number | null;
  vector?: number[];
  [key: string]: unknown;
}

export interface ActivationSummary {
  urn: string | null;
  tool_id: string | null;
  metadata: Record<string, unknown> | null;
  capabilities: string[];
  activation_hints: unknown;
  resources: unknown;
}

export interface SearchCommandResult {
  success: boolean;
  workspace: string;
  query: string;
  limit: number | null;
  returned: number;
  totalCandidates: number;
  results: SearchResultEntry[];
  timings: Record<string, number>;
  activation?: ActivationSummary;
}

export const searchCommand = searchCommandJs as (
  query: string,
  options?: SearchCommandOptions
) => Promise<SearchCommandResult | null>;

export default {
  searchCommand
};
