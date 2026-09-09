// ─────────────────────────────────────────────────────────────
// Shared data definitions for استودیو خلاق
// ─────────────────────────────────────────────────────────────

export type PersonaId = "director" | "cinematographer" | "writer" | "art_director";

export interface Persona {
  id: PersonaId;
  name: string;
  emoji: string;
  tagline: string;
  color: string; // accent hex for chips/bubbles
  systemPrompt: string;
  quickPrompts: string[];
}

const BASE_RULES = `
قواعد پاسخ‌دهی (حتماً رعایت کن):
- همیشه فارسی و لحن صمیمی-حرفه‌ای داشته باش؛ مخاطب یک کریتور ایرانی است که محتوا برای اینستاگرام/یوتیوب می‌سازد.
- پاسخ‌ها را ساختارمند بده: از تیتر، لیست شماره‌دار و بولت استفاده کن و از پاراگراف‌های خیلی طولانی پرهیز کن.
- هرجا شد، مثال عینی و اجرایی بده (زاویه دوربین، متن دقیق، کد رنگ HEX، نام فونت و…) نه توصیه کلی.
- اگر درخواست مبهم بود، اول یک سؤال کوتاه بپرس و بعد یک پیشنهاد پیش‌فرض هم ارائه بده تا گفتگو قطع نشود.
- طول پاسخ را منطقی نگه دار؛ کامل اما بدون آب‌بندی اضافه.`;

export const PERSONAS: Persona[] = [
  {
    id: "director",
    name: "کارگردان",
    emoji: "🎬",
    tagline: "ایده، دکوپاژ و استوری‌بورد",
    color: "#a78bfa",
    systemPrompt: `تو «کارگردان» یک دستیار هنری حرفه‌ای هستی؛ متخصص کارگردانی تیزر، ریلز، موزیک‌ویدئو و محتوای کوتاه.
تخصص تو: ایده‌پردازی کانسپت، دکوپاژ سکانس‌به‌سکانس، طراحی شات‌لیست (نوع نما، زاویه، حرکت دوربین)، ریتم تدوین و mise-en-scène.
وقتی کاربر موضوع می‌دهد، معمولاً این‌ها را پیشنهاد بده: لاگ‌لاین کانسپت، ساختار سه‌پردهانی یا قوس کوتاه، شات‌لیست جدول‌مانند، نکات ریتم و ترنزیشن.
${BASE_RULES}`,
    quickPrompts: [
      "برای ریلز معرفی یه کافه، یه کانسپت خلاقانه با شات‌لیست بده",
      "می‌خوام یه تیزر ۳۰ ثانیه‌ای برای محصول دست‌ساز بسازم؛ دکوپاژ بنویس",
      "چطور یهopening قوی برای ویدئوی یوتیوبم بسازم که مخاطب رد نشه؟",
      "برای موزیک‌ویدئوی زیرزمینی با بودجه کم، ۵ ایده بصری بده",
    ],
  },
  {
    id: "cinematographer",
    name: "تصویربردار",
    emoji: "🎥",
    tagline: "نور، لنز و ستینگ",
    color: "#e879f9",
    systemPrompt: `تو «تصویربردار» یک دستیار هنری حرفه‌ای هستی؛ متخصص فیلم‌برداری و نورپردازی.
تخصص تو: طراحی نورپردازی (سه‌نقطه‌ای، پراکتیکال، نئون، طبیعی)، انتخاب لنز و دیافراگم، حرکات دوربین (هند‌هلد، اسلایدر، گیبال، درون)، دی‌اِفِکتری، و رفرنس بصری سینمایی.
وقتی کاربر موقعیت می‌دهد، مشخص کن: پلان نور (جهت منابع، نسبت کلید به فیل، دمای رنگ کلوین)، ستینگ دوربین، تنظیمات پیشنهادی (شاتر، ISO، فریم‌ریت) و یک ترفند ارزان‌قیمت جایگزین برای بودجه کم.
${BASE_RULES}`,
    quickPrompts: [
      "برای مصاحبه indoors با یک چراغ، چه ستینگی پیشنهاد می‌دی؟",
      "می‌خوام حس فیلم‌های وس اندرسون رو تو آشپزخونه دربیارم؛ چه کنم؟",
      "برای شب‌برداری بیرون با گوشی، تنظیمات و ترفندها رو بگو",
      "چطور با یه سافت‌باکس و یه رفلکتور پرتره سینمایی بگیرم؟",
    ],
  },
  {
    id: "writer",
    name: "نویسنده",
    emoji: "✍️",
    tagline: "سناریو، دیالوگ و کپشن",
    color: "#f0abfc",
    systemPrompt: `تو «نویسنده» یک دستیار هنری حرفه‌ای هستی؛ متخصص سناریونویسی، دیالوگ، کپشن و اسکریپت محتوای کوتاه.
تخصص تو: هک شروع ۳ ثانیه‌ای، ساختار قصه‌گویی، دیالوگ طبیعی فارسی، اسکریپت ریلز (کلمه‌به‌کلمه با تایم‌کد)، کپشن اینستاگرام با کال‌تو‌اکشن و هشتگ هوشمند.
وقتی کاربر موضوع می‌دهد، لحن برند را بپرس یا حدس بزن و ۲-۳ نسخه با لحن‌های متفاوت بده (صمیمی، طنز، جدی). جمله‌های اول همیشه گیرا باشند.
${BASE_RULES}`,
    quickPrompts: [
      "برای ریلز آموزشی ۶۰ ثانیه‌ای درباره مدیریت زمان، اسکریپت کلمه‌به‌کلمه بنویس",
      "یه کپشن جذاب برای پست قبل و بعد ادیت عکاسم بخوام، ۳ نسخه بده",
      "برند مای لباس فشن ایرانیه؛ بیو اینستاگرام حرفه‌ای بنویس",
      "می‌خوام یه سری استوری ۵ تایی درباره پشت‌صحنه کارگاهم بذارم؛ متن هر فریم رو بده",
    ],
  },
  {
    id: "art_director",
    name: "آرت‌دایرکتور",
    emoji: "🎨",
    tagline: "پالت رنگ و هارمونی بصری",
    color: "#c084fc",
    systemPrompt: `تو «آرت‌دایرکتور» یک دستیار هنری حرفه‌ای هستی؛ متخصص رنگ‌شناسی، آرت‌دایرکشن و هویت بصری.
تخصص تو: ساخت پالت رنگ (با کد دقیق HEX و نام)، هارمونی رنگی (مکمل، آنالوگ، تریاد)، انتخاب جفت‌فونت فارسی، طراحی مودبورد توصیفی، و یکدست‌سازی فید اینستاگرام.
وقتی کاربر سبک یا حس و حال می‌دهد، بده: پالت ۵ رنگی با کد HEX و نقش هر رنگ، پیشنهاد فونت تیتر و متن، توصیف مودبورد، و ۳ رفرنس سبکی شناخته‌شده.
${BASE_RULES}`,
    quickPrompts: [
      "برای برند قهوه artisan با حس گرم و نوستالژیک، پالت رنگ و فونت پیشنهاد بده",
      "می‌خوام فید اینستاگرامم تیره و سینمایی بشه؛ راهنمای رنگ بده",
      "برای کاور پادکست طنز، چه ترکیب رنگ و تایپوگرافی خوبه؟",
      "یه مودبورد متنی برای کمپین نوروزی یه برند لوازم آرایشی توصیف کن",
    ],
  },
];

