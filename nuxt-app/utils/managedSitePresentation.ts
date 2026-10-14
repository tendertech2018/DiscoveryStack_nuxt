export const STUDIO_CHROME_KEYS = ['navigation', 'faq', 'contact', 'name', 'email', 'phone', 'message', 'submit', 'consent', 'thanksTitle', 'thanksBody', 'previewNotice', 'imageNeeded'] as const
export type StudioChrome = Record<typeof STUDIO_CHROME_KEYS[number], string>
export type StudioDesign = {
  version: 'studio-design-v1'
  layout: 'editorial' | 'showcase' | 'structured'
  typography: 'serif' | 'sans' | 'rounded' | 'mono'
  motion: 'none' | 'soft' | 'reveal'
  canvas: string
  surface: string
  ink: string
  accent: string
  tuning?: StudioDesignTuning
}
export type StudioDesignTuning = {
  density: 'airy' | 'balanced' | 'compact'
  corners: 'square' | 'soft' | 'round'
  imageRatio: 'portrait' | 'square' | 'landscape' | 'wide'
  headingWeight: 400 | 500 | 600 | 700
  navigation: 'static' | 'sticky'
  button: 'underline' | 'outline' | 'solid'
}
export const DEFAULT_STUDIO_TUNING: StudioDesignTuning = { density: 'airy', corners: 'square', imageRatio: 'portrait', headingWeight: 400, navigation: 'static', button: 'underline' }
export function isStudioDesignTuning(value: unknown): value is StudioDesignTuning {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as StudioDesignTuning
  return Object.keys(item).sort().join(',') === 'button,corners,density,headingWeight,imageRatio,navigation' && ['airy', 'balanced', 'compact'].includes(item.density) && ['square', 'soft', 'round'].includes(item.corners) && ['portrait', 'square', 'landscape', 'wide'].includes(item.imageRatio) && [400, 500, 600, 700].includes(item.headingWeight) && ['static', 'sticky'].includes(item.navigation) && ['underline', 'outline', 'solid'].includes(item.button)
}
export type StudioPresentation = {
  version: 'studio-presentation-v1'
  /** Absent means the immutable original renderer. New designs opt in before customer review. */
  renderer?: 'brand-studio-v2'
  design: StudioDesign
  chrome: StudioChrome
  media?: StudioMedia[]
}
// Two larger brand photographs still fit the bounded intake + pinned/latest proposal budget.
export const STUDIO_IMAGE_MAX_BYTES = 56_000
export type StudioMedia = { slot: 'hero' | 'detail'; dataUrl: string; alt: string; width: number; height: number; sha256: string }
/** Only server-normalised, metadata-free WebP is admitted; SVG, external URLs and executable data are never allowed. */
export function isStudioMedia(value: unknown): value is StudioMedia {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as StudioMedia
  return Object.keys(item).sort().join(',') === 'alt,dataUrl,height,sha256,slot,width' && ['hero', 'detail'].includes(item.slot) && typeof item.dataUrl === 'string' && item.dataUrl.length <= 23 + 4 * Math.ceil(STUDIO_IMAGE_MAX_BYTES / 3) && /^data:image\/webp;base64,UklGR[A-Za-z0-9+/]+={0,2}$/u.test(item.dataUrl) && typeof item.alt === 'string' && item.alt.trim().length > 0 && item.alt.length <= 200 && !/[<>\u0000-\u001f]/u.test(item.alt) && [item.width, item.height].every(n => Number.isInteger(n) && n > 0 && n <= 1400) && /^[a-f0-9]{64}$/u.test(item.sha256)
}

export const DEFAULT_STUDIO_DESIGN: StudioDesign = { version: 'studio-design-v1', layout: 'editorial', typography: 'serif', motion: 'soft', canvas: '#f4f0e9', surface: '#fffdf8', ink: '#282421', accent: '#76384b' }
export const EN_STUDIO_CHROME: StudioChrome = { navigation: 'Main navigation', faq: 'Questions & answers', contact: 'Contact us', name: 'Name', email: 'Email', phone: 'Phone (optional)', message: 'Your message', submit: 'Send enquiry', consent: 'I agree to share these details so the website owner can reply to this enquiry.', thanksTitle: 'Thank you for your message', thanksBody: 'Your enquiry has been received.', previewNotice: 'Draft for review. Booking, checkout and publishing require separate setup and verification.', imageNeeded: 'Add your own brand photography' }
export const ZH_STUDIO_CHROME: StudioChrome = { navigation: '主要導覽', faq: '常見問題', contact: '聯絡我們', name: '姓名', email: '電子郵件', phone: '電話（選填）', message: '你的訊息', submit: '送出洽詢', consent: '我同意提供這些資料，讓網站負責人回覆這次洽詢。', thanksTitle: '謝謝你的訊息', thanksBody: '我們已收到你的訊息。', previewNotice: '這是待確認草稿；預約、購物及正式發布仍須另外設定與驗收。', imageNeeded: '加入自己的品牌照片' }

const HEX = /^#[0-9a-f]{6}$/iu
export function isStudioDesign(value: unknown): value is StudioDesign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as StudioDesign
  return Object.keys(item).sort().join(',') === ['version', 'layout', 'typography', 'motion', 'canvas', 'surface', 'ink', 'accent', ...(item.tuning !== undefined ? ['tuning'] : [])].sort().join(',') && item.version === 'studio-design-v1' && ['editorial', 'showcase', 'structured'].includes(item.layout) && ['serif', 'sans', 'rounded', 'mono'].includes(item.typography) && ['none', 'soft', 'reveal'].includes(item.motion) && [item.canvas, item.surface, item.ink, item.accent].every(color => typeof color === 'string' && HEX.test(color)) && (item.tuning === undefined || isStudioDesignTuning(item.tuning))
}

export function isStudioPresentation(value: unknown): value is StudioPresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as StudioPresentation
  const keys = ['chrome', 'design', 'version', ...(item.media !== undefined ? ['media'] : []), ...(item.renderer !== undefined ? ['renderer'] : [])]
  return Object.keys(item).sort().join(',') === keys.sort().join(',') && (item.renderer === undefined || item.renderer === 'brand-studio-v2') && item.version === 'studio-presentation-v1' && isStudioDesign(item.design) && Boolean(item.chrome) && Object.keys(item.chrome).sort().join(',') === [...STUDIO_CHROME_KEYS].sort().join(',') && Object.values(item.chrome).every(text => typeof text === 'string' && text.trim().length > 0 && text.length <= 450 && !/[<>\u0000-\u001f]/u.test(text)) && (item.media === undefined || Array.isArray(item.media) && item.media.length <= 2 && item.media.every(isStudioMedia) && new Set(item.media.map(image => image.slot)).size === item.media.length)
}

export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722
  }
  const first = luminance(a), second = luminance(b)
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05)
}

export function legibleInk(background: string, preferred = '#282421'): string {
  if (contrastRatio(background, preferred) >= 4.5) return preferred
  return contrastRatio(background, '#111111') >= contrastRatio(background, '#ffffff') ? '#111111' : '#ffffff'
}
