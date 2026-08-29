import { notarize } from '@electron/notarize';

const TEAM_ID = 'BE2B2DH3YY';

// Two ways in, and the first one is better: `xcrun notarytool store-credentials
// <name>` puts the app-specific password in the keychain once, so it never has
// to live in an environment variable or a CI log. The env-var path stays for CI,
// where there is no keychain to ask.
const credentials = () => {
  if (process.env.NOTARY_PROFILE) {
    return { keychainProfile: process.env.NOTARY_PROFILE };
  }
  if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    return {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID ?? TEAM_ID,
    };
  }
  return null;
};

export default async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const found = credentials();
  if (found === null) {
    console.log(
      '[notarize] no credentials — skipping. Set NOTARY_PROFILE, or APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD.',
    );
    return;
  }

  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  console.log(`[notarize] submitting ${appPath}`);

  await notarize({ tool: 'notarytool', appPath, ...found });

  console.log('[notarize] accepted and stapled');
}
