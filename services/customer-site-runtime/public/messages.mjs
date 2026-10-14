import { customerLanguageRows } from './customer-languages.mjs'
const english = `
目前未開啟 Email 通知，請保留下方私人連結查詢。|Email notifications are not enabled. Keep the private link below to check your booking.
訂單已建立，等待付款確認|Order created, awaiting payment confirmation
付款期限已過，訂單已取消|Payment deadline passed; order cancelled
訂單已交付物流|Order handed to carrier
訂單已取消|Order cancelled
已記錄人工退款確認|Manual refund confirmation recorded
沙盒付款已模擬完成|Simulated sandbox payment completed
已人工確認離線付款|Offline payment confirmed by merchant
金流已確認全額退款|Payment provider confirmed a full refund
金流部分退款，暫停自動出貨，請商家對帳|Partial refund; fulfilment paused for merchant review
款項已到達，但訂單已釋出庫存，須人工對帳或退款|Late payment after inventory release; merchant review or refund required
Stripe 已確認付款|Stripe confirmed payment
Stripe 測試付款已確認（非真實收款）|Stripe test payment confirmed (no real charge)
只接受測試金鑰；加密儲存，不會再次顯示。儲存不代表已通過金流驗收。|Only test keys are accepted. They are encrypted and never displayed again. Saving is not payment verification.
安全儲存測試金鑰|Save test keys securely
測試金鑰已加密儲存。尚未執行付款驗收。|Test keys saved encrypted. Payment acceptance has not run.
上傳商品圖片|Upload product image
上傳文章封面|Upload article cover
上傳首頁圖片|Upload homepage image
上架中|Active
主要導覽|Main navigation
付款狀態以金流確認為準；返回此頁不代表付款成功。|Payment is confirmed by the payment provider. Returning here does not mean payment succeeded.
付款網址驗證失敗，請聯絡商家。|Payment URL verification failed. Please contact the merchant.
使用堂數|Credits required
使用建立預約時的私人連結查詢，不需要註冊帳號。|Use your private booking link. No account is required.
修訂記錄|Revision history
個字元）| characters)
價格使用最小貨幣單位；將規格庫存設為|Prices use the smallest currency unit. To stop selling a variant, set its stock to
價格（最小貨幣單位）|Price (minor units)
儲存商品|Save product
儲存時段|Save time slot
儲存服務|Save service
儲存網站設定|Save website settings
儲存草稿|Save draft
分享生活裡的片刻與想法。|Stories, moments and ideas.
分鐘| minutes
分類|Category
前往結帳|Checkout
前往|Continue to
加入購物袋|Add to bag
即將完成|Almost there
取消發布|Unpublish
取消訂單|Cancel order
取消預約|Cancel booking
可暫停販售。| to pause sales.
可用堂數|Available credits
可預約時段|Available time slots
可預約時間|Available times
合計|Total
品牌介紹|Brand description
品牌故事|Our story
品牌理念|Our philosophy
品牌短句|Tagline
品牌誌記|Journal
售價（最小貨幣單位）|Price (minor units)
商品分類|Product category
商品名稱|Product name
商品圖片網址|Product image URL
商品與庫存|Products and inventory
商品規格與|Variants and
商品說明|Product description
商品選購|Shop
啟用中|Active
啟用服務|Enable service
圖片上傳中…|Uploading image…
圖片上傳失敗。|Image upload failed.
圖片或|image or
地址|Address
堂數已更新。|Credits updated.
增減堂數|Credit adjustment
姓名|Name
婉拒|Decline
安全付款頁完成刷卡。|secure payment page to pay by card.
安全付款|Secure checkout
完成電子郵件驗證後即可查看會員訂單。|Verify your email to view your orders.
寄送重設連結|Send reset link
寄送驗證信|Send verification email
密碼已更新，請使用新密碼登入。|Password updated. Sign in with your new password.
密碼|Password
封面圖片網址|Cover image URL
尚有名額|Available
已付款|Paid
已停用|Disabled
已出貨|Shipped
已加入購物袋。|Added to your bag.
已取消|Cancelled
已找到訂單|Order found
已收到訂單|Order received
已收到預約申請，商家確認前尚未完成預約或付款。|Request received. Your booking and payment are not confirmed until the merchant confirms.
已有帳號？登入|Already have an account? Sign in
已發布|Published
已確認|Confirmed
已退款|Refunded
已送達|Delivered
已逾期|Expired
已選商品|Your selection
已預約／停用|Booked / disabled
帳戶協助|Account help
庫存|Stock
建立帳號|Create account
建立會員帳號|Create account
建立訂單後，請前往|After creating your order, continue to the
待商家對帳（暫停出貨）|Merchant review required (shipping on hold)
待確認付款|Awaiting payment confirmation
待處理|Pending
忘記密碼？|Forgot password?
您好|Welcome
我同意商家使用我的聯絡資料處理預約申請。|I agree to the merchant using my contact details to process this booking request.
我同意商家就此訊息與我聯絡。|I agree to being contacted about this enquiry.
我已閱讀並同意購物條款與隱私說明。|I have read and agree to the shopping terms and privacy policy.
我已閱讀並同意隱私說明。|I have read and agree to the privacy policy.
我的帳戶|My account
我的訂單|My orders
我的購物袋|My bag
我的預約|My bookings
探索服務|Explore services
搜尋商品|Search products
搜尋|Search
改期申請已送出，等待商家重新確認。|Reschedule request sent. Awaiting merchant confirmation.
改期需重新由商家確認；取消不代表自動退款。私人連結可操作此筆預約，請妥善保管。|Rescheduling requires merchant confirmation. Cancelling does not issue an automatic refund. Keep your private management link secure.
數量|Quantity
文章內容|Article content
文章摘要|Article summary
文章標題|Article title
新增規格|Add variant
新密碼（至少|New password (at least
新文章即將上線。|New stories coming soon.
日常珍選|Considered essentials
時段載入失敗，請稍後重試|Could not load time slots. Try again later.
暫時缺貨|Out of stock
更換時段|Change time slot
更新付款狀態|Refresh payment status
更新密碼|Update password
更新狀態|Refresh status
最後一步|One last step
會員堂數會顯示於此。|Member credits will appear here.
會員專區|Account
會員登入|Sign in
會員與堂數|Members and credits
會員|Member
服務名稱|Service name
服務說明|Service information
服務項目|Services
服務|Service
未接受|Declined
未提供付款狀態|Payment status unavailable
未提供出貨狀態|Shipping status unavailable
未提供狀態|Status unavailable
查看、取消或申請改期（請保留私人連結）|View, cancel or reschedule (keep this private link)
查詢訂單|Find order
標記已出貨|Mark shipped
歡迎與我們聊聊|Get in touch
正在確認安全連結…|Checking secure link…
正在讀取預約…|Loading booking…
測試付款（不扣真錢）|Test payment (no real charge)
測試環境：僅供驗收，不扣真錢、不使用真實卡號。|test mode: no real charges. Do not use real card details.
瀏覽精選商品|Explore the collection
為生活留一份從容|Make room for everyday ease
為生活細心挑選，長久相伴。|Thoughtfully chosen for everyday life.
為自己安排一段自在時光。|Make a little time for yourself.
版型|Layout
物流更新|Shipping updates
用心成就日常|Everyday, considered
申請改期|Request reschedule
留一段時間給自己|Time for yourself
異動原因|Reason for adjustment
登入工作室|Sign in to studio
登入|Sign in
登出|Sign out
發布|Publish
目前使用預覽付款流程。|Preview payment flow is active.
目前尚未收款。|No payment has been received yet.
目前尚無上架商品，敬請期待。|No products available yet.
目前尚無物流更新。|No shipping updates yet.
目前未開啟|Currently disabled:
目前沒有修訂記錄。|No revisions yet.
目前沒有可預約時段|No time slots available
目前沒有商品。|No products yet.
目前沒有文章。|No articles yet.
目前沒有聯絡訊息。|No enquiries yet.
目前沒有訂單。|No orders yet.
目前沒有預約。|No bookings yet.
目前登入：|Signed in as:
確定取消此預約？若已付款，退款請洽商家。|Cancel this booking? If you have paid, contact the merchant about a refund.
確認人工收款|Confirm manual payment
確認訂單|Review order
確認|Confirm
移除規格|Remove variant
移除|Remove
等待商家確認|Awaiting merchant confirmation
管理區導覽|Administration navigation
管理員登入|Administrator sign in
管理員|Administrator
管理商品、預約、會員與品牌內容。|Manage products, bookings, members and brand content.
管理密碼|Administrator password
管理工作室|Merchant studio
精彩內容即將登場，敬請期待。|New content coming soon.
精選商品|Selected products
精選推薦|Selected for you
細心製作，讓每一刻都更合心意。|Thoughtfully made for the moments that matter.
細選日常好物|Everyday essentials
網址代稱|URL slug
網站外觀與資訊|Website appearance and information
網站設定|Website settings
編輯|Edit
聯絡我們|Contact
聯絡訊息|Enquiries
聯絡電子郵件|Contact email
聯絡電話|Phone
若帳號仍需驗證，驗證連結將寄送至會員信箱。|If verification is needed, a link will be sent to your email.
若此電子郵件已有帳號，我們會寄送安全重設連結。|If an account exists, we will email a secure reset link.
若此電子郵件已有帳號，重設連結將寄送至該信箱。|If an account exists, a reset link will be sent to that email.
草稿|Draft
處理中|Processing
要將「|Restore “
規格名稱|Variant name
訂單尚未開放，歡迎先與我們聯絡。|Ordering is not yet available. Please contact us.
訂單已建立|Order created
訂單操作|Order action
訂單查詢|Order lookup
訂單編號|Order number
訂單與出貨|Orders and fulfillment
訂單送出後將由商家人工確認付款；本網站不會在線上收款。|The merchant will confirm payment manually. This website does not collect online payments.
訂單電子郵件|Order email
訂單|Order
訊息已送出，謝謝您。|Message sent. Thank you.
訊息載入中…|Loading messages…
訊息|Message
記錄退款|Record refund
訪客|Guest
設定新密碼|Set a new password
誌記|Journal
調整堂數|Adjust credits
請使用建立預約時取得的完整私人連結。|Use the complete private link you received when booking.
請先勾選同意購物條款與隱私說明。|Please agree to the shopping terms and privacy policy.
請先同意聯絡資料使用說明。|Please consent to the use of your contact details.
請先同意隱私說明。|Please agree to the privacy policy.
請先新增服務項目。|Add a service first.
請先登入管理後台|Please sign in to the merchant studio.
請完成電子郵件驗證以啟用會員帳戶。|Please verify your email to activate your account.
請新增可預約時段。|Add available booking times.
請求失敗（|Request failed (
請稍後再試。|Please try again later.
請輸入物流業者|Enter shipping carrier
請輸入物流追蹤編號|Enter tracking number
請輸入退款參考編號|Enter refund reference
讓日常更貼近理想|Everyday life, thoughtfully shaped
資源代碼|Resource ID
購物政策|Shopping policy
購物與隱私政策|Shopping and privacy policies
購物袋目前是空的，挑選幾件喜歡的商品吧。|Your bag is empty. Explore our collection.
購物袋目前是空的。|Your bag is empty.
購物袋|Bag
輸入要還原的修訂編號（取消以離開）：|Enter the revision ID to restore (cancel to exit):
退換政策|Returns policy
送出訂單|Place order
送出訊息|Send message
送出預約申請|Request booking
通知，請保留下方私人連結查詢。|notifications. Keep the private link below to check your booking.
選擇合適的服務與時間。|Choose a service and a time that suits you.
選擇操作|Choose action
選擇規格|Choose variant
還原為草稿嗎？|” as a draft?
配送地址|Shipping address
配送說明|Shipping policy
重設密碼|Reset password
重設連結已失效，請重新申請。|This reset link has expired. Request a new one.
開啟選單|Open menu
開放預約|Enable booking
關於品牌|About the brand
關於我們|About us
關閉選單|Close menu
隱私說明|Privacy policy
電子郵件已驗證，謝謝你。|Email verified. Thank you.
電子郵件|Email
靈感與日常|Stories and inspiration
預約、服務與時段|Bookings, services and times
預約已送出。|Booking submitted.
預約政策|Booking policy
預約時段即將開放，敬請期待。|Booking times coming soon.
預約時段|Book a time
預約服務|Booking
預約申請需由商家確認；送出不代表付款或預約已確認。|Bookings require merchant confirmation. Submitting a request does not confirm payment or your booking.
預約管理|Manage booking
預約|Book
預覽|Preview
顯示於商店|Show in store
首頁圖片網址|Homepage image URL
首頁標題|Homepage heading
首頁說明|Homepage description
首頁|Home
驗證連結已失效，請重新登入後申請新的驗證信。|Verification link expired. Sign in and request another email.
驗證電子郵件|Verify email
堂|credits
操作沒有完成，請稍後重試；既有資料不受影響。|The operation could not be completed. Try again; existing data is unchanged.
訊息已送達網站後台，商家將再與你聯絡。|Your message reached the merchant inbox. The merchant will contact you.
`.trim().split('\n').map(line => line.split('|'))
export const messages = { en: Object.fromEntries(english) }
for (const [index, locale] of ['ja', 'fr', 'es', 'ar'].entries()) messages[locale] = Object.fromEntries(customerLanguageRows.map(row => [row[0], row[index + 1]]))
