#!/usr/bin/env node

"use strict";

const fetch = require("node-fetch"),
  path = require("path"),
  tar = require("tar"),
  { mkdirp } = require("mkdirp"),
  fs = require("fs"),
  { exec } = require("child_process"),
  { promisify } = require("util");

const execAsync = promisify(exec);

// Get npm version for compatibility checking
async function getNpmVersion() {
  try {
    const { stdout } = await execAsync("npm --version");
    return parseInt(stdout.trim().split(".")[0], 10);
  } catch (error) {
    console.warn("Warning: Could not determine npm version, using fallback method");
    return 6; // Default to older npm behavior
  }
}

// Get npm global bin path with version compatibility
async function getNpmBinPath() {
  const npmVersion = await getNpmVersion();
  
  try {
    if (npmVersion >= 9) {
      const { stdout } = await execAsync("npm prefix -g");
      return path.join(stdout.trim(), "bin");
    } else {
      const { stdout } = await execAsync("npm bin -g");
      return stdout.trim();
    }
  } catch (error) {
    throw new Error(`Failed to determine npm global bin path: ${error.message}`);
  }
}

// Mapping from Node's `process.arch` to Golang's `$GOARCH`
const ARCH_MAPPING = {
  ia32: "386",
  x64: "amd64",
  arm: "arm",
  arm64: "arm64",
};

// Mapping between Node's `process.platform` to Golang's
const PLATFORM_MAPPING = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
  freebsd: "freebsd",
};

function verifyBinary(binName, binPath, callback) {
  const binaryPath = path.join(binPath, binName);
  if (!fs.existsSync(binaryPath)) {
    return callback(
      `Downloaded binary does not contain the expected binary '${binName}' at path '${binaryPath}'. ` +
      `Please verify the package configuration and URL template.`
    );
  }

  callback(null);
}

function validateConfiguration(packageJson) {
  if (!packageJson.version) {
    return "Missing required 'version' property in package.json";
  }

  if (!packageJson.goBinary || typeof packageJson.goBinary !== "object") {
    return "Missing or invalid 'goBinary' property in package.json. It must be an object containing 'name', 'path', and 'url' properties.";
  }

  if (!packageJson.goBinary.name) {
    return "Missing required 'goBinary.name' property. This should be the name of the binary executable.";
  }

  if (!packageJson.goBinary.path) {
    return "Missing required 'goBinary.path' property. This should be the local path where the binary will be extracted.";
  }

  if (!packageJson.goBinary.url) {
    return "Missing required 'goBinary.url' property. This should be the URL template for downloading the binary archive.";
  }

  // Validate URL template has required placeholders
  const url = packageJson.goBinary.url;
  if (!url.includes("{{platform}}") || !url.includes("{{arch}}")) {
    return "The 'goBinary.url' should contain {{platform}} and {{arch}} placeholders for cross-platform compatibility.";
  }

  return null; // No validation errors
}

function parsePackageJson() {
  if (!(process.arch in ARCH_MAPPING)) {
    console.error(
      `Installation is not supported for architecture: ${process.arch}. ` +
      `Supported architectures are: ${Object.keys(ARCH_MAPPING).join(", ")}`
    );
    return;
  }

  if (!(process.platform in PLATFORM_MAPPING)) {
    console.error(
      `Installation is not supported for platform: ${process.platform}. ` +
      `Supported platforms are: ${Object.keys(PLATFORM_MAPPING).join(", ")}`
    );
    return;
  }

  const packageJsonPath = path.join(".", "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.error(
      `Unable to find package.json at ${packageJsonPath}. ` +
      `Please run this script from the root directory of your package.`
    );
    return;
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
  } catch (error) {
    console.error(`Failed to parse package.json: ${error.message}`);
    return;
  }

  let error = validateConfiguration(packageJson);
  if (error) {
    console.error(`Invalid package.json configuration: ${error}`);
    return;
  }

  // We have validated the config. It exists in all its glory
  let binName = packageJson.goBinary.name;
  let binPath = packageJson.goBinary.path;
  let url = packageJson.goBinary.url;
  let version = packageJson.version;
  if (version[0] === "v") version = version.substr(1); // strip the 'v' if necessary v0.0.1 => 0.0.1

  // Binary name on Windows has .exe suffix
  if (process.platform === "win32") {
    binName += ".exe";
  }

  // Interpolate variables in URL, if necessary
  url = url.replace(/{{arch}}/g, ARCH_MAPPING[process.arch]);
  url = url.replace(/{{platform}}/g, PLATFORM_MAPPING[process.platform]);
  url = url.replace(/{{version}}/g, version);
  url = url.replace(/{{bin_name}}/g, binName);

  return {
    binName: binName,
    binPath: binPath,
    url: url,
    version: version,
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
const INVALID_INPUT = "Invalid inputs";
async function install(callback) {
  try {
    let opts = parsePackageJson();
    if (!opts) return callback(INVALID_INPUT);

    // Create directory structure
    await mkdirp(opts.binPath);
    
    console.log(`Downloading binary for ${PLATFORM_MAPPING[process.platform]}/${ARCH_MAPPING[process.arch]} from: ${opts.url}`);
    
    // Download with node-fetch
    const response = await fetch(opts.url);
    
    if (!response.ok) {
      const errorMsg = `Failed to download binary from ${opts.url}. ` +
        `HTTP ${response.status}: ${response.statusText}. ` +
        `Please verify the URL is correct and the release exists.`;
      return callback(errorMsg);
    }

    // Extract the archive
    const extractOptions = { 
      cwd: opts.binPath,
      filter: (path) => path.endsWith(opts.binName) || path === opts.binName
    };
    
    const extractor = tar.extract(extractOptions);
    
    extractor.on("error", (error) => {
      callback(`Failed to extract archive: ${error.message}`);
    });

    extractor.on("end", () => {
      verifyBinary(opts.binName, opts.binPath, callback);
    });

    // Pipe the response stream to the extractor
    response.body.pipe(extractor);
    
  } catch (error) {
    callback(`Installation failed: ${error.message}`);
  }
}

// Parse command line arguments and call the right method
let actions = {
  install: install,
};

let argv = process.argv;
if (argv && argv.length > 2) {
  let cmd = process.argv[2];
  if (!actions[cmd]) {
    console.log(
      "Invalid command to go-npm. `install` is the only supported command"
    );
    process.exit(1);
  }

  // Handle async install function
  if (cmd === "install") {
    install(function (err) {
      if (err) {
        console.error(err);
        process.exit(1);
      } else {
        console.log("Binary installation completed successfully!");
        process.exit(0);
      }
    });
  } else {
    actions[cmd](function (err) {
      if (err) {
        console.error(err);
        process.exit(1);
      } else {
        process.exit(0);
      }
    });
  }
}
