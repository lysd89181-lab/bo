// ملفي — الترجمة (عربي ← إنجليزي) واللغة والمظهر
// الواجهة مكتوبة بالعربي، وفي الوضع الإنجليزي نترجم النصوص الثابتة في الصفحة تلقائياً.
// بيانات المستخدم (أسماء الزباين، المنتجات…) ما تتترجمش.

export const LANG = (() => { try { return localStorage.getItem('malafy.lang') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; } })();
export const isEN = LANG === 'en';
export const getTheme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
export function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('malafy.theme', t); } catch { } }
export function setLang(l) { try { localStorage.setItem('malafy.lang', l); } catch { } location.reload(); }

const D = {
  // عام وتنقل
  'ملفي': 'Malafy', 'الرئيسية': 'Home', 'المنتجات': 'Products', 'الملفات': 'Profiles', 'المبيعات': 'Sales', 'العملاء': 'Customers',
  'التذكيرات': 'Reminders', 'الإعدادات': 'Settings', 'نظرة عامة': 'Overview', 'التجار': 'Merchants', 'طلبات الاشتراك': 'Subscription requests',
  'خطط الاشتراك': 'Subscription plans', 'الإعدادات العامة': 'General settings', 'البنرات': 'Banners', 'لوحة الأدمن': 'Admin panel', 'لوحة التاجر': 'Merchant panel',
  'تسجيل الخروج': 'Log out', 'مدير المنصة': 'Platform admin', 'جاري التحميل…': 'Loading…', 'جاري تحميل بياناتك…': 'Loading your data…',
  'ابحث عن زبون، منتج، أو رقم…': 'Search customers, products, or numbers…', 'ابحث عن تاجر بالاسم أو الإيميل…': 'Search merchants by name or email…',
  'القائمة': 'Menu', 'بحث': 'Search', 'التنبيهات': 'Notifications', 'إغلاق': 'Close', 'عرض الكل': 'View all', 'الكل': 'All', 'عرض': 'View',
  'تأكيد': 'Confirm', 'إلغاء': 'Cancel', 'حذف': 'Delete', 'تعديل': 'Edit', 'حفظ': 'Save', 'إضافة': 'Add', 'نسخ': 'Copy', 'إظهار': 'Show',
  'إعادة المحاولة': 'Try again', 'ما فيش نتائج': 'No results', 'تم النسخ': 'Copied', 'تم الحذف': 'Deleted', 'تم الحفظ': 'Saved',
  'تغيير المظهر': 'Toggle theme', 'تغيير اللغة': 'Change language', 'الآن': 'Just now', 'منذ يوم': '1 day ago',
  // الصفحة الرئيسية للتاجر
  'التذكيرات ': 'Reminders', 'تابع عملاءك قبل ما تنتهي اشتراكاتهم': 'Follow up before subscriptions end', 'ما فيش اشتراكات نشطة حالياً.': 'No active subscriptions right now.',
  'بيع جديد': 'New sale', 'إضافة منتج': 'Add product', 'أرباح الشهر': 'Monthly profit', 'مبيعات اليوم': "Today's sales", 'المتاح للبيع': 'Available to sell',
  'ملفات، أكواد، وأرقام': 'Profiles, codes & numbers', 'مقارنة بالشهر الماضي': 'vs last month', 'مقارنة بالأمس': 'vs yesterday', 'بداية قوية': 'Strong start',
  'ملفات الحساب وحالة كل واحد': 'Account profiles and their status', 'أضف أول حساب وقسّمه لملفات.': 'Add your first account and split it into profiles.',
  'إضافة حساب': 'Add account', 'سجل المبيعات': 'Sales log', 'آخر عمليات البيع': 'Latest sales', 'ما فيش مبيعات للحين.': 'No sales yet.',
  'صافي الربح': 'Net profit', 'آخر 7 أيام': 'Last 7 days', 'العميل': 'Customer', 'المنتج': 'Product', 'العنصر': 'Item', 'النوع': 'Type',
  'السعر': 'Price', 'الربح': 'Profit', 'التاريخ': 'Date', 'الحالة': 'Status', 'إعادة إرسال': 'Resend',
  // الحالات
  'متاح': 'Available', 'مباع': 'Sold', 'قريب ينتهي': 'Ending soon', 'انتهى': 'Expired', 'منتهي': 'Ended', 'نشط': 'Active', 'مسلّم': 'Delivered',
  'تم التجديد': 'Renewed', 'لم يجدد': 'Not renewed', 'جاهز للبيع': 'Ready to sell', 'الحساب منتهي': 'Account ended', 'موقوف': 'Suspended',
  'أدمن': 'Admin', 'قيد المراجعة': 'Pending', 'تم التفعيل': 'Activated', 'مرفوض': 'Rejected', 'نفد المخزون': 'Out of stock',
  'ملف': 'Profile', 'كود': 'Code', 'رقم': 'Number', 'حساب': 'Account', 'أكواد': 'Codes',
  'جدّد': 'Renew', 'تذكير': 'Remind', 'تذكير بالتجديد': 'Renewal reminder', 'انتهى الاشتراك': 'Expired', 'ينتهي اليوم': 'Ends today', 'متبقي يومين': '2 days left',
  // المنتجات
  'الحسابات، الأكواد، والأرقام اللي عندك': 'Your accounts, codes and numbers', 'إضافة فئة أكواد': 'Add code category', 'إضافة رقم': 'Add number',
  'الحسابات': 'Accounts', 'الأكواد': 'Codes', 'الأرقام': 'Numbers', 'الملفات ': 'Profiles', 'سعر الشراء': 'Purchase price', 'الملف شهرياً': 'Profile / month',
  'الإيراد': 'Revenue', 'بيع ملف': 'Sell profile', 'بيع كود': 'Sell code', 'بيع': 'Sell', 'سعر البيع': 'Sale price', 'إضافة فئة': 'Add category',
  'ما عندكش حسابات. أضف حساب Netflix أو Shahid وقسّمه لملفات.': "You don't have accounts yet. Add a Netflix or Shahid account and split it into profiles.",
  'أضف فئة أكواد، مثلاً "ببجي 60 UC"، والصق الأكواد دفعة وحدة.': 'Add a code category, e.g. "PUBG 60 UC", and paste the codes in one go.',
  'ابحث بالرقم…': 'Search by number…', 'كل الدول': 'All countries', 'الرقم': 'Number', 'الدولة': 'Country', 'الشراء': 'Purchase', 'البيع': 'Sale',
  'ما فيش أرقام تطابق البحث.': 'No numbers match your search.', 'أضف الأرقام اللي شاريها، كل رقم بدولته وسعره.': 'Add the numbers you bought, each with its country and price.',
  'عرض الأكواد': 'View codes', 'نسخ الإيميل': 'Copy email', 'نسخ كلمة المرور': 'Copy password',
  // الملفات
  'كل ملفات حساباتك وحالتها': 'All your account profiles and their status', 'كل الحسابات': 'All accounts', 'ما فيش ملفات بهذي الحالة.': 'No profiles with this status.',
  'ما عندكش حسابات للحين.': "You don't have accounts yet.",
  // المبيعات
  'كل عمليات البيع والأرباح': 'All sales and profits', 'ابحث بالعميل، المنتج، أو الكود…': 'Search by customer, product, or code…', 'كل الأنواع': 'All types',
  'كل الأشهر': 'All months', 'عدد العمليات': 'Transactions', 'ما فيش مبيعات تطابق الفلتر.': 'No sales match this filter.',
  // العملاء
  'بيانات زباينك ومشترياتهم': 'Your customers and their purchases', 'إضافة عميل': 'Add customer', 'ابحث بالاسم أو الرقم…': 'Search by name or number…',
  'الاسم': 'Name', 'واتساب': 'WhatsApp', 'المشتريات': 'Purchases', 'الإجمالي': 'Total', 'آخر شراء': 'Last purchase',
  'ما فيش عملاء يطابقوا البحث.': 'No customers match your search.', 'العملاء ينضافوا تلقائياً مع أول عملية بيع، أو تقدر تضيفهم يدوي.': 'Customers are added automatically with their first purchase, or you can add them manually.',
  'اشتراكات حالية': 'Current subscriptions', 'سجل المشتريات': 'Purchase history', 'محادثة واتساب': 'WhatsApp chat', 'تعديل العميل': 'Edit customer',
  'ملاحظات': 'Notes', 'فيه عميل بنفس الاسم. زيد حرف أو لقب يميزه.': 'A customer with this name exists. Add something to tell them apart.',
  // التذكيرات
  'اشتراكات الملفات حسب تاريخ الانتهاء': 'Profile subscriptions by end date', 'انتهت': 'Ended', 'تنتهي خلال 3 أيام': 'Ending within 3 days', 'نشطة': 'Active',
  'جدّد للزبون، أو سجّل إنه لم يجدد باش يرجع الملف متاح': 'Renew for the customer, or mark as not renewed to free the profile',
  'ذكّر الزبون برسالة واتساب جاهزة': 'Remind the customer with a ready WhatsApp message', 'اشتراكات شغالة': 'Running subscriptions',
  'ما فيش ملفات مباعة حالياً.': 'No sold profiles right now.',
  // الإعدادات
  'بياناتك، قوالب الرسائل، والاشتراك': 'Your info, message templates and subscription', 'بياناتك': 'Your info', 'الاسم أو اسم المتجر': 'Name or store name',
  'رقم الواتساب': 'WhatsApp number', 'العملة': 'Currency', 'دولار ($)': 'US Dollar ($)', 'دينار ليبي (د.ل)': 'Libyan Dinar (LYD)', 'ريال سعودي (ر.س)': 'Saudi Riyal (SAR)',
  'البريد الإلكتروني': 'Email', 'حفظ البيانات': 'Save info', 'الاشتراك': 'Subscription', 'اشتراكك غير مفعّل حالياً.': 'Your subscription is not active.',
  'تجديد الاشتراك': 'Renew subscription', 'تفعيل الاشتراك': 'Activate subscription', 'قوالب الرسائل': 'Message templates',
  'اضغط على المتغير باش ينضاف مكان المؤشر. النظام يبدّله ببيانات الزبون وقت التسليم.': 'Tap a variable to insert it at the cursor. It gets replaced with the customer data on delivery.',
  'تسليم ملف حساب': 'Profile delivery', 'تسليم كود': 'Code delivery', 'تسليم رقم': 'Number delivery', 'حفظ القوالب': 'Save templates',
  'استرجاع القوالب الافتراضية': 'Restore default templates', 'طلباتك': 'Your requests', 'الاشتراك غير مفعّل': 'Subscription inactive',
  'تم حفظ البيانات': 'Info saved', 'تم حفظ القوالب': 'Templates saved',
  // بوابة الاشتراك
  'انتهى اشتراكك': 'Your subscription has ended', '1. اختار المدة': '1. Choose a duration', '2. اختار طريقة الدفع': '2. Choose a payment method',
  'طلبك وصل الإدارة وقيد المراجعة. أول ما يتفعّل تفتح لوحتك تلقائياً.': 'Your request reached the admin and is under review. Your panel opens automatically once activated.',
  'بياناتك محفوظة. جدّد الاشتراك باش ترجع تبيع وتعدّل.': 'Your data is safe. Renew to keep selling and editing.',
  'اختار مدة الاشتراك، ادفع، وابعت رقم العملية. الإدارة تفعّل حسابك.': 'Pick a plan, pay, and send the transaction reference. The admin activates your account.',
  'دفعت عن طريق': 'Paid via', 'رقم العملية أو المرسِل': 'Transaction or sender number', 'رقم العملية': 'Transaction number', 'ملاحظة (اختياري)': 'Note (optional)',
  'إرسال طلب التفعيل': 'Send activation request', 'ما فيش خطط اشتراك متاحة حالياً. تواصل مع الإدارة.': 'No plans available right now. Contact the admin.',
  'اختار خطة.': 'Choose a plan.', 'اختار طريقة الدفع.': 'Choose a payment method.', 'عندك طلب قيد المراجعة.': 'You already have a pending request.',
  'تم إرسال الطلب للإدارة': 'Request sent to the admin', 'العملة:': 'Currency:', 'ما فيش طرق دفع لهذي العملة.': 'No payment methods for this currency.',
  // التحقق من الإيميل
  'أكّد بريدك الإلكتروني': 'Verify your email', 'بعتنالك رابط تأكيد على': 'We sent a verification link to',
  'افتح الرسالة واضغط الرابط، وبعدين ارجع هنا واضغط "تأكدت".': 'Open the email, tap the link, then come back and tap "I verified".',
  'لو ما لقيتهاش، شوف مجلد الرسائل غير المرغوب فيها (Spam).': "If you can't find it, check your Spam folder.",
  'تأكدت': 'I verified', 'إعادة إرسال الرابط': 'Resend link', 'تم إرسال رابط جديد': 'New link sent', 'البريد لسه ما تأكدش. افتح الرابط من الإيميل وجرّب مرة ثانية.': "Email isn't verified yet. Open the link in the email and try again.",
  'استنى دقيقة قبل ما تطلب رابط جديد.': 'Wait a minute before requesting a new link.',
  // نوافذ البيع
  'اسم الزبون': 'Customer name', 'المدة': 'Duration', 'تاريخ البداية': 'Start date', 'تأكيد البيع': 'Confirm sale', 'ينتهي في': 'Ends on',
  'تكلفة الملف للمدة': 'Profile cost for period', ' (نهاية الحساب)': ' (account end)', 'تم البيع': 'Sold', 'تسليم الملف': 'Deliver profile',
  'تسليم الكود': 'Deliver code', 'تسليم الرقم': 'Deliver number', 'تسليم للزبون': 'Deliver to customer', 'الرسالة': 'Message', 'واتساب الزبون': "Customer's WhatsApp",
  'إرسال على واتساب': 'Send on WhatsApp', 'نسخ الرسالة': 'Copy message', 'اكتب رقم واتساب الزبون': "Enter the customer's WhatsApp number",
  'اكتب اسم الزبون.': 'Enter the customer name.', 'الملف هذا تباع من قبل.': 'This profile was already sold.', 'تاريخ البداية بعد نهاية الحساب.': 'Start date is after the account end.',
  'الحساب هذا منتهي': 'This account has ended', 'ما فيش ملفات متاحة في هذا الحساب': 'No available profiles in this account', 'ما فيش أكواد متاحة': 'No codes available',
  'الفئة': 'Category', 'نفدت أكواد هذي الفئة.': 'This category is out of codes.', 'بيع رقم': 'Sell number', 'الرقم هذا مش متاح': 'This number is not available',
  'الرقم هذا تباع من قبل.': 'This number was already sold.', 'ما عندكش مخزون متاح للبيع.': 'You have no stock to sell.', 'الزبون': 'Customer', 'من': 'From', 'إلى': 'To',
  'إعادة إرسال بيانات الملف': 'Resend profile details', 'رسالة التجديد': 'Renewal message', 'رسالة التذكير': 'Reminder message',
  'مدة التجديد': 'Renewal period', 'ينتهي الجديد في': 'New end date', 'تأكيد التجديد': 'Confirm renewal', 'تم التجديد ': 'Renewed',
  'الحساب نفسه منتهي': 'The account itself has ended', 'تحرير الملف': 'Free profile', 'لم يجدد، حرّر الملف': 'Not renewed, free profile', 'الملف رجع متاح': 'Profile is available again',
  'الحساب': 'Account', 'انتهى/ينتهي في': 'Ended / ends on', 'المنتج محذوف، ما نقدرش نجيب بياناته': "Product was deleted, can't load its details",
  // نماذج المنتجات
  'إضافة حساب جديد': 'Add new account', 'تعديل الحساب': 'Edit account', 'اسم المنتج': 'Product name', 'إيميل الحساب': 'Account email', 'كلمة المرور': 'Password',
  'بداية الحساب': 'Account start', 'نهاية الحساب': 'Account end', 'عدد الملفات': 'Profiles count', 'حفظ التعديل': 'Save changes',
  'تقدر تزيد عدد الملفات، لكن ما تقدرش تنقصه.': 'You can increase the number of profiles, but not decrease it.', 'اكتب اسم المنتج.': 'Enter the product name.',
  'اكتب إيميل الحساب.': 'Enter the account email.', 'نهاية الحساب لازم تكون بعد البداية.': 'Account end must be after the start.', 'عدد الملفات من 1 لـ 50.': 'Profiles count must be 1 to 50.',
  'تعديل فئة الأكواد': 'Edit code category', 'اسم الفئة': 'Category name', 'سعر شراء الكود': 'Code purchase price', 'سعر بيع الكود': 'Code sale price',
  'الأكواد (كل كود في سطر)': 'Codes (one per line)', 'اكتب اسم الفئة.': 'Enter the category name.', 'الصق الأكواد أولاً.': 'Paste the codes first.',
  'الأكواد كلها موجودة من قبل': 'All codes already exist', 'ما فيش أكواد.': 'No codes.', 'تم حذف الكود': 'Code deleted', 'تعديل الرقم': 'Edit number',
  'حفظ وإضافة آخر': 'Save & add another', 'اكتب الرقم.': 'Enter the number.', 'اكتب الدولة.': 'Enter the country.', 'الرقم هذا مضاف من قبل.': 'This number already exists.',
  'تم إضافة الرقم': 'Number added', 'تم حفظ التعديل': 'Changes saved', 'حذف المنتج': 'Delete product', 'اكتب الاسم.': 'Enter the name.',
  // الأدمن
  'لوحة إدارة ملفي': 'Malafy admin', 'طلبات تنتظرك': 'Requests waiting', 'فعّل التجار بعد التأكد من الدفع': 'Activate merchants after confirming payment',
  'ما فيش طلبات جديدة.': 'No new requests.', 'اشتراكات تنتهي قريب': 'Subscriptions ending soon', 'خلال 5 أيام': 'Within 5 days',
  'ما فيش اشتراكات قريبة الانتهاء.': 'No subscriptions ending soon.', 'إيرادات المنصة': 'Platform revenue', 'التجار النشطين': 'Active merchants',
  'إجمالي التجار': 'Total merchants', 'هذا الشهر': 'this month', 'نمو المنصة': 'Platform growth', 'الإيرادات وتسجيلات التجار، آخر 6 أشهر': 'Revenue and sign-ups, last 6 months',
  '━ الإيرادات': '━ Revenue', '● تسجيلات': '● Sign-ups', 'آخر النشاطات': 'Recent activity', 'ما فيش نشاط للحين.': 'No activity yet.', 'مخطط نمو المنصة': 'Platform growth chart',
  'إدارة التجار': 'Merchants', 'تفعيل، إيقاف، وتمديد الاشتراكات': 'Activate, suspend and extend subscriptions', 'ابحث بالاسم، الإيميل، أو الرقم…': 'Search by name, email, or number…',
  'التاجر': 'Merchant', 'الخطة': 'Plan', 'مفعّل': 'Enabled', 'تمديد': 'Extend', 'ما فيش تجار يطابقوا البحث.': 'No merchants match your search.',
  'الانتهاء الحالي': 'Current end', 'غير مشترك': 'Not subscribed', 'تمديد يدوي': 'Manual extension', 'حفظ وتفعيل': 'Save & activate', 'إنهاء الاشتراك': 'End subscription',
  'التاريخ لازم يكون في المستقبل.': 'The date must be in the future.', 'تم التمديد': 'Extended', 'تم إنهاء الاشتراك': 'Subscription ended',
  'راجع الدفع وفعّل التاجر بضغطة': 'Review payment and activate in one tap', 'المفعّلة': 'Activated', 'المرفوضة': 'Rejected', 'المبلغ': 'Amount',
  'طريقة الدفع': 'Payment method', 'بيانات الدفع': 'Payment details', 'تفعيل': 'Activate', 'رفض': 'Reject', 'ما فيش طلبات هنا.': 'No requests here.',
  'حساب التاجر مش موجود': 'Merchant account not found', 'تفعيل الاشتراك ': 'Activate subscription', 'رفض الطلب': 'Reject request', 'سبب الرفض (يظهر للتاجر)': 'Reason (shown to merchant)',
  'مثلاً: المبلغ ما وصلش': "e.g. payment wasn't received", 'تم رفض الطلب': 'Request rejected', 'المدد والأسعار اللي يشوفها التاجر عند التفعيل': 'Durations and prices merchants see when subscribing',
  'إضافة خطة': 'Add plan', 'ما فيش خطط. أضف خطة باش التجار يقدروا يشتركوا.': 'No plans yet. Add one so merchants can subscribe.', 'تعديل الخطة': 'Edit plan',
  'اسم الخطة': 'Plan name', 'المدة بالأشهر': 'Duration (months)', 'السعر بالدينار الليبي': 'Price in LYD', 'السعر بالريال السعودي': 'Price in SAR',
  'اتركه فاضي لو الخطة ما تتباعش بهذي العملة': 'Leave empty if the plan is not sold in this currency', 'ظاهرة للتجار': 'Visible to merchants',
  'اكتب اسم الخطة.': 'Enter the plan name.', 'المدة شهر على الأقل.': 'Duration must be at least 1 month.', 'حط سعر بعملة وحدة على الأقل.': 'Set a price in at least one currency.',
  'تم حفظ الخطة': 'Plan saved', 'مخفية': 'Hidden', 'التسجيل وطرق الدفع اللي تظهر للتجار': 'Registration and payment methods shown to merchants', 'التسجيل': 'Registration',
  'التسجيل مفتوح': 'Registration open', 'لو قفلته، ما حد يقدر يسجّل كتاجر جديد': 'If closed, no new merchants can sign up',
  'ملاحظة عامة فوق طرق الدفع (اختياري)': 'General note above payment methods (optional)', 'طرق الدفع': 'Payment methods',
  'التاجر يختار وحدة، وتطلعله تفاصيلها جاهزة للنسخ': 'Merchants pick one and get its details ready to copy', 'إضافة طريقة': 'Add method',
  'ما فيش طرق دفع. أضف مصرف أو ليبيانا باش التاجر يعرف وين يحوّل.': 'No payment methods yet. Add a bank or Libyana so merchants know where to pay.',
  'إضافة طريقة دفع': 'Add payment method', 'تعديل طريقة الدفع': 'Edit payment method', 'قالب جاهز': 'Preset', 'صورة': 'Image', 'إزالة': 'Remove',
  'اسم الطريقة': 'Method name', 'التفاصيل اللي يشوفها التاجر (كل وحدة جنبها زر نسخ)': 'Details the merchant sees (each with a copy button)',
  'اسم الحقل': 'Field name', 'القيمة': 'Value', 'حذف الحقل': 'Delete field', 'حقل جديد': 'New field', 'الحقل اللي يعبيه التاجر': 'Field the merchant fills in',
  'ملاحظة تظهر تحت التفاصيل (اختياري)': 'Note under the details (optional)', 'الترتيب': 'Order', 'العملات': 'Currencies', 'دينار ليبي': 'Libyan Dinar', 'ريال سعودي': 'Saudi Riyal',
  'اكتب اسم الطريقة.': 'Enter the method name.', 'عبّي حقل واحد على الأقل (الاسم والقيمة).': 'Fill at least one field (name and value).', 'تم حفظ طريقة الدفع': 'Payment method saved',
  'تحويل مصرفي': 'Bank transfer', 'ليبيانا': 'Libyana', 'المدار': 'Almadar',
  // البنرات
  'بنرات دعائية تظهر للتجار في لوحتهم': 'Promo banners shown in the merchant panel', 'إضافة بنر': 'Add banner', 'تعديل البنر': 'Edit banner',
  'ما فيش بنرات. أضف صورة ورابط يوديه للمكان اللي تبيه.': 'No banners yet. Add an image and a link.', 'صورة البنر': 'Banner image',
  'المقاس المناسب 1200×400 تقريباً': 'Recommended size about 1200×400', 'لما يضغط عليه يمشي لـ': 'On tap, go to', 'بدون رابط': 'No link', 'موقع': 'Website',
  'تيك توك': 'TikTok', 'فيسبوك': 'Facebook', 'رقم واتساب': 'WhatsApp number', 'الرابط أو الحساب': 'Link or account', 'اختار صورة البنر.': 'Choose a banner image.',
  'الرابط غير صحيح.': 'Invalid link.', 'تم حفظ البنر': 'Banner saved', 'بدون رابط ': 'No link', 'معاينة الرابط': 'Preview link',
  // تسجيل الدخول
  'ملفي — تسجيل الدخول': 'Malafy — Sign in', 'ملفي — لوحة التاجر': 'Malafy — Merchant panel', 'ملفي — لوحة الأدمن': 'Malafy — Admin panel',
  'إدارة وبيع المنتجات الرقمية في مكان واحد: الحسابات وملفاتها، الأكواد، الأرقام، والزباين.': 'Manage and sell digital products in one place: accounts and profiles, codes, numbers, and customers.',
  'أرباح أوضح': 'Clearer profits', 'تسليم بضغطة': 'One-tap delivery', 'بياناتك لك وحدك': 'Your data stays yours', 'تسجيل الدخول': 'Sign in',
  'حساب تاجر جديد': 'New merchant account', 'أهلاً بعودتك': 'Welcome back', 'ادخل لحسابك وكمّل شغلك.': 'Sign in and get back to work.',
  'نسيت كلمة المرور؟': 'Forgot password?', 'بعد التسجيل تختار خطة الاشتراك، والإدارة تفعّل حسابك.': 'After signing up you choose a plan, and the admin activates your account.',
  'التسجيل مغلق حالياً. تواصل مع إدارة المنصة.': 'Registration is closed. Contact the platform admin.', '6 أحرف على الأقل': 'At least 6 characters', 'إنشاء الحساب': 'Create account',
  'اكتب الإيميل وكلمة المرور.': 'Enter your email and password.', 'بعتنالك رابط استعادة كلمة المرور على الإيميل': 'We emailed you a password reset link',
  'اكتب إيميلك فوق، وبعدين اضغط "نسيت كلمة المرور".': 'Enter your email above, then tap "Forgot password".', 'عبّي كل الحقول.': 'Fill in all fields.',
  'كلمة المرور لازم 6 أحرف على الأقل.': 'Password must be at least 6 characters.',
  // أخطاء
  'ما عندكش صلاحية لهذي العملية. تأكد إن اشتراكك مفعّل.': "You don't have permission. Make sure your subscription is active.",
  'تعذر الاتصال بالسيرفر. تحقق من الإنترنت.': "Couldn't reach the server. Check your connection.", 'الإيميل أو كلمة المرور غلط.': 'Wrong email or password.',
  'كلمة المرور غلط.': 'Wrong password.', 'ما فيش حساب بهذا الإيميل.': 'No account with this email.', 'الإيميل هذا مسجّل من قبل.': 'This email is already registered.',
  'كلمة المرور ضعيفة، خليها 6 أحرف على الأقل.': 'Weak password, use at least 6 characters.', 'صيغة الإيميل غير صحيحة.': 'Invalid email format.',
  'محاولات كثيرة، استنى شوية وجرّب.': 'Too many attempts, wait a bit and try again.', 'تعذر الاتصال. تحقق من الإنترنت.': "Couldn't connect. Check your internet.",
  'صار خطأ غير متوقع.': 'Something went wrong.', 'تعذر تحميل بعض البيانات. تحقق من الإنترنت.': "Couldn't load some data. Check your connection.",
  'تعذر تحميل البيانات. تأكد إن حسابك أدمن والقواعد منشورة.': "Couldn't load data. Make sure you're an admin and the rules are published.",
  'اشتراكك غير مفعّل. فعّله من صفحة الاشتراك.': 'Your subscription is inactive. Activate it from the subscription page.',
  'اختار ملف صورة.': 'Choose an image file.', 'تعذر قراءة الصورة.': "Couldn't read the image.", 'صيغة الصورة غير مدعومة.': 'Unsupported image format.',
  'الصورة كبيرة، جرّب صورة أبسط.': 'Image is too large, try a simpler one.', 'لم يجدد ': 'Not renewed',
  'انتبه: سعر الطلب': 'Warning: request price', 'يختلف عن سعر الخطة الحالي': 'differs from the current plan price', 'على': 'on', '، لين': ', until',
  'تأكد إن مبلغ': 'Make sure', 'وصلك.': 'was received.', 'اختار عملة وحدة على الأقل.': 'Choose at least one currency.', 'حذف البنر؟': 'Delete this banner?',
  '━ تفعيلات': '━ Activations', 'التفعيلات وتسجيلات التجار، آخر 6 أشهر': 'Activations and sign-ups, last 6 months', 'عروض': 'Offers', 'اكتب': 'Enter', 'الكود': 'Code', 'مثلاً: التفعيل خلال ساعة من التحويل': 'e.g. Activation within an hour of payment',
  'حسابك محذوف. تواصل مع إدارة المنصة لو عندك استفسار.': 'Your account was deleted. Contact the platform admin if you have questions.', 'محذوف': 'Deleted',
  'حذف التاجر': 'Delete merchant', 'بيتمسح كل شي يخص': 'This permanently erases everything for', 'المنتجات، الملفات، الأكواد، الأرقام، العملاء، المبيعات، والقوالب.': 'products, profiles, codes, numbers, customers, sales and templates.',
  'الحذف نهائي وما يرجعش.': 'This cannot be undone.', 'للتأكيد اكتب إيميل التاجر': "Type the merchant's email to confirm", 'حذف نهائي': 'Delete permanently', 'تم حذف': 'Deleted', 'تم حذف التاجر': 'Merchant deleted',
  // أسماء الخطط الافتراضية والتواصل
  'ليبيا': 'Libya', 'السعودية': 'Saudi Arabia'
};

