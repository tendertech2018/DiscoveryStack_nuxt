// Customer-facing transaction vocabulary. Merchant tools use the English fallback
// for additional operational terms. Brand/product copy is never translated here.
export const customerLanguageRows = `
目前未開啟 Email 通知，請保留下方私人連結查詢。|メール通知は未設定です。下の専用リンクを保管してください。|Les notifications par e-mail ne sont pas activées. Gardez le lien privé ci-dessous.|Las notificaciones por correo no están activadas. Guarda el enlace privado de abajo.|إشعارات البريد غير مفعلة. احتفظ بالرابط الخاص أدناه لمتابعة حجزك.
訂單已建立，等待付款確認|注文受付・入金確認待ち|Commande créée, paiement à confirmer|Pedido creado, pago pendiente|تم إنشاء الطلب، بانتظار تأكيد الدفع
付款期限已過，訂單已取消|支払い期限切れ・注文キャンセル|Délai de paiement dépassé, commande annulée|Plazo de pago vencido; pedido cancelado|انتهت مهلة الدفع؛ تم إلغاء الطلب
訂單已交付物流|配送業者へ引き渡しました|Commande remise au transporteur|Pedido entregado al transportista|تم تسليم الطلب لشركة الشحن
訂單已取消|注文をキャンセルしました|Commande annulée|Pedido cancelado|تم إلغاء الطلب
已記錄人工退款確認|手動返金確認を記録しました|Remboursement manuel enregistré|Reembolso manual registrado|تم تسجيل تأكيد الاسترداد اليدوي
沙盒付款已模擬完成|模擬決済が完了しました|Paiement simulé terminé|Pago simulado completado|اكتمل الدفع التجريبي
已人工確認離線付款|店舗がオフライン入金を確認しました|Paiement hors ligne confirmé|Pago fuera de línea confirmado|تم تأكيد الدفع غير الإلكتروني
金流已確認全額退款|決済サービスが全額返金を確認しました|Remboursement intégral confirmé|Reembolso completo confirmado|تم تأكيد استرداد المبلغ بالكامل
金流部分退款，暫停自動出貨，請商家對帳|一部返金・店舗確認まで発送保留|Remboursement partiel, expédition suspendue pour vérification|Reembolso parcial; envío suspendido para revisión|استرداد جزئي؛ الشحن معلق لمراجعة التاجر
款項已到達，但訂單已釋出庫存，須人工對帳或退款|在庫解放後の入金・店舗確認または返金が必要|Paiement tardif après libération du stock : vérification ou remboursement requis|Pago tardío tras liberar existencias; requiere revisión o reembolso|دفع متأخر بعد تحرير المخزون؛ يلزم مراجعة أو استرداد
Stripe 已確認付款|Stripeが支払いを確認しました|Paiement confirmé par Stripe|Stripe confirmó el pago|أكد Stripe الدفع
Stripe 測試付款已確認（非真實收款）|Stripeテスト決済確認済み（実際の請求なし）|Paiement test Stripe confirmé (sans débit réel)|Pago de prueba Stripe confirmado (sin cobro real)|تم تأكيد دفع Stripe التجريبي (دون خصم حقيقي)
主要導覽|メインナビゲーション|Navigation principale|Navegación principal|التنقل الرئيسي
商品選購|ショップ|Boutique|Tienda|المتجر
服務項目|サービス|Services|Servicios|الخدمات
預約時段|日時を予約|Réserver un créneau|Reservar horario|حجز موعد
誌記|ジャーナル|Journal|Revista|المجلة
品牌誌記|ジャーナル|Journal|Revista|المجلة
關於我們|私たちについて|À propos|Sobre nosotros|من نحن
品牌故事|ブランドについて|Notre histoire|Nuestra historia|قصتنا
聯絡我們|お問い合わせ|Contact|Contacto|اتصل بنا
會員專區|アカウント|Mon compte|Mi cuenta|حسابي
購物袋|バッグ|Panier|Bolsa|السلة
開啟選單|メニューを開く|Ouvrir le menu|Abrir menú|فتح القائمة
關閉選單|メニューを閉じる|Fermer le menu|Cerrar menú|إغلاق القائمة
首頁|ホーム|Accueil|Inicio|الرئيسية
暫時缺貨|在庫切れ|Rupture de stock|Agotado|غير متوفر
搜尋商品|商品を検索|Rechercher des produits|Buscar productos|البحث عن منتجات
商品名稱|商品名|Nom du produit|Nombre del producto|اسم المنتج
商品分類|カテゴリ|Catégorie de produit|Categoría de producto|فئة المنتج
搜尋|検索|Rechercher|Buscar|بحث
分類|カテゴリ|Catégorie|Categoría|الفئة
日常珍選|日々のセレクション|Une sélection au quotidien|Selección para cada día|مختارات يومية
為生活細心挑選，長久相伴。|日々に寄り添う、こだわりの品々。|Une sélection soignée pour votre quotidien.|Una selección cuidada para tu día a día.|مختارات مدروسة لحياتك اليومية.
目前尚無上架商品，敬請期待。|商品は準備中です。|Aucun produit disponible pour le moment.|Aún no hay productos disponibles.|لا توجد منتجات متاحة بعد.
選擇規格|仕様を選択|Choisir une variante|Elegir variante|اختيار النوع
數量|数量|Quantité|Cantidad|الكمية
加入購物袋|バッグに追加|Ajouter au panier|Añadir a la bolsa|إضافة إلى السلة
已加入購物袋。|バッグに追加しました。|Ajouté au panier.|Añadido a la bolsa.|تمت الإضافة إلى السلة.
已選商品|選んだ商品|Votre sélection|Tu selección|مختاراتك
我的購物袋|マイバッグ|Mon panier|Mi bolsa|سلتي
購物袋目前是空的。|バッグは空です。|Votre panier est vide.|Tu bolsa está vacía.|سلتك فارغة.
購物袋目前是空的，挑選幾件喜歡的商品吧。|バッグは空です。商品をご覧ください。|Votre panier est vide. Découvrez notre sélection.|Tu bolsa está vacía. Explora la colección.|سلتك فارغة. تصفح المجموعة.
前往結帳|レジへ進む|Passer commande|Finalizar compra|إتمام الطلب
移除|削除|Retirer|Quitar|إزالة
合計|合計|Total|Total|الإجمالي
即將完成|あと少し|Presque terminé|Casi listo|أوشكت على الانتهاء
確認訂單|注文を確認|Vérifier la commande|Revisar pedido|مراجعة الطلب
姓名|お名前|Nom|Nombre|الاسم
電子郵件|メールアドレス|E-mail|Correo electrónico|البريد الإلكتروني
聯絡電話|電話番号|Téléphone|Teléfono|الهاتف
配送地址|配送先住所|Adresse de livraison|Dirección de envío|عنوان الشحن
我已閱讀並同意購物條款與隱私說明。|購入条件とプライバシーポリシーを読み、同意します。|J’ai lu et j’accepte les conditions d’achat et la politique de confidentialité.|He leído y acepto las condiciones de compra y la política de privacidad.|قرأت شروط الشراء وسياسة الخصوصية وأوافق عليهما.
送出訂單|注文を送信|Passer la commande|Enviar pedido|إرسال الطلب
訂單送出後將由商家人工確認付款；本網站不會在線上收款。|お支払いは店舗が手動で確認します。このサイトではオンライン決済を行いません。|Le commerçant confirmera le paiement manuellement. Aucun paiement en ligne sur ce site.|El comercio confirmará el pago manualmente. Este sitio no cobra en línea.|سيؤكد التاجر الدفع يدويًا. لا يجمع هذا الموقع مدفوعات عبر الإنترنت.
訂單尚未開放，歡迎先與我們聯絡。|ご注文はまだ受け付けていません。お問い合わせください。|Les commandes ne sont pas encore ouvertes. Contactez-nous.|Los pedidos aún no están disponibles. Contáctanos.|الطلبات غير متاحة بعد. يرجى التواصل معنا.
建立訂單後，請前往|注文後、次へ進んでください：|Après la création de la commande, passez à|Tras crear el pedido, continúa a|بعد إنشاء الطلب، انتقل إلى
安全付款頁完成刷卡。|安全な決済ページ。|la page de paiement sécurisé.|la página de pago seguro.|صفحة الدفع الآمنة.
測試環境：僅供驗收，不扣真錢、不使用真實卡號。|テスト環境：実際の請求はありません。実際のカード情報は使用しないでください。|mode test : aucun débit réel. N’utilisez pas de vraie carte.|modo de prueba: sin cobros reales. No uses una tarjeta real.|بيئة اختبار: لا خصم حقيقي. لا تستخدم بيانات بطاقة حقيقية.
目前使用預覽付款流程。|プレビュー決済を使用しています。|Le paiement est en mode aperçu.|El pago está en modo de vista previa.|الدفع في وضع المعاينة.
訂單|注文|Commande|Pedido|الطلب
已收到訂單|注文を受け付けました|Commande reçue|Pedido recibido|تم استلام الطلب
訂單已建立|注文を作成しました|Commande créée|Pedido creado|تم إنشاء الطلب
目前尚未收款。|まだお支払いは確認されていません。|Aucun paiement reçu pour le moment.|Aún no se ha recibido el pago.|لم يتم استلام الدفع بعد.
待確認付款|入金確認待ち|Paiement en attente de confirmation|Pendiente de confirmar el pago|بانتظار تأكيد الدفع
已付款|支払済み|Payé|Pagado|مدفوع
已退款|返金済み|Remboursé|Reembolsado|تم رد المبلغ
待商家對帳（暫停出貨）|店舗の照合待ち（発送保留）|Vérification du commerçant requise (expédition suspendue)|Revisión del comercio requerida (envío suspendido)|بانتظار مراجعة التاجر (الشحن معلق)
待處理|処理待ち|En attente|Pendiente|قيد الانتظار
處理中|処理中|En cours|En proceso|قيد المعالجة
已出貨|発送済み|Expédié|Enviado|تم الشحن
已送達|配達済み|Livré|Entregado|تم التسليم
已取消|キャンセル済み|Annulé|Cancelado|ملغى
目前尚無物流更新。|配送情報はまだありません。|Pas encore d’information de livraison.|Aún no hay novedades de envío.|لا توجد تحديثات شحن بعد.
更新付款狀態|支払い状況を更新|Actualiser le paiement|Actualizar estado de pago|تحديث حالة الدفع
付款狀態以金流確認為準；返回此頁不代表付款成功。|支払いは決済サービスの通知で確定します。このページへの戻りは完了を意味しません。|Le paiement est confirmé par le prestataire. Revenir ici ne prouve pas son succès.|El proveedor confirma el pago. Volver aquí no significa que se haya completado.|تؤكد خدمة الدفع العملية. العودة إلى هذه الصفحة لا تعني نجاح الدفع.
測試付款（不扣真錢）|テスト決済（実際の請求なし）|Paiement test (sans débit réel)|Pago de prueba (sin cobro real)|دفع تجريبي (دون خصم حقيقي)
安全付款|安全な決済|Paiement sécurisé|Pago seguro|الدفع الآمن
前往|進む：|Continuer vers|Continuar a|الانتقال إلى
預約服務|ご予約|Réservation|Reservas|الحجوزات
為自己安排一段自在時光。|自分のための時間を。|Prenez un moment pour vous.|Dedica un momento para ti.|خصص وقتًا لنفسك.
分鐘|分|minutes|minutos|دقائق
堂|回|crédits|créditos|رصيد
預約|予約|Réserver|Reservar|حجز
選擇合適的服務與時間。|サービスと日時を選んでください。|Choisissez un service et un horaire.|Elige un servicio y un horario.|اختر الخدمة والوقت المناسبين.
可預約時間|予約可能日時|Horaires disponibles|Horarios disponibles|المواعيد المتاحة
我同意商家使用我的聯絡資料處理預約申請。|予約対応のため連絡先情報を使用することに同意します。|J’accepte l’utilisation de mes coordonnées pour traiter cette demande.|Acepto el uso de mis datos de contacto para gestionar esta reserva.|أوافق على استخدام بيانات الاتصال لمعالجة طلب الحجز.
預約申請需由商家確認；送出不代表付款或預約已確認。|店舗による確認が必要です。送信だけでは予約や支払いは確定しません。|La réservation nécessite la confirmation du commerçant. L’envoi ne confirme ni le paiement ni la réservation.|La reserva requiere confirmación del comercio. Enviar no confirma el pago ni la reserva.|يتطلب الحجز تأكيد التاجر. إرسال الطلب لا يؤكد الدفع أو الحجز.
送出預約申請|予約を申し込む|Demander une réservation|Solicitar reserva|طلب حجز
預約管理|予約管理|Gérer la réservation|Gestionar reserva|إدارة الحجز
我的預約|予約一覧|Mes réservations|Mis reservas|حجوزاتي
使用建立預約時的私人連結查詢，不需要註冊帳號。|予約時の専用リンクをご利用ください。登録は不要です。|Utilisez votre lien privé de réservation. Aucun compte requis.|Usa tu enlace privado de reserva. No necesitas cuenta.|استخدم رابط الحجز الخاص. لا يلزم إنشاء حساب.
正在讀取預約…|予約を読み込み中…|Chargement de la réservation…|Cargando reserva…|جارٍ تحميل الحجز…
更新狀態|状況を更新|Actualiser le statut|Actualizar estado|تحديث الحالة
更換時段|日時を変更|Changer de créneau|Cambiar horario|تغيير الموعد
申請改期|変更を申し込む|Demander un report|Solicitar cambio|طلب إعادة جدولة
取消預約|予約をキャンセル|Annuler la réservation|Cancelar reserva|إلغاء الحجز
改期需重新由商家確認；取消不代表自動退款。私人連結可操作此筆預約，請妥善保管。|変更には店舗の再確認が必要です。キャンセルは自動返金ではありません。専用リンクは大切に保管してください。|Tout report nécessite une confirmation. L’annulation ne déclenche pas de remboursement automatique. Gardez votre lien privé en sécurité.|Los cambios requieren confirmación. Cancelar no genera un reembolso automático. Guarda tu enlace privado.|تحتاج إعادة الجدولة إلى تأكيد. الإلغاء لا يصدر استردادًا تلقائيًا. احتفظ بالرابط الخاص بأمان.
等待商家確認|店舗の確認待ち|En attente du commerçant|Esperando confirmación del comercio|بانتظار تأكيد التاجر
已確認|確認済み|Confirmé|Confirmado|مؤكد
未接受|受付不可|Refusé|Rechazado|مرفوض
已逾期|期限切れ|Expiré|Vencido|منتهي الصلاحية
目前沒有可預約時段|予約可能な日時がありません|Aucun créneau disponible|No hay horarios disponibles|لا توجد مواعيد متاحة
目前沒有預約。|予約はありません。|Aucune réservation.|No hay reservas.|لا توجد حجوزات.
已收到預約申請，商家確認前尚未完成預約或付款。|申込を受け付けました。店舗の確認までは予約・支払いは未確定です。|Demande reçue. La réservation et le paiement restent non confirmés avant validation du commerçant.|Solicitud recibida. La reserva y el pago no se confirman hasta la aceptación del comercio.|تم استلام الطلب. الحجز والدفع غير مؤكدين حتى تأكيد التاجر.
查看、取消或申請改期（請保留私人連結）|確認・キャンセル・変更（専用リンクを保管）|Consulter, annuler ou reporter (gardez ce lien privé)|Ver, cancelar o cambiar (guarda este enlace privado)|عرض أو إلغاء أو إعادة جدولة (احتفظ بالرابط الخاص)
改期申請已送出，等待商家重新確認。|変更を申し込みました。店舗の確認をお待ちください。|Demande de report envoyée. Confirmation du commerçant attendue.|Cambio solicitado. Esperando confirmación del comercio.|تم إرسال طلب إعادة الجدولة. بانتظار تأكيد التاجر.
確定取消此預約？若已付款，退款請洽商家。|予約をキャンセルしますか？返金は店舗にお問い合わせください。|Annuler cette réservation ? Contactez le commerçant pour un remboursement.|¿Cancelar esta reserva? Contacta al comercio para solicitar un reembolso.|هل تريد إلغاء الحجز؟ تواصل مع التاجر لاسترداد المبلغ.
請使用建立預約時取得的完整私人連結。|予約時の専用リンクを省略せずにご利用ください。|Utilisez le lien privé complet reçu lors de la réservation.|Usa el enlace privado completo que recibiste al reservar.|استخدم الرابط الخاص الكامل الذي تلقيته عند الحجز.
歡迎與我們聊聊|お気軽にご連絡ください|Échangeons ensemble|Hablemos|تواصل معنا
訊息|メッセージ|Message|Mensaje|الرسالة
我同意商家就此訊息與我聯絡。|このお問い合わせへの返信に同意します。|J’accepte d’être contacté au sujet de cette demande.|Acepto que me contacten sobre esta consulta.|أوافق على التواصل معي بشأن هذا الاستفسار.
送出訊息|送信|Envoyer|Enviar mensaje|إرسال الرسالة
訊息已送出，謝謝您。|送信しました。ありがとうございます。|Message envoyé. Merci.|Mensaje enviado. Gracias.|تم إرسال الرسالة. شكرًا لك.
購物與隱私政策|購入とプライバシーの規約|Conditions d’achat et confidentialité|Compra y privacidad|سياسات الشراء والخصوصية
配送說明|配送について|Livraison|Envíos|الشحن
退換政策|返品・交換|Retours|Devoluciones|الإرجاع
隱私說明|プライバシー|Confidentialité|Privacidad|الخصوصية
購物政策|購入規約|Conditions d’achat|Condiciones de compra|سياسة الشراء
預約政策|予約規約|Conditions de réservation|Condiciones de reserva|سياسة الحجز
服務說明|ご利用案内|Informations|Información|معلومات الخدمة
我的帳戶|マイアカウント|Mon compte|Mi cuenta|حسابي
我的訂單|注文履歴|Mes commandes|Mis pedidos|طلباتي
訂單查詢|注文を確認|Suivi de commande|Consultar pedido|الاستعلام عن الطلب
查詢訂單|注文を検索|Rechercher la commande|Buscar pedido|البحث عن طلب
訂單編號|注文番号|Numéro de commande|Número de pedido|رقم الطلب
訂單電子郵件|注文時のメール|E-mail de commande|Correo del pedido|بريد الطلب
密碼|パスワード|Mot de passe|Contraseña|كلمة المرور
登入|ログイン|Se connecter|Iniciar sesión|تسجيل الدخول
登出|ログアウト|Se déconnecter|Cerrar sesión|تسجيل الخروج
建立會員帳號|アカウントを作成|Créer un compte|Crear cuenta|إنشاء حساب
建立帳號|アカウントを作成|Créer un compte|Crear cuenta|إنشاء حساب
會員登入|ログイン|Connexion|Inicio de sesión|تسجيل الدخول
忘記密碼？|パスワードを忘れた方|Mot de passe oublié ?|¿Olvidaste tu contraseña?|نسيت كلمة المرور؟
已有帳號？登入|アカウントをお持ちの方：ログイン|Déjà un compte ? Connectez-vous|¿Ya tienes cuenta? Inicia sesión|لديك حساب؟ سجّل الدخول
我已閱讀並同意隱私說明。|プライバシーポリシーを読み、同意します。|J’ai lu et j’accepte la politique de confidentialité.|He leído y acepto la política de privacidad.|قرأت سياسة الخصوصية وأوافق عليها.
重設密碼|パスワードを再設定|Réinitialiser le mot de passe|Restablecer contraseña|إعادة تعيين كلمة المرور
設定新密碼|新しいパスワード|Nouveau mot de passe|Nueva contraseña|كلمة مرور جديدة
新密碼（至少|新しいパスワード（最低|Nouveau mot de passe (au moins|Nueva contraseña (al menos|كلمة مرور جديدة (على الأقل
個字元）|文字）| caractères)| caracteres)| حرفًا)
更新密碼|パスワードを更新|Mettre à jour|Actualizar contraseña|تحديث كلمة المرور
寄送重設連結|再設定リンクを送信|Envoyer le lien|Enviar enlace|إرسال الرابط
帳戶協助|アカウントヘルプ|Aide au compte|Ayuda de cuenta|مساعدة الحساب
若此電子郵件已有帳號，我們會寄送安全重設連結。|アカウントが存在する場合、再設定リンクを送信します。|Si un compte existe, nous enverrons un lien sécurisé.|Si existe una cuenta, enviaremos un enlace seguro.|إذا كان الحساب موجودًا، فسنرسل رابط إعادة تعيين آمنًا.
若此電子郵件已有帳號，重設連結將寄送至該信箱。|アカウントが存在する場合、再設定リンクを送信します。|Si un compte existe, un lien sera envoyé à cette adresse.|Si existe una cuenta, se enviará un enlace a ese correo.|إذا كان الحساب موجودًا، فسيُرسل رابط إلى ذلك البريد.
最後一步|最後のステップ|Dernière étape|Último paso|الخطوة الأخيرة
驗證電子郵件|メールを確認|Vérifier l’e-mail|Verificar correo|التحقق من البريد
正在確認安全連結…|安全なリンクを確認中…|Vérification du lien…|Verificando enlace…|جارٍ التحقق من الرابط…
寄送驗證信|確認メールを送信|Envoyer la vérification|Enviar verificación|إرسال رسالة التحقق
請完成電子郵件驗證以啟用會員帳戶。|メール確認でアカウントを有効にしてください。|Vérifiez votre e-mail pour activer votre compte.|Verifica tu correo para activar tu cuenta.|تحقق من بريدك لتفعيل الحساب.
完成電子郵件驗證後即可查看會員訂單。|注文履歴を見るにはメールを確認してください。|Vérifiez votre e-mail pour voir vos commandes.|Verifica tu correo para ver tus pedidos.|تحقق من بريدك لعرض طلباتك.
電子郵件已驗證，謝謝你。|メールを確認しました。ありがとうございます。|E-mail vérifié. Merci.|Correo verificado. Gracias.|تم التحقق من البريد. شكرًا لك.
目前登入：|ログイン中：|Connecté en tant que :|Sesión iniciada como:|مسجل الدخول باسم:
目前沒有訂單。|注文はありません。|Aucune commande.|No hay pedidos.|لا توجد طلبات.
請稍後再試。|しばらくしてから再試行してください。|Réessayez plus tard.|Inténtalo de nuevo más tarde.|يرجى المحاولة لاحقًا.
請先勾選同意購物條款與隱私說明。|購入規約とプライバシーに同意してください。|Acceptez les conditions d’achat et de confidentialité.|Acepta las condiciones de compra y privacidad.|يرجى الموافقة على شروط الشراء والخصوصية.
請先同意隱私說明。|プライバシーポリシーに同意してください。|Acceptez la politique de confidentialité.|Acepta la política de privacidad.|يرجى الموافقة على سياسة الخصوصية.
請先同意聯絡資料使用說明。|連絡先情報の使用に同意してください。|Acceptez l’utilisation de vos coordonnées.|Acepta el uso de tus datos de contacto.|يرجى الموافقة على استخدام بيانات الاتصال.
`.trim().split('\n').map(row => row.split('|'))
