#!/usr/bin/env node

import fetch from 'node-fetch';
import * as path from 'path';
import * as tar from 'tar';
import { mkdirp } from 'mkdirp';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Types and interfaces
export type Architecture = 'ia32' | 'x64' | 'arm' | 'arm64';
export type Platform = 'darwin' | 'linux' | 'win32' | 'freebsd';
export type GoArchitecture = '386' | 'amd64' | 'arm' | 'arm64';
export type GoPlatform = 'darwin' | 'linux' | 'windows' | 'freebsd';

export interface GoBinaryConfig {
  name: string;
  path: string;
  url: string;
}

export interface PackageConfig {
  version: string;
  goBinary: GoBinaryConfig;
}

export interface ParsedOptions {
  binName: string;
  binPath: string;
  url: string;
  version: string;
}

export type ErrorCallback = (error: string | null) => void;

// Mapping from Node's `process.arch` to Golang's `$GOARCH`
const ARCH_MAPPING: Record<Architecture, GoArchitecture> = {
  ia32: '386',
  x64: 'amd64',
  arm: 'arm',
  arm64: 'arm64',
};

// Mapping between Node's `process.platform` to Golang's
const PLATFORM_MAPPING: Record<Platform, GoPlatform> = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
  freebsd: 'freebsd',
};

// Get npm version for compatibility checking
export async function getNpmVersion(): Promise<number> {
  try {
    const { stdout } = await execAsync('npm --version');
    return parseInt(stdout.trim().split('.')[0]!, 10);
  } catch (error) {
    console.warn('Warning: Could not determine npm version, using fallback method');
    return 6; // Default to older npm behavior
  }
}

