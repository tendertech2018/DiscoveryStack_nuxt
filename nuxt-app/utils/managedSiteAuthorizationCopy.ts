/** Same scope as managed-site-funnel-consent-v1. Prices and domain authority stay server-owned. */
const zh = [
  '我確認自己有權提供本流程中的品牌名稱、文字、圖片、網址、聯絡資料及其他內容，並授權網站建置團隊為製作示意預覽、建立網站、提供報價與安排付款而處理這些資料。',
  '我了解示意預覽只是討論方向的草稿，不代表最終交付內容；正式網站會依已確認的方案、功能與素材製作。若我提供第三方素材，我會先取得必要的使用權。',
  '我了解網站分析只檢查可公開讀取的首頁線索，不是完整稽核，也不保證搜尋排名、流量、詢問、成交或營收結果。',
  '我了解人工設定模組會依報價收費，付款後由團隊安排設定，完成前不會顯示為已開通；即將推出模組只登記需求，本次不開通也不收費。新網域會在付款確認後再次確認可註冊狀態，自動代為註冊、連接網站並設定 HTTPS；付款前的查詢不代表已取得網域。若網域已被他人註冊或價格超出同意範圍，會停止採購並顯示待處理狀態，不會替換名稱或自行加價。',
  '我同意團隊可使用我提供的聯絡 Email 傳送付款、網站建置進度及必要的服務通知。未經另行同意，不會把這項授權解讀為接收其他行銷訊息的同意。',
  '我會在付款前再次確認伺服器提供的費用明細、每月費用、網域年費與後續收費方式。如資料或需求有變，我會在確認付款前提出。',
]
const en = [
  'I have the rights to provide the brand names, text, images, URLs, contact information and other content in this application. I authorise the website team to process them for previews, website creation, quotations and payment arrangements. Third-party materials require the necessary permission.',
  'A concept preview is a draft for discussion, not the final delivery. The delivered website uses the approved plan, functionality and materials. Public homepage analysis is not a complete audit and does not guarantee rankings, traffic, enquiries, sales or revenue.',
  'Manual-setup modules are charged according to the quotation and arranged after payment. They are not shown as active before completion. Coming-soon modules record interest only and are neither activated nor charged in this order.',
  'A new domain is checked again after payment before registration, connection and HTTPS setup. An availability check does not reserve it. If the name is unavailable or the price exceeds the authorised limit, procurement stops for review. No replacement name or price increase is automatically accepted.',
  'The contact email may receive payment, build progress and essential service notifications. This authorisation does not include marketing without separate consent.',
  'Before payment I will review the server-provided itemised price, monthly fees, annual domain fees and recurring charges, and report any changes to my details or requirements.',
]
const translations: Record<string, readonly string[]> = {
  zh, en,
  fr: [
    'Je dispose des droits nécessaires sur les noms de marque, textes, images, URL, coordonnées et autres éléments fournis. J’autorise l’équipe à les traiter pour les aperçus, la création du site, les devis et l’organisation des paiements. Les éléments de tiers nécessitent leur autorisation.',
    'Un aperçu conceptuel est un brouillon de discussion, pas la livraison finale. Le site livré suit l’offre, les fonctions et les éléments approuvés. L’analyse publique de la page d’accueil n’est pas un audit complet et ne garantit ni classement, ni trafic, ni demandes, ni ventes, ni revenus.',
    'Les modules à configuration manuelle sont facturés selon le devis et configurés après paiement. Ils ne sont pas indiqués comme actifs avant leur achèvement. Les modules à venir enregistrent seulement un intérêt : ils ne sont ni activés ni facturés dans cette commande.',
    'La disponibilité du domaine est revérifiée après paiement, avant son enregistrement, sa connexion et la configuration HTTPS. Une vérification ne réserve pas le domaine. Si le nom est indisponible ou le prix dépasse le plafond autorisé, l’achat est suspendu pour examen. Aucun autre nom ni surcoût n’est accepté automatiquement.',
    'Mon e-mail peut recevoir les notifications de paiement, de progression et de service indispensables. Cette autorisation n’inclut pas de marketing sans consentement distinct.',
    'Avant de payer, je vérifierai le devis détaillé fourni par le serveur, les frais mensuels, annuels de domaine et récurrents, et signalerai tout changement de coordonnées ou de besoins.',
  ],
  de: [
    'Ich besitze die erforderlichen Rechte an den bereitgestellten Markennamen, Texten, Bildern, URLs, Kontaktdaten und anderen Inhalten. Ich erlaube dem Website-Team deren Verarbeitung für Vorschauen, Website-Erstellung, Angebote und Zahlungsabwicklung. Material Dritter benötigt die entsprechende Erlaubnis.',
    'Eine Konzeptvorschau ist ein Diskussionsentwurf, keine endgültige Lieferung. Die Website folgt dem bestätigten Paket, den Funktionen und Materialien. Die Analyse öffentlich zugänglicher Startseitensignale ist kein vollständiges Audit und garantiert keine Rankings, Besucher, Anfragen, Verkäufe oder Einnahmen.',
    'Manuell einzurichtende Module werden laut Angebot berechnet und nach Zahlung eingerichtet. Vor Abschluss gelten sie nicht als aktiv. Geplante Module erfassen nur Interesse und werden in dieser Bestellung weder aktiviert noch berechnet.',
    'Die Domainverfügbarkeit wird nach Zahlung vor Registrierung, Verbindung und HTTPS-Einrichtung erneut geprüft. Eine Prüfung reserviert die Domain nicht. Ist der Name vergeben oder der Preis höher als genehmigt, wird der Kauf zur Prüfung angehalten. Ersatznamen oder Mehrkosten werden nicht automatisch akzeptiert.',
    'Meine Kontakt-E-Mail darf Zahlungs-, Fortschritts- und notwendige Servicemitteilungen erhalten. Marketing erfordert eine gesonderte Zustimmung.',
    'Vor der Zahlung prüfe ich die serverseitige Preisaufstellung, Monatsgebühren, jährlichen Domainkosten und wiederkehrenden Gebühren und melde Änderungen meiner Angaben oder Anforderungen.',
  ],
  es: [
    'Tengo los derechos necesarios sobre las marcas, textos, imágenes, URL, datos de contacto y demás contenido proporcionado. Autorizo al equipo a procesarlos para vistas previas, creación del sitio, presupuestos y gestión del pago. El material de terceros requiere su permiso.',
    'Una vista previa conceptual es un borrador para discutir, no la entrega final. El sitio entregado seguirá el plan, las funciones y los materiales aprobados. El análisis público de la página inicial no es una auditoría completa ni garantiza posiciones, tráfico, consultas, ventas o ingresos.',
    'Los módulos de configuración manual se cobran según el presupuesto y se configuran tras el pago. No se muestran como activos antes de completarse. Los módulos futuros solo registran interés y no se activan ni cobran en este pedido.',
    'El dominio se vuelve a comprobar después del pago, antes de registrarlo, conectarlo y configurar HTTPS. Consultarlo no lo reserva. Si el nombre no está disponible o el precio supera el límite autorizado, la compra se detiene para revisión. No se aceptan automáticamente nombres alternativos ni aumentos.',
    'Mi correo puede recibir avisos de pago, progreso y servicio esenciales. Esta autorización no incluye marketing sin consentimiento separado.',
    'Antes de pagar, revisaré el desglose del servidor, las cuotas mensuales, el dominio anual y los cargos recurrentes, e informaré de cambios en mis datos o requisitos.',
  ],
  pt: [
    'Tenho os direitos necessários sobre marcas, textos, imagens, URLs, dados de contato e demais conteúdos fornecidos. Autorizo a equipe a processá-los para prévias, criação do site, orçamentos e organização de pagamentos. Materiais de terceiros exigem a devida permissão.',
    'Uma prévia conceitual é um rascunho para discussão, não a entrega final. O site entregue segue o plano, as funções e os materiais aprovados. A análise da página inicial pública não é uma auditoria completa nem garante posições, tráfego, contatos, vendas ou receita.',
    'Módulos de configuração manual são cobrados conforme o orçamento e configurados após o pagamento. Não aparecem como ativos antes da conclusão. Módulos futuros apenas registram interesse e não são ativados nem cobrados neste pedido.',
    'O domínio é verificado novamente após o pagamento, antes do registro, conexão e configuração HTTPS. A consulta não reserva o domínio. Se o nome não estiver disponível ou o preço exceder o limite autorizado, a compra é suspensa para análise. Nenhum nome alternativo ou aumento é aceito automaticamente.',
    'Meu e-mail pode receber avisos de pagamento, progresso e serviço essenciais. Marketing exige consentimento separado.',
    'Antes de pagar, revisarei os valores detalhados pelo servidor, mensalidades, taxas anuais do domínio e cobranças recorrentes, e comunicarei alterações dos meus dados ou requisitos.',
  ],
  ja: [
    '提供するブランド名、文章、画像、URL、連絡先などに必要な権利を有し、プレビュー、サイト制作、見積もり、支払い手配のために制作チームが処理することを許可します。第三者の素材には必要な使用許可を取得します。',
    'コンセプトプレビューは検討用の草案であり、最終納品ではありません。納品サイトは承認済みのプラン、機能、素材に基づきます。公開トップページの分析は完全な監査ではなく、検索順位、訪問数、問い合わせ、売上、収益を保証しません。',
    '手動設定モジュールは見積もりに従って課金され、支払い後に設定されます。完了前に有効とは表示されません。近日提供予定の機能は希望を記録するだけで、この注文では有効化も課金もしません。',
    '新規ドメインは支払い後、登録、接続、HTTPS設定の前に取得可否を再確認します。照会だけでは予約されません。取得不可または承認額を超える場合は購入を停止して確認します。別の名前や値上げを自動承認することはありません。',
    '連絡用メールには支払い、制作進捗、必要なサービス通知が届くことに同意します。別途同意のないマーケティングは含みません。',
    '支払い前にサーバーが提示する料金明細、月額料金、ドメイン年額料金、継続課金を確認し、情報や要望の変更を申告します。',
  ],
  ko: [
    '제공한 브랜드명, 문구, 이미지, URL, 연락처 등에 필요한 권리를 보유하고 있으며, 미리보기, 웹사이트 제작, 견적 및 결제 준비를 위한 처리를 허용합니다. 제삼자 자료에는 필요한 사용 허가를 받습니다.',
    '콘셉트 미리보기는 논의용 초안이며 최종 납품이 아닙니다. 납품 사이트는 승인된 요금제, 기능 및 자료를 따릅니다. 공개 홈페이지 분석은 전체 감사가 아니며 검색 순위, 방문, 문의, 판매 또는 수익을 보장하지 않습니다.',
    '수동 설정 모듈은 견적에 따라 과금하고 결제 후 설정합니다. 완료 전에는 활성화로 표시하지 않습니다. 출시 예정 모듈은 관심만 기록하며 이 주문에서 활성화하거나 과금하지 않습니다.',
    '새 도메인은 결제 후 등록, 연결 및 HTTPS 설정 전에 다시 확인합니다. 조회만으로 도메인이 예약되지 않습니다. 이름이 없거나 가격이 승인 한도를 넘으면 구매를 중단하고 검토합니다. 다른 이름이나 추가 금액을 자동 승인하지 않습니다.',
    '연락 이메일로 결제, 제작 진행 및 필수 서비스 알림을 받는 데 동의합니다. 별도 동의 없는 마케팅은 포함되지 않습니다.',
    '결제 전 서버가 제공한 상세 가격, 월 요금, 연간 도메인 요금 및 반복 청구를 확인하고 정보나 요구 사항의 변경을 알리겠습니다.',
  ],
  ar: [
    'أملك الحقوق اللازمة للأسماء التجارية والنصوص والصور والروابط وبيانات التواصل والمحتوى الذي أقدمه. أفوّض فريق الموقع بمعالجتها للمعاينات وإنشاء الموقع وعروض الأسعار وترتيبات الدفع. تتطلب مواد الجهات الأخرى الإذن المناسب.',
    'المعاينة الأولية مسودة للنقاش وليست التسليم النهائي. يتبع الموقع المسلّم الخطة والوظائف والمواد المعتمدة. تحليل الصفحة الرئيسية العامة ليس تدقيقًا شاملًا ولا يضمن ترتيب البحث أو الزيارات أو الاستفسارات أو المبيعات أو الإيرادات.',
    'تُحتسب الوحدات ذات الإعداد اليدوي وفق العرض وتُجهّز بعد الدفع، ولا تُعرض كمفعّلة قبل اكتمالها. الوحدات القادمة تسجّل الاهتمام فقط ولا تُفعّل ولا تُحتسب في هذا الطلب.',
    'يُفحص النطاق مجددًا بعد الدفع قبل التسجيل والربط وإعداد HTTPS. فحص التوفر لا يحجز النطاق. إذا لم يتوفر الاسم أو تجاوز السعر الحد المصرّح به، تتوقف عملية الشراء للمراجعة. لا يُقبل تلقائيًا اسم بديل أو زيادة سعر.',
    'يمكن استخدام بريدي لإشعارات الدفع وتقدم الإنشاء والخدمة الضرورية. لا يشمل هذا التفويض التسويق دون موافقة منفصلة.',
    'قبل الدفع سأراجع التفاصيل السعرية الصادرة عن الخادم والرسوم الشهرية والسنوية للنطاق والرسوم المتكررة، وأبلغ عن أي تغيير في بياناتي أو متطلباتي.',
  ],
  hi: [
    'दिए गए ब्रांड नाम, पाठ, चित्र, URL, संपर्क विवरण और अन्य सामग्री के आवश्यक अधिकार मेरे पास हैं। पूर्वावलोकन, वेबसाइट निर्माण, कोटेशन और भुगतान व्यवस्था के लिए टीम को उनका उपयोग करने की अनुमति है। तीसरे पक्ष की सामग्री के लिए आवश्यक अनुमति ली जाएगी।',
    'प्रारंभिक पूर्वावलोकन चर्चा का मसौदा है, अंतिम डिलीवरी नहीं। वेबसाइट स्वीकृत योजना, सुविधाओं और सामग्री के अनुसार बनेगी। सार्वजनिक होमपेज विश्लेषण पूर्ण ऑडिट नहीं है और रैंकिंग, ट्रैफ़िक, पूछताछ, बिक्री या आय की गारंटी नहीं देता।',
    'मैनुअल सेटअप मॉड्यूल का शुल्क कोटेशन के अनुसार है और भुगतान के बाद सेटअप होगा। पूरा होने से पहले उन्हें सक्रिय नहीं दिखाया जाएगा। आगामी मॉड्यूल केवल रुचि दर्ज करते हैं; इस ऑर्डर में न सक्रिय होंगे न उनका शुल्क लगेगा।',
    'भुगतान के बाद पंजीकरण, कनेक्शन और HTTPS सेटअप से पहले डोमेन फिर जाँचा जाएगा। जाँच से डोमेन आरक्षित नहीं होता। नाम अनुपलब्ध होने या कीमत अधिकृत सीमा से बढ़ने पर खरीद समीक्षा के लिए रुकेगी। वैकल्पिक नाम या अधिक कीमत स्वतः स्वीकार नहीं होगी।',
    'संपर्क ईमेल पर भुगतान, निर्माण प्रगति और आवश्यक सेवा सूचनाएँ भेजी जा सकती हैं। अलग सहमति के बिना मार्केटिंग शामिल नहीं है।',
    'भुगतान से पहले सर्वर द्वारा दिया गया मूल्य विवरण, मासिक शुल्क, वार्षिक डोमेन शुल्क और आवर्ती भुगतान जाँचूँगा और विवरण या आवश्यकताओं में बदलाव बताऊँगा।',
  ],
}
export function studioAuthorizationCopy(language: string): readonly string[] { return translations[language.toLowerCase().split('-')[0]!] || en }

