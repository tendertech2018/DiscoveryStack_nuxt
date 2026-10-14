import type { ManagedSiteBlueprintV1, ManagedSiteBlueprintSectionV1 } from '../../../server/managed-sites/live-connectors/types'
import { DEFAULT_STUDIO_DESIGN, DEFAULT_STUDIO_TUNING, EN_STUDIO_CHROME, type StudioMedia } from '../../../utils/managedSitePresentation'

/** Explicitly synthetic content for renderer tests and local browser QA; never imported by runtime. */
export function brandStudioFixture(options: { brand?: 'eclat' | 'jselect'; locale?: string; media?: StudioMedia[]; formEndpoint?: string | null } = {}): ManagedSiteBlueprintV1 {
  const soft = options.brand === 'jselect'
  const brandName = soft ? 'J. SELECT' : 'ÉCLAT'
  const section = (sectionId: string, kind: ManagedSiteBlueprintSectionV1['kind'], heading: string, body: string, ctaHref: string | null = null, ctaLabel: string | null = null): ManagedSiteBlueprintSectionV1 => ({ sectionId, kind, heading, body, ctaHref, ctaLabel, moduleKey: null, formEndpoint: null })
  const form: ManagedSiteBlueprintSectionV1 = { ...section('module-contact-lead-capture', 'contact_form', 'A conversation, just for you.', ''), moduleKey: 'contact_lead_capture', formEndpoint: options.formEndpoint || null }
  return {
    schemaVersion: 'managed-site-blueprint-v1', customerSitePreset: 'atelier', brandName, locale: options.locale || 'en', siteType: 'brand_blog',
    studioPresentation: {
      version: 'studio-presentation-v1', renderer: 'brand-studio-v2', media: options.media || [],
      chrome: EN_STUDIO_CHROME,
      design: { ...DEFAULT_STUDIO_DESIGN, layout: soft ? 'showcase' : 'editorial', canvas: soft ? '#fbf4ef' : '#f5f1ea', surface: soft ? '#f5e6df' : '#eee7dd', accent: soft ? '#914f5b' : '#76384b', motion: 'reveal', tuning: { ...DEFAULT_STUDIO_TUNING, navigation: 'sticky' } },
    },
    navigation: [{ route: '/', label: 'Home' }, { route: '/about', label: 'Our story' }, { route: '/services', label: 'The collection' }, { route: '/faq', label: 'Questions' }, { route: '/contact', label: 'Contact' }],
    pages: [
      { pageKey: 'home', route: '/', title: soft ? 'Les jours en fleurs.' : 'Quietly, powerful.', description: soft ? 'A softer kind of everyday. Thoughtful little pieces for the moments that are entirely your own.' : 'Jewellery and you. Each with a presence of its own, quietly bringing out the best in the other.', sections: [
        section('home-hero', 'hero', 'Welcome', 'Synthetic brand preview.', '/services', soft ? 'Find your everyday favourites' : 'Explore The Essence'),
        section('home-summary', 'summary', soft ? 'Lovely little things.' : 'Objects of quiet desire.', soft ? 'From the first light of morning to a quiet evening at home. A considered edit of the little things you love.' : 'A curve, a silhouette, a familiar gesture. Discover the pieces that feel like an extension of you.'),
        section('home-offer', 'services', soft ? 'Beautiful things. Honest little stories.' : 'Small objects. Lasting presence.', soft ? 'There is room for softness in the everyday. Get to know the shapes, textures and details in our considered collection.' : 'Come closer. Explore the sculptural forms and considered details that give each piece its own quiet character.', '/about', soft ? 'Meet J. SELECT' : 'Inside the studio'),
        section('home-journey', 'summary', 'Find your own way.', 'Explore the collection\nLearn about the details\nAsk us a question'),
        section('home-contact', 'contact', soft ? 'A moment, just for you.' : 'For the woman you are.', 'Tell us what caught your eye. We would love to hear from you.', '/contact', 'Start a conversation'),
      ] },
      { pageKey: 'about', route: '/about', title: soft ? 'A note from J.' : 'Presence, in every detail.', description: 'An introduction to the ideas behind our collection. This local example uses fixed sample copy, not AI-generated business facts.', sections: [
        section('about-story', 'about', soft ? 'A softer point of view.' : 'She wears herself.', 'We invite you to discover the collection in your own way. The story begins with the details that feel personal to you.'),
        section('about-contact', 'contact', 'Let us introduce ourselves.', 'A question, a detail, a new idea. Start a conversation.', '/contact', 'Contact the studio'),
      ] },
      { pageKey: 'services', route: '/services', title: soft ? 'The everyday edit.' : 'The considered edit.', description: 'Explore the brand and ask about the pieces that speak to you. This is a catalogue introduction, not an activated online checkout.', sections: [
        section('services-offer', 'services', 'A closer look.', 'Discover the collection through its forms and details. Ask the studio for current specifications, availability and purchasing options.', '/contact', 'Enquire about the collection'),
      ] },
      { pageKey: 'faq', route: '/faq', title: 'A few things to know.', description: 'Answers to questions about this sample brand website.', sections: [] },
      { pageKey: 'contact', route: '/contact', title: 'A conversation, just for you.', description: 'Tell us what you would like to know. The form in the local QA environment stores no customer data and sends no email.', sections: [form] },
    ],
    faq: [{ question: 'Can I ask about a piece?', answer: 'Use the contact page to send the studio your question.' }, { question: 'Can I buy through this example?', answer: 'No. This is a local design and form acceptance fixture. Checkout and payment are not enabled.' }],
    selectedModulePlacements: [{ moduleKey: 'contact_lead_capture', pageKey: 'contact', sectionId: form.sectionId, mode: 'first_party' }],
    seoGeo: { summaryAnswer: soft ? 'A considered edit for a softer kind of everyday.' : 'Quietly, powerful. A considered perspective on everyday jewellery.', canonicalPlaceholder: '', organizationName: brandName, evidenceLimitations: ['SYNTHETIC_LOCAL_QA_ONLY'], structuredDataKinds: ['Organization', 'FAQPage'] },
    provenance: { evidenceSnapshotHash: 'a'.repeat(64), authoritySourceIds: [], providerContentHash: 'b'.repeat(64) },
  }
}
