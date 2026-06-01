// ==UserScript==
// @name         translate_the_words
// @namespace    legado.reader.selection.tools
// @version      3.3.0
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

    function words(text) {
      const parts = [];
      if (Array.isArray(text)) {
        for (const item of text) {
          if (item && item[0]) parts.push(item[0]);
        }
      }
      return parts.join("");
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
                  const lines = [text];
                  if (phonetic) lines.push(`🔊 /${phonetic}/`);

                  for (const entry of dict) {
                    for (const m of entry.meanings || []) {
                      const posCn = posMap[m.partOfSpeech] || m.partOfSpeech;
                      const defs = m.definitions.slice(0, 5);
                      lines.push(`【${posCn}】`);

                      for (let i = 0; i < defs.length; i++) {
                        let cn = defs[i].definition;
                        const trans = await get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(defs[i].definition.slice(0, 300))}&langpair=en|zh-CN`);
                        if (trans && trans.responseData && trans.responseData.translatedText) {
                          cn = trans.responseData.translatedText;
                        }
                        lines.push(`  ${i + 1}. ${cn}`);
                      }
                    }
                  }

                  await api.ui.prompt({ title: "翻译结果", message: lines.join("\n"), submitText: "关闭" });
                  return;
                }
              }

              const gt = await get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|zh-CN`);
              if (gt && gt.responseData && gt.responseData.translatedText) {
                await api.ui.prompt({ title: "翻译结果", message: `${text}\n${gt.responseData.translatedText}`, submitText: "关闭" });
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
