// Apps targeting Android 16 (API 36) get predictive back by default, which skips
// React Native's onBackPressed, so the Back swipe closed the app instead of the
// keypad. Opt out until React Native handles predictive back itself.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withLegacyBack(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:enableOnBackInvokedCallback'] = 'false';
    return cfg;
  });
};
