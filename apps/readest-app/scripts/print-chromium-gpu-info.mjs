import os from 'node:os';
import { chromium } from 'playwright';

const cpus = os.cpus().length;
console.log(`os.cpus().length: ${cpus}`);
console.log(`os.availableParallelism(): ${os.availableParallelism()}`);
console.log(
  `expected renderer raster threads (Chromium default: cores / 2, clamped to 1..4): ${Math.min(4, Math.max(1, Math.floor(cpus / 2)))}`,
);

const browser = await chromium.launch({ headless: true });
try {
  console.log(`chromium version: ${browser.version()}`);
  const session = await browser.newBrowserCDPSession();
  const { gpu, modelName, commandLine } = await session.send('SystemInfo.getInfo');
  console.log(`model: ${modelName || '(none)'}`);
  console.log(`command line: ${commandLine}`);
  console.log('gpu feature status:');
  for (const [feature, status] of Object.entries(gpu.featureStatus)) {
    console.log(`  ${feature}: ${status}`);
  }
  for (const device of gpu.devices) {
    console.log(
      `gpu device: vendor=${device.vendorString || device.vendorId} device=${device.deviceString || device.deviceId} driver=${device.driverVendor} ${device.driverVersion}`,
    );
  }
  const rasterFlag = commandLine.match(/--num-raster-threads=(\d+)/);
  console.log(`--num-raster-threads on command line: ${rasterFlag ? rasterFlag[1] : 'not set'}`);
  console.log('renderer raster thread count is not exposed by SystemInfo.getInfo');
} finally {
  await browser.close();
}