// أنماط للنصوص اللي فيها أرقام أو بيانات
const P = [
  [/^متبقي (\d+) (?:أيام|يوم)$/, '$1 days left'],
  [/^منذ (\d+) دقيقة$/, '$1 min ago'], [/^منذ (\d+) ساعة$/, '$1 h ago'], [/^منذ (\d+) يوم$/, '$1 days ago'],
  [/^(\d+) (?:أشهر|شهر)$/, '$1 months'], [/^شهر$/, '1 month'], [/^شهرين$/, '2 months'],
  [/^\+(\d+) (?:أشهر|شهر)$/, '+$1 months'], [/^\+شهر$/, '+1 month'], [/^\+شهرين$/, '+2 months'],
  [/^(\d+) مباع من (\d+)$/, '$1 of $2 sold'], [/^(\d+) متاح$/, '$1 available'], [/^(\d+) كود$/, '$1 codes'], [/^(\d+) كود مضاف$/, '$1 codes added'],
  [/^(\d+) ملف متاح$/, '$1 profiles available'], [/^(\d+) كود متاح$/, '$1 codes available'], [/^(\d+) حقل$/, '$1 fields'], [/^(\d+) حقل، مخفية$/, '$1 fields, hidden'],
  [/^(\d+) رقم متاح، اختار الرقم من القائمة$/, '$1 numbers available, pick one from the list'],
  [/^الملف #(\d+)$/, 'Profile #$1'], [/^بيع (.+)، الملف #(\d+)$/, 'Sell $1, profile #$2'], [/^(.+)، الملف #(\d+)$/, '$1, profile #$2'],
  [/^(.+): (\d+) تاجر$/, '$1: $2 merchants'], [/^مفعّل حتى (.+)$/, (m, a) => `Active until ${tr(a) || a}`], [/^طلب (.+): (.+)$/, (m, a, b) => `${a}'s request: ${tr(b) || b}`],
  [/^مشترك حتى (.+)$/, 'Subscribed until $1'], [/^مرحباً، (.+)$/, 'Hello, $1'], [/^مرحباً، بيك$/, 'Hello'],
  [/^أهلاً (.*)، خطوة وحدة وتبدأ$/, 'Welcome $1, one step to start'],
  [/^اشتراكك في ملفي (.+)\.$/, (m, a) => `Your Malafy subscription: ${tr(a) || a}.`],
  [/^(.+) إلى (.+)$/, '$1 to $2'], [/^ينتهي (\d{4}\/\d\d\/\d\d)$/, 'Ends $1'],
  [/^مباع لـ (.+)$/, 'Sold to $1'], [/^تم إضافة (.+) بـ (\d+) ملفات$/, 'Added $1 with $2 profiles'], [/^تم إضافة (\d+) كود$/, 'Added $1 codes'],
  [/^تم إضافة (.+) مع (\d+) كود$/, 'Added $1 with $2 codes'], [/^تم إضافة (.+)$/, 'Added $1'],
  [/^تم تفعيل (.+)$/, 'Activated $1'], [/^تم إيقاف (.+)$/, 'Suspended $1'],
  [/^تجديد (.+)$/, 'Renew $1'], [/^تمديد اشتراك (.+)$/, 'Extend $1'], [/^أكواد (.+)$/, '$1 codes'], [/^إضافة أكواد: (.+)$/, 'Add codes: $1'],
  [/^عدد الملفات ما يقلش عن (\d+)\.$/, 'Profiles count cannot be less than $1.'],
  [/^من أصل (\d+) تاجر$/, 'out of $1 merchants'], [/^\+(\d+) هذا الشهر$/, '+$1 this month'],
  [/^(\d+) تاجر جديد هذا الشهر، وما فيش طلبات تنتظر التفعيل\.$/, '$1 new merchants this month, no pending requests.'],
  [/^(\d+) تاجر جديد هذا الشهر، و(\d+) طلب ينتظر التفعيل\.$/, '$1 new merchants this month, $2 pending requests.'],
  [/^(.+) سجّل كتاجر جديد$/, '$1 signed up as a merchant'], [/^(.+) طلب اشتراك (.+)$/, '$1 requested $2'],
  [/^تم تفعيل (.+) \((.+)\)$/, 'Activated $1 ($2)'], [/^تم رفض طلب (.+)$/, 'Rejected $1’s request'],
  [/^سجّل (.+)$/, 'Joined $1'], [/^قيد المراجعة \((\d+)\)$/, 'Pending ($1)'], [/^تفعيل (.+)$/, 'Activate $1'],
  [/^اكتب (.+)\.$/, (m, a) => `Enter ${tr(a) || a}.`], [/^(.+)، (.+)$/, (m, a, b) => `${tr(a) || a}, ${tr(b) || b}`],
  [/^(.+) \((.+)\)$/, (m, a, b) => `${tr(a) || a} (${tr(b) || b})`], [/^(.+):$/, (m, a) => `${tr(a) || a}:`]
];

const AR = /[\u0600-\u06FF]/;
export function tr(s) {
  const k = String(s).trim();
  if (!k || !AR.test(k)) return null;
  if (D[k]) return D[k];
  for (const [re, rep] of P) if (re.test(k)) { const out = k.replace(re, rep); if (out !== k) return out; }
  return null;
}
// ترجمة نص في الكود مباشرة (للرسائل والعناوين المبنية بالـ JS)
export const t = s => (isEN && tr(s)) || s;

const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION']);
function walk(root) {
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.closest?.('[data-raw]')) return;
  ATTRS.forEach(a => { const v = root.getAttribute(a); if (v) { const o = tr(v); if (o) root.setAttribute(a, o); } });
  if (root.tagName === 'INPUT' && (root.type === 'button' || root.type === 'submit') && root.value) { const o = tr(root.value); if (o) root.value = o; }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => n.nodeType === 1 ? (SKIP.has(n.tagName) || n.hasAttribute('data-raw') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT
  });
  let n; while ((n = w.nextNode())) fixText(n);
  root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(el => {
    if (el.closest('[data-raw]')) return;
    ATTRS.forEach(a => { const v = el.getAttribute(a); if (v) { const o = tr(v); if (o) el.setAttribute(a, o); } });
  });
  root.querySelectorAll?.('option').forEach(o => { if (!o.closest('datalist') && !o.closest('[data-raw]')) { const x = tr(o.textContent); if (x) o.textContent = x; } });
}
const PUNCT = s => /[؟،]/.test(s) && !/[\u0621-\u064A]/.test(s.replace(/[؟،]/g, '')) ? s.replace(/؟/g, '?').replace(/،/g, ',') : null;
function fixText(n) {
  if (n.parentElement?.closest('[data-raw]')) return;
  const v = n.nodeValue; const o = tr(v);
  if (o) { const x = v.replace(v.trim(), o); n.nodeValue = PUNCT(x) || x; return; }
  const q = PUNCT(v); if (q) n.nodeValue = q;
}

// تشغيل الترجمة التلقائية على الصفحة
export function startI18n() {
  const h = document.documentElement;
  h.lang = LANG; h.dir = isEN ? 'ltr' : 'rtl';
  if (!isEN) return;
  document.title = tr(document.title) || document.title;
  walk(document.body);
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') fixText(m.target);
      else m.addedNodes.forEach(walk);
      if (m.type === 'attributes' && ATTRS.includes(m.attributeName)) { const v = m.target.getAttribute(m.attributeName); const o = v && tr(v); if (o) m.target.setAttribute(m.attributeName, o); }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
