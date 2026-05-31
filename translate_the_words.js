// ==UserScript==
// @name         translate_the_words
// @namespace    legado.reader.selection.tools
// @version      2.0.1
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

    async function translate(text, from, to) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${from}|${to}`;
      const res = await api.http.request({ url, method: "GET" });
      const data = JSON.parse(res.body);
      if (data.responseStatus !== 200) {
        throw new Error(data.responseDetails || "翻译失败");
      }
      return data.responseData.translatedText;
    }

    async function fetchDict(word) {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
      const res = await api.http.request({ url, method: "GET" });
      const data = JSON.parse(res.body);
      if (!Array.isArray(data) || data.length === 0) return null;
      return data;
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
              const isWord = /^[a-zA-Z]+$/.test(text);

              if (isWord) {
                const entries = await fetchDict(text.toLowerCase());
                if (entries) {
                  const phonetic = entries[0].phonetic || entries[0].phonetics?.find(p => p.text)?.text || "";
                  const lines = [];
                  if (phonetic) lines.push(`🔊 /${phonetic}/`);
                  lines.push("");

                  for (const entry of entries) {
                    for (const m of entry.meanings || []) {
                      const posCn = posMap[m.partOfSpeech] || m.partOfSpeech;
                      const defs = m.definitions.slice(0, 5);
                      lines.push(`【${posCn}】`);

                      for (let i = 0; i < defs.length; i++) {
                        let cn = defs[i].definition;
                        try {
                          cn = await translate(defs[i].definition, "en", "zh-CN");
                        } catch {}
                        lines.push(`  ${i + 1}. ${cn}`);
                      }
                    }
                  }

                  await api.ui.prompt({
                    title: `📖 ${text}`,
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

              const translation = await translate(text, "en", "zh-CN");
              await api.ui.prompt({
                title: "翻译结果",
                fields: [
                  { type: "info", label: "原文", description: text },
                  { type: "info", label: "译文", description: translation },
                ],
                submitText: "关闭",
              });
            } catch (e) {
              await api.ui.toast("翻译失败：" + e.message, "error");
            }
          },
        },
        {
          id: "replace",
          name: "替换",
          when: (ctx) => ctx.sourceType === "novel" && !!ctx.text,
          run: async (ctx) => {
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
          },
        },
      ],
    };
  },
});
