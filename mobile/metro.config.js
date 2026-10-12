// Metro bundles this app together with the web app's shared code in ../src (loan maths, formatting,
// Supabase queries). A few browser-only modules there are swapped for the native ones listed in SWAP.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const shared = path.resolve(__dirname, '../src')
const SWAP = {
  'lib/supabase': 'src/lib/supabase.ts',
  'lib/device': 'src/lib/device.ts',
  'ui/Toast': 'src/ui/Toast.tsx',
}

const config = getDefaultConfig(__dirname)
config.watchFolders = [shared]

config.resolver.resolveRequest = (ctx, name, platform) => {
  const fromShared = ctx.originModulePath.startsWith(shared + path.sep)
  // packages imported by shared files come from this app's node_modules, so there is one React
  const bare = !name.startsWith('.') && !name.startsWith('/') && !name.startsWith('@shared/')
  const res = fromShared && bare
    ? ctx.resolveRequest({ ...ctx, originModulePath: path.join(__dirname, 'package.json') }, name, platform)
    : ctx.resolveRequest(ctx, name, platform)
  if (res.type === 'sourceFile' && res.filePath.startsWith(shared + path.sep)) {
    const key = path.relative(shared, res.filePath).replace(/\.[jt]sx?$/, '').split(path.sep).join('/')
    if (SWAP[key]) return { type: 'sourceFile', filePath: path.join(__dirname, SWAP[key]) }
  }
  return res
}

module.exports = config
