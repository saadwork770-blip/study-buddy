# رفيق الدراسة · Study Buddy

مساعد ذكي لطلبة الماجستير: إدارة التكاليف، البحث العلمي، التلخيص، والمذاكرة — بدعم كامل للعربية وتصدير بصيغ متعددة.

An AI study companion for master's students: assignment planning, research, summarisation and tutoring — with first-class Arabic support and multi-format export.

> **مجاني بالكامل.** يعمل التطبيق على الطبقة المجانية من Gemini: مفتاح من
> [Google AI Studio](https://aistudio.google.com/apikey) بلا بطاقة ائتمان، واستضافة
> مجانية على Vercel. لا فواتير ولا اشتراك.
>
> **Runs free.** Gemini's free tier (no credit card) plus Vercel's free hosting.
> The free tier has a daily request cap and Google may use free-tier inputs to
> improve its models — don't paste anything confidential.

---

## المزايا · Features

| | العربية | English |
|---|---|---|
| 🗂 | **المهام والتكاليف** — سجّل التكاليف ومواعيد التسليم، ودع الذكاء الاصطناعي يقسّمها إلى خطوات بخطة زمنية وتنبيهات. | **Tasks** — track deliverables and deadlines; AI breaks each one into scheduled steps with risk notes. |
| 🔎 | **البحث العلمي** — بحث في الويب مع مصادر حقيقية، أسئلة فرعية، ملاحظات منهجية، وكلمات مفتاحية للبحث في قواعد البيانات. | **Research** — web search with real sources, sub-questions, method notes and database keywords. |
| 📄 | **التلخيص** — ارفع PDF أو Word أو نصاً أو صورة، واختر: ملخص موجز/تفصيلي، قراءة نقدية، ملاحظات مذاكرة، بطاقات مراجعة، أو مخطط. | **Summarise** — upload PDF, Word, text or an image; choose brief/detailed summary, critical reading, study notes, flashcards or an outline. |
| 💬 | **المذاكرة** — مدرّس، حوار سقراطي، اختبرني، أو بسّط لي. | **Study chat** — tutor, Socratic, quiz-me or explain-simply modes. |
| 📚 | **المكتبة** — احفظ أي مخرج، وابحث فيه، وصدّره لاحقاً. | **Library** — save any output, search it, export it later. |
| ✍️ | **إنجاز التكاليف** — صِف التكليف وأرفق مصادرك لتحصل على تقرير أو مقال أو مراجعة أدبيات أو عرض تقديمي كامل. | **Produce** — describe the assignment, attach sources, get a finished report, essay, literature review, answers or presentation. |
| 📎 | **رفع الملفات في كل قسم** — PDF أو Word أو صورة أو نص، بلا حدّ للحجم. | **Upload anywhere** — PDF, Word, images or text attach to every AI feature, with no size limit. |
| ⤓ | **تصدير** — Word (.docx)، **PowerPoint (.pptx)**، PDF، Markdown، HTML، نص، JSON، وCSV للمهام. | **Export** — Word (.docx), **PowerPoint (.pptx)**, PDF, Markdown, HTML, plain text, JSON, and CSV for tasks. |

### دعم العربية · Arabic support

- الواجهة كاملة من اليمين إلى اليسار، والعربية هي اللغة الافتراضية (زر تبديل فوري للإنجليزية).
- المخرجات تُكتب بالعربية الفصحى مع الإبقاء على المصطلحات الأجنبية بين قوسين عند أول ذكر.
- ملفات Word تُنتَج بفقرات ثنائية الاتجاه (`bidi`) وأسطر RTL وجداول معكوسة الاتجاه.
- تصدير CSV يبدأ بعلامة BOM حتى يقرأ Excel العربية بشكل صحيح.
- ملفات PDF تُطبع عبر المتصفح، فيتكفّل بتشكيل الحروف ووصلها بدل أن تكسرها مكتبة PDF.


### الخبراء المتخصصون · Specialist personas

في صفحتي **البحث العلمي** و**المذاكرة** يمكنك اختيار خبير يجيبك بمنهجية مجاله:

| | الخبير | Specialist | يفيدك في |
|---|---|---|---|
| 🔍 | محلّل الأدبيات | Research Synthesist | مراجعة الأدبيات، تدرّج قوة المصادر، وكشف الاقتباس الدائري (افتراضي في صفحة البحث) |
| 📊 | الإحصائي | Statistician | تصميم الدراسات، الاستدلال، حجم الأثر وعدم اليقين بدل الاكتفاء بـ p < 0.05 |
| 📝 | كاتب المِنَح | Grant Writer | مقترحات البحث، خطابات الاهتمام، وسرد الميزانية |

هذه الشخصيات مقتبسة من مشروع [agency-agents](https://github.com/msitarzewski/agency-agents)
برخصة MIT، وتُحفظ في مجلّد `agents/` (انظر `agents/NOTICE.md`). النصوص الكاملة تبقى على
الخادم ولا تُرسل إلى المتصفح؛ ولا يمكن لأي شخصية أن تتجاوز قواعد اللغة أو النزاهة الأكاديمية،
لأن التطبيق يعيد تأكيدها بعد نص الشخصية.

The three vendored personas come from the MIT-licensed
[agency-agents](https://github.com/msitarzewski/agency-agents) project and live in `agents/`
(see `agents/NOTICE.md` for the licence and for why only three of its roster are used — most
of that repo, including its `academic/` division, is written for **worldbuilding and fiction**,
which would misfire badly for a postgraduate student). `scripts/build-experts.mjs` compiles them
into a server module plus a small client metadata module, so ~12,000 words of persona text stay
on the server. A persona is appended *after* the app's own rules, and a precedence paragraph
after it re-asserts the language, citation and academic-integrity rules, so a vendored prompt
cannot override them.

---

## التشغيل · Getting started

```bash
npm install
cp .env.example .env.local     # then put your key in .env.local
npm run dev                    # http://localhost:3000
```

يحتاج التطبيق إلى مفتاح **مجاني** من [Google AI Studio](https://aistudio.google.com/apikey)
— بلا بطاقة ائتمان، ويستغرق دقيقة:

```
GEMINI_API_KEY=AIza...
```

المتغيّرات الاختيارية · Optional variables:

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_MODEL` | `gemini-2.5-flash` | The free-tier workhorse. `gemini-2.5-pro` is stronger but its free quota is much smaller. |
| `AI_EFFORT` | `high` | How hard the model thinks: `low` (thinking off, fastest, least quota), `medium`, `high`. |
| _(no upload variable)_ | — | There is no size cap: the browser uploads files straight to Google's Files API, so nothing large passes through the server. |

للنشر · To deploy:

```bash
npm run build && npm start
```

يعمل على أي منصّة تدعم Node.js‏ (Vercel، Netlify، Railway، أو خادم خاص). أضِف `GEMINI_API_KEY` إلى متغيّرات البيئة هناك.


---

## النشر · Deploy it live

الطريقة الأسرع هي **Vercel** (مجاني للاستخدام الشخصي، ولا يحتاج بطاقة):

1. أنشئ مفتاحاً من [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) وتأكّد أن حسابك فيه رصيد.
2. افتح [vercel.com/new](https://vercel.com/new) وسجّل الدخول بحساب GitHub.
3. اختر مستودع **study-buddy** واضغط **Import**.
4. افتح **Environment Variables** وأضِف:

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | `AIza...` |

5. اضغط **Deploy** وانتظر دقيقتين. ستحصل على رابط مثل `study-buddy.vercel.app`.

الفرع الافتراضي للمستودع هو `claude/master-study-support-site-8g04ww`، وهو ما ستنشره Vercel تلقائياً — لا حاجة لتغيير شيء.

The fastest route is **Vercel** (free tier, no card): create a key, open
[vercel.com/new](https://vercel.com/new), import **study-buddy**, add
`GEMINI_API_KEY` under Environment Variables, and hit Deploy. The repo's
default branch is already the one Vercel will build.

### إعدادات تهمّك بعد النشر · Post-deploy settings

| الإعداد | لماذا |
|---|---|
| **Fluid Compute** (Settings → Functions) | مُفعّل افتراضياً للمشاريع الجديدة. بدونه تتوقّف الدوال بعد ٦٠ ثانية، وقد لا يكتمل «البحث المعمّق». |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | حجم الرفع الأقصى. الافتراضي **٤ ميغابايت** لأن Vercel تحدّ جسم الطلب عند ٤٫٥ تقريباً. إن استضفت التطبيق بنفسك (Node أو Docker أو Railway) ارفعه إلى ٢٠ أو أكثر. |
| `AI_EFFORT` | `low` يوقف «التفكير» فيصبح أسرع ويستهلك حصّة أقل، `high` (الافتراضي) لأفضل جودة. |
| `GEMINI_MODEL` | `gemini-2.5-flash` (الافتراضي، حصّة مجانية سخيّة) أو `gemini-2.5-pro` لجودة أعلى بحصّة أصغر. |

**Uploads bypass the server entirely.** Vercel caps a serverless request body at
~4.5 MB, which would make a real thesis PDF impossible. Instead `/api/upload`
mints a resumable-upload session against the Gemini Files API with the secret
key, and the browser sends the bytes directly to Google — so there is no size
limit and the key is never exposed. Word files are converted to text in the
browser (`mammoth`), since the Files API does not host `.docx`.

**Remaining platform limit.** Functions are capped at `maxDuration = 300`
seconds; on a plan without Fluid Compute that ceiling is lower, so a "long"
deliverable or "deep" research run may be cut off — use a shorter setting there.

### بدائل · Other hosts

يعمل التطبيق على أي منصّة تشغّل Node.js. للاستضافة الذاتية:

```bash
npm ci && npm run build && npm start    # PORT=3000
```

ضَع `GEMINI_API_KEY` في بيئة التشغيل، وارفع `NEXT_PUBLIC_MAX_UPLOAD_MB` إلى ٢٠ لأن حدّ ٤٫٥ ميغابايت خاصّ بـ Vercel وحدها.


### تأكّد أنه يعمل · Verify it works

قبل النشر، تحقّق من المفتاح في ثانيتين:

```bash
npm run check
```

يخبرك مباشرة: المفتاح يعمل، أو مرفوض، أو لا يوجد رصيد في الحساب.

وبعد التشغيل، تعرض الصفحة الرئيسية حالة الاتصال تلقائياً: شريط أخضر إن كان كل شيء
جاهزاً، أو شريط أحمر يذكر سبب الفشل بالضبط — فلا تكتشف المشكلة وأنت في منتصف بحثك.

`npm run check` verifies the key against the real Gemini API before you deploy, and the
home page runs the same check itself (`/api/health`) on every load — green when
Gemini is reachable, red with the exact reason when it is not.

---

## البنية · Project structure

```
app/
  page.tsx                 الصفحة الرئيسية
  tasks/ research/ summarize/ chat/ library/
  api/
    chat/        محادثة متدفقة (streaming tutor chat)
    research/    بحث مع أداة web_search ومصادر
    summarize/   رفع ملف أو نص → تلخيص متدفق
    plan/        تقسيم مهمة → JSON منظّم (structured output)
    export/docx/ توليد ملف Word من Markdown
components/      الواجهة (مزوّد اللغة، التنقّل، لوحة المخرجات، بطاقة المهمة)
lib/
  claude.ts      نقطة الاتصال الوحيدة بواجهة Claude
  prompts.ts     تعليمات النظام لكل ميزة
  i18n.ts        قاموس العربية/الإنجليزية
  export.ts      المصدّرات (Word، PDF، MD، HTML، TXT، JSON، CSV)
  markdown.ts    عارض Markdown آمن + تحويل إلى نص
  markdown-docx.ts  تحويل Markdown إلى Word مع دعم RTL
  store.ts       التخزين المحلي (المهام والمكتبة)
```

### كيف يعمل · How it works

- **المفتاح لا يغادر الخادم**: كل نداءات Claude تمر عبر Route Handlers، ولا يُرسل المفتاح إلى المتصفح أبداً.
- **البث المباشر**: تُرسل الخوادم NDJSON (سطر JSON لكل حدث) فتظهر الإجابة كلمةً كلمة مع مؤشّر حالة («يفكّر…»، «أبحث في الويب…»).
- **بياناتك محلية**: المهام والمكتبة تُحفظ في `localStorage` داخل متصفحك — لا حساب ولا قاعدة بيانات. استخدم «تصدير كل البيانات» في المكتبة للنسخ الاحتياطي أو النقل بين الأجهزة.
- **PDF**: يُبنى مستند HTML كامل ويُطبع عبر إطار مخفي، فيتولّى المتصفح تشكيل العربية.
- **الأمان**: مخرجات النموذج تُهرَّب (escape) قبل عرضها، فلا يمكن حقن HTML من خلالها.

### النزاهة الأكاديمية · Academic integrity

التطبيق مُوجَّه ليساعدك على الفهم والتخطيط والمراجعة، لا ليكتب عنك. تعليمات النظام تمنع اختلاق المراجع والأرقام، وتطلب من النموذج أن يوضّح أن أي مسوّدة يكتبها هي مسوّدة عليك إعادة صياغتها والتحقّق منها.

Prompts are written to help you understand, plan and revise your own work. The model is instructed never to fabricate citations or statistics, and to mark any draft as something you must rewrite and verify.

---

## ملاحظات تقنية · Technical notes

- Next.js 16 (App Router) · React 19 · TypeScript · بدون مكتبة واجهة خارجية.
- Uploads: `/api/upload` returns a resumable Gemini Files API session; the browser POSTs the file to Google directly, then passes the returned `fileUri` to the AI routes as a `fileData` part.
- Slides: `pptxgenjs` converts Markdown to `.pptx` — headings become slides, lists become bullets, and loose prose becomes speaker notes so a slide never turns into a wall of text.
- Gemini via `@google/genai` — streaming, a configurable thinking budget, **Google Search grounding** for real citations on the Research page, and `responseSchema` JSON output for task plans.
- PDFs and images are sent to Gemini as native `inlineData` parts; `.docx` is converted locally with `mammoth`.
- Uploads are capped by `NEXT_PUBLIC_MAX_UPLOAD_MB` (4 MB by default, for Vercel's sake).
