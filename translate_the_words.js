// ==UserScript==
// @name         translate_the_words
// @namespace    legado.reader.selection.tools
// @version      4.0.0
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
      "v.": "动词", "vi.": "动词", "vt.": "动词",
      "n.": "名词",
      "adj.": "形容词", "a.": "形容词",
      "adv.": "副词", "ad.": "副词",
      "prep.": "介词",
      "conj.": "连词",
      "pron.": "代词",
      "int.": "感叹词",
      "art.": "冠词",
      "num.": "数词",
      "det.": "限定词",
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
                const data = await get(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`);
                const wd = data?.ec?.word?.[0];
                const trs = wd?.trs;

                if (trs && trs.length > 0) {
                  const phonetic = wd.usphone || wd.ukphone || "";
                  const fields = [];

                  if (phonetic) {
                    fields.push({ type: "info", label: word, description: `🔊 /${phonetic}/` });
                  }

                  for (const tr of trs) {
                    const raw = tr.tr?.[0]?.l?.i?.[0] || "";
                    if (!raw) continue;

                    let posCn = "";
                    let defText = raw;

                    const match = raw.match(/^\[?([a-z]+\.?)\]?\s+(.+)/);
                    if (match) {
                      posCn = posMap[match[1].toLowerCase()] || match[1];
                      defText = match[2];
                    }

                    const items = defText.split(/[；;]/).map(s => s.trim()).filter(Boolean);
                    const lines = items.map((item, i) => `${i + 1}. ${item}`);
                    fields.push({
                      type: "info",
                      label: `【${posCn || "其它"}】`,
                      description: lines.join("\n"),
                    });
                  }

                  await api.ui.prompt({
                    title: "词典释义",
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
