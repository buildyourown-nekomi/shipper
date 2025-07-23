/**
 * Keelanfile Parser
 * Parses YAML configuration files for crate build and runtime configuration
 */

import { parse } from 'yaml';
import fs from 'fs-extra';
import * as fs_original from 'fs';
import * as path from 'path';

// Type definitions for the Keelanfile configuration

export interface BuildContext {
  base_image: string;
  work_directory: string;
}

export interface BuildStep {
  action: string;
  source?: string;
  destination?: string;
  description?: string;
  command?: string[];
  shell?: boolean;
  fail_on_error?: boolean;
}

export interface CrateConfig {
  expose_ports: number[];
  environment_variables: Record<string, string>;
}

export interface KeelanConfig {
  build_context: BuildContext;
  build_steps: BuildStep[];
  crate_config: CrateConfig;
  runtime_entrypoint?: string[];
  runtime_command?: string[];
}

export class KeelanParserError extends Error {
  constructor(message: string, public readonly line?: number, public readonly column?: number) {
    super(message);
    this.name = 'KeelanParserError';
  }
}

export class KeelanParser {
  /**
   * Parse a Keelanfile from a file path
   * @param filePath Path to the Keelanfile
   * @returns Parsed configuration
   */
  static parseFromFile(filePath: string): KeelanConfig {
    try {
      if (!fs_original.existsSync(filePath)) {
        throw new KeelanParserError(`Keelanfile not found: ${filePath}`);
      }

      const content = fs_original.readFileSync(filePath, 'utf8');
      return this.parseFromString(content);
    } catch (error: any) {
      if (error instanceof KeelanParserError) {
        throw error;
      }
      throw new KeelanParserError(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Parse a Keelanfile from string content
   * @param content YAML content as string
   * @returns Parsed configuration
   */
  static parseFromString(content: string): KeelanConfig {
    try {
      const parsed = parse(content) as any;
      
      if (!parsed || typeof parsed !== 'object') {
        throw new KeelanParserError('Invalid YAML format: expected object');
      }

      return this.validateAndTransform(parsed);
    } catch (error) {
      if (error instanceof KeelanParserError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new KeelanParserError(`YAML parsing error: ${error.message}`);
      }
      throw new KeelanParserError(`Parsing failed: ${String(error)}`);
    }
  }

  /**
   * Validate and transform the parsed YAML into a KeelanConfig
   * @param raw Raw parsed YAML object
   * @returns Validated KeelanConfig
   */
  private static validateAndTransform(raw: any): KeelanConfig {
    const config: KeelanConfig = {
      build_context: this.validateBuildContext(raw.build_context),
      build_steps: this.validateBuildSteps(raw.build_steps),
      crate_config: this.validateCrateConfig(raw.crate_config),
    };

    // Optional fields
    if (raw.runtime_entrypoint !== undefined) {
      config.runtime_entrypoint = this.validateStringArray(
        raw.runtime_entrypoint,
        'runtime_entrypoint'
      );
    }

    if (raw.runtime_command !== undefined) {
      config.runtime_command = this.validateStringArray(
        raw.runtime_command,
        'runtime_command'
      );
    }

    return config;
  }

  private static validateBuildContext(raw: any): BuildContext {
    if (!raw || typeof raw !== 'object') {
      throw new KeelanParserError('build_context must be an object');
    }

    if (typeof raw.base_image !== 'string') {
      throw new KeelanParserError('build_context.base_image must be a string');
    }

    if (typeof raw.work_directory !== 'string') {
      throw new KeelanParserError('build_context.work_directory must be a string');
    }

    return {
      base_image: raw.base_image,
      work_directory: raw.work_directory,
    };
  }

  private static validateBuildSteps(raw: any): BuildStep[] {
    if (!Array.isArray(raw)) {
      throw new KeelanParserError('build_steps must be an array');
    }

    if (raw.length === 0) {
      throw new KeelanParserError('build_steps cannot be empty');
    }

    return raw.map((step, index) => this.validateBuildStep(step, index));
  }

  private static validateBuildStep(raw: any, index: number): BuildStep {
    if (!raw || typeof raw !== 'object') {
      throw new KeelanParserError(`build_steps[${index}] must be an object`);
    }

    if (typeof raw.action !== 'string') {
      throw new KeelanParserError(`build_steps[${index}].action must be a string`);
    }

    const step: BuildStep = {
      action: raw.action,
    };

    // Optional fields based on action type
    if (raw.source !== undefined) {
      if (typeof raw.source !== 'string') {
        throw new KeelanParserError(`build_steps[${index}].source must be a string`);
      }
      step.source = raw.source;
    }

    if (raw.destination !== undefined) {
      if (typeof raw.destination !== 'string') {
        throw new KeelanParserError(`build_steps[${index}].destination must be a string`);
      }
      step.destination = raw.destination;
    }

    if (raw.description !== undefined) {
      if (typeof raw.description !== 'string') {
        throw new KeelanParserError(`build_steps[${index}].description must be a string`);
      }
      step.description = raw.description;
    }

    if (raw.command !== undefined) {
      step.command = this.validateStringArray(raw.command, `build_steps[${index}].command`);
    }

    if (raw.shell !== undefined) {
      if (typeof raw.shell !== 'boolean') {
        throw new KeelanParserError(`build_steps[${index}].shell must be a boolean`);
      }
      step.shell = raw.shell;
    }

    if (raw.fail_on_error !== undefined) {
      if (typeof raw.fail_on_error !== 'boolean') {
        throw new KeelanParserError(`build_steps[${index}].fail_on_error must be a boolean`);
      }
      step.fail_on_error = raw.fail_on_error;
    }

    return step;
  }

  private static validateCrateConfig(raw: any): CrateConfig {
    if (!raw || typeof raw !== 'object') {
      throw new KeelanParserError('crate_config must be an object');
    }

    const config: CrateConfig = {
      expose_ports: [],
      environment_variables: {},
    };

    if (raw.expose_ports !== undefined) {
      if (!Array.isArray(raw.expose_ports)) {
        throw new KeelanParserError('crate_config.expose_ports must be an array');
      }
      config.expose_ports = raw.expose_ports.map((port: any, index: number) => {
        if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
          throw new KeelanParserError(
            `crate_config.expose_ports[${index}] must be an integer between 1 and 65535`
          );
        }
        return port;
      });
    }

    if (raw.environment_variables !== undefined) {
      if (!raw.environment_variables || typeof raw.environment_variables !== 'object') {
        throw new KeelanParserError('crate_config.environment_variables must be an object');
      }
      
      for (const [key, value] of Object.entries(raw.environment_variables)) {
        if (typeof value !== 'string') {
          throw new KeelanParserError(
            `crate_config.environment_variables.${key} must be a string`
          );
        }
        config.environment_variables[key] = value;
      }
    }

    return config;
  }

  private static validateStringArray(raw: any, fieldName: string): string[] {
    if (!Array.isArray(raw)) {
      throw new KeelanParserError(`${fieldName} must be an array`);
    }

    return raw.map((item, index) => {
      if (typeof item !== 'string') {
        throw new KeelanParserError(`${fieldName}[${index}] must be a string`);
      }
      return item;
    });
  }

  /**
   * Get the default Keelanfile path
   * @param baseDir Base directory to search for Keelanfile
   * @returns Path to the Keelanfile
   */
  static getDefaultPath(baseDir: string = process.cwd()): string {
    const possibleNames = ['Keelanfile', 'Keelanfile.yml', 'Keelanfile.yaml'];
    
    for (const name of possibleNames) {
      const fullPath = path.join(baseDir, name);
      if (fs_original.existsSync(fullPath)) {
        return fullPath;
      }
    }
    
    return path.join(baseDir, 'Keelanfile');
  }
}