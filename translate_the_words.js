// ==UserScript==
// @name         translate_the_words
// @namespace    legado.reader.selection.tools
// @version      3.1.0
// @description  选中英文单词显示多义中文释义，长句整句翻译
// @author       Legado
// @category     阅读器
// @match        *
// @grant        none
// @run-at       document-idle
// @enabled      true
// ==/UserScript==

legado.registerPlugin({
  id: "reader-selection-tools",
  name: "阅读器选中文本工具",
  setup: function (api) {

    const GT = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=en&tl=zh-CN&q=";

    async function googleTranslate(text) {
      try {
        const url = GT + encodeURIComponent((text || "").slice(0, 2000));
        const res = await api.http.request({ url, method: "GET" });
        const data = JSON.parse(res.body);
        const parts = [];
        const arr = data[0];
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item && item[0]) parts.push(item[0]);
          }
        }
        return parts.join("") || text;
      } catch {
        return text;
      }
    }

    async function fetchDict(word) {
      try {
        const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
        const res = await api.http.request({ url, method: "GET" });
        const data = JSON.parse(res.body);
        if (!Array.isArray(data) || data.length === 0) return null;
        return data;
      } catch {
        return null;
      }
    }

    const posMap = {
      noun: "名词", verb: "动词", adjective: "形容词", adverb: "副词",
      preposition: "介词", conjunction: "连词", pronoun: "代词",
      interjection: "感叹词", determiner: "限定词", numeral: "数词",
    };

    return {
      readerContextActions: [
        {
          id: "translate",
          name: "翻译",
          when: (ctx) => ctx.sourceType === "novel" && !!ctx.text,
          run: async (ctx) => {
            const text = ctx.text.trim();
            if (!text) { await api.ui.toast("没有选中文字", "warning"); return; }

            try {
              if (/^[a-zA-Z]+$/.test(text)) {
                const entries = await fetchDict(text.toLowerCase());
                if (entries) {
                  const phonetic = entries[0].phonetic || entries[0].phonetics?.find(p => p.text)?.text || "";
                  const lines = [];
                  lines.push(text);
                  if (phonetic) lines.push(`🔊 /${phonetic}/`);

                  for (const entry of entries) {
                    for (const m of entry.meanings || []) {
                      const posCn = posMap[m.partOfSpeech] || m.partOfSpeech;
                      const defs = m.definitions.slice(0, 5);
                      lines.push(`【${posCn}】`);
                      for (let i = 0; i < defs.length; i++) {
                        const cn = await googleTranslate(defs[i].definition);
                        lines.push(`  ${i + 1}. ${cn}`);
                      }
                    }
                  }

                  await api.ui.prompt({
                    title: "翻译结果",
                    fields: [{
                      type: "info",
                      label: "释义",
                      description: lines.join("\n"),
                    }],
                    submitText: "关闭",
                  });
                  return;
                }
              }

              const translation = await googleTranslate(text);
              await api.ui.prompt({
                title: "翻译结果",
                fields: [
                  { type: "info", label: "原文", description: text },
                  { type: "info", label: "译文", description: translation },
                ],
                submitText: "关闭",
              });
            } catch (e) {
              try { await api.ui.toast("翻译失败", "error"); } catch {}
            }
          },
        },
        {
          id: "replace",
          name: "替换",
          when: (ctx) => ctx.sourceType === "novel" && !!ctx.text,
          run: async (ctx) => {
            try {
              const values = await api.ui.prompt({
                title: "替换",
                message: "为当前选中文字保存替换规则",
                initialValues: { from: ctx.text, to: "" },
                fields: [
                  { type: "text", key: "from", label: "原文" },
                  { type: "text", key: "to", label: "替换为" },
                ],
                submitText: "保存",
                cancelText: "取消",
              });
              if (!values) return;
              const rules = api.storage.readJson("selectionReplaceRules", []);
              rules.push({ from: String(values.from ?? ""), to: String(values.to ?? ""), time: Date.now() });
              api.storage.writeJson("selectionReplaceRules", rules);
              await api.ui.toast("替换规则已保存", "success");
            } catch {}
          },
        },
      ],
    };
  },
});