// ─────────────────────────────────────────────────────────────

export interface ExploreCategory {
  id: string;
  label: string;
  emoji: string;
  query: string; // English query for image search
  moreQueries: string[]; // used for "load more"
}

export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  {
    id: "typography",
    label: "تایپوگرافی و گرافیک",
    emoji: "🔤",
    query: "creative typography poster design inspiration",
    moreQueries: [
      "persian arabic calligraphy typography art",
      "minimal brand identity design mockup",
      "album cover typography design",
    ],
  },
  {
    id: "photo_video",
    label: "عکاسی و ویدئو",
    emoji: "🎥",
    query: "cinematic film photography lighting reference",
    moreQueries: [
      "moody portrait photography golden hour",
      "behind the scenes film set lighting",
      "cinematic street photography night neon",
    ],
  },
  {
    id: "fashion",
    label: "فشن و استایل",
    emoji: "👗",
    query: "street style fashion outfit aesthetic",
    moreQueries: [
      "editorial fashion photoshoot styling",
      "minimal fashion lookbook beige",
      "persian modern fashion style",
    ],
  },
  {
    id: "ideas",
    label: "ایده و اینسپیریشن",
    emoji: "💡",
    query: "creative moodboard aesthetic inspiration collage",
    moreQueries: [
      "instagram reels content ideas creative",
      "color palette inspiration aesthetic",
      "creative set design props ideas",
    ],
  },
];

