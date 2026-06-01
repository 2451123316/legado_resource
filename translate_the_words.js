// ==UserScript==
// @name         translate_the_words
// @namespace    legado.reader.selection.tools
// @version      3.4.0
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

    async function get(url) {
      try {
        const res = await api.http.request({ url, method: "GET" });
        if (res && res.body) return JSON.parse(res.body);
      } catch {}
      return null;
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
            if (!text) return;

            try {
              if (/^[a-zA-Z]+$/.test(text)) {
                const word = text.toLowerCase();
                const dict = await get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

                if (dict && Array.isArray(dict) && dict.length > 0) {
                  const first = dict[0];
                  const phonetic = first.phonetic || (first.phonetics || []).find(p => p.text)?.text || "";
                  const fields = [];
                  fields.push({ type: "info", label: text, description: phonetic ? `🔊 /${phonetic}/` : "" });

                  for (const entry of dict) {
                    for (const m of entry.meanings || []) {
                      const posCn = posMap[m.partOfSpeech] || m.partOfSpeech;
                      const defs = m.definitions.slice(0, 5);
                      const items = [];
                      for (let i = 0; i < defs.length; i++) {
                        let cn = defs[i].definition;
                        const trans = await get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(defs[i].definition.slice(0, 300))}&langpair=en|zh-CN`);
                        if (trans && trans.responseData && trans.responseData.translatedText) {
                          cn = trans.responseData.translatedText;
                        }
                        items.push(`${i + 1}. ${cn}`);
                      }
                      fields.push({ type: "info", label: `【${posCn}】`, description: items.join("  |  ") });
                    }
                  }

                  await api.ui.prompt({
                    title: "翻译结果",
                    message: text,
                    fields: fields,
                    submitText: "关闭",
                    cancelText: "取消",
                  });
                  return;
                }
              }

              const gt = await get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|zh-CN`);
              if (gt && gt.responseData && gt.responseData.translatedText) {
                await api.ui.prompt({
                  title: "翻译结果",
                  message: text,
                  fields: [{ type: "info", label: "译文", description: gt.responseData.translatedText }],
                  submitText: "关闭",
                  cancelText: "取消",
                });
              } else {
                await api.ui.prompt({
                  title: "翻译结果",
                  message: text,
                  fields: [{ type: "info", label: "原文", description: text }],
                  submitText: "关闭",
                  cancelText: "取消",
                });
              }
            } catch {}
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
