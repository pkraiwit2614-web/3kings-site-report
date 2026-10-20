'use strict'
// Ignored Build Step: Vercel exit 0 = skip, exit 1 = build.
// Git-triggered Preview never spends Vercel build quota; Production is unchanged.
// A separate, privileged on-demand/prebuilt procedure owns exceptional hosted previews.
function allowBuild(env) {
  return env && env.VERCEL_ENV === 'production'
}
if (require.main === module) {
  const allow = allowBuild(process.env)
  console.log(allow ? 'ALLOW_PRODUCTION_BUILD' : 'SKIP_AUTOMATIC_VERCEL_PREVIEW')
  process.exitCode = allow ? 1 : 0
}
module.exports = { allowBuild }
