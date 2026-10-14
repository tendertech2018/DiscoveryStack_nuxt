// Transactional messages use the site's language, never the operator's language.
const rows = `
booking|預約更新|Booking update|予約の更新|Mise à jour de réservation|Actualización de reserva|تحديث الحجز
status|狀態|Status|状態|Statut|Estado|الحالة
notPayment|此通知不代表付款或退款已完成。|This notice does not confirm payment or refund.|この通知は支払いや返金の完了を意味しません。|Ce message ne confirme ni paiement ni remboursement.|Este aviso no confirma pagos ni reembolsos.|هذا الإشعار لا يؤكد إتمام الدفع أو استرداد المبلغ.
privateLink|請保留此私人連結，不要轉傳。|Keep this private link secure. Do not forward it.|専用リンクは大切に保管し、転送しないでください。|Gardez ce lien privé en sécurité. Ne le transférez pas.|Guarda este enlace privado. No lo reenvíes.|احتفظ بهذا الرابط الخاص بأمان ولا تشاركه.
originalLink|請使用建立預約時取得的私人連結查看最新狀態。|Use the private link from your booking to view its latest status.|予約時の専用リンクで最新の状態をご確認ください。|Consultez le statut via le lien privé reçu lors de la réservation.|Consulta el estado con el enlace privado recibido al reservar.|استخدم الرابط الخاص الذي تلقيته عند الحجز لعرض أحدث حالة.
reset|重設密碼|Reset password|パスワードの再設定|Réinitialiser le mot de passe|Restablecer contraseña|إعادة تعيين كلمة المرور
verify|驗證會員信箱|Verify email|メール確認|Vérifier l’e-mail|Verificar correo|التحقق من البريد
expires|請開啟下方連結；30 分鐘內有效，僅能使用一次。|Open the link below. It is valid for 30 minutes and can be used once.|下のリンクを開いてください。有効期間は30分で、1回のみ使用できます。|Ouvrez ce lien. Il est valable 30 minutes et utilisable une fois.|Abre este enlace. Es válido durante 30 minutos y solo puede usarse una vez.|افتح الرابط أدناه. صالح لمدة 30 دقيقة ولمرة واحدة.
ignore|若非本人操作，請忽略此信。|If you did not request this, ignore this email.|お心当たりがない場合は、このメールを無視してください。|Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.|Si no lo solicitaste, ignora este correo.|إن لم تطلب ذلك، تجاهل هذه الرسالة.
order|訂單已建立，等待付款確認|Order created, payment confirmation pending|注文受付・入金確認待ち|Commande créée, paiement à confirmer|Pedido creado, pago pendiente de confirmar|تم إنشاء الطلب، بانتظار تأكيد الدفع
payment|請在網站前往安全付款頁，付款以金流通知確認為準。|Use the secure checkout on the website. Payment is confirmed by the payment provider.|サイトの安全な決済ページをご利用ください。決済サービスの通知で支払いが確定します。|Utilisez le paiement sécurisé du site. Le prestataire confirme le paiement.|Usa el pago seguro del sitio. El proveedor confirma el pago.|استخدم صفحة الدفع الآمنة على الموقع. تؤكد خدمة الدفع العملية.
manual|請依商家指示完成付款。|Follow the merchant’s payment instructions.|店舗のお支払い案内に従ってください。|Suivez les instructions de paiement du commerçant.|Sigue las instrucciones de pago del comercio.|اتبع تعليمات الدفع من التاجر.
`.trim().split('\n').map(row => row.split('|'))
const languages = ['zh', 'en', 'ja', 'fr', 'es', 'ar']
export function notificationCopy(locale) {
  const language = new Intl.Locale(locale).language
  const index = Math.max(0, languages.indexOf(language))
  const selected = languages.includes(language) ? index + 1 : 2
  return Object.fromEntries(rows.map(row => [row[0], row[selected]]))
}
