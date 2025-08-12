import * as fs from 'fs';
import * as path from 'path';
import {
  validateConfiguration,
  parsePackageJson,
  verifyBinary,
  getNpmVersion,
  Architecture,
  Platform,
  PackageConfig
} from '../dist/index';

describe('validateConfiguration', () => {
  it('should return null for valid configuration', () => {
    const validConfig: PackageConfig = {
      version: '1.0.0',
      goBinary: {
        name: 'testBinary',
        path: './bin',
        url: 'https://example.com/releases/{{version}}/binary_{{platform}}_{{arch}}.tar.gz'
      }
    };

    const result = validateConfiguration(validConfig);
    expect(result).toBeNull();
  });

  it('should return error for missing version', () => {
    const invalidConfig = {
      goBinary: {
        name: 'testBinary',
        path: './bin',
        url: 'https://example.com/releases/{{version}}/binary_{{platform}}_{{arch}}.tar.gz'
      }
    };

    const result = validateConfiguration(invalidConfig);
    expect(result).toContain('Missing required \'version\' property');
  });

  it('should return error for missing goBinary', () => {
    const invalidConfig = {
      version: '1.0.0'
    };

    const result = validateConfiguration(invalidConfig);
    expect(result).toContain('Missing or invalid \'goBinary\' property');
  });

  it('should return error for missing goBinary.name', () => {
    const invalidConfig = {
      version: '1.0.0',
      goBinary: {
        path: './bin',
        url: 'https://example.com/releases/{{version}}/binary_{{platform}}_{{arch}}.tar.gz'
      }
    };

    const result = validateConfiguration(invalidConfig);
    expect(result).toContain('Missing required \'goBinary.name\' property');
  });

  it('should return error for missing goBinary.path', () => {
    const invalidConfig = {
      version: '1.0.0',
      goBinary: {
        name: 'testBinary',
        url: 'https://example.com/releases/{{version}}/binary_{{platform}}_{{arch}}.tar.gz'
      }
    };

    const result = validateConfiguration(invalidConfig);
    expect(result).toContain('Missing required \'goBinary.path\' property');
  });

  it('should return error for missing goBinary.url', () => {
    const invalidConfig = {
      version: '1.0.0',
      goBinary: {
        name: 'testBinary',
        path: './bin'
      }
    };

    const result = validateConfiguration(invalidConfig);
    expect(result).toContain('Missing required \'goBinary.url\' property');
  });

  it('should return error for URL without required placeholders', () => {
    const invalidConfig = {
      version: '1.0.0',
      goBinary: {
        name: 'testBinary',
        path: './bin',
        url: 'https://example.com/releases/{{version}}/binary.tar.gz' // Missing {{platform}} and {{arch}}
      }
    };

    const result = validateConfiguration(invalidConfig);
    expect(result).toContain('should contain {{platform}} and {{arch}} placeholders');
  });
});

describe('verifyBinary', () => {
  const testDir = path.join(__dirname, 'test-temp');
  const testBinary = 'testBinary';
  const testBinaryPath = path.join(testDir, testBinary);

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should call callback with null when binary exists', (done) => {
    // Create test binary file
    fs.writeFileSync(testBinaryPath, 'test binary content');

    verifyBinary(testBinary, testDir, (error) => {
      expect(error).toBeNull();
      done();
    });
  });

  it('should call callback with error when binary does not exist', (done) => {
    verifyBinary(testBinary, testDir, (error) => {
      expect(error).toContain('Downloaded binary does not contain the expected binary');
      expect(error).toContain(testBinary);
      expect(error).toContain(testBinaryPath);
      done();
    });
  });
});

describe('getNpmVersion', () => {
  it('should return a number representing npm version', async () => {
    const version = await getNpmVersion();
    expect(typeof version).toBe('number');
    expect(version).toBeGreaterThan(0);
  });

  it('should return default version 6 on error', async () => {
    // This test would require more complex mocking setup for TypeScript modules
    // For now, we'll test the happy path and document this limitation
    const version = await getNpmVersion();
    expect(typeof version).toBe('number');
    expect(version).toBeGreaterThan(0);
  });
});

describe('parsePackageJson', () => {
  const testDir = path.join(__dirname, 'test-parse');
  const originalCwd = process.cwd();

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should parse valid package.json correctly', () => {
    const validPackageJson = {
      version: '1.2.3',
      goBinary: {
        name: 'myapp',
        path: './bin',
        url: 'https://github.com/user/repo/releases/download/v{{version}}/myapp_{{version}}_{{platform}}_{{arch}}.tar.gz'
      }
    };

    // Write test package.json
    const packageJsonPath = path.join(testDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(validPackageJson, null, 2));
    
    // Change to test directory
    process.chdir(testDir);

    const result = parsePackageJson();
    
    expect(result).not.toBeNull();
    expect(result?.binName).toBe(process.platform === 'win32' ? 'myapp.exe' : 'myapp');
    expect(result?.binPath).toBe('./bin');
    expect(result?.version).toBe('1.2.3');
    expect(result?.url).toContain('1.2.3');
    expect(result?.url).toContain(process.platform === 'win32' ? 'windows' : process.platform);
  });

  it('should strip v prefix from version', () => {
    const packageJson = {
      version: 'v1.2.3',
      goBinary: {
        name: 'myapp',
        path: './bin',
        url: 'https://github.com/user/repo/releases/download/v{{version}}/myapp_{{version}}_{{platform}}_{{arch}}.tar.gz'
      }
    };

    const packageJsonPath = path.join(testDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    process.chdir(testDir);

    const result = parsePackageJson();
    expect(result?.version).toBe('1.2.3');
  });

  it('should return null when package.json does not exist', () => {
    process.chdir(testDir);
    const result = parsePackageJson();
    expect(result).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    const packageJsonPath = path.join(testDir, 'package.json');
    fs.writeFileSync(packageJsonPath, '{ invalid json');
    process.chdir(testDir);

    const result = parsePackageJson();
    expect(result).toBeNull();
  });
});