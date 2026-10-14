import { createTranslator, formatMoney, normalizeLocale, direction, legibleInk } from '../public/locale.mjs'
const e = (value = "") =>
  String(value ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]
  );
const base_paymentLabel = status => ({ pending: "待確認付款", paid: "已付款", refunded: "已退款", review_required: "待商家對帳（暫停出貨）" })[status] || status || "未提供付款狀態";
const base_fulfillmentLabel = status => ({ unfulfilled: "待處理", processing: "處理中", shipped: "已出貨", delivered: "已送達", cancelled: "已取消" })[status] || status || "未提供出貨狀態";
const base_bookingLabel = status => ({ confirmed: "已確認", cancelled: "已取消", pending_hold: "等待商家確認", rejected: "未接受", expired: "已逾期" })[status] || status || "未提供狀態";
const base_postLabel = status => ({ draft: "草稿", published: "已發布" })[status] || status || "草稿";
const dateLabel = (value, timeZone = "Asia/Taipei", locale = 'zh-Hant') => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value || "");
  const options = { timeZone, month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  try { return new Intl.DateTimeFormat(locale, options).format(date); }
  catch { return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date); }
};
const list = (service, method, ...args) => {
  try {
    const value = service?.[method]?.(...args);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const image = (url, alt = "") => {
  const src = String(url || "");
  if (
    !(
      /^https:\/\//i.test(src) ||
      /^\/media\/[a-f0-9]{64}\.(?:png|jpg|webp)$/i.test(src)
    )
  )
    return "";
  return `<img src="${e(src)}" alt="${e(alt)}" loading="lazy">`;
};
const icon = `<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4c2 11 8 17 20 20-12 2-18 8-20 20C22 32 16 26 4 24 16 22 22 16 24 4Z" fill="currentColor"/><circle cx="24" cy="24" r="4" fill="var(--paper)"/></svg>`;
const route = (path, label, current) =>
  `<a href="${path}"${current === path ? ' aria-current="page"' : ""}>${e(label)}</a>`;

export function renderPage({
  config = {},
  path = "/",
  commerce,
  booking,
  blog,
  actor = null,
  query = {},
  members = [],
  payments = { configured: false },
  assetVersion = 'v1',
} = {}) {
  const locale = normalizeLocale(config.locale)
  const t = createTranslator(locale)
  const paymentLabel = value => t(base_paymentLabel(value))
  const fulfillmentLabel = value => t(base_fulfillmentLabel(value))
  const bookingLabel = value => t(base_bookingLabel(value))
  const postLabel = value => t(base_postLabel(value))
  const fonts = { serif: 'Georgia,serif', sans: 'system-ui,sans-serif', rounded: 'ui-rounded,system-ui,sans-serif', mono: 'ui-monospace,monospace' }
  const d = config.design
  const ink = d && legibleInk(d.canvas, d.ink)
  const brandStyle = d ? `--paper:${d.canvas};--surface:${d.surface};--ink:${ink};--accent:${d.accent};--accent-2:${d.accent};--muted:${ink};--button-ink:${legibleInk(d.accent, '#ffffff')};--serif:${fonts[d.typography]};--line:color-mix(in srgb,${ink} 20%,transparent)` : ''
  const money = (minor, currency = config.currency || 'TWD') => Number.isSafeInteger(minor) ? formatMoney(minor, currency, locale) : '—'
  const localDate = (value, timeZone) => dateLabel(value, timeZone, locale)
  const preset = ["atelier", "bloom", "alignment"].includes(config.preset)
    ? config.preset
    : "atelier";
  const isAdmin = actor?.role === "admin";
  const currency = config.currency || "TWD";
  const stripe = ["stripe_test", "stripe_live"].includes(config.commerce?.paymentMode);
  const checkoutEnabled = config.commerce?.paymentMode === "manual" || (config.commerce?.paymentMode === "sandbox" && config.mode !== "production") || (stripe && payments.configured);
  const products = list(commerce, "listProducts", {
    admin: isAdmin,
    query: query.q,
    category: query.category,
  });
  const services = list(booking, "listServices", { admin: isAdmin });
  const posts = list(blog, "list", { admin: isAdmin });
  const orders = isAdmin ? list(commerce, "listOrders") : [];
  const bookings = isAdmin
    ? list(booking, "listBookings", undefined)
    : actor
      ? list(booking, "listBookings", actor.id)
      : [];
  const slots = list(booking, "listSlots", {
    serviceId: isAdmin ? query.serviceId : query.serviceId || services[0]?.id,
    admin: isAdmin,
  });
  const title = config.brandName || "Maison";
  const hero = config.hero || {};
  const orderRows = orders.map(o => t`<div class="order-admin-row"><b>${e(o.number || o.id)}</b><span>${e(paymentLabel(o.paymentStatus))} · ${e(fulfillmentLabel(o.fulfillmentStatus))}</span><span>${money(o.totalMinor, o.currency || currency)}</span><div class="order-customer"><b>${e(o.customer?.name || "")}</b><span>${e(o.customer?.email || "")}</span><span>${e(o.customer?.phone || "")}</span><span>${e(typeof o.customer?.address === "string" ? o.customer.address : Object.values(o.customer?.address || {}).filter(Boolean).join("、"))}</span></div><div class="order-items">${(o.items || []).map(item => `<p>${e(item.name)}${item.variantLabel ? ` · ${e(item.variantLabel)}` : ""} × ${e(item.quantity)}</p>`).join("")}</div><select aria-label="訂單操作" data-order-action="${e(o.id)}"><option value="">選擇操作</option><option value="confirm_manual_payment">確認人工收款</option><option value="ship">標記已出貨</option><option value="cancel">取消訂單</option><option value="refund">記錄退款</option></select></div>`).join("");
  const nav =
    config.siteType === "booking_blog"
      ? [
          ["/services", t("服務項目")],
          ["/book", t("預約時段")],
          ["/journal", t("誌記")],
          ["/about", t("關於我們")],
          ["/contact", t("聯絡我們")],
        ]
      : [
          ["/shop", t("商品選購")],
          ["/journal", t("誌記")],
          ["/about", t("品牌故事")],
          ["/contact", t("聯絡我們")],
        ];
  const header = t`<a class="brand" href="/" aria-label="${e(title)}首頁">${icon}<span>${e(title)}</span></a><nav aria-label="主要導覽">${nav.map(([p, l]) => route(p, l, path)).join("")}</nav><div class="header-tools"><a href="/account">會員專區</a>${config.siteType === "commerce" ? t(`<a class="bag-link" href="/cart">購物袋 <span data-cart-count>0</span></a>`) : ""}<button class="menu-toggle" type="button" aria-expanded="false" aria-label="開啟選單">☰</button></div>`;
  const productCard = p =>
    `<article class="product-card"><a class="product-image" href="/products/${encodeURIComponent(p.slug || p.id)}">${image(p.images?.[0], p.name)}${!p.images?.[0] ? '<span class="image-placeholder" aria-hidden="true">✳</span>' : ""}</a><div class="card-copy"><h3><a href="/products/${encodeURIComponent(p.slug || p.id)}">${e(p.name)}</a></h3><span>${money(p.priceMinor, currency)}</span></div>${p.stock <= 0 ? t('<span class="stock-note">暫時缺貨</span>') : ""}</article>`;
  const postCard = p =>
    `<article class="journal-card"><a class="journal-image" href="/journal/${encodeURIComponent(p.slug || p.id)}">${image(p.image || p.images?.[0], p.title)}${!p.image && !p.images?.[0] ? '<span class="image-placeholder" aria-hidden="true">✳</span>' : ""}</a><p class="eyebrow">${e(p.category || "Journal")}</p><h3><a href="/journal/${encodeURIComponent(p.slug || p.id)}">${e(p.title)}</a></h3><p>${e(p.excerpt || "")}</p></article>`;
  const home = t`<section class="hero hero-${preset}"><div class="hero-art">${image(hero.image, hero.title)}${!hero.image ? `<span class="hero-orb" aria-hidden="true"></span>${icon}` : ""}</div><div class="hero-copy"><p class="eyebrow">${e(hero.eyebrow || config.tagline || t("用心成就日常"))}</p><h1>${e(hero.title || t("為生活留一份從容"))}</h1><p>${e(hero.description || config.description || "")}</p><a class="button" href="${config.siteType === "booking_blog" ? "/services" : "/shop"}">${config.siteType === "booking_blog" ? t("探索服務") : t("瀏覽精選商品")}</a></div></section><section class="section"><div class="section-heading"><p class="eyebrow">精選推薦</p><h2>${config.siteType === "booking_blog" ? t("留一段時間給自己") : t("細選日常好物")}</h2></div><div class="product-grid">${
    (config.siteType === "booking_blog" ? services : products)
      .slice(0, 4)
      .map(
        config.siteType === "booking_blog"
          ? s =>
              t`<article class="service-card"><span class="service-icon">✳</span><p class="eyebrow">${e(s.durationMinutes || "")} 分鐘 · ${e(s.creditCost || 0)} 堂</p><h3>${e(s.name)}</h3><p>${e(s.description || "")}</p><a class="text-link" href="/book?serviceId=${encodeURIComponent(s.id)}">預約時段 ↗</a></article>`
          : productCard
      )
      .join("") || t('<p class="empty-state">精彩內容即將登場，敬請期待。</p>')
  }</div></section><section class="statement"><p>${e(config.about || config.description || t("細心製作，讓每一刻都更合心意。"))}</p></section><section class="section journal-preview"><div class="section-heading"><p class="eyebrow">品牌誌記</p><h2>靈感與日常</h2></div><div class="journal-grid">${
    posts
      .filter(p => p.status === "published" || isAdmin)
      .slice(0, 3)
      .map(postCard)
      .join("") || t('<p class="empty-state">新文章即將上線。</p>')
  }</div></section>`;
  let body = home;
  if (path === "/shop")
    body = t`<section class="page-intro"><p class="eyebrow">商品選購</p><h1>日常珍選</h1><p>為生活細心挑選，長久相伴。</p><form class="shop-filter" method="get" action="/shop"><label>搜尋<input name="q" value="${e(query.q || "")}" placeholder="商品名稱"></label><label>分類<input name="category" value="${e(query.category || "")}" placeholder="商品分類"></label><button class="button button-small">搜尋商品</button></form></section><section class="section"><div class="product-grid">${
      products
        .filter(p => p.active !== false)
        .map(productCard)
        .join("") || t('<p class="empty-state">目前尚無上架商品，敬請期待。</p>')
    }</div></section>`;
  else if (path === "/services")
    body = t`<section class="page-intro"><p class="eyebrow">預約服務</p><h1>服務項目</h1><p>為自己安排一段自在時光。</p></section><section class="section service-list">${services.map(s => t`<article class="service-row"><div><p class="eyebrow">${e(s.durationMinutes || "")} 分鐘 · ${e(s.creditCost || 0)} 堂</p><h2>${e(s.name)}</h2><p>${e(s.description || "")}</p></div><div><span>${e(s.creditCost || 0)} 堂</span><a class="button button-small" href="/book?serviceId=${encodeURIComponent(s.id)}">預約</a></div></article>`).join("") || t('<p class="empty-state">預約時段即將開放，敬請期待。</p>')}</section>`;
  else if (path === "/book")
    body = t`<section class="page-intro"><p class="eyebrow">預約服務</p><h1>預約時段</h1><p>選擇合適的服務與時間。</p></section><form class="form-panel" data-booking-form data-time-zone="${e(config.booking?.timeZone || "Asia/Taipei")}"><label>服務項目<select name="serviceId" required>${services.map(s => `<option value="${e(s.id)}"${query.serviceId === s.id ? " selected" : ""}>${e(s.name)}</option>`).join("")}</select></label><label>可預約時間<select name="slotId" required>${slots
      .filter(s => s.available)
      .map(
        s =>
          `<option value="${e(s.id)}">${e(localDate(s.startsAt || s.start, config.booking?.timeZone))}</option>`
      )
      .join(
        ""
      )}</select></label>${actor?.role !== "member" ? t('<label>姓名<input name="name" autocomplete="name" required></label><label>電子郵件<input name="email" type="email" autocomplete="email" required></label><label>聯絡電話<input name="phone" type="tel" autocomplete="tel" required></label><label class="consent-label"><input name="consent" type="checkbox" value="true" required> 我同意商家使用我的聯絡資料處理預約申請。</label>') : ""}<p class="form-note">預約申請需由商家確認；送出不代表付款或預約已確認。</p><button class="button" type="submit"${slots.some(s => s.available) ? "" : " disabled"}>送出預約申請</button><p class="form-message" aria-live="polite"></p></form>`;
  else if (path === "/booking")
    body = t`<section class="page-intro"><p class="eyebrow">預約管理</p><h1>我的預約</h1><p>使用建立預約時的私人連結查詢，不需要註冊帳號。</p></section><section class="form-panel" data-guest-booking data-time-zone="${e(config.booking?.timeZone || 'Asia/Taipei')}"><p data-booking-summary aria-live="polite">正在讀取預約…</p><button type="button" class="button button-small" data-booking-refresh>更新狀態</button><form data-guest-reschedule hidden><label>更換時段<select name="slotId" required></select></label><button class="button" type="submit">申請改期</button><p class="form-message" aria-live="polite"></p></form><button class="button button-small" type="button" data-guest-cancel hidden>取消預約</button><p class="form-message" aria-live="polite"></p><p>改期需重新由商家確認；取消不代表自動退款。私人連結可操作此筆預約，請妥善保管。</p></section>`;
  else if (path === "/journal")
    body = t`<section class="page-intro"><p class="eyebrow">品牌誌記</p><h1>靈感與日常</h1><p>分享生活裡的片刻與想法。</p></section><section class="section"><div class="journal-grid">${
      posts
        .filter(p => p.status === "published" || isAdmin)
        .map(postCard)
        .join("") || t('<p class="empty-state">新文章即將上線。</p>')
    }</div></section>`;
  else if (path.startsWith("/journal/")) {
    const p = blog?.get?.(decodeURIComponent(path.slice(9)), {
      admin: isAdmin,
    });
    if (!p) return null;
    body = `<article class="article"><p class="eyebrow">${e(p.category || t("品牌誌記"))}</p><h1>${e(p.title)}</h1><p class="article-lede">${e(p.excerpt || "")}</p>${image(p.image, p.title)}<div class="rich-copy">${p.renderedBody || `<p>${e(p.body || "")}</p>`}</div></article>`;
  } else if (path === "/about")
    body = t`<section class="page-intro"><p class="eyebrow">品牌理念</p><h1>${e(config.tagline || t("讓日常更貼近理想"))}</h1><p>${e(config.about || config.description || "")}</p></section><section class="statement">${icon}</section>`;
  else if (path === "/contact")
    body = t`<section class="page-intro"><p class="eyebrow">聯絡我們</p><h1>歡迎與我們聊聊</h1></section><section class="contact-panel">${config.contact?.email ? `<a href="mailto:${e(config.contact.email)}">${e(config.contact.email)}</a>` : ""}${config.contact?.phone ? `<a href="tel:${e(config.contact.phone)}">${e(config.contact.phone)}</a>` : ""}<p>${e(config.contact?.address || "")}</p></section><form class="form-panel" data-contact-form><label>姓名<input name="name" autocomplete="name" required></label><label>電子郵件<input name="email" type="email" autocomplete="email" required></label><label>訊息<textarea name="message" required></textarea></label><label class="consent-label"><input name="consent" type="checkbox" value="true" required> 我同意商家就此訊息與我聯絡。</label><button class="button">送出訊息</button><p class="form-message" aria-live="polite"></p></form>`;
  else if (path === "/policies")
    body = t`<section class="page-intro"><p class="eyebrow">服務說明</p><h1>購物與隱私政策</h1></section><section class="policy-copy">${["shipping", "returns", "privacy"].map((k, i) => `<article><h2>${[t("配送說明"), t("退換政策"), t("隱私說明")][i]}</h2><p>${e(config.policies?.[k] || "")}</p></article>`).join("")}</section>`;
  else if (path.startsWith("/products/")) {
    const p = commerce?.getProduct?.(decodeURIComponent(path.slice(10)));
    body = p
      ? t`<section class="detail-layout"><div class="detail-image">${image(p.images?.[0], p.name) || '<span class="image-placeholder">✳</span>'}</div><div class="detail-copy"><p class="eyebrow">${e(p.category || t("精選商品"))}</p><h1>${e(p.name)}</h1><p class="price" data-product-price="${Number(p.priceMinor) || 0}">${money(p.priceMinor, currency)}</p><p>${e(p.description || "")}</p>${p.variants?.length ? t`<label>選擇規格<select data-variant required>${p.variants.map(v => `<option value="${e(v.id)}" data-price="${Number(v.priceMinor) || 0}" data-stock="${Number(v.stock) || 0}">${e(v.label)} · ${money(v.priceMinor, currency)}</option>`).join("")}</select></label>` : ""}<label>數量<input type="number" min="1" max="${Number(p.stock) || 1}" value="1" data-quantity></label><button class="button" data-add-to-cart="${e(p.id)}" data-name="${e(p.name)}" data-price="${Number(p.priceMinor) || 0}"${p.stock <= 0 ? " disabled" : ""}>加入購物袋</button><p class="form-message" aria-live="polite"></p></div></section>`
      : null;
  } else if (path === "/cart")
    body = t(`<section class="page-intro"><p class="eyebrow">已選商品</p><h1>我的購物袋</h1></section><section class="section" data-cart><div data-cart-items><p class="empty-state">購物袋目前是空的。</p></div><p data-cart-total></p><a class="button" href="/checkout">前往結帳</a></section>`);
  else if (path === "/checkout")
    body = t`<section class="page-intro"><p class="eyebrow">即將完成</p><h1>確認訂單</h1><p>${config.commerce?.paymentMode === "manual" ? e(config.commerce.manualPaymentInstructions || t("訂單送出後將由商家人工確認付款；本網站不會在線上收款。")) : !checkoutEnabled ? t("訂單尚未開放，歡迎先與我們聯絡。") : stripe ? (config.commerce.paymentMode === "stripe_test" ? t("Stripe 測試環境：僅供驗收，不扣真錢、不使用真實卡號。") : t("建立訂單後，請前往 Stripe 安全付款頁完成刷卡。")) : t("目前使用預覽付款流程。")}</p></section><form class="form-panel" data-checkout-form><label>姓名<input name="name" autocomplete="name" required></label><label>電子郵件<input name="email" type="email" autocomplete="email" required></label><label>聯絡電話<input name="phone" type="tel" autocomplete="tel" required></label><label>配送地址<textarea name="address" autocomplete="street-address" required></textarea></label><label class="consent-label"><input name="consent" type="checkbox" value="true" required> 我已閱讀並同意購物條款與隱私說明。</label><button class="button" type="submit"${checkoutEnabled ? "" : " disabled"}>送出訂單</button><p class="form-message" aria-live="polite"></p></form>`;
  else if (path === "/orders" || path === "/account")
    body = t`<section class="page-intro"><p class="eyebrow">會員專區</p><h1>${path === "/orders" ? t("訂單查詢") : t("我的帳戶")}</h1></section><section class="section">${actor ? t`<p>目前登入：${e(actor.email || actor.name || t("會員"))}</p>${actor.emailVerified === false ? t('<div class="account-verification"><p>請完成電子郵件驗證以啟用會員帳戶。</p><button class="button button-small" type="button" data-email-verification-request>寄送驗證信</button><p class="form-message" data-verification-message aria-live="polite"></p></div>') : ""}<div data-account-content></div>` : t(`<form class="form-panel" data-login-form><label>電子郵件<input name="email" type="email" required autocomplete="email"></label><label>密碼<input name="password" type="password" required autocomplete="current-password"></label><button class="button">登入</button><p class="form-message" aria-live="polite"></p><a href="/register">建立會員帳號</a> · <a href="/forgot-password">忘記密碼？</a></form><form class="lookup-form" data-order-lookup><h2>查詢訂單</h2><label>訂單編號<input name="number" required></label><label>訂單電子郵件<input name="email" type="email" required></label><button class="button button-small">查詢訂單</button><p class="form-message" aria-live="polite"></p></form>`)}</section>`;
  else if (path === "/register" || path === "/login")
    body = t`<section class="page-intro"><p class="eyebrow">會員專區</p><h1>${path === "/register" ? t("建立會員帳號") : t("會員登入")}</h1></section><form class="form-panel" data-${path === "/register" ? "register" : "login"}-form>${path === "/register" ? t('<label>姓名<input name="name" autocomplete="name" required></label>') : ''}<label>電子郵件<input name="email" type="email" required autocomplete="email"></label><label>密碼<input name="password" type="password" required autocomplete="new-password"></label>${path === "/register" ? t('<label class="consent-label"><input name="consent" type="checkbox" value="true" required> 我已閱讀並同意隱私說明。</label>') : ''}<button class="button">${path === "/register" ? t("建立帳號") : t("登入")}</button><p class="form-message" aria-live="polite"></p>${path === "/register" ? t('<a href="/login">已有帳號？登入</a>') : t('<a href="/register">建立帳號</a> · <a href="/forgot-password">忘記密碼？</a>')}</form>`;
  else if (path === "/forgot-password")
    body = t(`<section class="page-intro"><p class="eyebrow">帳戶協助</p><h1>重設密碼</h1><p>若此電子郵件已有帳號，我們會寄送安全重設連結。</p></section><form class="form-panel" data-password-reset-request><label>電子郵件<input name="email" type="email" required autocomplete="email"></label><button class="button">寄送重設連結</button><p class="form-message" aria-live="polite"></p></form>`);
  else if (path === "/reset-password")
    body = t(`<section class="page-intro"><p class="eyebrow">帳戶協助</p><h1>設定新密碼</h1></section><form class="form-panel" data-password-reset-confirm><label>新密碼（至少 12 個字元）<input name="password" type="password" required autocomplete="new-password" minlength="12"></label><button class="button">更新密碼</button><p class="form-message" aria-live="polite"></p></form>`);
  else if (path === "/verify-email")
    body = t(`<section class="page-intro"><p class="eyebrow">最後一步</p><h1>驗證電子郵件</h1><p data-email-verification-status aria-live="polite">正在確認安全連結…</p></section>`);
  else if (path === "/admin/login")
    body = t(`<section class="page-intro"><p class="eyebrow">管理工作室</p><h1>管理員登入</h1></section><form class="form-panel" data-admin-login><label>管理密碼<input name="password" type="password" required autocomplete="current-password"></label><button class="button">登入工作室</button><p class="form-message" aria-live="polite"></p></form>`);
  else if (path.startsWith("/admin"))
    body = isAdmin
      ? t`<section class="page-intro admin-heading"><p class="eyebrow">管理工作室</p><h1>${e(actor.name || t("管理員"))}，您好</h1><p>管理商品、預約、會員與品牌內容。</p></section>
        <nav class="admin-tabs" aria-label="管理區導覽"><a href="#products">商品與庫存</a><a href="#orders">訂單</a><a href="#appointments">預約時段</a><a href="#members">會員與堂數</a><a href="#stories">品牌誌記</a><a href="#messages">聯絡訊息</a><a href="#settings">網站設定</a></nav>
        <section class="admin-content">
          <article id="products" class="admin-panel"><h2>商品與庫存</h2><form data-admin-product><input type="hidden" name="id"><input type="hidden" name="version"><input name="name" placeholder="商品名稱" required><input name="slug" placeholder="網址代稱" required><input name="category" placeholder="商品分類" required><input name="description" placeholder="商品說明"><input name="priceMinor" type="number" placeholder="售價（最小貨幣單位）" required><input name="stock" type="number" placeholder="庫存" required><input name="image" placeholder="商品圖片網址"><label><input name="active" type="checkbox" checked> 顯示於商店</label><fieldset class="variant-editor"><legend>商品規格與 SKU 庫存</legend><div data-variant-rows></div><button type="button" class="button button-small" data-add-variant>新增規格</button><small>價格使用最小貨幣單位；將規格庫存設為 0 可暫停販售。</small></fieldset><button class="button button-small">儲存商品</button></form><label class="upload-label">上傳商品圖片<input type="file" accept="image/png,image/jpeg,image/webp" data-media-upload></label><div class="admin-table">${products.map(p => t`<div><b>${e(p.name)}</b><span>${e(p.slug)}</span><span>庫存 ${Number(p.stock) || 0}</span><span>${money(p.priceMinor, currency)}</span><span>${p.active ? t("上架中") : t("草稿")}</span><button type="button" data-edit-product="${e(p.id)}" data-version="${e(p.version)}" data-name="${e(p.name)}" data-slug="${e(p.slug)}" data-category="${e(p.category)}" data-description="${e(p.description)}" data-price="${Number(p.priceMinor)}" data-stock="${Number(p.stock)}" data-active="${p.active}" data-image="${e(p.images?.[0] || "")}" data-variants="${e(JSON.stringify(p.variants || []))}">編輯</button></div>`).join("") || t('<p class="empty-state">目前沒有商品。</p>')}</div></article>
          <article id="orders" class="admin-panel"><h2>訂單與出貨</h2><div class="admin-table">${orderRows || t('<p class="empty-state">目前沒有訂單。</p>')}</div></article>
          <article id="appointments" class="admin-panel"><h2>預約、服務與時段</h2><div class="admin-table">${bookings.map(b => `<div><b>${e(b.serviceName || t("預約"))}</b><span>${e(localDate(b.startsAt, config.booking?.timeZone))}</span><span>${e(bookingLabel(b.status))}</span><span>${e(b.memberId || b.contact?.name || t("訪客"))}</span>${b.contact?.email ? `<span>${e(b.contact.email)}</span>` : ""}${b.kind === "guest" && b.status === "pending_hold" ? t`<button data-confirm-guest="${e(b.id)}">確認</button><button data-reject-guest="${e(b.id)}">婉拒</button>` : ""}</div>`).join("") || t('<p class="empty-state">目前沒有預約。</p>')}</div><h3>服務項目</h3><div class="admin-table">${services.map(s => t`<div><b>${e(s.name)}</b><span>${e(s.durationMinutes)} 分鐘</span><span>${e(s.creditCost)} 堂</span><span>${s.active ? t("啟用中") : t("已停用")}</span><button type="button" data-edit-service="${e(s.id)}" data-version="${e(s.version)}" data-name="${e(s.name)}" data-duration="${e(s.durationMinutes)}" data-credit="${e(s.creditCost)}" data-active="${s.active}">編輯</button></div>`).join("") || t('<p class="empty-state">請先新增服務項目。</p>')}</div><form data-admin-service><input type="hidden" name="id"><input type="hidden" name="version"><input name="name" placeholder="服務名稱" required><input name="durationMinutes" type="number" placeholder="分鐘" required><input name="creditCost" type="number" placeholder="使用堂數" required><label><input name="active" type="checkbox" checked> 啟用服務</label><button class="button button-small">儲存服務</button></form><h3>可預約時段</h3><div class="admin-table">${slots.map(s => t`<div><b>${e(services.find(service => service.id === s.serviceId)?.name || t("服務"))}</b><span>${e(localDate(s.startsAt, config.booking?.timeZone))}</span><span>${s.available ? t("尚有名額") : t("已預約／停用")}</span><span>${e(s.resourceId)}</span><button type="button" data-edit-slot="${e(s.id)}" data-version="${e(s.version)}" data-service="${e(s.serviceId)}" data-starts-at="${e(s.startsAt)}" data-resource="${e(s.resourceId)}" data-active="${s.active}">編輯</button></div>`).join("") || t('<p class="empty-state">請新增可預約時段。</p>')}</div><form data-admin-slot><input type="hidden" name="id"><input type="hidden" name="version"><select name="serviceId" required>${services.map(s => `<option value="${e(s.id)}">${e(s.name)}</option>`).join("")}</select><input name="startsAt" type="datetime-local" required><input name="resourceId" value="default" placeholder="資源代碼"><label><input name="active" type="checkbox" checked> 開放預約</label><button class="button button-small">儲存時段</button></form></article>
          <article id="members" class="admin-panel"><h2>會員與堂數</h2><div class="admin-table">${members.map(m => t`<div><b>${e(m.name || m.email)}</b><span>${e(m.email || "")}</span><span>${e(m.balance?.balance ?? m.balance ?? "")} 堂</span><form data-credit-form><input type="hidden" name="memberId" value="${e(m.id)}"><input name="delta" type="number" placeholder="增減堂數" required><input name="reason" placeholder="異動原因" required><button class="button button-small">調整堂數</button></form></div>`).join("") || t('<p class="empty-state">會員堂數會顯示於此。</p>')}</div></article>
          <article id="stories" class="admin-panel"><h2>品牌誌記</h2><form data-admin-blog><input type="hidden" name="id"><input type="hidden" name="version"><input name="title" placeholder="文章標題" required><input name="slug" placeholder="網址代稱" required><input name="summary" placeholder="文章摘要" required><input name="cover" placeholder="封面圖片網址"><textarea name="body" placeholder="文章內容" required></textarea><button class="button button-small">儲存草稿</button></form><label class="upload-label">上傳文章封面<input type="file" accept="image/png,image/jpeg,image/webp" data-media-upload></label><div class="admin-table">${posts.map(p => t`<div><b>${e(p.title)}</b><span>/${e(p.slug)}</span><span>${e(p.status || "draft")}</span><a href="/journal/${encodeURIComponent(p.slug)}">預覽 ↗</a><button type="button" data-edit-blog="${e(p.id)}" data-version="${e(p.version)}" data-title="${e(p.title)}" data-slug="${e(p.slug)}" data-summary="${e(p.summary || p.excerpt || "")}" data-body="${e(p.body || "")}" data-cover="${e(p.cover || "")}">編輯</button><button data-post-revisions="${e(p.id)}" data-version="${e(p.version)}">修訂記錄</button><button data-publish-post="${e(p.id)}" data-version="${e(p.version)}">${p.status === "published" ? t("取消發布") : t("發布")}</button></div>`).join("") || t('<p class="empty-state">目前沒有文章。</p>')}</div></article>
          <article id="messages" class="admin-panel"><h2>聯絡訊息</h2><div data-contact-messages class="empty-state">訊息載入中…</div></article>
          <article id="settings" class="admin-panel"><h2>網站外觀與資訊</h2><form data-admin-settings><label>版型<select name="preset">${["atelier", "bloom", "alignment"].map(x => `<option${x === preset ? " selected" : ""}>${x}</option>`).join("")}</select></label><label>品牌短句<input name="tagline" value="${e(config.tagline || "")}"></label><label>品牌介紹<textarea name="description">${e(config.description || "")}</textarea></label><label>關於品牌<textarea name="about">${e(config.about || "")}</textarea></label><label>首頁標題<input name="heroTitle" value="${e(hero.title || "")}"></label><label>首頁說明<textarea name="heroDescription">${e(hero.description || "")}</textarea></label><label>首頁圖片網址<input name="heroImage" value="${e(hero.image || "")}" placeholder="HTTPS 圖片或 /media/…"></label><label>聯絡電子郵件<input name="contactEmail" value="${e(config.contact?.email || "")}"></label><label>聯絡電話<input name="contactPhone" value="${e(config.contact?.phone || "")}"></label><label>地址<input name="contactAddress" value="${e(config.contact?.address || "")}"></label>${["shipping", "returns", "privacy"].map((k, i) => `<label>${[t("配送說明"), t("退換政策"), t("隱私說明")][i]}<textarea name="policy_${k}">${e(config.policies?.[k] || "")}</textarea></label>`).join("")}<button class="button">儲存網站設定</button></form><label class="upload-label">上傳首頁圖片<input type="file" accept="image/png,image/jpeg,image/webp" data-media-upload></label></article>
          <p class="form-message" data-admin-message aria-live="polite"></p></section>`
      : t('<section class="page-intro"><h1>請先登入管理後台</h1><a class="button" href="/admin/login">管理員登入</a></section>');
  const footer = t`<footer class="footer"><div class="footer-brand">${icon}<span>${e(title)}</span></div><p>${e(config.tagline || config.description || "")}</p><div class="footer-links"><a href="/policies">${config.siteType === "commerce" ? t("購物政策") : t("預約政策")}</a><a href="/contact">聯絡我們</a>${config.siteType === "commerce" ? t('<a href="/shop">商品選購</a>') : t('<a href="/services">服務項目</a>')}</div><small>© ${new Date().getFullYear()} ${e(title)}</small></footer>`;
  if (path === "/orders") body += t('<section class="section" data-payment-return><p>付款狀態以金流確認為準；返回此頁不代表付款成功。</p><button type="button" class="button button-small" data-refresh-order>更新付款狀態</button><p class="form-message" aria-live="polite"></p></section>');
  if (path === '/admin' && isAdmin && config.mode === 'preview') body += `<section class="form-panel"><h2>Stripe · ${t('測試付款（不扣真錢）')}</h2><p>${t('只接受測試金鑰；加密儲存，不會再次顯示。儲存不代表已通過金流驗收。')}</p><form data-stripe-test-form autocomplete="off"><label>Stripe test secret key<input name="secretKey" type="password" autocomplete="new-password" spellcheck="false" required pattern="sk_test_[A-Za-z0-9]{8,240}"></label><label>Webhook signing secret<input name="webhookSecret" type="password" autocomplete="new-password" spellcheck="false" required pattern="whsec_[A-Za-z0-9]{8,240}"></label><p>Webhook: <code>/api/payments/stripe/webhook</code></p><button class="button">${t('安全儲存測試金鑰')}</button><p class="form-message" aria-live="polite"></p></form></section>`
  const knownPaths = new Set(["/", "/shop", "/services", "/book", "/journal", "/about", "/contact", "/policies", "/cart", "/checkout", "/orders", "/account", "/register", "/login", "/forgot-password", "/reset-password", "/verify-email", "/admin", "/admin/login"]);
  const exists = knownPaths.has(path) || path === '/booking' || /^\/products\/[^/]+$/u.test(path) || /^\/journal\/[^/]+$/u.test(path);
  if (!exists || body === null) return null;
  return `<!doctype html><html lang="${e(locale)}" dir="${direction(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${e(config.description || "")}"><meta name="theme-color" content="${d?.canvas || '#f6f2ea'}"><title>${e(path.startsWith("/admin") ? t("管理工作室 · ") : "")}${e(title)}</title><link rel="stylesheet" href="/assets/site.css?v=${e(assetVersion)}"></head><body class="preset-${preset}${d?.motion === 'none' ? ' motion-none' : ''}" data-site-id="${e(config.siteId)}" data-currency="${e(currency)}" data-time-zone="${e(config.booking?.timeZone || 'UTC')}" style="${brandStyle}"><header class="site-header">${header}</header><main>${body}</main>${footer}<script type="module" src="/assets/site.js?v=${e(assetVersion)}" defer></script></body></html>`;
}
