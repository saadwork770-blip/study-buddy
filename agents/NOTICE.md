# Vendored specialist personas

The `*.md` files in this directory are vendored from
[msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)
(commit `54573734191790031cfe294c98d2a6b002136956`), used under the MIT licence.

```
MIT License

Copyright (c) 2025 AgentLand Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Why only these three

The upstream repository has a large roster, but most of it is written for a
software agency or, in the case of its `academic/` division, for **worldbuilding
and fiction** ("Design Culturally Coherent Societies", "Build Believable
Physical Worlds"). Those would give a postgraduate student character-writing
advice, so they are deliberately not vendored.

The three kept here are the ones actually written for real research work:

| File | Used for |
|---|---|
| `research-synthesist.md` | Literature review, source grading, evidence synthesis — powers the Research page |
| `academic-statistician.md` | Quantitative methodology, study design, inference |
| `grant-writer.md` | Research proposals, letters of inquiry, budget narratives |

## Editing

`lib/experts.generated.ts` is built from these files by `scripts/build-experts.mjs`
(run automatically by `npm run build`). Edit the Markdown, not the generated file.
