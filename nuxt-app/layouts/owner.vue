<script setup lang="ts">
const route = useRoute()

const activeSection = computed(() => {
  if (route.path === '/audit-lab/geo') return 'geo'
  if (route.path === '/audit-lab/training-report') return 'training'
  return 'audit'
})

useHead({ htmlAttrs: { lang: 'zh-Hant', dir: 'ltr' } })
</script>

<template>
  <div class="owner-layout">
    <header class="owner-layout__header">
      <NuxtLink class="owner-layout__brand" to="/audit-lab" aria-label="DiscoveryStack 私有稽核實驗室首頁">
        DISCOVERYSTACK<span>.</span><small>PRIVATE WORKBENCH</small>
      </NuxtLink>
      <nav class="owner-layout__nav" aria-label="私有工作台導覽">
        <NuxtLink to="/audit-lab" :aria-current="activeSection === 'audit' ? 'page' : undefined">Audit Lab</NuxtLink>
        <NuxtLink to="/audit-lab/geo" :aria-current="activeSection === 'geo' ? 'page' : undefined">GEO Workbench</NuxtLink>
        <NuxtLink to="/audit-lab/training-report" :aria-current="activeSection === 'training' ? 'page' : undefined">訓練報告</NuxtLink>
      </nav>
      <NuxtLink class="owner-layout__exit" to="/zh-hant">返回公開網站 <span aria-hidden="true">↗</span></NuxtLink>
    </header>
    <main id="owner-workbench"><slot /></main>
  </div>
</template>

<style scoped>
.owner-layout {
  min-height: 100vh;
  background:
    radial-gradient(circle at 10% -10%, rgba(58, 91, 135, .12), transparent 31rem),
    #101319;
  color: #eff3f7;
}

.owner-layout__header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: minmax(13rem, 1fr) auto minmax(13rem, 1fr);
  align-items: center;
  gap: 1rem;
  min-height: 4.5rem;
  padding: .75rem clamp(1.25rem, 4vw, 4rem);
  border-bottom: 1px solid rgba(230, 238, 246, .13);
  background: rgba(16, 19, 25, .91);
  backdrop-filter: blur(16px);
}

.owner-layout__brand,
.owner-layout__exit,
.owner-layout__nav a { color: inherit; text-decoration: none; }

.owner-layout__brand {
  display: inline-flex;
  align-items: baseline;
  gap: .32rem;
  width: max-content;
  color: #fff;
  font-size: .83rem;
  font-weight: 800;
  letter-spacing: .11em;
}

.owner-layout__brand span { color: #8eb7ec; }
.owner-layout__brand small { color: #aeb9c5; font-size: .55rem; font-weight: 700; letter-spacing: .1em; }

.owner-layout__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .2rem;
  padding: .22rem;
  border: 1px solid rgba(230, 238, 246, .12);
  border-radius: 999px;
  background: rgba(255, 255, 255, .035);
}

.owner-layout__nav a,
.owner-layout__exit {
  padding: .48rem .7rem;
  border-radius: 999px;
  color: #b9c3ce;
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .025em;
  transition: color 160ms ease-out, background 160ms ease-out, transform 160ms ease-out;
}

.owner-layout__nav a:hover,
.owner-layout__nav a:focus-visible,
.owner-layout__nav a[aria-current='page'] { color: #111820; background: #dce9f6; outline: none; }
.owner-layout__exit { justify-self: end; border: 1px solid rgba(230, 238, 246, .18); }
.owner-layout__exit:hover, .owner-layout__exit:focus-visible { color: #fff; border-color: #8eb7ec; outline: none; transform: translateY(-1px); }

@media (max-width: 800px) {
  .owner-layout__header { grid-template-columns: 1fr auto; gap: .7rem; padding: .72rem 1rem; }
  .owner-layout__nav { grid-column: 1 / -1; grid-row: 2; justify-content: stretch; overflow-x: auto; border-radius: .7rem; }
  .owner-layout__nav a { flex: 1 0 max-content; text-align: center; }
  .owner-layout__brand small { display: none; }
  .owner-layout__exit { font-size: .65rem; }
}

@media (prefers-reduced-motion: reduce) {
  .owner-layout__nav a, .owner-layout__exit { transition: none; }
}
</style>
