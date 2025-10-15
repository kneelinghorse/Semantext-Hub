/**
 * Template Engine
 * Provides mustache-style template interpolation for scaffolding
 */

import fs from 'fs/promises';
import path from 'path';

export class TemplateEngine {
  /**
   * @param {string} templateDir - Directory containing templates
   */
  constructor(templateDir) {
    this.templateDir = templateDir;
    this.cache = new Map();
  }

  /**
   * Render a template with variables
   * @param {string} templateName - Template filename
   * @param {Object} variables - Variables for interpolation
   * @param {boolean} useCache - Use cached template if available
   * @returns {Promise<string>} Rendered template
   */
  async render(templateName, variables = {}, useCache = true) {
    let template;

    // Check cache
    if (useCache && this.cache.has(templateName)) {
      template = this.cache.get(templateName);
    } else {
      // Load template
      template = await this.loadTemplate(templateName);
      if (useCache) {
        this.cache.set(templateName, template);
      }
    }

    // Interpolate variables
    return this.interpolate(template, variables);
  }

  /**
   * Load template from file
   * @param {string} templateName - Template filename
   * @returns {Promise<string>} Template content
   */
  async loadTemplate(templateName) {
    const templatePath = path.join(this.templateDir, templateName);
    try {
      return await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to load template ${templateName}: ${error.message}`);
    }
  }

  /**
   * Interpolate variables into template
   * Supports {{variable}} syntax
   * @param {string} template - Template string
   * @param {Object} variables - Variables for interpolation
   * @returns {string} Interpolated string
   */
  interpolate(template, variables) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (key in variables) {
        const value = variables[key];
        // Handle different types
        if (value === null || value === undefined) {
          return '';
        }
        if (typeof value === 'object') {
          return JSON.stringify(value, null, 2);
        }
        return String(value);
      }
      // Keep placeholder if variable not provided
      return match;
    });
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get available templates
   * @returns {Promise<string[]>} List of template filenames
   */
  async getTemplates() {
    try {
      const files = await fs.readdir(this.templateDir);
      return files.filter(f => !f.startsWith('.') && f !== 'README.md');
    } catch (error) {
      throw new Error(`Failed to list templates: ${error.message}`);
    }
  }

  /**
   * Check if template exists
   * @param {string} templateName - Template filename
   * @returns {Promise<boolean>}
   */
  async hasTemplate(templateName) {
    const templatePath = path.join(this.templateDir, templateName);
    try {
      await fs.access(templatePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Render multiple templates
   * @param {Array<{name: string, variables: Object}>} templates - Templates to render
   * @returns {Promise<Array<{name: string, content: string}>>}
   */
  async renderBatch(templates) {
    return Promise.all(
      templates.map(async ({ name, variables }) => ({
        name,
        content: await this.render(name, variables)
      }))
    );
  }
}

export default TemplateEngine;
