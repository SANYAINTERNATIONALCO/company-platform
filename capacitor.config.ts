import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sanya.platform',
  appName: 'Sanya International',
  webDir: 'public',
  server: {
    url: 'https://company-platform-theta.vercel.app',
    cleartext: true
  }
};

export default config;