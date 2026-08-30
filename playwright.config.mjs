import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30000,
  expect:{timeout:7000},
  fullyParallel:false,
  retries:process.env.CI?1:0,
  workers:process.env.CI?1:undefined,
  reporter:process.env.CI?'line':'list',
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',serviceWorkers:'allow'},
  webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1',url:'http://127.0.0.1:4173/index.html',reuseExistingServer:!process.env.CI,timeout:15000},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'mobile-chrome',use:{...devices['Pixel 7']}}
  ]
});
