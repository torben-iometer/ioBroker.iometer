const path = require('path');
const { tests } = require('@iobroker/testing');

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
// controllerVersion is pinned to the latest stable js-controller release instead of the "dev" nightly build,
// which changes daily and can be unstable (e.g. missing iobroker-data/iobroker.json after setup).
tests.integration(path.join(__dirname, '..'), { controllerVersion: '7.2.2' });