// Get npm global bin path with version compatibility
export async function getNpmBinPath(): Promise<string> {
  const npmVersion = await getNpmVersion();
  
  try {
    if (npmVersion >= 9) {
      const { stdout } = await execAsync('npm prefix -g');
      return path.join(stdout.trim(), 'bin');
    } else {
      const { stdout } = await execAsync('npm bin -g');
      return stdout.trim();
    }
  } catch (error) {
    throw new Error(`Failed to determine npm global bin path: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function verifyBinary(binName: string, binPath: string, callback: ErrorCallback): void {
  const binaryPath = path.join(binPath, binName);
  if (!fs.existsSync(binaryPath)) {
    return callback(
      `Downloaded binary does not contain the expected binary '${binName}' at path '${binaryPath}'. ` +
      `Please verify the package configuration and URL template.`
    );
  }

  callback(null);
}

export function validateConfiguration(packageJson: unknown): string | null {
  const config = packageJson as Partial<PackageConfig>;

  if (!config.version) {
    return 'Missing required \'version\' property in package.json';
  }

  if (!config.goBinary || typeof config.goBinary !== 'object') {
    return 'Missing or invalid \'goBinary\' property in package.json. It must be an object containing \'name\', \'path\', and \'url\' properties.';
  }

  const goBinary = config.goBinary as Partial<GoBinaryConfig>;

  if (!goBinary.name) {
    return 'Missing required \'goBinary.name\' property. This should be the name of the binary executable.';
  }

  if (!goBinary.path) {
    return 'Missing required \'goBinary.path\' property. This should be the local path where the binary will be extracted.';
  }

  if (!goBinary.url) {
    return 'Missing required \'goBinary.url\' property. This should be the URL template for downloading the binary archive.';
  }

  // Validate URL template has required placeholders
  const url = goBinary.url;
  if (!url.includes('{{platform}}') || !url.includes('{{arch}}')) {
    return 'The \'goBinary.url\' should contain {{platform}} and {{arch}} placeholders for cross-platform compatibility.';
  }

  return null; // No validation errors
}

export function parsePackageJson(): ParsedOptions | null {
  const currentArch = process.arch as Architecture;
  const currentPlatform = process.platform as Platform;

  if (!(currentArch in ARCH_MAPPING)) {
    console.error(
      `Installation is not supported for architecture: ${currentArch}. ` +
      `Supported architectures are: ${Object.keys(ARCH_MAPPING).join(', ')}`
    );
    return null;
  }

  if (!(currentPlatform in PLATFORM_MAPPING)) {
    console.error(
      `Installation is not supported for platform: ${currentPlatform}. ` +
      `Supported platforms are: ${Object.keys(PLATFORM_MAPPING).join(', ')}`
    );
    return null;
  }

  const packageJsonPath = path.join('.', 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.error(
      `Unable to find package.json at ${packageJsonPath}. ` +
      `Please run this script from the root directory of your package.`
    );
    return null;
  }

  let packageJson: unknown;
  try {
    const fileContent = fs.readFileSync(packageJsonPath, 'utf8');
    packageJson = JSON.parse(fileContent);
  } catch (error) {
    console.error(`Failed to parse package.json: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  const validationError = validateConfiguration(packageJson);
  if (validationError) {
    console.error(`Invalid package.json configuration: ${validationError}`);
    return null;
  }

  // Type assertion is safe here because we've validated the configuration
  const config = packageJson as PackageConfig;
  
  // We have validated the config. It exists in all its glory
  let binName = config.goBinary.name;
  const binPath = config.goBinary.path;
  let url = config.goBinary.url;
  let version = config.version;
  
  if (version[0] === 'v') {
    version = version.substring(1); // strip the 'v' if necessary v0.0.1 => 0.0.1
  }

  // Binary name on Windows has .exe suffix
  if (process.platform === 'win32') {
    binName += '.exe';
  }

  // Interpolate variables in URL, if necessary
  url = url.replace(/\{\{arch\}\}/g, ARCH_MAPPING[currentArch]);
  url = url.replace(/\{\{platform\}\}/g, PLATFORM_MAPPING[currentPlatform]);
  url = url.replace(/\{\{version\}\}/g, version);
  url = url.replace(/\{\{bin_name\}\}/g, binName);

  return {
    binName,
    binPath,
    url,
    version,
  };
}

/**
 * Reads the configuration from application's package.json,
 * validates properties, downloads the binary, untars, and stores at
 * goBinary.path in the package's root. NPM already has support to install binary files
 * specific locations when invoked with "npm install -g"
 *
 *  See: https://docs.npmjs.com/files/package.json#bin
 */
const INVALID_INPUT = 'Invalid inputs';

export async function install(callback: ErrorCallback): Promise<void> {
  try {
    const opts = parsePackageJson();
    if (!opts) {
      callback(INVALID_INPUT);
      return;
    }

    // Create directory structure
    await mkdirp(opts.binPath);
    
    const currentPlatform = process.platform as Platform;
    const currentArch = process.arch as Architecture;
    
    console.log(`Downloading binary for ${PLATFORM_MAPPING[currentPlatform]}/${ARCH_MAPPING[currentArch]} from: ${opts.url}`);
    
    // Download with node-fetch
    const response = await fetch(opts.url);
    
    if (!response.ok) {
      const errorMsg = `Failed to download binary from ${opts.url}. ` +
        `HTTP ${response.status}: ${response.statusText}. ` +
        `Please verify the URL is correct and the release exists.`;
      callback(errorMsg);
      return;
    }

    // Extract the archive
    const extractOptions: tar.ExtractOptions = { 
      cwd: opts.binPath,
      filter: (path: string) => path.endsWith(opts.binName) || path === opts.binName
    };
    
    const extractor = tar.extract(extractOptions);
    
    extractor.on('error', (error: Error) => {
      callback(`Failed to extract archive: ${error.message}`);
    });

    extractor.on('end', () => {
      verifyBinary(opts.binName, opts.binPath, callback);
    });

    // Pipe the response stream to the extractor
    if (response.body) {
      response.body.pipe(extractor);
    } else {
      callback('No response body received from download');
    }
    
  } catch (error) {
    callback(`Installation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Parse command line arguments and call the right method
const actions = {
  install: install,
};

type ActionName = keyof typeof actions;

function main(): void {
  const argv = process.argv;
  if (argv && argv.length > 2) {
    const cmd = process.argv[2] as ActionName;
    
    if (!actions[cmd]) {
      console.log(
        'Invalid command to go-npm. `install` is the only supported command'
      );
      process.exit(1);
    }

    // Handle async install function
    if (cmd === 'install') {
      install((err: string | null) => {
        if (err) {
          console.error(err);
          process.exit(1);
        } else {
          console.log('Binary installation completed successfully!');
          process.exit(0);
        }
      });
    }
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main();
}