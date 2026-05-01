const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Forces React-RCTAppDelegate to be built with modular headers.
 *
 * Without this, __has_include(<React_RCTAppDelegate/...>) returns false in
 * RCTAppDelegateUmbrella.h, the import is silently skipped, and compilation
 * fails with "cannot find type 'RCTAppDelegate' in scope".
 *
 * IMPORTANT: CocoaPods forbids multiple post_install blocks.
 * This plugin inserts code INTO the existing post_install block that Expo
 * generates, rather than adding a second one.
 */
function withRCTAppDelegateModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );
      let contents = fs.readFileSync(podfilePath, 'utf8');

      const marker = '# withRCTAppDelegateModularHeaders';

      // Idempotent: skip if already patched
      if (contents.includes(marker)) {
        return config;
      }

      const injection = `  ${marker}
  installer.pods_project.targets.each do |target|
    if target.name == 'React-RCTAppDelegate'
      target.build_configurations.each do |cfg|
        cfg.build_settings['DEFINES_MODULE'] = 'YES'
        cfg.build_settings['SWIFT_INSTALL_OBJC_HEADER'] = 'YES'
      end
    end
  end
`;

      // Expo always generates: post_install do |installer|
      // Insert our code right after that opening line.
      const openingLine = 'post_install do |installer|';

      if (contents.includes(openingLine)) {
        contents = contents.replace(
          openingLine,
          openingLine + '\n' + injection
        );
      } else {
        // No existing post_install block — add one at the end
        contents += `\npost_install do |installer|\n${injection}end\n`;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
}

module.exports = withRCTAppDelegateModularHeaders;
