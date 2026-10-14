/**
 * Original, bounded design system. Editorial portrait / full-width campaign / precision layouts
 * share brand tokens but not composition. No third-party CSS, fonts, scripts or tracking.
 */
export const BRAND_STUDIO_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:100px}
body{margin:0;background:var(--canvas);color:var(--ink);font:400 16px/1.7 ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere;text-rendering:optimizeLegibility}
a{color:inherit;text-decoration:none}button,input,textarea{font:inherit}a,button,summary,input,textarea{touch-action:manipulation}
:focus-visible{outline:2px solid var(--ink);outline-offset:5px}
.skip-link{position:fixed;inset-block-start:12px;inset-inline-start:12px;z-index:50;background:var(--canvas);padding:12px 20px;border:1px solid var(--ink);transform:translateY(-200%)}
.skip-link:focus{transform:none}
::selection{background:var(--accent);color:var(--accentInk)}
img{display:block;max-width:100%}figure,p,h1,h2,h3{margin:0}h1,h2,h3{text-wrap:balance}
.wrap{width:min(1440px,calc(100% - 112px));margin-inline:auto}
.top{position:relative;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:32px;min-height:100px;border-bottom:1px solid var(--line);background:var(--canvas)}
.sticky-nav .top{position:sticky;top:0}
.brand{font:400 clamp(20px,2.8vw,37px)/1.1 var(--display);letter-spacing:-.045em;max-width:35%;padding-block:12px}
.nav{display:flex;justify-content:flex-end;gap:8px 25px;flex-wrap:wrap}
.nav a{display:inline-flex;align-items:center;min-height:44px;font-size:11px;letter-spacing:.055em}
.nav a:hover,.nav a[aria-current]{text-decoration:underline;text-underline-offset:6px}
.mobile-navigation{display:none}
.eyebrow,.number{font-size:10px;line-height:1.5;letter-spacing:.16em;text-transform:uppercase}
.eyebrow{display:flex;align-items:center;gap:12px}.eyebrow::before{content:"";display:inline-block;width:24px;height:1px;background:currentColor;flex-shrink:0}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:clamp(32px,6vw,92px);padding-block:var(--space);position:relative}
.hero-copy{min-width:0;position:relative}
.hero h1{font:var(--weight) clamp(46px,6.1vw,102px)/1.03 var(--display);letter-spacing:-.052em;max-width:14ch;margin-block:30px}
.hero.long-title h1{font-size:clamp(38px,4.9vw,78px);max-width:20ch}
.lede{max-width:42ch;font-size:15px;line-height:1.85}
.link{display:inline-flex;align-items:center;justify-content:space-between;gap:40px;min-height:48px;border-bottom:1px solid currentColor;padding:12px 0;font-size:12px;margin-top:26px}
.link .arrow{display:grid;place-items:center;flex-shrink:0;width:34px;height:34px;border:1px solid var(--line);border-radius:50%;font-size:18px;transition:transform .25s ease}
.link:hover .arrow{transform:rotate(45deg)}
.button-outline .link,.button-solid .link{border:1px solid currentColor;padding:10px 18px;border-radius:var(--radius)}
.button-solid .link{background:var(--accent);color:var(--accentInk);border-color:var(--accent)}
.hero-figure{position:relative;min-width:0;align-self:stretch;display:flex;flex-direction:column;justify-content:center}
.visual{position:relative;aspect-ratio:var(--ratio);overflow:hidden;border-radius:var(--radius);background:var(--wash);min-width:0}
.brand-photo{width:100%;height:100%;object-fit:cover;transition:transform 1.2s cubic-bezier(.2,.7,.3,1)}
@media(hover:hover){.visual:hover .brand-photo,.story-photo:hover img{transform:scale(1.035)}}
.visual-note{display:flex;align-items:start;justify-content:space-between;gap:20px;font-size:9px;letter-spacing:.1em;margin-block:13px 0}
.visual-note span:last-child{white-space:nowrap}
.hero-artifact{display:flex;align-items:center;gap:20px;max-width:350px;margin-top:48px;font-size:11px}
.hero-artifact img{width:88px;height:105px;object-fit:cover;border-radius:var(--radius);flex-shrink:0}
.hero-artifact figcaption{max-width:23ch}
.brand-art{height:100%;min-height:240px;display:grid;place-content:center;text-align:center;position:relative;isolation:isolate;overflow:hidden;background:linear-gradient(150deg,var(--wash),var(--canvas))}
.brand-art::before,.brand-art::after{content:"";position:absolute;z-index:-1;border:1px solid color-mix(in srgb,var(--ink) 25%,transparent);width:70%;height:70%;inset:15%;border-radius:50% 50% 2% 2%;transform:rotate(-18deg)}
.brand-art::after{transform:rotate(18deg);inset:22% 8% 8% 22%}
.brand-art .monogram{font:400 clamp(80px,16vw,240px)/1 var(--display);opacity:.45}
.brand-art .art-signature{font-size:11px;letter-spacing:.13em;padding:24px;max-width:28ch}
.index{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;border-block:1px solid var(--line);padding:14px 0}
.index a{display:flex;align-items:center;gap:22px;min-height:44px;font-size:12px}.index a span{font-size:9px;opacity:.6;flex:0 0 2ch;white-space:nowrap}
.chapters{padding-block:var(--space)}
.chapter{display:grid;grid-template-columns:minmax(0,.65fr) minmax(0,1fr);gap:10%;padding-block:64px;border-bottom:1px solid var(--line);scroll-margin-top:100px;position:relative}
.chapter:first-child{padding-top:16px}
.chapter h2{font:var(--weight) clamp(30px,3.8vw,62px)/1.12 var(--display);letter-spacing:-.035em;margin-block:16px 24px}
.chapter-content{min-width:0;align-self:center}.chapter-content>p{max-width:62ch;white-space:pre-line;font-size:15px}
.chapter-intro{display:block;max-width:960px;margin-inline:auto;text-align:center;padding-block:32px 88px;border:0}
.chapter-intro .chapter-content>p{max-width:60ch;margin-inline:auto}
.chapter-intro h2{font-size:clamp(32px,4.1vw,64px)}
.chapter-story{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);align-items:center;border:0;gap:9%;padding-block:72px}
.chapter-story .story-photo{grid-column:1;grid-row:1;overflow:hidden;border-radius:var(--radius)}
.chapter-story .story-photo img{width:100%;aspect-ratio:4/5;object-fit:cover;transition:transform 1.2s ease}
.chapter-story .story-copy{grid-column:2;grid-row:1;min-width:0}
.chapter-story .chapter-content>p{max-width:43ch}
.chapter-story .story-caption{padding-top:12px;font-size:10px;letter-spacing:.09em}
.chapter-journey{grid-template-columns:minmax(0,.65fr) minmax(0,1fr)}
.steps{list-style:none;padding:0;margin:0;display:grid;gap:0}
.steps li{display:grid;grid-template-columns:36px minmax(0,1fr);gap:20px;border-top:1px solid var(--line);padding:22px 0;align-items:baseline;font-size:15px}
.steps li:first-child{border:0}.steps .step-no{font-size:10px}
.chapter-contact{display:block;text-align:center;padding:80px 36px;background:var(--wash);border:0;margin-top:56px;border-radius:var(--radius)}
.chapter-contact h2{font-size:clamp(36px,5vw,80px);max-width:18ch;margin-inline:auto}
.chapter-contact .chapter-content>p{margin-inline:auto;max-width:52ch}
.chapter-form{grid-template-columns:minmax(0,.6fr) minmax(0,1fr);border:0;background:var(--surface);color:var(--surfaceInk);padding:clamp(24px,5vw,64px);margin-top:40px;border-radius:var(--radius)}
.contact-form{display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:720px;margin:0}
.contact-form label{display:grid;gap:8px;font-size:12px;min-width:0}
.contact-form input,.contact-form textarea{width:100%;padding:12px 0;color:inherit;background:transparent;border:0;border-bottom:1px solid currentColor;border-radius:0;min-height:44px}
.contact-form label:has(textarea),.contact-form label:has(input[type=checkbox]),.contact-form button,.contact-form .module-note{grid-column:1/-1}
.contact-form label>span{display:flex;gap:10px;align-items:flex-start;font-size:12px}
.contact-form input[type=checkbox]{width:18px;height:18px;min-height:18px;margin:3px 0;flex-shrink:0;accent-color:var(--accent)}
.contact-form textarea{min-height:140px;resize:vertical}
.contact-form button{min-height:50px;background:var(--accent);color:var(--accentInk);border:0;padding:14px 24px;cursor:pointer}
.contact-form button:disabled{opacity:.55;cursor:not-allowed}
.module-note{font-size:13px;line-height:1.8;border-inline-start:2px solid currentColor;padding:14px 18px;text-align:start}
.hp-field{position:absolute!important;inset-inline-start:-9999px!important;width:1px!important;height:1px!important;overflow:hidden}
.faq{display:grid;grid-template-columns:minmax(0,.65fr) minmax(0,1fr);gap:10%;padding-block:var(--space)}
.faq h2{font:var(--weight) clamp(34px,4vw,60px)/1.1 var(--display)}
.faq details{border-bottom:1px solid var(--line)}
.faq summary{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:24px 0;cursor:pointer;font-size:17px;min-height:52px;list-style:none}
.faq summary::-webkit-details-marker{display:none}.faq summary::after{content:"+";font-size:25px;font-weight:300;flex-shrink:0}.faq details[open] summary::after{content:"−"}
.faq details p{padding:0 35px 24px 0;max-width:64ch;white-space:pre-line;font-size:14px}
.site-footer{border-top:1px solid var(--line);padding-block:40px 24px}
.footer-meta{display:flex;justify-content:space-between;gap:40px;font-size:11px;padding-bottom:32px}
.footer-meta p{max-width:60ch}.footer-meta nav{display:flex;flex-wrap:wrap;gap:8px 20px;align-content:start}
.footer-meta a{min-height:44px;display:inline-flex;align-items:center}
.footer-wordmark{font:400 clamp(40px,var(--wordmark),210px)/1.08 var(--display);letter-spacing:-.06em;padding-block:25px 5px;border-top:1px solid var(--line);overflow-wrap:anywhere;text-align:center}
.layout-showcase .hero{grid-template-columns:1fr;gap:35px;padding-block:36px 44px}
.layout-showcase .hero-figure{grid-row:1}
.layout-showcase .visual{aspect-ratio:2.05/1;max-height:720px}
.layout-showcase .hero-copy{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);column-gap:10%;align-items:end}
.layout-showcase .hero h1{margin:16px 0 0;font-size:clamp(48px,6vw,98px);max-width:17ch}
.layout-showcase .hero .eyebrow{grid-column:1/-1}
.layout-showcase .hero-artifact{display:none}
.layout-showcase .chapter-story .story-photo{grid-column:2}.layout-showcase .chapter-story .story-copy{grid-column:1}
.layout-showcase .chapter-story{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}
.layout-showcase .chapter-intro{padding-block:32px 64px}
.layout-showcase .brand-art::before{border-radius:50%;transform:rotate(35deg) scaleX(.62)}
.layout-showcase .brand-art::after{border-radius:50%;transform:rotate(-35deg) scaleX(.62)}
.layout-structured .hero{grid-template-columns:1fr;max-width:1120px;margin-inline:auto;text-align:center;gap:44px}
.layout-structured .hero .eyebrow{justify-content:center}
.layout-structured .hero h1,.layout-structured .lede{margin-inline:auto}
.layout-structured .visual{aspect-ratio:2.6/1}.layout-structured .hero-artifact{display:none}
.layout-structured .chapters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px}
.layout-structured .chapter{display:block;padding:36px;border:1px solid var(--line);border-radius:var(--radius);margin:0}
.layout-structured .chapter h2{font-size:clamp(28px,3vw,44px)}
.layout-structured .chapter-intro,.layout-structured .chapter-story,.layout-structured .chapter-form,.layout-structured .chapter-contact{grid-column:1/-1;max-width:none}
.layout-structured .chapter-story{display:grid;grid-template-columns:1fr 1fr;gap:8%;padding:40px}
.layout-structured .chapter-form{display:grid;grid-template-columns:1fr 1.3fr;gap:8%}
.layout-structured .chapter-intro{padding:55px;max-width:none}
.page-inner .hero{padding-block:64px;gap:7%}
.page-inner .hero h1{font-size:clamp(40px,5vw,78px);max-width:18ch}
.page-inner .hero-artifact{display:none}
.page-inner .hero .visual{aspect-ratio:5/4;max-height:430px}
.page-inner .hero-figure{grid-row:auto}
.page-contact .hero,.page-faq .hero,.page-blog .hero{display:block;max-width:880px;margin-inline:auto;text-align:center}
.page-contact .hero .eyebrow,.page-faq .hero .eyebrow,.page-blog .hero .eyebrow{justify-content:center}
.page-contact .hero-copy,.page-faq .hero-copy,.page-blog .hero-copy{display:block}
.page-contact .hero h1,.page-contact .hero .lede,.page-faq .hero h1,.page-faq .hero .lede,.page-blog .hero h1,.page-blog .hero .lede{margin-inline:auto}
.page-contact .chapters,.page-faq .chapters{padding-top:0}
.page-shop .chapter:not(.chapter-form):not(.chapter-contact),.page-services .chapter:not(.chapter-form):not(.chapter-contact){border-bottom:1px solid var(--line)}
@keyframes studio-arrive{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes studio-image-arrive{from{opacity:.5;clip-path:inset(6% 0 0)}to{opacity:1;clip-path:inset(0)}}
.motion-soft .hero-copy,.motion-reveal .hero-copy{animation:studio-arrive .8s ease-out both}
.motion-reveal .hero-figure{animation:studio-image-arrive 1.1s ease-out both}
.motion-none *{animation:none!important;transition:none!important}.motion-none .brand-photo,.motion-none .arrow{transform:none!important}
@supports(animation-timeline:view()){
  .motion-reveal .chapter:not(.chapter-form),.motion-reveal .faq{animation:studio-arrive linear both;animation-timeline:view();animation-range:entry 0% entry 22%}
}
@media(min-width:1800px){.hero h1{font-size:102px}}
@media(max-width:1000px){
  .wrap{width:calc(100% - 56px)}.nav{gap:6px 15px}.brand{font-size:28px}
  .hero{gap:40px}.hero h1{font-size:clamp(42px,6.4vw,72px)}.hero-artifact{margin-top:30px}
}
@media(max-width:760px){
  html{scroll-padding-top:88px}.wrap{width:calc(100% - 40px)}.top{min-height:78px;gap:20px}
  .brand{max-width:65%;font-size:clamp(20px,6vw,30px)}.desktop-navigation{display:none}
  .mobile-navigation{display:block;position:static}.mobile-navigation>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:center;min-width:48px;min-height:48px;font-size:22px}
  .mobile-navigation>summary::-webkit-details-marker{display:none}
  .mobile-navigation>summary .menu-close,.mobile-navigation[open]>summary .menu-open{display:none}.mobile-navigation[open]>summary .menu-close{display:inline}
  .mobile-navigation .nav{position:absolute;inset:100% 0 auto;display:grid;justify-content:stretch;padding:18px 24px;background:var(--canvas);border:1px solid var(--line);box-shadow:0 16px 22px #0000000d;max-height:65vh;overflow:auto}
  .mobile-navigation .nav a{font-size:15px;border-bottom:1px solid var(--line);padding-block:8px}
  .hero,.layout-showcase .hero,.layout-structured .hero{grid-template-columns:1fr;padding-block:40px;gap:30px}
  .hero h1,.hero.long-title h1,.layout-showcase .hero h1{font-size:clamp(42px,11.7vw,68px);max-width:17ch;margin-block:22px}
  .hero.long-title h1{font-size:clamp(35px,9.5vw,58px)}
  .hero .lede{font-size:14px;max-width:44ch}.hero-artifact{display:none}
  .visual,.layout-showcase .visual{aspect-ratio:4/5;max-height:none}.layout-structured .visual{aspect-ratio:4/3}
  .visual-note{font-size:8px;margin-top:10px}
  .layout-showcase .hero-copy{display:block}.layout-showcase .hero-figure{grid-row:1}
  .index{display:grid;grid-template-columns:1fr 1fr;gap:0 20px}.index a{font-size:11px;gap:12px}
  .chapters{padding-block:40px}.chapter,.chapter-story,.layout-showcase .chapter-story{grid-template-columns:1fr;gap:24px;padding-block:34px}
  .chapter h2{font-size:clamp(30px,8.8vw,46px)}.chapter-content>p{font-size:14px}
  .chapter-intro{padding:30px 0 48px}.chapter-intro h2{font-size:38px}
  .chapter-story .story-photo,.layout-showcase .chapter-story .story-photo{grid-column:1;grid-row:1}
  .chapter-story .story-copy,.layout-showcase .chapter-story .story-copy{grid-column:1;grid-row:2}
  .chapter-story .story-photo img{aspect-ratio:4/5;max-height:620px}
  .chapter-contact{padding:50px 22px;margin-top:30px}.chapter-contact h2{font-size:40px}
  .chapter-form{padding:28px 20px}.contact-form{grid-template-columns:1fr;gap:20px}
  .contact-form label,.contact-form button{grid-column:1/-1}
  .layout-structured .chapters{grid-template-columns:1fr;gap:18px}
  .layout-structured .chapter{padding:26px}.layout-structured .chapter-story,.layout-structured .chapter-form{grid-template-columns:1fr}
  .faq{grid-template-columns:1fr;gap:26px;padding-block:40px}.faq summary{font-size:16px}
  .footer-meta{flex-direction:column;gap:18px}.footer-wordmark{font-size:clamp(38px,var(--wordmark-mobile),88px)}
  .page-inner .hero{padding-block:42px}.page-inner .hero h1{font-size:44px}
  .page-inner .hero .visual{aspect-ratio:4/3;max-height:none}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation:none!important;transition:none!important}.brand-photo{transform:none!important}}
@media(forced-colors:active){.link,.contact-form button{border:1px solid ButtonText}.visual{border:1px solid CanvasText}}
`
