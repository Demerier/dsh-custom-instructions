window.__ModuleLoader__.load({
  id: "dsh-custom-instructions",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    const { createElement, useState, useEffect } = react;

    // 端点固定挂在宿主 web 服务的同源根路径下；不拼接 origin，交由浏览器按页面 origin 解析。
    const ENDPOINT = "/custom-instructions";

    // 面板样式：主题 token，随明暗主题自动适配。
    const CSS =
      ".dci-row{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}" +
      ".dci-head{display:flex;flex-direction:column;gap:2px}" +
      ".dci-label{font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}" +
      ".dci-caption{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}" +
      ".dci-textarea{box-sizing:border-box;width:100%;min-height:120px;resize:vertical;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Consolas,\"Courier New\",monospace;font-size:12.5px;line-height:1.6;outline:none}" +
      ".dci-textarea:focus{border-color:var(--dsw-alias-brand-primary)}" +
      ".dci-foot{display:flex;align-items:center;gap:10px;min-height:28px}" +
      ".dci-save{flex:none;padding:4px 14px;border:none;border-radius:8px;background:var(--dsw-alias-brand-primary);color:#fff;font-size:12.5px;font-weight:600;line-height:20px;cursor:pointer}" +
      ".dci-save:hover:not(:disabled){opacity:.88}" +
      ".dci-save:disabled{opacity:.45;cursor:default}" +
      ".dci-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}" +
      ".dci-status-ok{color:var(--dsw-alias-state-success-primary)}" +
      ".dci-status-err{color:var(--dsw-alias-state-error-primary)}";

    const TAG_ID = "dsh-custom-instructions/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-custom-instructions";
      tag.dataset.pluginCss = TAG_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function InstructionsRow() {
      const [content, setContent] = useState("");
      const [loaded, setLoaded] = useState(false);
      const [dirty, setDirty] = useState(false);
      const [saving, setSaving] = useState(false);
      const [status, setStatus] = useState("");
      const [message, setMessage] = useState("");

      useEffect(() => {
        let alive = true;
        fetch(ENDPOINT, { headers: { accept: "application/json" }, credentials: "same-origin" })
          .then((response) => {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.json();
          })
          .then((res) => {
            if (!alive) return;
            if (res && res.ok) {
              setContent(res.content === undefined || res.content === null ? "" : String(res.content));
              setLoaded(true);
            } else {
              setStatus("err");
              setMessage((res && res.error) || "读取失败");
            }
          })
          .catch((error) => {
            if (!alive) return;
            setStatus("err");
            setMessage(String((error && error.message) || error));
          });
        return () => { alive = false; };
      }, []);

      const save = () => {
        setSaving(true);
        setStatus("");
        setMessage("");
        fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ content }),
        })
          .then((response) => {
            if (!response.ok && response.status !== 200) {
              return response.json().catch(() => ({ ok: false, error: "HTTP " + response.status }));
            }
            return response.json();
          })
          .then((res) => {
            setSaving(false);
            if (res && res.ok) {
              setStatus("ok");
              setMessage("已保存，之后的新对话都会带上");
              setDirty(false);
            } else {
              setStatus("err");
              setMessage((res && res.error) || "保存失败");
            }
          })
          .catch((error) => {
            setSaving(false);
            setStatus("err");
            setMessage(String((error && error.message) || error));
          });
      };

      return createElement("div", { className: "dci-row" },
        createElement("div", { className: "dci-head" },
          createElement("span", { className: "dci-label" }, "自定义指令"),
          createElement("span", { className: "dci-caption" },
            "编辑对所有会话（不限模型）生效的全局说明与上下文，对应 ~/.dsh/AGENTS.md"),
        ),
        createElement("textarea", {
          className: "dci-textarea",
          value: content,
          rows: 6,
          spellCheck: false,
          placeholder: "在这里写全局指令，例如：\n- 始终使用中文回答。\n- 使用直接、务实的语气回复。",
          onChange: (event) => {
            setContent(event.target.value);
            setDirty(true);
            setStatus("");
            setMessage("");
          },
        }),
        createElement("div", { className: "dci-foot" },
          createElement("button", {
            className: "dci-save",
            disabled: saving || !dirty || !loaded,
            onClick: save,
          }, saving ? "保存中…" : "保存"),
          (!loaded && status !== "err") && createElement("span", { className: "dci-status" }, "加载中…"),
          status === "ok" && createElement("span", { className: "dci-status dci-status-ok" }, message),
          status === "err" && createElement("span", { className: "dci-status dci-status-err" }, message),
        ),
      );
    }

    function apply(ctx) {
      ctx.slots.inject("settings.general.item", () => ctx.slots.register(
        { name: "settings.general.item", id: "custom-instructions", order: -10 },
        () => createElement(InstructionsRow, null),
      ));
    }

    exports.name = "dsh-custom-instructions";
    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  }
});
