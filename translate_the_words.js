// ==UserScript==
// @name         translate_the_words
// @namespace    legado.reader.selection.tools
// @version      1.5.0
// @description  选中英文单词或句子翻译为中文，单词附带详细释义（词性、例句），需手动关闭。
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
    // 免费翻译接口（MyMemory）
    async function translateText(text, sourceLang, targetLang) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
      const res = await api.http.request({ url, method: "GET" });
      const data = JSON.parse(res.body);
      if (data.responseStatus !== 200 && data.responseStatus !== "200") {
        throw new Error(data.responseDetails || "翻译服务错误");
      }
      return data.responseData.translatedText || text;
    }

    // 免费英文词典（获取结构化数据）
    async function getWordDefinition(word) {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
      try {
        const res = await api.http.request({ url, method: "GET" });
        const data = JSON.parse(res.body);
        if (!Array.isArray(data) || data.length === 0) return null;
        const entry = data[0];
        const phonetic = entry.phonetic ? `🔊 /${entry.phonetic}/` : "";
        const meanings = [];
        for (const m of entry.meanings || []) {
          // 词性单独一行
          meanings.push(`【${m.partOfSpeech}】`);
          // 每个释义占一行
          m.definitions.slice(0, 3).forEach((d, i) => {
            meanings.push(`  ${i + 1}. ${d.definition}`);
            if (d.example) {
              meanings.push(`    例：${d.example}`);
            }
          });
        }
        return { phonetic, meanings };
      } catch {
        return null;
      }
    }

    return {
      readerContextActions: [
        {
          id: "dictionary",
          name: "字典",
          when: (ctx) => ctx.sourceType === "novel" && !!ctx.text,
          run: async (ctx) => {
            await api.ui.prompt({
              title: "字典",
              message: ctx.text,
              fields: [
                { type: "info", label: "选中文字", description: ctx.text },
              ],
              submitText: "关闭",
              cancelText: "取消",
            });
          },
        },
        {
          id: "translate",
          name: "翻译",
          when: (ctx) => ctx.sourceType === "novel" && !!ctx.text,
          run: async (ctx) => {
            const text = ctx.text.trim();
            if (!text) {
              await api.ui.toast("没有选中文字", "warning");
              return;
            }
            try {
              // 固定英译中
              const mainTranslation = await translateText(text, "en", "zh-CN");

              // 如果是单个英文单词（无空格）则附加词典详解
              let detail = "";
              if (/^[a-zA-Z]+$/.test(text)) {
                const def = await getWordDefinition(text);
                if (def) {
                  // 逐行翻译英文释义，保留换行格式
                  const lines = [];
                  if (def.phonetic) lines.push(def.phonetic);
                  for (const line of def.meanings) {
                    if (line.trim() === "") {
                      lines.push("");
                      continue;
                    }
                    // 翻译每一行（词性标签如【noun】会原样保留，由API处理）
                    try {
                      const transLine = await translateText(
                        line,
                        "en",
                        "zh-CN",
                      );
                      lines.push(transLine);
                    } catch {
                      lines.push(line); // 翻译失败保留原文
                    }
                  }
                  detail = `\n\n📖 详细释义：\n${lines.join("\n")}`;
                }
              }

              await api.ui.prompt({
                title: "翻译结果",
                message: `原文：${text}`,
                fields: [
                  {
                    type: "info",
                    label: "翻译",
                    description: mainTranslation + detail,
                  },
                ],
                submitText: "关闭",
                cancelText: "取消",
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
              message: "为当前选中文字保存一个替换规则示例。",
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
            rules.push({
              from: String(values.from ?? ""),
              to: String(values.to ?? ""),
              time: Date.now(),
            });
            api.storage.writeJson("selectionReplaceRules", rules);
            await api.ui.toast("替换规则已保存到插件存储", "success");
          },
        },
      ],
    };
  },
});
