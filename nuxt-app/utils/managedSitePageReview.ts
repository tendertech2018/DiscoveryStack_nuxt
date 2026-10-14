import { normalizeSiteLanguage } from './managedSiteLanguage'

export type PageReviewCode = 'contact_fields_missing' | 'no_visible_content' | 'search_excluded' | 'no_primary_action' | 'booking_is_inquiry' | 'scheduled_content'
export type ManagedSitePageReview = {
  schemaVersion: 'managed-site-page-review-v1'
  pageId: string
  pageVersion: number
  pageFingerprint: string
  artifactFingerprint: string
  locale: string
  reviewedAt: string
  technicalStatus: 'passed' | 'blocked'
  findings: Array<{ code: PageReviewCode; severity: 'warning' | 'blocking'; blockId: string | null }>
  checked: readonly ['document_integrity', 'media_authority', 'responsive_definitions', 'contact_field_contract']
  unverified: readonly ['business_fact_accuracy', 'browser_mobile_desktop', 'external_link_availability', 'live_form_delivery', 'citation_performance']
  comparison: null | {
    fromVersion: number
    toVersion: number
    beforeFingerprint: string
    afterFingerprint: string
    seoChanged: boolean
    designChanged: boolean
    changes: Array<{ blockId: string; kind: 'added' | 'removed' | 'updated' | 'moved'; before: string | null; after: string | null }>
  }
  fingerprint: string
}

function defaultPageReviewCopy(locale: string) {
  const chinese = /^zh(?:-|$)/iu.test(locale)
  return chinese ? {
    title: '發布前檢查與版本對照', check: '檢查這個版本', checking: '檢查中…', passed: '程式檢查通過，仍需確認實際效果', blocked: '有問題需要先修正', error: '檢查未完成。請確認圖片可公開使用，重新載入後再試。',
    checked: '已檢查版本完整性、圖片權限、響應式設定及表單欄位。', limits: '尚未實測：手機／電腦畫面、外部連結、表單收件、品牌事實與 AI 引用成效。這不是流量或引用率預測。',
    comparison: '與儲存版本比較', initial: '這是第一個儲存版本，尚無前一版可比。', unchanged: '此區塊沒有文字變更；請查看版面、顯示條件或圖片。', before: '之前', after: '現在', metadata: '頁面標題、描述或搜尋設定有變更', design: '版面設計設定有變更',
    added: '新增', removed: '移除', updated: '修改', moved: '移動',
    contact_fields_missing: '聯絡表單需包含姓名、Email 與留言，否則無法送出。', no_visible_content: '目前沒有可顯示的內容，請檢查顯示時間與區塊。', search_excluded: '此頁被設定為不收錄，不會加入 AI 閱讀檔。', no_primary_action: '目前沒有主要連結或聯絡方式，請確認訪客下一步要做什麼。', booking_is_inquiry: '預約區塊只收集詢問，不代表已確認時段或已付款。', scheduled_content: '部分內容有排程，實際發布時會重新檢查顯示時間。',
  } : {
    title: 'Pre-publication review and changes', check: 'Check this version', checking: 'Checking…', passed: 'Technical checks passed; review the real experience', blocked: 'Fix the blocking issue before publishing', error: 'Review could not finish. Check that images are approved for public use, then reload and retry.',
    checked: 'Checked document integrity, media authority, responsive definitions and contact fields.', limits: 'Not verified: desktop/mobile rendering, external links, form delivery, business facts or AI citations. This is not a traffic or citation prediction.',
    comparison: 'Compared with saved version', initial: 'This is the first saved version; there is no previous version to compare.', unchanged: 'No text change in this block; inspect layout, visibility or images.', before: 'Before', after: 'After', metadata: 'Page title, description or search settings changed', design: 'Design settings changed',
    added: 'Added', removed: 'Removed', updated: 'Updated', moved: 'Moved',
    contact_fields_missing: 'The contact form needs name, email and message fields to submit.', no_visible_content: 'No content is currently visible. Check block visibility and schedules.', search_excluded: 'This page is excluded from indexing and AI reading files.', no_primary_action: 'There is no primary link or contact action. Decide what visitors should do next.', booking_is_inquiry: 'Booking collects an inquiry only; it does not confirm a time slot or payment.', scheduled_content: 'Some content is scheduled. Visibility will be rechecked at publication time.',
  }
}

