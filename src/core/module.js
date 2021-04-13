import { resolve } from 'path'
import gracefulFs from 'graceful-fs'
// import { generatePosition, generateSlug, generateTo, isDraft, processDocumentInfo } from './lib/document'
import { useDefaults } from './lib/settings'
import { contentConfig } from './lib/utils'
import { generatePosition, generateSlug, generateTo, isDraft, processDocumentInfo } from './lib/document'

const fs = gracefulFs.promises
const r = (...args) => resolve(__dirname, ...args)

export default async function docusModule() {
  // wait for nuxt options to be normalized
  const { nuxt, requireModule, addPlugin } = this
  const { options, hook, callHook } = this.nuxt

  // Disable SSR in dev
  if (options.dev) {
    options.ssr = false
    options.build.ssr = false
    options.render.ssr = false
  }

  // Inject Docus theme as ~docus
  nuxt.options.alias['~docus'] = r('runtime')

  // Inject content dir in private runtime config
  const contentDir = options?.content?.dir || 'content'
  options.publicRuntimeConfig.contentDir = contentDir

  // read docus settings
  const settingsPath = resolve(options.srcDir, contentDir, 'settings.json')
  try {
    const userSettings = require(settingsPath)
    const settings = useDefaults(userSettings)

    hook('content:ready', $content => {
      callHook('docus:content:ready', { settings, $content })
    })

    // default title and description for pages
    options.meta.name = settings.title
    options.meta.description = settings.description
    if (settings.colors && settings.colors.primary) {
      options.meta.theme_color = settings.colors.primary
    }
  } catch (err) {
    /* settings not found */
  }

  // If pages/ does not exists, disable Nuxt pages parser (to avoid warning) and watch pages/ creation for full restart
  hook('build:before', async () => {
    // To support older version of Nuxt
    const pagesDirPath = resolve(options.srcDir, options.dir.pages)
    const pagesDirExists = await fs.stat(pagesDirPath).catch(() => false)
    if (!pagesDirExists) {
      this.nuxt.options.build.createRoutes = () => []
      nuxt.options.watch.push(pagesDirPath)
    }
  })
  // Configure content after each hook
  hook('content:file:beforeInsert', document => {
    if (document.extension !== '.md') {
      return
    }

    const locales = options.i18n?.locales.map(locale => locale.code).join('|') || 'en'
    const defaultLocale = options.i18n?.defaultLocale || 'en'

    const regexp = new RegExp(`^/(${locales})`, 'gi')
    const { dir, slug, category } = document
    const _dir = dir.replace(regexp, '')
    const _language = dir.replace(_dir, '').replace(/\//, '') || defaultLocale
    const _category = category && typeof category === 'string' ? category : ''
    const _to = `${_dir}/${slug}`.replace(/\/+/, '/')
    const position = generatePosition(_to, document)

    processDocumentInfo(document)

    document.slug = generateSlug(slug)
    document.position = position
    document.to = generateTo(_to)
    document.language = _language
    document.category = _category
    document.draft = document.draft || isDraft(slug)
  })

  addPlugin({
    src: r('./runtime/plugin.js'),
    filename: 'docus.js'
  })

  await requireModule(['@nuxt/content', contentConfig])
}