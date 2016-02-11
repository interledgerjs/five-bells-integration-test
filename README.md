# five-bells-integration-test

> A module to help with testing Five Bells components against each other

## Introduction

This module is used by the CI tests of the different Five Bells components. This module is installed with each component as a dev dependency and run during continuous integration. When run, it installs the other components and then tests them against the local working tree of the current component.

## Installation

```sh
npm install --save-dev five-bells-integration-test
```

## Usage

In any five-bells module which has `five-bells-integration-test` installed, simply run:

``` sh
npm run integration
```

This is enabled by the following config in the `package.json`:

``` json
{
  "scripts": {
    "integration": "integration test"
  }
}
```

## Tests

The five-bells-integration-test module can be tested on its own:

**TODO: Implement this!**

```sh
npm install
npm test
```