export const STUDIO_AUTHORIZATION_VERSION = 'managed-site-funnel-consent-v1'
export const STUDIO_DOMAIN_AUTHORIZATION_VERSION = 'funnel-domain-registration-delegation-v1'
const domainTerms: Record<string, string> = {
  en: 'After verified payment, I authorise DiscoveryStack to register the chosen domain for one year within the approved price limit through the platform-managed registrar account, use the registrant details I supply, and configure DNS and the website connection. No unapproved fees may be added. I will complete the registrar’s email verification.',
  fr: 'Après confirmation du paiement, j’autorise DiscoveryStack à enregistrer le domaine choisi pour un an, dans la limite du prix approuvé, via le compte de registraire géré par la plateforme, à utiliser mes coordonnées de titulaire et à configurer le DNS et la connexion au site. Aucun frais non accepté ne sera ajouté. Je terminerai la vérification e-mail du registraire.',
  de: 'Nach bestätigter Zahlung autorisiere ich DiscoveryStack, die gewählte Domain für ein Jahr innerhalb des genehmigten Preislimits über das von der Plattform verwaltete Registrarkonto zu registrieren, meine Registrierungsdaten zu verwenden und DNS sowie Website-Verbindung einzurichten. Nicht genehmigte Gebühren dürfen nicht hinzukommen. Ich schließe die E-Mail-Verifizierung des Registrars ab.',
  es: 'Tras confirmar el pago, autorizo a DiscoveryStack a registrar el dominio elegido durante un año dentro del precio aprobado, mediante la cuenta del registrador gestionada por la plataforma, a usar mis datos de titular y configurar DNS y la conexión al sitio. No se añadirán cargos no aceptados. Completaré la verificación de correo del registrador.',
  pt: 'Após a confirmação do pagamento, autorizo a DiscoveryStack a registrar o domínio escolhido por um ano dentro do limite aprovado, pela conta de registrador gerenciada pela plataforma, usando meus dados de titular e configurando DNS e a conexão ao site. Nenhuma taxa não aprovada será adicionada. Concluirei a verificação de e-mail do registrador.',
  ja: '支払い確認後、承認済み料金上限内で、プラットフォーム管理の登録事業者アカウントを通じて選択したドメインを1年間登録し、提供した登録者情報を使用してDNSとサイト接続を設定することをDiscoveryStackに委任します。未同意の追加料金は認めません。登録事業者のメール認証を完了します。',
  ko: '결제 확인 후 승인된 가격 한도 내에서 플랫폼이 관리하는 등록기관 계정으로 선택한 도메인을 1년간 등록하고, 제공한 등록자 정보를 사용하여 DNS와 사이트 연결을 설정하도록 DiscoveryStack에 위임합니다. 동의하지 않은 추가 요금은 허용하지 않습니다. 등록기관의 이메일 인증을 완료하겠습니다.',
  ar: 'بعد تأكيد الدفع، أفوّض DiscoveryStack بتسجيل النطاق المختار لمدة سنة ضمن السعر المعتمد عبر حساب المسجّل الذي تديره المنصة، واستخدام بيانات التسجيل التي أقدمها وإعداد DNS وربط الموقع. لا تُضاف رسوم غير موافق عليها. سأكمل التحقق بالبريد الإلكتروني الذي يطلبه المسجّل.',
  hi: 'भुगतान की पुष्टि के बाद, स्वीकृत कीमत की सीमा में प्लेटफ़ॉर्म-प्रबंधित पंजीयक खाते से चुना गया डोमेन एक वर्ष के लिए पंजीकृत करने, मेरे दिए पंजीयक विवरण इस्तेमाल करने और DNS तथा वेबसाइट कनेक्शन स्थापित करने की अनुमति DiscoveryStack को देता हूँ। बिना स्वीकृति कोई अतिरिक्त शुल्क नहीं लगेगा। मैं पंजीयक का ईमेल सत्यापन पूरा करूँगा।',
}
export function studioDomainAuthorizationCopy(language: string, canonical: string): string { return language.startsWith('zh') ? canonical : domainTerms[language.toLowerCase().split('-')[0]!] || domainTerms.en! }