const localized = {
  fr: ['Vérification avant publication', 'Vérifier cette version', 'Vérification…', 'Contrôles techniques réussis ; vérifiez l’expérience réelle', 'Corrigez le problème bloquant', 'Vérification impossible. Vérifiez les droits des images, rechargez et réessayez.', 'Intégrité, droits des images, règles adaptatives et champs du formulaire vérifiés.', 'Non vérifiés : affichage mobile/ordinateur, liens externes, réception du formulaire, faits et citations IA. Aucune prévision de trafic.', 'Comparaison avec la version enregistrée', 'Première version : aucune version précédente.', 'Texte identique ; vérifiez la mise en page, la visibilité ou les images.', 'Avant', 'Après', 'Titre, description ou paramètres de recherche modifiés', 'Paramètres visuels modifiés', 'Ajout', 'Suppression', 'Modification', 'Déplacement', 'Le formulaire doit contenir nom, e-mail et message.', 'Aucun contenu visible. Vérifiez les horaires et les blocs.', 'Page exclue de l’indexation et des fichiers de lecture IA.', 'Aucune action principale. Définissez la prochaine étape du visiteur.', 'La réservation est une demande, pas une confirmation ni un paiement.', 'Le contenu planifié sera vérifié de nouveau à la publication.'],
  ja: ['公開前チェックと変更比較', 'このバージョンを確認', '確認中…', '技術チェック完了。実際の体験を確認してください', '公開前に問題を修正してください', '確認できません。画像の公開権限を確認して再試行してください。', '文書の整合性、画像の権限、レスポンシブ設定、フォーム項目を確認しました。', '画面表示、外部リンク、フォーム受信、事実、AI 引用は未検証です。流入予測ではありません。', '保存バージョンと比較', '最初の保存バージョンです。比較対象はありません。', '文章は同じです。配置、表示条件、画像を確認してください。', '変更前', '変更後', 'タイトル、説明、検索設定に変更あり', 'デザイン設定に変更あり', '追加', '削除', '変更', '移動', 'フォームには氏名、メール、メッセージが必要です。', '表示される内容がありません。表示設定を確認してください。', '検索と AI 読み取りファイルから除外されています。', '主なアクションがありません。訪問者の次の行動を決めてください。', '予約は問い合わせのみで、日時確定や支払いではありません。', '予約表示の内容は公開時に再確認されます。'],
  ko: ['게시 전 검토 및 변경 비교', '이 버전 확인', '확인 중…', '기술 점검 통과. 실제 경험을 확인하세요', '게시 전 차단 문제를 수정하세요', '확인하지 못했습니다. 이미지 공개 권한을 확인하고 다시 시도하세요.', '문서 무결성, 이미지 권한, 반응형 설정 및 양식 필드를 확인했습니다.', '화면, 외부 링크, 양식 수신, 사실 및 AI 인용은 미검증입니다. 트래픽 예측이 아닙니다.', '저장된 버전과 비교', '첫 저장 버전입니다. 이전 버전이 없습니다.', '텍스트 변경 없음. 배치, 표시 조건 또는 이미지를 확인하세요.', '이전', '이후', '제목, 설명 또는 검색 설정 변경', '디자인 설정 변경', '추가', '삭제', '수정', '이동', '양식에는 이름, 이메일, 메시지가 필요합니다.', '표시할 내용이 없습니다. 표시 조건을 확인하세요.', '검색 및 AI 읽기 파일에서 제외된 페이지입니다.', '주요 행동이 없습니다. 방문자의 다음 단계를 정하세요.', '예약 문의만 수집하며 시간 확정이나 결제가 아닙니다.', '예약된 콘텐츠는 게시 시 다시 확인됩니다.'],
  de: ['Prüfung vor Veröffentlichung', 'Diese Version prüfen', 'Wird geprüft…', 'Technische Prüfungen bestanden; tatsächliche Nutzung prüfen', 'Blockierendes Problem zuerst beheben', 'Prüfung fehlgeschlagen. Bildrechte prüfen, neu laden und wiederholen.', 'Dokumentintegrität, Bildrechte, responsive Regeln und Formularfelder geprüft.', 'Nicht geprüft: Bildschirmdarstellung, externe Links, Formularzustellung, Fakten und KI-Zitate. Keine Verkehrsprognose.', 'Vergleich mit gespeicherter Version', 'Erste gespeicherte Version; kein Vergleich verfügbar.', 'Text unverändert; Layout, Sichtbarkeit oder Bilder prüfen.', 'Vorher', 'Nachher', 'Titel, Beschreibung oder Sucheinstellungen geändert', 'Design-Einstellungen geändert', 'Hinzugefügt', 'Entfernt', 'Geändert', 'Verschoben', 'Das Formular benötigt Name, E-Mail und Nachricht.', 'Keine sichtbaren Inhalte. Sichtbarkeit und Zeitplan prüfen.', 'Seite ist von Indexierung und KI-Lesedateien ausgeschlossen.', 'Keine Hauptaktion. Nächsten Besucherschritt festlegen.', 'Buchung erfasst nur eine Anfrage, keine Termin- oder Zahlungsbestätigung.', 'Geplante Inhalte werden bei Veröffentlichung erneut geprüft.'],
  es: ['Revisión antes de publicar', 'Revisar esta versión', 'Revisando…', 'Comprobaciones técnicas superadas; revisa la experiencia real', 'Corrige el problema que bloquea la publicación', 'No se pudo revisar. Comprueba los permisos de las imágenes y reintenta.', 'Integridad, permisos de imágenes, reglas adaptativas y campos comprobados.', 'Sin verificar: pantallas, enlaces externos, recepción del formulario, hechos y citas IA. No es una predicción de tráfico.', 'Comparación con versión guardada', 'Primera versión guardada; no hay una anterior.', 'Texto sin cambios; revisa diseño, visibilidad o imágenes.', 'Antes', 'Después', 'Cambios en título, descripción o búsqueda', 'Diseño modificado', 'Añadido', 'Eliminado', 'Modificado', 'Movido', 'El formulario requiere nombre, correo y mensaje.', 'Sin contenido visible. Comprueba bloques y horarios.', 'Página excluida del índice y de los archivos de lectura IA.', 'No hay acción principal. Define el siguiente paso del visitante.', 'La reserva solo recoge una consulta, no confirma hora ni pago.', 'El contenido programado se volverá a comprobar al publicar.'],
  pt: ['Revisão antes da publicação', 'Verificar esta versão', 'Verificando…', 'Verificações técnicas aprovadas; confira a experiência real', 'Corrija o problema que bloqueia a publicação', 'Não foi possível verificar. Confira os direitos das imagens e tente novamente.', 'Integridade, direitos das imagens, regras responsivas e campos verificados.', 'Não verificados: telas, links externos, recebimento do formulário, fatos e citações IA. Não é previsão de tráfego.', 'Comparar com versão salva', 'Primeira versão salva; não há versão anterior.', 'Texto inalterado; confira layout, visibilidade ou imagens.', 'Antes', 'Depois', 'Título, descrição ou busca alterados', 'Design alterado', 'Adicionado', 'Removido', 'Alterado', 'Movido', 'O formulário precisa de nome, e-mail e mensagem.', 'Nenhum conteúdo visível. Confira os blocos e horários.', 'Página excluída da indexação e dos arquivos de leitura IA.', 'Não há ação principal. Defina o próximo passo do visitante.', 'A reserva coleta apenas uma consulta; não confirma horário ou pagamento.', 'O conteúdo agendado será verificado novamente na publicação.'],
  ar: ['مراجعة ما قبل النشر والتغييرات', 'فحص هذا الإصدار', 'جارٍ الفحص…', 'اجتازت الفحوص التقنية؛ راجع التجربة الفعلية', 'أصلح المشكلة المانعة قبل النشر', 'تعذر الفحص. تحقق من حقوق الصور ثم أعد المحاولة.', 'تم فحص سلامة المستند وحقوق الصور وقواعد العرض وحقول النموذج.', 'لم يتم التحقق من العرض والروابط الخارجية واستلام النموذج والحقائق واستشهادات الذكاء الاصطناعي. ليست توقعًا للزيارات.', 'مقارنة بالإصدار المحفوظ', 'هذا أول إصدار محفوظ؛ لا يوجد إصدار سابق.', 'لم يتغير النص؛ راجع التخطيط أو الظهور أو الصور.', 'قبل', 'بعد', 'تغير العنوان أو الوصف أو إعدادات البحث', 'تغيرت إعدادات التصميم', 'إضافة', 'إزالة', 'تعديل', 'نقل', 'يتطلب النموذج الاسم والبريد الإلكتروني والرسالة.', 'لا يوجد محتوى ظاهر. تحقق من الجدول والكتل.', 'الصفحة مستبعدة من الفهرسة وملفات قراءة الذكاء الاصطناعي.', 'لا يوجد إجراء رئيسي. حدد الخطوة التالية للزائر.', 'الحجز يجمع استفسارًا فقط، ولا يؤكد موعدًا أو دفعًا.', 'سيتم فحص المحتوى المجدول مجددًا عند النشر.'],
  hi: ['प्रकाशन से पहले जाँच और बदलाव', 'इस संस्करण की जाँच', 'जाँच जारी…', 'तकनीकी जाँच सफल; वास्तविक अनुभव जाँचें', 'प्रकाशन रोकने वाली समस्या ठीक करें', 'जाँच पूरी नहीं हुई। छवियों के अधिकार जाँचें और पुनः प्रयास करें।', 'दस्तावेज़, छवि अधिकार, अनुकूल लेआउट नियम और फ़ॉर्म फ़ील्ड जाँचे गए।', 'स्क्रीन, बाहरी लिंक, फ़ॉर्म प्राप्ति, तथ्य और AI संदर्भ सत्यापित नहीं हैं। यह ट्रैफ़िक पूर्वानुमान नहीं है।', 'सहेजे गए संस्करण से तुलना', 'पहला सहेजा गया संस्करण; पिछला संस्करण नहीं है।', 'पाठ नहीं बदला; लेआउट, दृश्यता या छवियाँ जाँचें।', 'पहले', 'बाद में', 'शीर्षक, विवरण या खोज सेटिंग बदली', 'डिज़ाइन सेटिंग बदली', 'जोड़ा', 'हटाया', 'बदला', 'स्थान बदला', 'फ़ॉर्म में नाम, ईमेल और संदेश आवश्यक हैं।', 'कोई दृश्य सामग्री नहीं। समय और ब्लॉक जाँचें।', 'पृष्ठ खोज और AI पढ़ने वाली फ़ाइलों से बाहर है।', 'मुख्य कार्रवाई नहीं है। आगंतुक का अगला कदम तय करें।', 'बुकिंग केवल पूछताछ है; समय या भुगतान की पुष्टि नहीं।', 'निर्धारित सामग्री प्रकाशन के समय फिर जाँची जाएगी।'],
  'zh-hans': ['发布前检查与版本对照', '检查这个版本', '检查中…', '程序检查通过，仍需确认实际效果', '有问题需要先修正', '检查未完成。请确认图片可公开使用，重新加载后再试。', '已检查版本完整性、图片权限、响应式设置及表单字段。', '尚未实测：手机／电脑画面、外部链接、表单收件、品牌事实与 AI 引用效果。这不是流量或引用率预测。', '与保存版本比较', '这是第一个保存版本，尚无前一版可比。', '此区块没有文字变更；请查看布局、显示条件或图片。', '之前', '现在', '页面标题、描述或搜索设置有变更', '设计设置有变更', '新增', '移除', '修改', '移动', '联系表单需包含姓名、Email 与留言。', '目前没有可显示的内容，请检查显示时间与区块。', '此页不收录，不会加入 AI 阅读文件。', '目前没有主要链接或联系方式，请确认访客下一步。', '预约只收集询问，不代表已确认时段或已付款。', '部分内容有排程，发布时会重新检查显示时间。'],
} as const

export function managedSitePageReviewCopy(locale: string) {
  const normalized = normalizeSiteLanguage(locale) || 'en'
  const values = localized[normalized as keyof typeof localized] || localized[normalized.split('-')[0] as keyof typeof localized]
  const fallback = defaultPageReviewCopy(normalized)
  if (!values) return fallback
  return Object.fromEntries(Object.keys(fallback).map((key, index) => [key, values[index]])) as typeof fallback
}
