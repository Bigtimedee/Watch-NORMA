const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Forces React-RCTAppDelegate to be built with modular headers.
 *
 * Without this, __has_include(<React_RCTAppDelegate/...>) returns false in
 * RCTAppDelegateUmbrella.h, the import is silently skipped, and Swift/ObjC
 * compilation fails with "cannot find type 'RCTAppDelegate' in scope".
 *
 * DEFINES_MODULE = YES in the podspec alone is insufficient — CocoaPods
 * requires an explicit :modular_headers => true directive in the Podfile to
 * generate the module map.
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

      // Inject a post_install hook that enables modular headers for the target
      const hook = `
${marker}
post_install do |installer|
  installer.pods_project.targets.each do |target|
    if target.name == 'React-RCTAppDelegate'
      target.build_configurations.each do |config|
        config.build_settings['DEFINES_MODULE'] = 'YES'
        config.build_settings['SWIFT_INSTALL_OBJC_HEADER'] = 'YES'
      end
    end
  end
end
`;

      // If there is already a post_install block, merge into it rather than
      // adding a second one (multiple post_install blocks are not allowed in
      // CocoaPods >= 1.x without use_frameworks! merge). Inject just before
      // the closing 'end' of the last post_install block if one exists,
      // otherwise append at end of file.
      const postInstallMatch = contents.match(/^post_install\s+do\s+\|installer\|([\s\S]*?)^end/m);

      if (postInstallMatch) {
        // Insert our target loop just before the closing `end` of the existing block
        const insertionPoint = postInstallMatch.index + postInstallMatch[0].lastIndexOf('end');
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
        contents =
          contents.slice(0, insertionPoint) +
          injection +
          contents.slice(insertionPoint);
      } else {
        contents += hook;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
}

module.exports = withRCTAppDelegateModularHeaders;
