# five-bells-integration-test

> A module to help with testing Interledger.js components against each other

## Introduction

This module is used by the CI tests of the different Interledger.js components. This module is installed with each component as a dev dependency and run during continuous integration. When run, it installs the other components and then tests them against the local working tree of the current component.

## Installation

```sh
npm install --save-dev five-bells-integration-test
```

## Process

When run this test suite will instantiate instances of `ilp-connector` and configure it with instances of `ilp-plugin-mini-accounts` or `ilp-plugin-btp` (depending on whether the environment is configured as a server or client).

It will then create necessary senders and receivers using the `STREAM` protocol and send payments through the connector(s).

All services are loaded using the `five-bells-service-manager` which provides convenience APIs for interacting with the services.

The `five-bells-integration-test-loader` is used to install and setup the test directory with the appropriate versions of dependencies. If the tests are triggered as part of the test run for a specific component then the working copy of that componenet is used. Dependencies will be fetched from the latest `master` branch OR from a branch with the same name as the component under test (if available).

## Testing a component

To run the integration tests for the current version of a component ensure that the `package.json` contains the following:

```json
  "scripts": {
    "integration": "integration-loader && integration all"
  },
  "config": {
    "five-bells-integration-test-loader": {
      "module": "five-bells-integration-test",
      "repo": "interledgerjs/five-bells-integration-test"
    }
  },
```

Running `npm run integration` will install the necessary components and run the tests.

# TODO - Below is outdated

## Usage (with Docker)
Get the Docker image for the Five Bells integration tests,
and save yourself a lot of configuration and slow building steps on
your laptop:
```sh
docker pull michielbdejong/five-bells-integration-test
```

That pulls in a certified build from Docker's hub, but if you like to
build the Docker imager yourself then just do `docker build .` instead.

You are probably not so interested in seeing the integration tests run
on the master branches of the various repos as they were when this
Docker image was built, because you can already watch that on circleci,
but just so you know, the command for that would be:
```sh
docker run michielbdejong/five-bells-integration-test
```

So instead, go inside the container and run the tests interactively:
```sh
docker run -it --rm michielbdejong/five-bells-integration-test /bin/bash
$ cd integration-test/ilp-kit ; git status ; git fetch origin ; git checkout origin/my-awesome-improvement-that-I-want-to-test ; cd ../..
$ vim src/tests/index.js # add some debug statement to that failing `beforeEach` hook
$ vim integration-test/node_modules/ilp-connector/src/lib/route-builder.js +123 # add a console.log statement to see how that error is caused
$ ./src/bin/integration test advanced connector_first # run only the 'advanced' and 'connector_first' integration test
$ ./src/bin/integration test # run all the integration tests
```

Repositories tested by the integration tests:
* ilp-kit
* ilp-kit-cli
* ilp
* ilp-connector
* ilp-routing
* ilp-plugin-virtual
* ilp-plugin-settlement-adapter
* ilp-plugin-bells
* five-bells-ledger
* five-bells-shared
* five-bells-condition

The branch-matching done by `integration-loader` is quite nifty, although sometimes you will have to read the code to know exactly what is going on.
Roughly, what it does is:
* if the branch in the `/app` folder is `master`, then test all master branches against each other.
* if the branch is something else, try to check out that branch name on the different repositories as well. This allows you to refactor across repositories!
* when run as `npm run integration` in the ilp-kit repository (not using this Docker image), it will load appropriate the versions of components, as specified by ilp-kit's package.json file. This allows the master branches of different components to be ahead of the ilp-kit master branch, which can be useful when we are working on a big change that will break the Interledger network. Updating ilp-kit can be postponed until all the components have been tested thoroughly.

To check out a cross-repo branch, for instance `mj-currency_scale`, do the following inside the container:
```sh
$ cd /app
$ git branch mj-currency_scale
$ git checkout mj-currency_scale
$ ./node_modules/.bin/integration-loader
$ src/bin/integration setup
$ cd integration-test/ilp-kit
$ npm rebuild node-sass; npm run build # this is necessary because running npm install as root causes it to skip the postinstall hook
$ cd ../..
$ ps auxwww # kill any npm/node processes still running from previous runs
$ src/bin/integration test connector_first
$ src/bin/integration test
```
You will probably need to manually keep track of which version of which package is installed in `/app/node_modules`, `/app/integration-test/node_modules`, and `/app/integration-test/ilp-kit/node_modules`
to make sure you are testing the versions you want to. Of course, you can also still run the integration tests on circleci.com, or direcyly on your laptop, without Docker.

## Usage (without Docker)

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

```sh
npm install
npm test
```
