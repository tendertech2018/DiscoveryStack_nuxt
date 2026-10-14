import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openSiteDatabase } from './lib/store.mjs'
import { createAuth } from './lib/auth.mjs'
import { parseConfig, changeVisualSettings } from './lib/config.mjs'
import { createCommerce } from './lib/commerce.mjs'
import { createStripePayments } from './lib/stripe.mjs'
import { createBooking } from './lib/booking.mjs'
import { createBlog } from './lib/blog.mjs'
import { createNotifications } from './lib/notifications.mjs'
import { renderPage } from './lib/render.mjs'
import { fail, text } from './lib/errors.mjs'
import { createDelivery, deliveryFingerprint } from './lib/delivery.mjs'
import { createTranslator, customerError } from './public/locale.mjs'
import { createMerchantSecrets } from './lib/merchant-secrets.mjs'
import { notificationCopy } from './lib/notification-copy.mjs'

const runtimeRoot = dirname(fileURLToPath(import.meta.url))
const cookieName = 'ds_customer_site_session'
const hash = value => createHash('sha256').update(value).digest('hex')
const readToken = request => /(?:^|;\s*)ds_customer_site_session=([a-f0-9]{64})(?:;|$)/u.exec(request.headers.cookie || '')?.[1]

async function boundedBody(request, max = 128 * 1024, json = true) {
  if (Number(request.headers['content-length']) > max) fail(413, '資料過大，請縮小後再試')
  let size = 0; const chunks = []
  for await (const chunk of request) { size += chunk.length; if (size > max) fail(413, '資料過大，請縮小後再試'); chunks.push(chunk) }
  const bytes = Buffer.concat(chunks)
  if (!json) return bytes
  if (!/^application\/json(?:;|$)/iu.test(request.headers['content-type'] || '')) fail(415, '請使用 JSON 格式送出資料')
  try { const value = JSON.parse(bytes.toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value } catch { fail(422, '資料格式不正確') }
}

export function createSiteRuntime(options) {
  let config = parseConfig(options.config)
  const origin = new URL(options.origin)
  if (origin.origin !== options.origin || config.mode === 'production' && origin.protocol !== 'https:' || !['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password) fail(503, '請設定網站的完整正式網址')
  const db = openSiteDatabase(options.databasePath || ':memory:', config.siteId, config.mode)
  db.exec('CREATE TABLE IF NOT EXISTS site_settings (id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL); CREATE TABLE IF NOT EXISTS contact_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS request_limits (key_hash TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);')
  const stored = db.prepare('SELECT config FROM site_settings WHERE id=1').get()
  if (stored) config = parseConfig({ ...config, ...JSON.parse(stored.config), mode: config.mode, siteId: config.siteId, siteType: config.siteType, commerce: config.commerce, booking: config.booking })
  const sessionSecret = options.sessionSecret || (config.mode === 'preview' ? randomBytes(32).toString('hex') : '')
  const auth = createAuth(db, { adminPassword: options.adminPassword, sessionSecret, mode: config.mode })
  const merchantSecrets = createMerchantSecrets(db, config, options.sessionSecret)
  const savedStripe = config.mode === 'preview' ? merchantSecrets.read() : null
  if (savedStripe) config.commerce.paymentMode = 'stripe_test'
  let commerce = createCommerce(db, config)
  let payments = createStripePayments(db, commerce, config, { ...options.stripe, ...savedStripe, origin: origin.origin })
  const assetVersion = hash(Buffer.concat(['site.css', 'site.js', 'locale.mjs', 'messages.mjs', 'customer-languages.mjs'].map(file => readFileSync(join(runtimeRoot, 'public', file))))).slice(0, 16)
  const booking = createBooking(db, config)
  const delivery = createDelivery(db, config, { initial: options.approvedDelivery, key: options.deploymentKey, origin: origin.origin, durable: options.durableStorage === true && Boolean(options.databasePath) && options.databasePath !== ':memory:', commerce, booking, payments: () => payments.status() })
  const t = createTranslator(config.locale)
  const mail = notificationCopy(config.locale)
  const blog = createBlog(db, config)
  const notifications = createNotifications(db, { ...options.notifications, encryptionKey: sessionSecret })
  function notifyBooking(result) {
    const configured = notifications.status().configured
    if (configured && result.contact?.email) {
      const status = t({ pending_hold: '等待商家確認', confirmed: '已確認', cancelled: '已取消', rejected: '未接受', expired: '已逾期' }[result.status] || result.status)
      const link = result.accessToken ? `${origin.origin}/booking#id=${encodeURIComponent(result.id)}&token=${result.accessToken}` : ''
      const time = new Intl.DateTimeFormat(config.locale, { timeZone: config.booking.timeZone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(result.startsAt))
      notifications.queue({ key: `booking:${result.id}:${result.version}`, to: result.contact.email, subject: `${config.brandName} | ${mail.booking}: ${status}`, body: `${result.serviceName}\n${time} (${config.booking.timeZone})\n${mail.status}: ${status}\n${mail.notPayment}\n${link ? `${mail.privateLink}\n${link}` : mail.originalLink}` })
    }
    return { ...result, notification: { configured, queued: configured && Boolean(result.contact?.email) } }
  }
  const uploadsPath = resolve(options.uploadsPath || join(runtimeRoot, 'uploads', config.siteId))
  const secure = origin.protocol === 'https:'
  const setSession = (response, token) => response.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure ? '; Secure' : ''}`)
  const json = (response, data, status = 200) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(data)) }
  function rateLimit(address, path) {
    db.prepare('DELETE FROM request_limits WHERE expires_at<=?').run(Date.now())
    const key = hash(`${address}:${path}`)
    if ((db.prepare('SELECT count FROM request_limits WHERE key_hash=?').get(key)?.count || 0) >= 60) fail(429, '操作較頻繁，請稍後再試')
    db.prepare('INSERT INTO request_limits VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET count=count+1').run(key, Date.now() + 10 * 60 * 1000)
  }
  async function handle(request, response) {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
    response.setHeader('Cache-Control', 'private, no-store')
    if (config.mode === 'preview' || request.url?.startsWith('/api/') || request.url?.startsWith('/admin') || request.url?.startsWith('/account')) response.setHeader('X-Robots-Tag', 'noindex, nofollow')
    try {
      if (request.headers.host !== origin.host) fail(421, '網站網址不符合設定')
      const url = new URL(request.url, origin)
      const path = url.pathname.replace(/\/$/u, '') || '/'
      const method = request.method || 'GET'
      if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(method)) fail(405, '此操作不支援')
      // This sole non-browser route requires a short-lived signature bound to exact bytes/origin/site.
      if (path === '/api/deployment' && method === 'POST') return json(response, delivery.publish(await boundedBody(request, 2_000_000, false), request.headers['x-site-deploy-time'], request.headers['x-site-deploy-signature']))
      // Stripe cannot supply a browser CSRF token. Only this signed, raw-body endpoint bypasses CSRF.
      if (path === '/api/payments/stripe/webhook' && method === 'POST') return json(response, payments.webhook(await boundedBody(request, 256_000, false), request.headers['stripe-signature']))
      const token = readToken(request)
      const session = auth.session(token)
      const actor = session?.actor
      if (config.mode === 'production' && options.approvedDelivery && !delivery.current() && actor?.role !== 'admin' && !path.startsWith('/admin') && !path.startsWith('/api/admin/') && !path.startsWith('/assets/') && !['/health', '/api/session', '/api/auth/logout'].includes(path)) fail(503, 'Website publication is awaiting verification', 'PUBLICATION_REQUIRED')
      const address = request.socket?.remoteAddress || 'unknown'
      const mutation = !['GET', 'HEAD'].includes(method)
      if (mutation) {
        if (request.headers.origin !== origin.origin || request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin') fail(403, '請從本網站送出操作', 'ORIGIN_REJECTED')
        rateLimit(address, path)
        auth.verifyCsrf(token, request.headers['x-csrf-token'])
      }
      const admin = () => { if (actor?.role !== 'admin') fail(401, '請先登入管理後台') }
      const member = () => { if (actor?.role !== 'member' || !actor.id) fail(401, '請先登入會員'); return actor.id }
      if (path === '/health' && method === 'GET') return json(response, { status: 'ok', siteId: config.siteId, mode: config.mode, version: 'customer-site-runtime-v1', deliveryHash: delivery.current()?.contentHash || null })
      if (path === '/api/session' && method === 'GET') {
        if (!session) rateLimit(address, 'anonymous-session')
        const current = session || auth.issue()
        if (current.token) setSession(response, current.token)
        return json(response, { actor: current.actor, csrfToken: current.csrfToken })
      }
      if (['GET', 'HEAD'].includes(method) && ['/assets/site.css', '/assets/site.js', '/assets/locale.mjs', '/assets/messages.mjs', '/assets/customer-languages.mjs'].includes(path)) { response.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); response.setHeader('Cache-Control', 'public,max-age=300'); return response.end(method === 'HEAD' ? undefined : readFileSync(join(runtimeRoot, 'public', path.split('/').at(-1)))) }
      if (['GET', 'HEAD'].includes(method) && /^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/u.test(path)) { const filename = join(uploadsPath, path.split('/').at(-1)); if (!existsSync(filename)) fail(404, '找不到圖片'); response.setHeader('Content-Type', `image/${path.endsWith('.jpg') ? 'jpeg' : path.split('.').at(-1)}`); response.setHeader('Cache-Control', 'public,max-age=31536000,immutable'); return response.end(method === 'HEAD' ? undefined : readFileSync(filename)) }
      if (path === '/api/auth/register' && method === 'POST') { const result = auth.register(await boundedBody(request), address); if (token) auth.logout(token); setSession(response, result.token); return json(response, { actor: result.actor, csrfToken: result.csrfToken }, 201) }
      if (['/api/auth/login', '/api/admin/login'].includes(path) && method === 'POST') { const result = auth.login(await boundedBody(request), address, path.includes('/admin/')); if (token) auth.logout(token); setSession(response, result.token); return json(response, { actor: result.actor, csrfToken: result.csrfToken }) }
      if (path === '/api/auth/logout' && method === 'POST') { auth.logout(token); response.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`); return json(response, { ok: true }) }
      if (['/api/auth/email/request', '/api/auth/password-reset/request'].includes(path) && method === 'POST') {
        if (!notifications.status().configured) fail(503, '寄信服務尚未設定，請聯絡商家協助處理帳號')
        const result = path === '/api/auth/email/request' ? auth.requestVerification(member()) : auth.requestPasswordReset(await boundedBody(request))
        if (result.delivery) {
          const { to, token: actionToken, kind } = result.delivery
          const link = `${origin.origin}/${kind === 'password_reset' ? 'reset-password' : 'verify-email'}#token=${actionToken}`
          notifications.queue({ key: `account:${kind}:${hash(actionToken)}`, to, subject: `${config.brandName} | ${kind === 'password_reset' ? mail.reset : mail.verify}`, body: `${mail.expires}\n${link}\n${mail.ignore}` })
        }
        void notifications.flush()
        return json(response, result.receipt)
      }
      if (path === '/api/auth/email/confirm' && method === 'POST') return json(response, auth.confirmVerification(await boundedBody(request)))
      if (path === '/api/auth/password-reset/confirm' && method === 'POST') { const result = auth.resetPassword(await boundedBody(request)); response.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`); return json(response, result) }
      if (path === '/api/products' && method === 'GET') return json(response, { products: commerce.listProducts({ query: url.searchParams.get('q') || undefined, category: url.searchParams.get('category') || undefined }) })
      if (path === '/api/orders' && method === 'POST') {
        if (config.siteType !== 'commerce') fail(404, '此網站未提供購物服務')
        if (config.commerce.paymentMode.startsWith('stripe_')) payments.assertReady()
        const result = commerce.createOrder(await boundedBody(request))
        const order = result.order || result
        if (order.customer?.email) notifications.queue({ key: `order:${order.id}`, to: order.customer.email, subject: `${config.brandName} | ${mail.order}`, body: `${t('訂單')}: ${order.number}\n${mail.notPayment}\n${config.commerce.paymentMode.startsWith('stripe_') ? mail.payment : config.commerce.manualPaymentInstructions || mail.manual}` })
        return json(response, result, 201)
      }
      if (path === '/api/orders/lookup' && method === 'POST') return json(response, commerce.lookupOrder(await boundedBody(request)))
      if (/^\/api\/orders\/[^/]+$/u.test(path) && method === 'GET') return json(response, commerce.getOrder(path.split('/').at(-1), request.headers['x-order-token']))
      if (/^\/api\/orders\/[^/]+\/checkout$/u.test(path) && method === 'POST') { await boundedBody(request); return json(response, await payments.checkout(path.split('/')[3], request.headers['x-order-token'])) }
      if (path === '/api/services' && method === 'GET') return json(response, { services: booking.listServices() })
      if (path === '/api/slots' && method === 'GET') return json(response, { slots: booking.listSlots({ serviceId: url.searchParams.get('serviceId') || undefined }) })
      if (path === '/api/account' && method === 'GET') { const memberId = member(); return json(response, config.siteType === 'commerce' ? { siteType: config.siteType, member: actor, orders: actor.emailVerified === true ? commerce.listMemberOrders(actor.email) : [], emailVerificationRequired: actor.emailVerified !== true } : { siteType: config.siteType, member: actor, balance: booking.balance(memberId), bookings: booking.listBookings(memberId) }) }
      if (path === '/api/bookings' && method === 'POST') { if (config.siteType !== 'booking_blog') fail(404, '此網站未提供預約服務'); return json(response, booking.reserve(member(), await boundedBody(request)), 201) }
      if (/^\/api\/bookings\/[^/]+$/u.test(path) && method === 'PATCH') return json(response, booking.change(member(), path.split('/').at(-1), await boundedBody(request)))
      if (path === '/api/booking-requests' && method === 'POST') { if (config.siteType !== 'booking_blog') fail(404, '此網站未提供預約服務'); const body = await boundedBody(request); if (body.consent !== true) fail(422, '請先同意預約聯絡資料使用說明'); return json(response, notifyBooking(booking.requestGuest(body)), 201) }
      if (/^\/api\/booking-requests\/[^/]+$/u.test(path) && method === 'GET') return json(response, booking.getGuest(path.split('/').at(-1), request.headers['x-booking-token']))
      if (/^\/api\/booking-requests\/[^/]+$/u.test(path) && method === 'PATCH') return json(response, notifyBooking(booking.changeGuest(path.split('/').at(-1), request.headers['x-booking-token'], await boundedBody(request))))
      if (path === '/api/journal' && method === 'GET') return json(response, { posts: blog.list() })
      if (path === '/api/contact' && method === 'POST') {
        const body = await boundedBody(request)
        if (body.consent !== true) fail(422, '請先同意聯絡資料使用說明')
        const email = text(body.email, 'Email', 320)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) fail(422, 'Email 格式不正確')
        db.prepare('INSERT INTO contact_messages(name,email,message,created_at) VALUES(?,?,?,?)').run(text(body.name, '姓名', 120), email, text(body.message, '訊息', 4000), new Date().toISOString())
        return json(response, { received: true, message: '訊息已送達網站後台，商家將再與你聯絡。' }, 201)
      }
      if (path.startsWith('/api/admin/')) {
        admin()
        if (path === '/api/admin/stripe-test' && method === 'POST') {
          const receipt = merchantSecrets.save(await boundedBody(request, 2048))
          config.commerce.paymentMode = 'stripe_test'
          commerce = createCommerce(db, config)
          payments = createStripePayments(db, commerce, config, { ...options.stripe, ...merchantSecrets.read(), origin: origin.origin })
          return json(response, receipt)
        }
        if (path === '/api/admin/products' && ['GET', 'POST', 'PATCH'].includes(method)) return json(response, method === 'GET' ? { products: commerce.listProducts({ admin: true }) } : commerce.saveProduct(await boundedBody(request)))
        if (path === '/api/admin/orders' && method === 'GET') return json(response, { orders: commerce.listOrders() })
        if (/^\/api\/admin\/orders\/[^/]+$/u.test(path) && method === 'PATCH') return json(response, commerce.transitionOrder(path.split('/').at(-1), await boundedBody(request)))
        if (path === '/api/admin/services' && ['GET', 'POST', 'PATCH'].includes(method)) return json(response, method === 'GET' ? { services: booking.listServices({ admin: true }) } : booking.saveService(await boundedBody(request)))
        if (path === '/api/admin/slots' && ['GET', 'POST', 'PATCH'].includes(method)) return json(response, method === 'GET' ? { slots: booking.listSlots({ admin: true }) } : booking.saveSlot(await boundedBody(request)))
        if (path === '/api/admin/bookings' && method === 'GET') return json(response, { bookings: booking.listBookings() })
        if (/^\/api\/admin\/bookings\/[^/]+$/u.test(path) && method === 'PATCH') return json(response, notifyBooking(booking.confirmGuest(path.split('/').at(-1), await boundedBody(request))))
        if (path === '/api/admin/members' && method === 'GET') return json(response, { members: auth.listMembers().map(row => ({ ...row, balance: booking.balance(row.id) })) })
        if (path === '/api/admin/credits' && method === 'POST') { const body = await boundedBody(request); if (!auth.member(body.memberId)) fail(404, '找不到會員'); return json(response, booking.adjustCredits(body.memberId, body)) }
        if (path === '/api/admin/blog' && ['GET', 'POST', 'PATCH'].includes(method)) return json(response, method === 'GET' ? { posts: blog.list({ admin: true }) } : blog.save(await boundedBody(request)))
        const postAction = /^\/api\/admin\/blog\/([^/]+)\/(publish|unpublish|restore|revisions)$/u.exec(path)
        if (postAction) { const [, postId, action] = postAction; if (action === 'revisions' && method === 'GET') return json(response, { revisions: blog.revisions(postId) }); if (method === 'POST') { const body = await boundedBody(request); return json(response, action === 'restore' ? blog.restore(postId, body.revisionId, body.version) : blog[action](postId, body.version)) } }
        if (path === '/api/admin/settings' && method === 'GET') return json(response, { config, notifications: notifications.status(), payments: payments.status() })
        if (path === '/api/admin/settings' && method === 'PATCH') {
          const next = changeVisualSettings(config, await boundedBody(request))
          if (delivery.current() && ['preset', 'tagline', 'description', 'hero', 'about'].some(key => deliveryFingerprint(config[key]) !== deliveryFingerprint(next[key]))) fail(409, 'Review a new design before replacing the approved website', 'APPROVED_DESIGN_LOCKED')
          Object.assign(config, next)
          db.prepare('INSERT INTO site_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config').run(JSON.stringify(config))
          return json(response, { config })
        }
        if (path === '/api/admin/contact-messages' && method === 'GET') return json(response, { messages: db.prepare('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 200').all() })
        if (path === '/api/admin/media' && method === 'POST') {
          const bytes = await boundedBody(request, 2 * 1024 * 1024, false)
          const isPng = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          const isJpeg = bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          const isWebp = bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
          const extension = isPng ? 'png' : isJpeg ? 'jpg' : isWebp ? 'webp' : ''
          if (!extension) fail(415, '只接受 PNG、JPEG 或 WebP 圖片，不接受 SVG 或可執行檔案')
          mkdirSync(uploadsPath, { recursive: true, mode: 0o700 })
          const filename = `${hash(bytes)}.${extension}`
          if (!existsSync(join(uploadsPath, filename))) writeFileSync(join(uploadsPath, filename), bytes, { flag: 'wx', mode: 0o600 })
          return json(response, { url: `/media/${filename}` }, 201)
        }
        fail(404, '找不到管理操作')
      }
      if (path.startsWith('/api/')) fail(404, '找不到這個操作')
      if (method !== 'GET' && method !== 'HEAD') fail(405, '此頁面不接受資料送出')
      if (path === '/robots.txt') { response.setHeader('Content-Type', 'text/plain'); return response.end(config.mode === 'preview' ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nDisallow: /admin\nDisallow: /account\nDisallow: /api\nSitemap: ${origin.origin}/sitemap.xml\n`) }
      if (path === '/sitemap.xml') {
        const routes = ['/', '/about', '/contact', '/journal', ...(config.siteType === 'commerce' ? ['/shop', ...commerce.listProducts().map(item => `/products/${item.slug}`)] : ['/services', '/book']), ...blog.list().map(post => `/journal/${post.slug}`)]
        response.setHeader('Content-Type', 'application/xml'); return response.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${config.mode === 'preview' ? '' : routes.map(route => `<url><loc>${origin.origin}${route}</loc></url>`).join('')}</urlset>`)
      }
      if (path === '/admin' && actor?.role !== 'admin') { response.statusCode = 302; response.setHeader('Location', '/admin/login'); return response.end() }
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      const html = delivery.page(path) || renderPage({ config, path: path === '/store' ? '/shop' : path === '/inquiry' ? '/contact' : path, commerce, booking, blog, actor, assetVersion, payments: payments.status(), query: Object.fromEntries(url.searchParams), members: actor?.role === 'admin' ? auth.listMembers().map(row => ({ ...row, balance: booking.balance(row.id) })) : [], origin: origin.origin })
      if (!html) fail(404, '找不到頁面')
      response.end(method === 'HEAD' ? undefined : html)
    } catch (error) {
      const source = error.status && error.status < 500 ? error.message : error.status === 503 ? error.message : '操作沒有完成，請稍後重試；既有資料不受影響。'
      const translated = t(source)
      const publicMessage = !config.locale.startsWith('zh') && /[\u3400-\u9fff]/u.test(translated) ? customerError(error.status || 500, config.locale) : translated
      json(response, { error: publicMessage, code: error.code || 'REQUEST_FAILED' }, error.status || 500)
    }
  }
  return { handle, db, auth, get commerce() { return commerce }, get payments() { return payments }, booking, blog, delivery, notifications, get config() { return config }, close: () => db.close() }
}

export async function startSiteRuntime(options) {
  if (options.config?.mode === 'production' && (!options.databasePath || options.databasePath === ':memory:' || !options.uploadsPath)) fail(503, '正式網站必須設定獨立持久資料庫與媒體儲存空間')
  const runtime = createSiteRuntime(options)
  const server = createServer(runtime.handle)
  server.requestTimeout = 15000; server.headersTimeout = 10000
  try { await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(options.port ?? 3002, options.host || '127.0.0.1', resolveReady) }) } catch (error) { runtime.close(); throw error }
  const timer = setInterval(() => { runtime.commerce.expireOrders(); void runtime.notifications.flush() }, 60000)
  timer.unref()
  let stopping
  return { ...runtime, server, stop: () => stopping ||= new Promise(resolveStopped => { clearInterval(timer); server.close(async () => { await runtime.notifications.whenIdle(); runtime.close(); resolveStopped() }) }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const configPath = process.env.SITE_CONFIG_PATH
  if (!configPath) throw new Error('SITE_CONFIG_PATH_REQUIRED')
  const sourceConfig = JSON.parse(readFileSync(resolve(configPath), 'utf8'))
  const siteConfig = parseConfig({ ...sourceConfig, ...(process.env.SITE_RUNTIME_MODE ? { mode: process.env.SITE_RUNTIME_MODE } : {}), commerce: { ...sourceConfig.commerce, ...(process.env.SITE_PAYMENT_MODE ? { paymentMode: process.env.SITE_PAYMENT_MODE } : {}) } })
  const instance = await startSiteRuntime({ config: siteConfig, approvedDelivery: process.env.SITE_APPROVED_DELIVERY_PATH ? JSON.parse(readFileSync(resolve(process.env.SITE_APPROVED_DELIVERY_PATH), 'utf8')) : null, deploymentKey: process.env.SITE_DEPLOYMENT_KEY, durableStorage: process.env.SITE_STORAGE_DURABLE_CONFIRMED === 'true', origin: process.env.SITE_ORIGIN, port: Number(process.env.PORT || 3002), host: process.env.HOST || '127.0.0.1', databasePath: process.env.SITE_DATABASE_PATH || resolve('data', siteConfig.siteId, 'site.sqlite'), uploadsPath: process.env.SITE_UPLOADS_PATH || resolve('data', siteConfig.siteId, 'uploads'), adminPassword: process.env.SITE_ADMIN_PASSWORD, sessionSecret: process.env.SITE_SESSION_SECRET, stripe: { secretKey: process.env.SITE_STRIPE_SECRET_KEY, webhookSecret: process.env.SITE_STRIPE_WEBHOOK_SECRET }, notifications: { enabled: process.env.SITE_NOTIFICATIONS_ENABLED === 'true', apiKey: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM } })
  console.log(`Customer site ready (${siteConfig.mode}); database and administrator credentials are isolated.`)
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void instance.stop() })
}
