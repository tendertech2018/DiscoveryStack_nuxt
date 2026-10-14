/** Free/manual onboarding defaults. The model supplies and persists native-language dialogue for other languages. */
export function intakeCopy(language: string) {
  const copies: Record<string, [string, string, string, string, string, string]> = {
    en: ['Your brief is ready. Review it or generate your website proposal.', 'Tell me about your business. I will only ask for missing details.', 'What is your brand called?', 'What do you offer?', 'Who are your main customers?', 'Should visitors buy, book, contact you, or get to know your brand?'],
    zh: ['重點已整理好，可以檢查資料或產生網站提案。', '告訴我你的生意，我只會補問還缺的重點。', '你的品牌叫什麼名字？', '你提供什麼商品或服務？', '主要想服務哪些客人？', '最希望客人購買、預約、聯絡你，還是認識品牌？'],
    ja: ['必要な情報が揃いました。内容を確認して、サイト案を作成できます。', 'あなたのビジネスについて教えてください。不足している情報だけを伺います。', 'ブランド名を教えてください。', 'どのような商品やサービスを提供していますか？', '主なお客様はどのような方ですか？', '購入、予約、お問い合わせ、ブランド紹介のうち、主な目的はどれですか？'],
    ko: ['필요한 정보가 준비되었습니다. 내용을 확인하고 웹사이트 제안을 만들어 보세요.', '비즈니스를 소개해 주세요. 부족한 정보만 질문하겠습니다.', '브랜드 이름은 무엇인가요?', '어떤 제품이나 서비스를 제공하나요?', '주요 고객은 누구인가요?', '구매, 예약, 문의, 브랜드 소개 중 가장 중요한 목표는 무엇인가요?'],
    fr: ['Votre brief est prêt. Vérifiez les informations ou créez votre proposition de site.', 'Présentez votre activité. Je ne demanderai que les informations manquantes.', 'Quel est le nom de votre marque ?', 'Quels produits ou services proposez-vous ?', 'Qui sont vos principaux clients ?', 'Votre priorité : acheter, réserver, vous contacter ou découvrir la marque ?'],
    de: ['Ihr Briefing ist bereit. Prüfen Sie die Angaben oder erstellen Sie Ihren Website-Entwurf.', 'Erzählen Sie von Ihrem Unternehmen. Ich frage nur nach fehlenden Angaben.', 'Wie heißt Ihre Marke?', 'Welche Produkte oder Leistungen bieten Sie an?', 'Wer sind Ihre wichtigsten Kunden?', 'Sollen Besucher kaufen, buchen, Kontakt aufnehmen oder Ihre Marke kennenlernen?'],
    es: ['Tu información está lista. Revísala o genera la propuesta de tu web.', 'Cuéntame sobre tu negocio. Solo preguntaré lo que falte.', '¿Cómo se llama tu marca?', '¿Qué productos o servicios ofreces?', '¿Quiénes son tus principales clientes?', '¿Quieres que compren, reserven, te contacten o conozcan tu marca?'],
    pt: ['As informações estão prontas. Revise-as ou gere a proposta do site.', 'Conte sobre seu negócio. Perguntarei apenas o que falta.', 'Qual é o nome da sua marca?', 'Quais produtos ou serviços você oferece?', 'Quem são seus principais clientes?', 'O objetivo é comprar, agendar, entrar em contato ou conhecer a marca?'],
    ar: ['المعلومات جاهزة. راجعها أو أنشئ مقترح موقعك.', 'أخبرني عن نشاطك. سأسأل فقط عن المعلومات الناقصة.', 'ما اسم علامتك؟', 'ما المنتجات أو الخدمات التي تقدمها؟', 'من هم عملاؤك الرئيسيون؟', 'هل الهدف هو الشراء أم الحجز أم التواصل أم التعرف إلى العلامة؟'],
    hi: ['ज़रूरी जानकारी तैयार है। इसे जाँचें या अपनी वेबसाइट का प्रस्ताव बनाएँ।', 'अपने व्यवसाय के बारे में बताएँ। मैं केवल छूटी हुई जानकारी पूछूँगा।', 'आपके ब्रांड का नाम क्या है?', 'आप कौन से उत्पाद या सेवाएँ देते हैं?', 'आपके मुख्य ग्राहक कौन हैं?', 'मुख्य लक्ष्य खरीदारी, बुकिंग, संपर्क या ब्रांड की जानकारी देना है?'],
  }
  const [ready, start, brandName, offer, audience, goal] = copies[language.split('-')[0]!] || copies.en!
  return { ready, start, questions: { brandName, offer, audience, goal } }
}
