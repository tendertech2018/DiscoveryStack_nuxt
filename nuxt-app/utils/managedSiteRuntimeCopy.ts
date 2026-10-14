// Interface copy only. Never translate approved customer content or guess currency.
// Unknown languages explicitly fall back to English; native publication has a language gate.
const rows = `
購物與預約操作會在專用網站啟用；這裡只檢視設計。|ショップ・予約は専用サイトで動作します。ここはデザイン確認専用です。|Vente et réservation fonctionnent sur le site dédié. Ce panneau sert à vérifier le design.|Las compras y reservas funcionan en el sitio dedicado. Este panel solo muestra el diseño.|تعمل وظائف التسوق والحجز على الموقع المخصص. هذه اللوحة لمراجعة التصميم فقط.
確認設計預覽（僅檢視）|承認済みデザイン（閲覧のみ）|Design approuvé (lecture seule)|Diseño aprobado (solo vista)|معاينة التصميم المعتمد (عرض فقط)
你的設計，接上真正的功能|デザインを実際の機能へ。|Votre design, des fonctions réelles.|Tu diseño, funciones reales.|تصميمك مع وظائف حقيقية.
購物／預約網站|ショップ・予約サイト|Site de vente / réservation|Sitio de compras / reservas|موقع التسوق والحجز
沿用你已確認的設計、圖片與文字，使用內建購物或預約。不會連接外部 Shopify／Google 帳號，也不會因此購買主機或扣款。|承認済みのデザイン・写真・文章に内蔵ショップまたは予約を接続します。Shopify / Googleへの接続、ホスティング購入、決済は行いません。|Conservez le design, les photos et les textes approuvés avec notre boutique ou réservation intégrée. Aucun compte Shopify / Google connecté, hébergement acheté ou carte débitée.|Conserva el diseño, las fotos y los textos aprobados con compras o reservas integradas. No conecta cuentas Shopify / Google, compra alojamiento ni cobra tarjetas.|احتفظ بالتصميم والصور والنصوص المعتمدة مع التسوق أو الحجز المدمج. لن يتم ربط حسابات Shopify / Google أو شراء استضافة أو خصم أموال.
功能|機能|Fonction|Función|الوظيفة
購物、訂單與庫存|ショップ・注文・在庫|Vente, commandes et stock|Compras, pedidos e inventario|التسوق والطلبات والمخزون
預約、時段與文章|予約・空き時間・記事|Réservations, créneaux et articles|Reservas, horarios y artículos|الحجوزات والمواعيد والمقالات
收費幣別（不自動換匯）|価格の通貨（自動換算なし）|Devise (sans conversion automatique)|Moneda (sin conversión automática)|عملة الأسعار (دون تحويل تلقائي)
選擇幣別|通貨を選択|Choisir une devise|Elegir moneda|اختر العملة
服務時區|サービスのタイムゾーン|Fuseau horaire du service|Zona horaria del servicio|المنطقة الزمنية للخدمة
處理中…|処理中…|En cours…|Procesando…|جارٍ المعالجة…
接上功能，準備網站|機能を接続してサイトを準備|Connecter et préparer le site|Conectar y preparar el sitio|ربط الوظائف وتجهيز الموقع
已核對發布版本|公開バージョンを確認済み|Version publiée vérifiée|Versión publicada verificada|تم التحقق من النسخة المنشورة
已接主機，等待你確認發布|ホスト接続済み。公開承認をお待ちしています。|Hébergement connecté. Publication à approuver.|Alojamiento conectado. Falta aprobar la publicación.|الاستضافة متصلة. بانتظار موافقتك على النشر.
網站包已準備；尚未上線，等待專用主機|サイトパッケージを準備済み。未公開です。専用ホストが必要です。|Site préparé, pas encore en ligne. Hébergement dédié requis.|Paquete listo, aún no publicado. Requiere alojamiento dedicado.|حزمة الموقع جاهزة ولم تُنشر بعد. تحتاج إلى استضافة مخصصة.
不會把訂單或預約存到會消失的展示環境。你現在不需要提供 Stripe 金鑰。|注文や予約は一時的なデモ環境には保存しません。Stripeキーはまだ不要です。|Aucune commande ni réservation dans une démo éphémère. Pas besoin de clés Stripe pour le moment.|No guardamos pedidos ni reservas en una demo temporal. Aún no necesitas claves Stripe.|لن تُحفظ الطلبات والحجوزات في بيئة عرض مؤقتة. لا تحتاج إلى مفاتيح Stripe الآن.
確認稿已接上功能的預覽|承認済みデザインと機能のプレビュー|Aperçu du design approuvé avec ses fonctions|Vista del diseño aprobado con funciones|معاينة التصميم المعتمد مع الوظائف
下載確認版網站包（不含金鑰）|承認済みパッケージを保存（キーなし）|Télécharger le site approuvé (sans secrets)|Descargar paquete aprobado (sin claves)|تنزيل حزمة الموقع المعتمدة (دون مفاتيح)
我確認設計、功能與幣別，發布此版本。商品、時段、政策與付款設定仍須通過實際檢查。|デザイン・機能・通貨を承認し、この版を公開します。商品・予約枠・ポリシー・決済設定の検証が必要です。|J’approuve ce design, ces fonctions et cette devise. Produits, créneaux, politiques et paiement doivent réussir les vérifications.|Apruebo este diseño, funciones y moneda. Los productos, horarios, políticas y pagos deben superar las verificaciones.|أوافق على نشر هذا التصميم والوظائف والعملة. يجب اجتياز فحوص المنتجات والمواعيد والسياسات وإعدادات الدفع.
核對／重試發布|確認・公開を再試行|Vérifier / réessayer|Verificar / reintentar|التحقق / إعادة محاولة النشر
發布確認版本|承認済み版を公開|Publier la version approuvée|Publicar versión aprobada|نشر النسخة المعتمدة
開啟已發布網站|公開サイトを開く|Ouvrir le site publié|Abrir sitio publicado|فتح الموقع المنشور
操作未完成。請重新確認版本及設定；發布狀態不明時請按「核對／重試發布」，不要重建網站。|操作を完了できませんでした。版と設定を確認してください。公開状態が不明な場合は確認・再試行し、新しいサイトを作成しないでください。|Opération non terminée. Vérifiez la version et les paramètres. Si la publication est incertaine, vérifiez / réessayez sans créer un autre site.|No se completó la operación. Revisa la versión y la configuración. Si la publicación es incierta, verifica o reintenta sin crear otro sitio.|لم تكتمل العملية. راجع النسخة والإعدادات. إن كانت حالة النشر غير مؤكدة، تحقق أو أعد المحاولة دون إنشاء موقع آخر.
`.trim().split('\n').map(row => row.split('|'))
const packs = Object.fromEntries(['ja', 'fr', 'es', 'ar'].map((language, index) => [language, Object.fromEntries(rows.map(row => [row[0], row[index + 1]]))]))
export function runtimeDeliveryCopy(language: string, traditional: string, english: string): string {
  const locale = new Intl.Locale(language)
  if (locale.language === 'zh') return traditional
  return packs[locale.language]?.[traditional] || english
}
