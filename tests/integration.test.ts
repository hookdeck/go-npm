import * as fs from 'fs';
import * as path from 'path';
import { install } from '../dist/index';

describe('install integration tests', () => {
  const testDir = path.join(__dirname, 'test-integration');
  const originalCwd = process.cwd();

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    process.chdir(originalCwd);
  });

  it('should fail gracefully with invalid package.json', (done) => {
    const invalidPackageJson = {
      version: '1.0.0'
      // Missing goBinary
    };

    const packageJsonPath = path.join(testDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(invalidPackageJson, null, 2));
    process.chdir(testDir);

    install((error) => {
      expect(error).toBe('Invalid inputs');
      done();
    });
  });

  it('should fail gracefully with 404 URL', (done) => {
    const packageJson = {
      version: '1.0.0',
      goBinary: {
        name: 'nonexistent',
        path: './bin',
        url: 'https://httpbin.org/status/404?platform={{platform}}&arch={{arch}}'
      }
    };

    const packageJsonPath = path.join(testDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    process.chdir(testDir);

    install((error) => {
      expect(error).toContain('Failed to download binary');
      expect(error).toContain('404');
      done();
    });
  }, 10000); // Longer timeout for network request

  it('should fail gracefully with invalid URL', (done) => {
    const packageJson = {
      version: '1.0.0',
      goBinary: {
        name: 'test',
        path: './bin',
        url: 'not-a-valid-url-{{platform}}-{{arch}}'
      }
    };

    const packageJsonPath = path.join(testDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    process.chdir(testDir);

    install((error) => {
      expect(error).toContain('Installation failed');
      done();
    });
  });

  it('should create bin directory when it does not exist', (done) => {
    const packageJson = {
      version: '1.0.0',
      goBinary: {
        name: 'test',
        path: './test-bin',
        url: 'https://httpbin.org/status/404?platform={{platform}}&arch={{arch}}' // Will fail, but directory should be created
      }
    };

    const packageJsonPath = path.join(testDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    process.chdir(testDir);

    const binPath = path.join(testDir, 'test-bin');
    expect(fs.existsSync(binPath)).toBe(false);

    install((error) => {
      // Should fail due to 404, but directory should exist
      expect(error).toBeTruthy();
      expect(fs.existsSync(binPath)).toBe(true);
      done();
    });
  }, 10000);
});