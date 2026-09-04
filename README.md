# رفيق الدراسة · Study Buddy

مساعد ذكي لطلبة الماجستير: إدارة التكاليف، البحث العلمي، التلخيص، والمذاكرة — بدعم كامل للعربية وتصدير بصيغ متعددة.

An AI study companion for master's students: assignment planning, research, summarisation and tutoring — with first-class Arabic support and multi-format export.

---

## المزايا · Features

| | العربية | English |
|---|---|---|
| 🗂 | **المهام والتكاليف** — سجّل التكاليف ومواعيد التسليم، ودع الذكاء الاصطناعي يقسّمها إلى خطوات بخطة زمنية وتنبيهات. | **Tasks** — track deliverables and deadlines; AI breaks each one into scheduled steps with risk notes. |
| 🔎 | **البحث العلمي** — بحث في الويب مع مصادر حقيقية، أسئلة فرعية، ملاحظات منهجية، وكلمات مفتاحية للبحث في قواعد البيانات. | **Research** — web search with real sources, sub-questions, method notes and database keywords. |
| 📄 | **التلخيص** — ارفع PDF أو Word أو نصاً أو صورة، واختر: ملخص موجز/تفصيلي، قراءة نقدية، ملاحظات مذاكرة، بطاقات مراجعة، أو مخطط. | **Summarise** — upload PDF, Word, text or an image; choose brief/detailed summary, critical reading, study notes, flashcards or an outline. |
| 💬 | **المذاكرة** — مدرّس، حوار سقراطي، اختبرني، أو بسّط لي. | **Study chat** — tutor, Socratic, quiz-me or explain-simply modes. |
| 📚 | **المكتبة** — احفظ أي مخرج، وابحث فيه، وصدّره لاحقاً. | **Library** — save any output, search it, export it later. |
| ⤓ | **تصدير** — Word (.docx)، PDF، Markdown، HTML، نص، JSON، وCSV للمهام. | **Export** — Word (.docx), PDF, Markdown, HTML, plain text, JSON, and CSV for tasks. |

### دعم العربية · Arabic support

- الواجهة كاملة من اليمين إلى اليسار، والعربية هي اللغة الافتراضية (زر تبديل فوري للإنجليزية).
- المخرجات تُكتب بالعربية الفصحى مع الإبقاء على المصطلحات الأجنبية بين قوسين عند أول ذكر.
- ملفات Word تُنتَج بفقرات ثنائية الاتجاه (`bidi`) وأسطر RTL وجداول معكوسة الاتجاه.
- تصدير CSV يبدأ بعلامة BOM حتى يقرأ Excel العربية بشكل صحيح.
- ملفات PDF تُطبع عبر المتصفح، فيتكفّل بتشكيل الحروف ووصلها بدل أن تكسرها مكتبة PDF.

---

## التشغيل · Getting started

```bash
npm install
cp .env.example .env.local     # then put your key in .env.local
npm run dev                    # http://localhost:3000
```

يحتاج التطبيق إلى مفتاح من [Anthropic Console](https://console.anthropic.com/settings/keys):

```
ANTHROPIC_API_KEY=sk-ant-...
```

المتغيّرات الاختيارية · Optional variables:

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-opus-5` | Model used for every request. |
| `ANTHROPIC_EFFORT` | `high` | Reasoning effort: `low`, `medium`, `high`, `xhigh`, `max`. Lower it to cut cost. |

للنشر · To deploy:

```bash
npm run build && npm start
```

يعمل على أي منصّة تدعم Node.js‏ (Vercel، Netlify، Railway، أو خادم خاص). أضِف `ANTHROPIC_API_KEY` إلى متغيّرات البيئة هناك.

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
- Claude via `@anthropic-ai/sdk` — adaptive thinking, streaming, `web_search` server tool, structured outputs (Zod) for task plans, and server-side refusal fallback with an automatic downgrade to the stable endpoint if that beta isn't enabled on the account.
- PDF files are sent to Claude as native document blocks; `.docx` is converted with `mammoth`; images use vision.
- Uploads are capped at 20 MB.
