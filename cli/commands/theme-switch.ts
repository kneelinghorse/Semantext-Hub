import { themeSwitchCommand as themeSwitchCommandJs } from './theme-switch.js';

export interface ThemeSwitchOptions {
  workspace?: string;
  includeMetadata?: boolean;
}

export interface ThemeSwitchResult {
  theme: string;
  drawio: string;
  cytoscape: string;
}

export const themeSwitchCommand = themeSwitchCommandJs as (
  themeId: string,
  options?: ThemeSwitchOptions
) => Promise<ThemeSwitchResult>;

export default {
  themeSwitchCommand
};