export interface ExploreImage {
  url: string;
  w: number;
  h: number;
  source: string;
}

// ─────────────────────────────────────────────────────────────

export interface SubtitleStyle {
  fontFamily: "Vazirmatn" | "Lalezar";
  fontWeight: number;
  fontSize: number; // relative units, scaled by canvas
  color: string;
  gradient: boolean;
  strokeColor: string;
  strokeWidth: number;
  bgColor: string; // hex
  bgOpacity: number; // 0..1
  shadow: boolean;
  yPercent: number; // 0..100 vertical center of text
  uppercase: boolean;
  letterSpacing: number;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: "Vazirmatn",
  fontWeight: 900,
  fontSize: 46,
  color: "#ffffff",
  gradient: false,
  strokeColor: "#000000",
  strokeWidth: 10,
  bgColor: "#000000",
  bgOpacity: 0,
  shadow: true,
  yPercent: 80,
  uppercase: false,
  letterSpacing: 0,
};

export interface SubtitlePreset {
  id: string;
  name: string;
  emoji: string;
  style: SubtitleStyle;
}

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: "impact",
    name: "امپکت",
    emoji: "💥",
    style: { ...DEFAULT_SUBTITLE_STYLE },
  },
  {
    id: "neon",
    name: "نئون",
    emoji: "💜",
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      color: "#f5d0fe",
      gradient: true,
      strokeColor: "#86198f",
      strokeWidth: 6,
      shadow: true,
      yPercent: 78,
    },
  },
  {
    id: "minimal",
    name: "مینیمال",
    emoji: "⚪️",
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontWeight: 500,
      fontSize: 38,
      strokeWidth: 0,
      shadow: true,
      bgColor: "#000000",
      bgOpacity: 0.35,
      yPercent: 82,
    },
  },
  {
    id: "classic",
    name: "کلاسیک",
    emoji: "🟡",
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      color: "#facc15",
      gradient: false,
      strokeColor: "#000000",
      strokeWidth: 12,
      shadow: false,
      yPercent: 80,
    },
  },
  {
    id: "lalezar",
    name: "لاله‌زار",
    emoji: "🔥",
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontFamily: "Lalezar",
      fontWeight: 400,
      fontSize: 54,
      gradient: true,
      strokeWidth: 0,
      shadow: true,
      yPercent: 76,
    },
  },
];

// ─────────────────────────────────────────────────────────────

export interface StoryGradient {
  id: string;
  name: string;
  stops: [string, string, string]; // 3 stops for rich gradient
  angle: number; // degrees
}

export const STORY_GRADIENTS: StoryGradient[] = [
  { id: "violet-dusk", name: "غروب بنفش", stops: ["#2e1065", "#7c3aed", "#d946ef"], angle: 135 },
  { id: "midnight", name: "نیمه‌شب", stops: ["#0f0f1a", "#1e1b4b", "#312e81"], angle: 160 },
  { id: "sunset", name: "طلوع", stops: ["#431407", "#be185d", "#fb923c"], angle: 120 },
  { id: "mint", name: "نعنایی", stops: ["#022c22", "#059669", "#a7f3d0"], angle: 145 },
  { id: "royal", name: "سلطنتی", stops: ["#1e1b4b", "#4338ca", "#818cf8"], angle: 135 },
  { id: "cherry", name: "گیلاسی", stops: ["#500724", "#e11d48", "#fda4af"], angle: 110 },
  { id: "sand", name: "شنی", stops: ["#292524", "#a8a29e", "#fde68a"], angle: 150 },
  { id: "ink", name: "مرکب", stops: ["#09090b", "#27272a", "#52525b"], angle: 170 },
];

export const STORY_SIZES = [
  { id: "story", name: "استوری ۹:۱۶", w: 9, h: 16 },
  { id: "post", name: "پست ۱:۱", w: 1, h: 1 },
  { id: "wide", name: "عریض ۱۶:۹", w: 16, h: 9 },
] as const;

export type StorySizeId = (typeof STORY_SIZES)[number]["id"];

export const STORY_FONTS = [
  { id: "Vazirmatn", name: "وزیرمتن", weights: [400, 500, 700, 800, 900] },
  { id: "Lalezar", name: "لاله‌زار (تیتر)", weights: [400] },
] as const;

export const STORY_STICKERS = [
  "✨", "🔥", "💯", "🎬", "🎨", "🌙", "⭐️", "💫", "🦋", "🌸", "👑", "🎯", "☕️", "🖤", "💜", "🎧", "📷", "🫶",
];
