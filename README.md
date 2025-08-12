## Go NPM

Distribute cross-platform Go binaries via NPM.

**🚀 Modernized version with TypeScript, comprehensive testing, and enhanced reliability**

Applications written in Golang are portable - you can easily cross-compile binaries that work on Windows, Mac, and Linux. But how do you distribute the binaries to customers? When you publish new releases, how do they update the binary? 

**Use NPM to distribute cross-platform Go binaries**

> **Note:** This is `go-npm-next`, a modernized and enhanced version of the original `go-npm` package. See [Credits](#credits) for information about other versions.

## Kidding me! Why NPM?
* **Cross-platform**: NPM is the only popular package manager that works cross-platform. 
* **Lower barier to entry**: Most developers have NPM installed already. 
* **Pain free publishing**: It just takes one command to publish - `npm publish`
* **Dead simple install & update story**: `npm install/update -g your-awesome-app`
* **Adds $PATH**: NPM will automatically add your binary location to $PATH and generate .cmd file for Windows. Your app just works after installation! 

## Okay, tell me how?
### 1. Publish your binaries
Setup your Go application to compile and publish binaries to a file server. This could be Github Releases or Amazon S3 or even Dropbox. All you need is a link.

I like to use [GoReleaser](https://github.com/goreleaser/goreleaser) to setup by release process. You create a simple YAML configuration file like this and run `goreleaser` CLI to publish binaries for various platform/architecture combination to Github:

```
# .goreleaser.yml
# Build customization
builds:
  - binary: drum-roll
    goos:
      - windows
      - darwin
      - linux
    goarch:
      - amd64
```

`go-npm-next` will pull the appropriate binary for the platform & architecture where the package is being installed.

### 2. Create a package.json file for your NPM app
To publish to NPM, you need to create a `package.json` file. You give your application a name, link to Readme, Github repository etc, and more importantly add `go-npm-next` as a dependency. You can create this file in an empty directory in your project or in a separate Git repository altogether. It is your choice.

**Create package.json**

`$ npm init`

Answer the questions to create an initial package.json file

**Add go-npm-next dependency**

From the directory containing package.json file, do

`$ npm install go-npm-next --save`

This will install go-npm-next under to your package.json file. It will also create a `node_modules` directory where the `go-npm-next` package is downloaded. You don't need this directory since you are only going to publish the module and not consume it yourself. Let's go ahead and delete it.

`$ rm -r node_modules`

**Add postinstall script**
Here is the magic: You ask to run `go-npm install` after it completes installing your package. This will pull down binaries from Github or Amazon S3 and install in NPM's `bin` directory. Binaries under bin directory are immediately available for use in your Terminal.

Edit `package.json` file and add the following:
```
{
    "scripts": {
        "postinstall": "go-npm install"
    }
}
```

**Configure your binary path**

You need to tell `go-npm` where to download the binaries from, and where to install them. Edit `package.json` file and add the following configuration.

```
"goBinary": {
      "name": "command-name",
      "path": "./bin",
      "url": "https://github.com/user/my-go-package/releases/download/v{{version}}/myGoPackage_{{version}}_{{platform}}_{{arch}}.tar.gz"
}
```

* *name*: Name of the command users will use to run your binary. 
* *path*: Temporary path where binaries will be downloaded to
* *url*: HTTP Web server where binaries are hosted.

Following variables are available to customize the URL:
* `{{version}}`: Version number read from  `package.json` file. When you publish your package to NPM, it will use this version number. Ex: 0.0.1
* `{{platform}}`: `$GOOS` value for the platform
* `{{arch}}`: `$GOARCH` value for the architecture

If you use `goreleaser` to publish your modules, it will automatically set the right architecture & platform in your URL.

**Publish to NPM**

All that's left now is publish to NPM. As I promised before, just one command

`$ npm publish`

### 3. Distribute to users

To install:

`npm install -g your-app-name`

To Update:

`npm update -g your-app-name`

## Troubleshooting

### Common Issues and Solutions

**Installation fails with "HTTP 404" error:**
- Verify the URL template in your `goBinary.url` is correct
- Check that the release exists on your hosting platform (GitHub Releases, S3, etc.)
- Ensure platform/architecture placeholders match your binary naming convention

**"Architecture not supported" error:**
- Supported architectures: `ia32`, `x64`, `arm`, `arm64`
- Supported platforms: `darwin`, `linux`, `win32`, `freebsd`
- Make sure your Go build process creates binaries for the target platform/arch

**npm v9+ compatibility issues:**
- The package automatically detects your npm version and uses the appropriate method
- If you encounter issues, try updating to the latest npm version: `npm install -g npm@latest`

**Permission errors during installation:**
- On Unix systems, you may need to run with `sudo` for global installations
- Consider using a Node version manager like `nvm` to avoid permission issues

**Binary not found after installation:**
- Verify your `goBinary.url` template includes the correct binary name
- Check that the archive structure matches your extraction expectations
- Ensure the binary has executable permissions

### Getting Help

If you encounter issues not covered above:
1. Check that your `package.json` follows the configuration format shown in this README
2. Verify your binary archives are properly structured
3. Test your URL template manually by substituting the placeholders

## Development

### Building
```bash
npm run build        # Compile TypeScript to JavaScript
npm run dev          # Watch mode for development
```

### Testing
```bash
npm test            # Run all tests
npm test -- --watch # Run tests in watch mode
npm test -- --coverage # Generate coverage report
```

### TypeScript Support

This package is written in TypeScript and provides type definitions. You can import types for better development experience:

```typescript
import { PackageConfig, GoBinaryConfig, ParsedOptions } from 'go-npm-next';

const config: PackageConfig = {
  version: "1.0.0",
  goBinary: {
    name: "my-binary",
    path: "./bin",
    url: "https://github.com/user/repo/releases/download/v{{version}}/binary_{{platform}}_{{arch}}.tar.gz"
  }
};
```

## Changelog

### v1.2.0 (Latest)
- ✅ **TypeScript**: Full TypeScript rewrite with type safety and better developer experience
- ✅ **Comprehensive Testing**: Unit and integration tests with Jest for reliability
- ✅ **Modern dependencies**: Replaced deprecated `request` with `node-fetch`
- ✅ **npm v9+ compatibility**: Dynamic detection and fallback for binary path resolution
- ✅ **Enhanced error messages**: Detailed, actionable error reporting
- ✅ **Better validation**: Comprehensive package.json validation with helpful guidance
- ✅ **Security updates**: Latest dependency versions with security patches
- ✅ **Improved reliability**: Better cross-platform support and error handling

## Credits

This package builds upon the excellent work of previous versions:

- **Original `go-npm`** by [Sanath Kumar Ramesh](http://twitter.com/sanathkr_) - The foundational concept and implementation
- **Community contributions** - Various improvements and bug fixes over the years
- **`go-npm-next`** (this version) - Modernized by Hookdeck with TypeScript, comprehensive testing, and enhanced reliability

### Related Packages
- [`go-npm`](https://www.npmjs.com/package/go-npm) - Original implementation
- [`node-go-require`](https://www.npmjs.com/package/node-go-require) - Alternative approach for Go/Node.js integration
- [`pkg-fetch`](https://www.npmjs.com/package/pkg-fetch) - Similar concept for Node.js binaries

---

With ❤️ to the community by [Sanath Kumar Ramesh](http://twitter.com/sanathkr_) and the Hookdeck team