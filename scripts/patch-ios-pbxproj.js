#!/usr/bin/env node
// Patches ios/ pbxproj files after `expo prebuild` or `pod install`.
// Fixes path-with-spaces issues that break xcodebuild on this machine.
// Idempotent — safe to run multiple times.
'use strict';

const fs = require('fs');
const path = require('path');

const IOS = path.join(__dirname, '..', 'ios');
const MAIN_PBX = path.join(IOS, 'intoyourstories.xcodeproj', 'project.pbxproj');
const PODS_PBX = path.join(IOS, 'Pods', 'Pods.xcodeproj', 'project.pbxproj');
const MIN_IOS = '16.4';

let applied = 0;
let skipped = 0;

function patch(file, label, from, to) {
  if (!fs.existsSync(file)) {
    console.log(`  [miss]  ${label}`);
    return;
  }
  const src = fs.readFileSync(file, 'utf8');
  const out = typeof from === 'string' ? src.split(from).join(to) : src.replace(from, to);
  if (out === src) {
    console.log(`  [skip]  ${label}`);
    skipped++;
  } else {
    fs.writeFileSync(file, out, 'utf8');
    console.log(`  [ok]    ${label}`);
    applied++;
  }
}

console.log('\npatching iOS pbxproj files...\n');

// ── intoyourstories.xcodeproj ──────────────────────────────────────────────

// A. expo-configure-project.sh: drop `-c` flag and unescape spaces in path
//    expo prebuild writes: bash -l -c "…Target\ Support\ Files/…"
//    which splits on spaces when the project path itself has spaces
patch(
  MAIN_PBX,
  'A: expo-configure-project  bash -l -c → bash -l',
  'bash -l -c \\"./Pods/Target\\\\ Support\\\\ Files/Pods-intoyourstories/expo-configure-project.sh\\"',
  'bash -l \\"./Pods/Target Support Files/Pods-intoyourstories/expo-configure-project.sh\\"',
);

// B. IPHONEOS_DEPLOYMENT_TARGET — expo-speech-recognition requires 16.4+
patch(
  MAIN_PBX,
  `B: IPHONEOS_DEPLOYMENT_TARGET → ${MIN_IOS}`,
  /IPHONEOS_DEPLOYMENT_TARGET = (?!16\.4)\d+\.\d+;/g,
  `IPHONEOS_DEPLOYMENT_TARGET = ${MIN_IOS};`,
);

// C. LIBRARY_SEARCH_PATHS — expo prebuild generates a single string value with
//    unbalanced quotes inside, which breaks the xcode npm PEG parser.
//    Replace with the equivalent list form.
//    broken: LIBRARY_SEARCH_PATHS = "$(SDKROOT)/usr/lib/swift\"$(inherited)\"";
//    fixed:  LIBRARY_SEARCH_PATHS = ("$(SDKROOT)/usr/lib/swift", "$(inherited)",);
patch(
  MAIN_PBX,
  'C: LIBRARY_SEARCH_PATHS single-string → list',
  'LIBRARY_SEARCH_PATHS = "$(SDKROOT)/usr/lib/swift\\"$(inherited)\\"";',
  'LIBRARY_SEARCH_PATHS = (\n\t\t\t\t\t"$(SDKROOT)/usr/lib/swift",\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t);',
);

// D. Bundler shellScript: wrap the final NODE_BINARY invocation in quotes so
//    the resolved path (which may contain spaces) is treated as one word.
//    expo prebuild writes one of two forms depending on version:
//    broken (backtick): `\"$NODE_BINARY\" --print \"...xcode.sh\"`\n\n
//    broken (dbl-quote): \"\"$NODE_BINARY\" --print \"...xcode.sh\"\"\n\n
//    fixed:  \"$(\"$NODE_BINARY\" --print \"...xcode.sh\")\"\n\n
const RN_SCRIPT = "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'";
// form 1 — backtick (expo prebuild SDK 54)
patch(
  MAIN_PBX,
  'D1: bundler shellScript backtick → quoted $()',
  '`\\"$NODE_BINARY\\" --print \\"' + RN_SCRIPT + '\\"`\\n\\n',
  '\\"$(\\"$NODE_BINARY\\" --print \\"' + RN_SCRIPT + '\\")\\"\\n\\n',
);
// form 2 — double-quote (older expo prebuild)
patch(
  MAIN_PBX,
  'D2: bundler shellScript dbl-quote → quoted $()',
  `\\"\\"\$NODE_BINARY\\" --print \\"${RN_SCRIPT}\\"\\"\n\n`,
  `\\"$(\\"$NODE_BINARY\\" --print \\"${RN_SCRIPT}\\")\\"\\n\\n`,
);

// ── Pods/Pods.xcodeproj ────────────────────────────────────────────────────

// E. EXConstants app.config script: same bash -l -c → bash -l fix
patch(
  PODS_PBX,
  'E: EXConstants app.config  bash -l -c → bash -l',
  'bash -l -c \\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"',
  'bash -l \\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"',
);

// ── summary ───────────────────────────────────────────────────────────────

console.log(`\n${applied} patch(es) applied, ${skipped} already up-to-date.\n`);
