(function () {
  "use strict";

  var cfg = window.APP_CONFIG || {};
  var DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  var HEAD = ["Data", "Loja", "Quantidade", "Produto", "Urgente", "Observação do pedido", "Hora", "Login", "Categoria", "Pedido por"];
  var CATEGORIAS = ["CONGELADOR", "LINGUIÇAS", "CARVÃO", "PÃO DE ALHO / QUEIJO COALHO"];
  var LIM_CX = 9, LIM_KG = 80;               // estoque em excesso: mais de 9 caixas ou mais de 80 KG
  var UNID = { cx: "Caixas", kg: "KG" };
  var root = document.getElementById("root");
  var sb = null;
  var S = { perfil: null, lojas: [], acessos: [], aba: "", dia: hoje(), soUrgentes: false, ordens: [], carregouDia: false };
  var panels = {};

  /* ---------- utilidades ---------- */
  function h(tag, props) {
    var el = document.createElement(tag);
    var p = props || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "value") el.value = v;
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { add(el, k); }); return; }
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fmtData(iso) { var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function fmtHora(iso) { var d = new Date(iso); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function addDias(iso, n) { var p = iso.split("-").map(Number); var d = new Date(p[0], p[1] - 1, p[2] + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function diaSemana(iso) { var p = iso.split("-").map(Number); return DIAS[new Date(p[0], p[1] - 1, p[2]).getDay()]; }
  function nomeLoja(id) { var l = S.lojas.find(function (x) { return x.id === id; }); return l ? l.nome : "Loja " + id; }
  function loginDe(uid) { var a = S.acessos.find(function (x) { return x.user_id === uid; }); return a ? a.usuario : ""; }
  function temUrgente(o) { return (o.itens || []).some(function (i) { return i.urgente; }); }
  function setMsg(el, text, tipo) { el.textContent = text; el.className = "msg" + (tipo ? " " + tipo : ""); }
  function erroDb(e) {
    if (e && (e.code === "42501" || /row-level security/i.test(e.message || ""))) return "Você não tem permissão para esta ação.";
    if (e && (e.code === "PGRST204" || e.code === "PGRST205" || e.code === "42P01" || e.code === "42703")) return "O banco de dados ainda não recebeu a atualização. Peça para rodar o arquivo schema-v2-estoque.sql no Supabase.";
    return "Não foi possível concluir agora. Confira a internet e tente de novo.";
  }

  /* ---------- início ---------- */
  async function init() {
    var semConfig = !cfg.SUPABASE_URL || /SEU-PROJETO/.test(cfg.SUPABASE_URL) || !cfg.SUPABASE_ANON_KEY || /COLE-AQUI/.test(cfg.SUPABASE_ANON_KEY);
    if (semConfig) { root.replaceChildren(h("p", { class: "empty", text: "Falta configurar o arquivo config.js com os dados do Supabase. Veja o README." })); return; }
    if (!window.supabase) { root.replaceChildren(h("p", { class: "empty", text: "Não foi possível carregar o sistema. Confira a internet e recarregue." })); return; }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    var r = await sb.auth.getSession();
    if (r.data && r.data.session) await entrar(r.data.session.user); else telaLogin();
    sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") { S.perfil = null; panels = {}; telaLogin(); } });
    setInterval(function () {
      if (!document.hidden && S.perfil && S.perfil.is_admin && S.aba === "dia" && panels.dia) panels.dia.show(true);
    }, 30000);
  }

  /* ---------- login ---------- */
  function telaLogin(aviso) {
    var usuario = h("input", { class: "in", id: "usuario", type: "text", autocomplete: "username", autocapitalize: "none", autocorrect: "off", spellcheck: "false", required: true, placeholder: "ex.: loja03" });
    var senha = h("input", { class: "in", id: "senha", type: "password", autocomplete: "current-password", required: true });
    var m = h("p", { class: "msg err", role: "alert", text: aviso || "" });
    var go = h("button", { type: "submit", class: "btn" }, "Entrar");
    var form = h("form", { class: "card login", onsubmit: async function (e) {
      e.preventDefault();
      go.disabled = true; setMsg(m, "");
      var u = usuario.value.trim().toLowerCase();
      var r = await sb.auth.signInWithPassword({ email: u + "@" + cfg.EMAIL_DOMAIN, password: senha.value });
      if (r.error) {
        go.disabled = false;
        setMsg(m, /invalid|credentials/i.test(r.error.message || "") ? "Usuário ou senha incorretos." : "Não foi possível entrar agora. Tente de novo.", "err");
        return;
      }
      await entrar(r.data.user);
    } },
      h("h1", { text: "Pedidos das Lojas" }),
      h("p", { class: "muted small", text: "Entre com o usuário e a senha da sua loja." }),
      h("div", null, h("label", { class: "lbl", for: "usuario" }, "Usuário"), usuario),
      h("div", null, h("label", { class: "lbl", for: "senha" }, "Senha"), senha),
      go, m);
    root.replaceChildren(form);
  }

  async function entrar(user) {
    var rp = await sb.from("perfis").select("usuario,loja_id,is_admin").eq("user_id", user.id).maybeSingle();
    if (rp.error || !rp.data) {
      await sb.auth.signOut();
      telaLogin(rp.error ? "Não foi possível carregar seu acesso. Tente de novo." : "Este usuário ainda não tem loja configurada. Fale com o administrador.");
      return;
    }
    S.perfil = rp.data;
    var rl = await sb.from("lojas").select("id,nome").order("id");
    S.lojas = rl.data || [];
    if (S.perfil.is_admin) {
      var ra = await sb.from("perfis").select("user_id,usuario,loja_id,is_admin").order("usuario");
      S.acessos = ra.data || [];
    }
    S.aba = S.perfil.is_admin ? "dia" : "novo";
    S.dia = hoje();
    panels = {};
    desenharShell();
  }

  /* ---------- estrutura ---------- */
  var elSub, elTabs, elMain;
  function desenharShell() {
    var p = S.perfil;
    elSub = h("p", { text: "" });
    elTabs = h("nav", { id: "tabs", role: "tablist", "aria-label": "Seções" });
    elMain = h("main", { class: "stack" });
    root.replaceChildren(
      h("header", { class: "top" },
        h("div", null, h("h1", { text: "Pedidos das Lojas" }), elSub),
        h("button", { type: "button", class: "btn ghost no-print", onclick: function () { sb.auth.signOut(); } }, "Sair")),
      elTabs, elMain);
    elSub.textContent = (p.is_admin ? "Administração" : nomeLoja(p.loja_id)) + " · " + diaSemana(hoje()) + ", " + fmtData(hoje()).slice(0, 5);
    trocarAba(S.aba);
  }
  function trocarAba(aba) {
    S.aba = aba;
    var abas = S.perfil.is_admin ? [["dia", "Pedidos recebidos"], ["relatorio", "Relatório por loja"], ["lojas", "Lojas e acessos"]] : [["novo", "Novo pedido"], ["meus", "Meus pedidos"], ["estoque", "Estoque"]];
    elTabs.replaceChildren();
    abas.forEach(function (a) {
      elTabs.append(h("button", { type: "button", class: "tab", role: "tab", "aria-selected": String(S.aba === a[0]), onclick: function () { trocarAba(a[0]); } }, a[1]));
    });
    var mk = { novo: buildNovo, meus: buildMeus, estoque: buildEstoque, dia: buildDia, relatorio: buildRelatorio, lojas: buildLojas }[aba];
    if (!panels[aba]) panels[aba] = mk();
    elMain.replaceChildren(panels[aba].el);
    panels[aba].show();
  }

  /* ---------- pedidos (cartões) ---------- */
  function itemRow(it) {
    return h("div", { class: "item" }, h("span", { class: "q", text: it.qtd }), h("span", { class: "p", text: it.produto }),
      it.urgente ? h("span", { class: "pill urgent", text: "Urgente" }) : null);
  }
  function orderCard(o, itens, quem) {
    return h("div", { class: "order" },
      h("div", { class: "order-h" }, h("strong", { text: fmtData(o.data) + " às " + fmtHora(o.criado_em) }), quem ? h("span", { text: quem }) : null,
        o.categoria ? h("span", { class: "pill cat", text: o.categoria }) : null,
        o.categoria && o.solicitante ? h("span", { text: "Pedido por: " + o.solicitante }) : null),
      h("div", null, itens.map(itemRow)),
      o.obs ? h("div", { class: "obs", text: o.obs }) : null);
  }

  /* ---------- loja: novo pedido ---------- */
  function buildNovo() {
    var uid = 0, draft = [], enviando = false;
    function nova() { return { k: ++uid, qtd: "", produto: "", urgente: false }; }
    draft = [nova(), nova(), nova()];
    var rowsEl = h("div", { class: "rows" });
    var obs = h("textarea", { class: "in", id: "obs", placeholder: "Ex.: entregar antes das 10h", "aria-label": "Observação do pedido" });
    var m = h("span", { class: "msg grow", role: "status" });
    var enviar = h("button", { type: "button", class: "btn", onclick: enviarPedido }, "Enviar pedido");
    /* categorias de pedido individual (opcional; vazio = pedido geral, como sempre foi) */
    var solic = h("input", { class: "in", id: "solic", maxlength: "80", autocomplete: "off", placeholder: "Nome de quem fez o pedido", "aria-label": "Nome de quem fez o pedido", oninput: function (e) { e.target.classList.remove("bad"); } });
    var solicWrap = h("div", { hidden: true }, h("label", { class: "lbl", for: "solic" }, "Nome de quem fez o pedido"), solic);
    var cat = h("select", { class: "in", id: "cat", "aria-label": "Tipo de pedido", onchange: function () { solicWrap.hidden = !cat.value; if (!cat.value) solic.value = ""; solic.classList.remove("bad"); } },
      h("option", { value: "" }, "Pedido geral"), CATEGORIAS.map(function (c) { return h("option", { value: c }, c); }));

    function renderRows(focusLast) {
      rowsEl.replaceChildren();
      draft.forEach(function (r) {
        var q = h("input", { class: "in qtd", id: "q-" + r.k, value: r.qtd, placeholder: "200 kg", autocomplete: "off", "aria-label": "Quantidade", oninput: function (e) { r.qtd = e.target.value; e.target.classList.remove("bad"); } });
        var p = h("input", { class: "in prod", id: "p-" + r.k, value: r.produto, placeholder: "Linguiça Perdigão", autocomplete: "off", "aria-label": "Produto", oninput: function (e) { r.produto = e.target.value; e.target.classList.remove("bad"); },
          onkeydown: function (e) { if (e.key === "Enter") { e.preventDefault(); draft.push(nova()); renderRows(true); } } });
        var u = h("button", { type: "button", class: "urg" + (r.urgente ? " on" : ""), "aria-pressed": String(!!r.urgente), onclick: function () { r.urgente = !r.urgente; u.classList.toggle("on", r.urgente); u.setAttribute("aria-pressed", String(r.urgente)); } }, "Urgente");
        var x = h("button", { type: "button", class: "rem", "aria-label": "Remover item", onclick: function () { draft = draft.filter(function (d) { return d !== r; }); if (!draft.length) draft.push(nova()); renderRows(); } }, "×");
        rowsEl.append(h("div", { class: "row" }, q, p, u, x));
      });
      if (focusLast) { var ps = rowsEl.querySelectorAll(".prod"); if (ps.length) ps[ps.length - 1].focus(); }
    }
    renderRows();

    async function enviarPedido() {
      if (enviando) return;
      rowsEl.querySelectorAll(".bad").forEach(function (n) { n.classList.remove("bad"); });
      var itens = [], falta = false;
      draft.forEach(function (r) {
        var q = r.qtd.trim(), p = r.produto.trim();
        if (!q && !p) return;
        if (!q) { falta = true; document.getElementById("q-" + r.k).classList.add("bad"); }
        if (!p) { falta = true; document.getElementById("p-" + r.k).classList.add("bad"); }
        if (q && p) itens.push({ qtd: q, produto: p, urgente: !!r.urgente });
      });
      if (falta) { setMsg(m, "Preencha quantidade e produto nas linhas marcadas.", "err"); return; }
      if (!itens.length) { setMsg(m, "Adicione pelo menos um item.", "err"); return; }
      if (cat.value && !solic.value.trim()) { solic.classList.add("bad"); setMsg(m, "Informe o nome de quem fez o pedido.", "err"); return; }
      enviando = true; enviar.disabled = true; setMsg(m, "Enviando…");
      var novo = { loja_id: S.perfil.loja_id, itens: itens, obs: obs.value.trim() };
      if (cat.value) { novo.categoria = cat.value; novo.solicitante = solic.value.trim(); }
      var r = await sb.from("pedidos").insert(novo);
      enviando = false; enviar.disabled = false;
      if (r.error) { setMsg(m, erroDb(r.error), "err"); return; }
      draft = [nova(), nova(), nova()]; obs.value = ""; cat.value = ""; solic.value = ""; solicWrap.hidden = true; renderRows();
      setMsg(m, "Pedido enviado com " + itens.length + (itens.length === 1 ? " item." : " itens."), "ok");
      if (panels.meus) panels.meus.stale = true;
    }

    var el = h("section", { class: "card" },
      h("div", { class: "bar" }, h("h2", { class: "grow", text: "Novo pedido" }), h("strong", { class: "muted small", text: nomeLoja(S.perfil.loja_id) })),
      h("div", null, h("label", { class: "lbl", for: "cat" }, "Tipo de pedido"), cat),
      solicWrap,
      h("div", { class: "cols" }, h("span", { text: "Quantidade" }), h("span", { text: "Produto" })),
      rowsEl,
      h("div", { class: "bar" }, h("button", { type: "button", class: "btn ghost", onclick: function () { draft.push(nova()); renderRows(true); } }, "+ Adicionar item")),
      h("div", null, h("label", { class: "lbl", for: "obs" }, "Observação (opcional)"), obs),
      h("div", { class: "bar" }, enviar, m));
    return { el: el, show: function () {} };
  }

  /* ---------- loja: meus pedidos ---------- */
  function buildMeus() {
    var lista = h("div", { class: "stack" });
    var self = { stale: true, el: h("section", { class: "stack" }, h("h2", { text: "Pedidos da minha loja" }), lista) };
    self.show = async function () {
      if (!self.stale) return;
      lista.replaceChildren(h("p", { class: "empty", text: "Carregando…" }));
      var r = await sb.from("pedidos").select("*").order("criado_em", { ascending: false }).limit(100);
      lista.replaceChildren();
      if (r.error) { lista.append(h("p", { class: "empty", text: erroDb(r.error) })); return; }
      self.stale = false;
      if (!r.data.length) { lista.append(h("p", { class: "empty", text: "Nenhum pedido enviado ainda." })); return; }
      r.data.forEach(function (o) { lista.append(orderCard(o, o.itens || [])); });
    };
    return self;
  }

  /* ---------- admin: pedidos recebidos ---------- */
  function ordensDoDia() { return S.ordens.filter(function (o) { return Array.isArray(o.itens); }); }
  function linhasDe(os) {
    var rows = [];
    os.forEach(function (o) {
      o.itens.forEach(function (it) {
        rows.push([fmtData(o.data), nomeLoja(o.loja_id), it.qtd, it.produto, it.urgente ? "URGENTE" : "", o.obs || "", fmtHora(o.criado_em), loginDe(o.criado_por), o.categoria || "", o.solicitante || ""]);
      });
    });
    return rows;
  }
  function linhasPlanilha() { return linhasDe(ordensDoDia()); }

  function buildDia() {
    var data = h("input", { type: "date", class: "in", id: "dia", "aria-label": "Dia dos pedidos", onchange: function (e) { if (e.target.value) { S.dia = e.target.value; copiaLimpa(); self.show(); } } });
    var nomeDia = h("span", { class: "muted" });
    var resumo = h("div", { class: "stack" });
    var lista = h("div", { class: "stack" });
    var copiaBox = h("div", { class: "stack" });
    var mm = h("span", { class: "msg small", role: "status" });
    var sw = h("input", { type: "checkbox", id: "so-urg", onchange: function (e) { S.soUrgentes = e.target.checked; pintar(); } });
    var tituloPrint = h("h2", { class: "print-only" });
    function copiaLimpa() { copiaBox.replaceChildren(); }
    function irPara(d) { S.dia = d; copiaLimpa(); self.show(); }

    function baixarExcel() {
      var rows = linhasPlanilha();
      if (!rows.length) { setMsg(mm, "Não há pedidos neste dia."); return; }
      if (!window.XLSX) { setMsg(mm, "Não foi possível carregar o gerador de Excel. Use “Copiar para colar no Excel”.", "err"); return; }
      var ws = XLSX.utils.aoa_to_sheet([HEAD].concat(rows));
      ws["!cols"] = [{ wch: 11 }, { wch: 14 }, { wch: 12 }, { wch: 36 }, { wch: 10 }, { wch: 28 }, { wch: 7 }, { wch: 12 }, { wch: 22 }, { wch: 18 }];
      var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
      XLSX.writeFile(wb, "pedidos-" + S.dia + ".xlsx");
      setMsg(mm, "Planilha gerada.", "ok");
    }
    async function copiarTabela() {
      var rows = linhasPlanilha();
      if (!rows.length) { setMsg(mm, "Não há pedidos neste dia."); return; }
      var tsv = [HEAD].concat(rows).map(function (r) { return r.map(function (c) { return String(c).replace(/[\t\r\n]+/g, " "); }).join("\t"); }).join("\n");
      try { await navigator.clipboard.writeText(tsv); setMsg(mm, "Tabela copiada. Cole na planilha com Ctrl+V.", "ok"); copiaLimpa(); }
      catch (e) {
        var ta = h("textarea", { class: "in", readonly: true, "aria-label": "Tabela para copiar", style: "font-family:var(--font-mono);font-size:13px;min-height:120px" });
        ta.value = tsv; copiaBox.replaceChildren(ta); ta.focus(); ta.select();
        setMsg(mm, "Selecione o texto abaixo e copie.");
      }
    }

    var self = {
      el: h("section", { class: "stack" },
        h("div", { class: "card no-print" },
          h("div", { class: "dia-nav" },
            h("button", { type: "button", class: "btn ghost", "aria-label": "Dia anterior", onclick: function () { irPara(addDias(S.dia, -1)); } }, "‹"),
            data,
            h("button", { type: "button", class: "btn ghost", "aria-label": "Próximo dia", onclick: function () { irPara(addDias(S.dia, 1)); } }, "›"),
            h("button", { type: "button", class: "btn ghost", onclick: function () { irPara(hoje()); } }, "Hoje"),
            nomeDia),
          resumo,
          h("div", { class: "bar" },
            h("button", { type: "button", class: "btn", onclick: baixarExcel }, "Baixar Excel do dia"),
            h("button", { type: "button", class: "btn ghost", onclick: function () { window.print(); } }, "Imprimir"),
            h("button", { type: "button", class: "btn ghost", onclick: copiarTabela }, "Copiar para colar no Excel"),
            h("label", { class: "switch" }, sw, "Só urgentes")),
          mm, copiaBox),
        tituloPrint, lista)
    };

    function pintar() {
      if (document.activeElement !== data) data.value = S.dia;
      sw.checked = S.soUrgentes;
      nomeDia.textContent = diaSemana(S.dia);
      tituloPrint.textContent = "Pedidos de " + fmtData(S.dia) + " (" + diaSemana(S.dia) + ")";
      var os = ordensDoDia();
      var comPedido = {}; os.forEach(function (o) { comPedido[o.loja_id] = true; });
      var urg = 0; os.forEach(function (o) { o.itens.forEach(function (i) { if (i.urgente) urg++; }); });
      resumo.replaceChildren(
        h("p", { style: "margin:0" }, h("strong", { text: Object.keys(comPedido).length + " de " + S.lojas.length + " lojas enviaram pedido" }),
          urg ? h("span", { class: "pill urgent", style: "margin-left:8px", text: urg + (urg === 1 ? " item urgente" : " itens urgentes") }) : null),
        h("div", { class: "chips" }, S.lojas.map(function (l) { return h("span", { class: "pill " + (comPedido[l.id] ? "ok" : "wait"), text: l.nome }); })));

      lista.replaceChildren();
      if (!S.carregouDia) { lista.append(h("p", { class: "empty", text: "Carregando pedidos…" })); return; }
      S.lojas.forEach(function (l) {
        var das = os.filter(function (o) { return o.loja_id === l.id; });
        if (S.soUrgentes) das = das.filter(temUrgente);
        if (S.soUrgentes && !das.length) return;
        var bloco = h("section", { class: "loja" },
          h("div", { class: "loja-h" }, h("h3", { text: l.nome }),
            das.length ? h("span", { class: "pill ok", text: das.length + (das.length === 1 ? " pedido" : " pedidos") }) : h("span", { class: "pill wait", text: "Sem pedido" })));
        das.forEach(function (o) {
          var itens = S.soUrgentes ? o.itens.filter(function (i) { return i.urgente; }) : o.itens;
          bloco.append(orderCard(o, itens, loginDe(o.criado_por)));
        });
        lista.append(bloco);
      });
    }

    self.show = async function (silencioso) {
      if (!silencioso) { S.carregouDia = false; pintar(); }
      var dia = S.dia;
      var r = await sb.from("pedidos").select("*").eq("data", dia).order("loja_id").order("criado_em");
      if (dia !== S.dia) return;
      if (r.error) { setMsg(mm, erroDb(r.error), "err"); return; }
      S.ordens = r.data || []; S.carregouDia = true; pintar();
    };
    return self;
  }

  /* ---------- estoque e relatórios: apoio ---------- */
  function num(v) { return Number(String(v).trim().replace(",", ".")); }
  function fmtQtd(q) { return Number(q).toLocaleString("pt-BR", { maximumFractionDigits: 3 }); }
  function isExcesso(q, un) { q = Number(q); return (un === "cx" && q > LIM_CX) || (un === "kg" && q > LIM_KG); }
  function fmtDataHora(iso) { var d = new Date(iso); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function agora() { return fmtDataHora(new Date().toISOString()); }
  function slug(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase(); }

  function salvarXlsx(cab, linhas, larguras, aba, arquivo, msgEl) {
    if (!linhas.length) { setMsg(msgEl, "Não há dados para exportar.", "err"); return; }
    if (!window.XLSX) { setMsg(msgEl, "Não foi possível carregar o gerador de Excel. Confira a internet e recarregue.", "err"); return; }
    var ws = XLSX.utils.aoa_to_sheet([cab].concat(linhas));
    ws["!cols"] = larguras.map(function (w) { return { wch: w }; });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, aba);
    XLSX.writeFile(wb, arquivo);
    setMsg(msgEl, "Planilha gerada.", "ok");
  }
  function exportarEstoque(lojaId, rows, msgEl) {
    var linhas = rows.map(function (r) {
      return [nomeLoja(lojaId), r.produto, Number(r.quantidade), UNID[r.unidade], isExcesso(r.quantidade, r.unidade) ? "EXCESSO" : "Normal", fmtDataHora(r.atualizado_em)];
    });
    salvarXlsx(["Loja", "Produto", "Quantidade", "Unidade", "Situação", "Atualizado em"], linhas, [14, 36, 12, 10, 11, 17], "Estoque", "estoque-" + slug(nomeLoja(lojaId)) + "-" + hoje() + ".xlsx", msgEl);
  }

  function cabRel(tipo, lojaId, sub) {
    return h("div", { class: "rel-head" }, h("span", { class: "tag", text: tipo }), h("h2", { text: nomeLoja(lojaId) }), h("p", { class: "rel-sub", text: sub }));
  }
  function tabelaEstoque(rows) {
    var tb = h("tbody");
    rows.forEach(function (r) {
      var ex = isExcesso(r.quantidade, r.unidade);
      tb.append(h("tr", { class: ex ? "excesso" : "" },
        h("td", { text: r.produto }), h("td", { class: "num", text: fmtQtd(r.quantidade) }), h("td", { text: UNID[r.unidade] }),
        h("td", null, ex ? h("span", { class: "pill excess", text: "EXCESSO" }) : h("span", { class: "ok-txt", text: "Normal" }))));
    });
    return h("div", { class: "tbl-wrap" }, h("table", { class: "rel" },
      h("thead", null, h("tr", null, h("th", { text: "Produto" }), h("th", { class: "num", text: "Quantidade" }), h("th", { text: "Unidade" }), h("th", { text: "Situação" }))), tb));
  }
  function relEstoque(lojaId, rows) {
    var exc = rows.filter(function (r) { return isExcesso(r.quantidade, r.unidade); }).length;
    return h("div", { class: "papel" },
      cabRel("ESTOQUE", lojaId, "Emitido em " + agora()),
      h("p", { class: "rel-res" }, h("strong", { text: rows.length + (rows.length === 1 ? " produto" : " produtos") }),
        exc ? h("span", { class: "pill excess", text: exc + " em excesso" }) : h("span", { class: "ok-txt", text: "Nenhum em excesso" })),
      rows.length ? tabelaEstoque(rows) : h("p", { class: "empty", text: "Nenhum produto no estoque desta loja." }),
      h("p", { class: "rel-nota", text: "Estoque em excesso: mais de " + LIM_CX + " caixas ou mais de " + LIM_KG + " KG." }));
  }
  function relPedidos(lojaId, dia, ordens) {
    var os = ordens.filter(function (o) { return Array.isArray(o.itens); });
    var nItens = 0, nUrg = 0;
    os.forEach(function (o) { o.itens.forEach(function (i) { nItens++; if (i.urgente) nUrg++; }); });
    var tb = h("tbody");
    os.forEach(function (o) {
      var login = loginDe(o.criado_por);
      tb.append(h("tr", { class: "grupo" }, h("td", { colspan: "3" },
        h("div", { class: "grp" },
          h("strong", { text: "Pedido das " + fmtHora(o.criado_em) }),
          login ? h("span", { class: "muted", text: login }) : null,
          o.categoria ? h("span", { class: "pill cat", text: o.categoria }) : null,
          o.categoria && o.solicitante ? h("span", { text: "Pedido por: " + o.solicitante }) : null),
        o.obs ? h("div", { class: "rel-obs", text: "Obs.: " + o.obs }) : null)));
      o.itens.forEach(function (it) {
        tb.append(h("tr", null, h("td", { class: "q", text: it.qtd }), h("td", { text: it.produto }),
          h("td", null, it.urgente ? h("span", { class: "pill urgent", text: "URGENTE" }) : null)));
      });
    });
    return h("div", { class: "papel" },
      cabRel("PEDIDO", lojaId, fmtData(dia) + " (" + diaSemana(dia) + ") · Emitido em " + agora()),
      h("p", { class: "rel-res" },
        h("strong", { text: os.length + (os.length === 1 ? " pedido" : " pedidos") + " · " + nItens + (nItens === 1 ? " item" : " itens") }),
        nUrg ? h("span", { class: "pill urgent", text: nUrg + (nUrg === 1 ? " urgente" : " urgentes") }) : null),
      os.length ? h("div", { class: "tbl-wrap" }, h("table", { class: "rel" },
        h("thead", null, h("tr", null, h("th", { text: "Quantidade" }), h("th", { text: "Produto" }), h("th", { text: "Urgência" }))), tb))
        : h("p", { class: "empty", text: "Nenhum pedido desta loja neste dia." }));
  }

  /* ---------- loja: estoque ---------- */
  function buildEstoque() {
    var lojaId = S.perfil.loja_id, rows = null, falha = false;
    var m = h("span", { class: "msg grow", role: "status" });
    var resumo = h("div", { class: "bar" });
    var lista = h("div", { class: "est-lista" });
    var rel = h("div", { class: "print-only" });
    var inProd = h("input", { class: "in", id: "est-prod", maxlength: "120", autocomplete: "off", placeholder: "Ex.: Linguiça Perdigão", "aria-label": "Produto" });
    var inQtd = h("input", { class: "in", id: "est-qtd", inputmode: "decimal", autocomplete: "off", placeholder: "0", "aria-label": "Quantidade em estoque" });
    var inUn = h("select", { class: "in", id: "est-un", "aria-label": "Unidade" }, h("option", { value: "cx" }, UNID.cx), h("option", { value: "kg" }, UNID.kg));
    inProd.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); inQtd.focus(); } });
    inQtd.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); adicionar(); } });

    function pintarResumo() {
      resumo.replaceChildren(); rel.replaceChildren();
      if (rows === null) return;
      var exc = rows.filter(function (r) { return isExcesso(r.quantidade, r.unidade); }).length;
      resumo.append(
        h("span", { class: "pill " + (exc ? "excess" : "ok"), text: exc ? exc + (exc === 1 ? " produto em excesso" : " produtos em excesso") : "Nenhum produto em excesso" }),
        h("span", { class: "muted small", text: rows.length + (rows.length === 1 ? " produto" : " produtos") + " · excesso: mais de " + LIM_CX + " caixas ou mais de " + LIM_KG + " KG" }));
      rel.append(relEstoque(lojaId, rows));
    }
    function pintar() {
      lista.replaceChildren();
      if (falha && rows === null) { lista.append(h("p", { class: "empty", text: "Não foi possível carregar o estoque. Confira a internet e recarregue." })); pintarResumo(); return; }
      if (rows === null) { lista.append(h("p", { class: "empty", text: "Carregando…" })); return; }
      if (!rows.length) lista.append(h("p", { class: "empty", text: "Nenhum produto no estoque. Adicione o primeiro acima." }));
      rows.forEach(function (r) { lista.append(linha(r)); });
      pintarResumo();
    }
    function linha(r) {
      var el = h("div", { class: "est-row" });
      var flag = h("span", { class: "est-flag" });
      var q = h("input", { class: "in qtd", value: String(Number(r.quantidade)).replace(".", ","), inputmode: "decimal", autocomplete: "off", "aria-label": "Quantidade de " + r.produto, onchange: salvar });
      var u = h("select", { class: "in", "aria-label": "Unidade de " + r.produto, onchange: salvar }, h("option", { value: "cx" }, UNID.cx), h("option", { value: "kg" }, UNID.kg));
      u.value = r.unidade;
      var rem = h("button", { type: "button", class: "rem", "aria-label": "Remover " + r.produto, onclick: remover }, "×");
      function marca() {
        var ex = isExcesso(r.quantidade, r.unidade);
        el.classList.toggle("excesso", ex);
        flag.replaceChildren();
        if (ex) flag.append(h("span", { class: "pill excess", text: "ESTOQUE EM EXCESSO" }));
      }
      async function salvar() {
        q.classList.remove("bad");
        var nq = num(q.value);
        if (q.value.trim() === "" || !isFinite(nq) || nq < 0) { q.classList.add("bad"); setMsg(m, "Quantidade inválida em “" + r.produto + "”.", "err"); return; }
        var res = await sb.from("estoque").update({ quantidade: nq, unidade: u.value }).eq("id", r.id).select();
        if (res.error || !res.data || !res.data.length) { setMsg(m, res.error ? erroDb(res.error) : "Você não tem permissão para esta ação.", "err"); return; }
        r.quantidade = res.data[0].quantidade; r.unidade = res.data[0].unidade; r.atualizado_em = res.data[0].atualizado_em;
        marca(); pintarResumo(); setMsg(m, "Salvo: " + r.produto + ".", "ok");
      }
      async function remover() {
        if (!rem.dataset.conf) {
          rem.dataset.conf = "1"; rem.textContent = "Remover?"; rem.classList.add("conf");
          setTimeout(function () { delete rem.dataset.conf; rem.textContent = "×"; rem.classList.remove("conf"); }, 3000);
          return;
        }
        var res = await sb.from("estoque").delete().eq("id", r.id).select();
        if (res.error || !res.data || !res.data.length) { setMsg(m, res.error ? erroDb(res.error) : "Você não tem permissão para esta ação.", "err"); return; }
        rows = rows.filter(function (x) { return x.id !== r.id; });
        setMsg(m, "Produto removido.", "ok");
        pintar();
      }
      marca();
      el.append(h("strong", { class: "est-nome", text: r.produto }), q, u, flag, rem);
      return el;
    }
    async function carregar() {
      var r = await sb.from("estoque").select("*").eq("loja_id", lojaId).order("produto");
      if (r.error) { falha = true; setMsg(m, erroDb(r.error), "err"); }
      else { falha = false; rows = r.data || []; }
      pintar();
    }
    async function adicionar() {
      inProd.classList.remove("bad"); inQtd.classList.remove("bad");
      var prod = inProd.value.trim(), q = num(inQtd.value);
      if (!prod) { inProd.classList.add("bad"); setMsg(m, "Informe o produto.", "err"); return; }
      if (inQtd.value.trim() === "" || !isFinite(q) || q < 0) { inQtd.classList.add("bad"); setMsg(m, "Informe uma quantidade válida (0 ou mais).", "err"); return; }
      if (rows === null) { setMsg(m, "Aguarde o estoque carregar.", "err"); return; }
      var ja = rows.find(function (r) { return r.produto.trim().toLowerCase() === prod.toLowerCase(); });
      add.disabled = true; setMsg(m, "Salvando…");
      var res = ja
        ? await sb.from("estoque").update({ quantidade: q, unidade: inUn.value }).eq("id", ja.id).select()
        : await sb.from("estoque").insert({ loja_id: lojaId, produto: prod, quantidade: q, unidade: inUn.value }).select();
      add.disabled = false;
      if (res.error || !res.data || !res.data.length) { setMsg(m, res.error ? erroDb(res.error) : "Você não tem permissão para esta ação.", "err"); return; }
      inProd.value = ""; inQtd.value = "";
      setMsg(m, ja ? "Produto atualizado." : "Produto adicionado.", "ok");
      inProd.focus();
      await carregar();
    }
    var add = h("button", { type: "button", class: "btn", onclick: adicionar }, "Adicionar");

    var el = h("section", { class: "stack" },
      h("div", { class: "card no-print" },
        h("div", { class: "bar" }, h("h2", { class: "grow", text: "Estoque" }), h("strong", { class: "muted small", text: nomeLoja(lojaId) })),
        resumo,
        h("div", { class: "est-add" },
          h("div", null, h("label", { class: "lbl", for: "est-prod" }, "Produto"), inProd),
          h("div", null, h("label", { class: "lbl", for: "est-qtd" }, "Quantidade"), inQtd),
          h("div", null, h("label", { class: "lbl", for: "est-un" }, "Unidade"), inUn),
          add),
        lista,
        h("div", { class: "bar" },
          h("button", { type: "button", class: "btn", onclick: function () { if (!rows || !rows.length) { setMsg(m, "Não há produtos no estoque.", "err"); return; } exportarEstoque(lojaId, rows, m); } }, "Baixar Excel"),
          h("button", { type: "button", class: "btn ghost", onclick: function () { if (!rows || !rows.length) { setMsg(m, "Não há produtos no estoque.", "err"); return; } window.print(); } }, "Imprimir estoque"),
          m)),
      rel);
    return { el: el, show: carregar };
  }

  /* ---------- admin: relatório por loja (PEDIDO ou ESTOQUE) ---------- */
  function buildRelatorio() {
    var lojaId = S.lojas.length ? S.lojas[0].id : 1, tipo = "pedido", dia = hoje(), dados = null, falha = false, tok = 0;
    var mm = h("span", { class: "msg small", role: "status" });
    var rel = h("div", { class: "relatorio" });
    var selLoja = h("select", { class: "in", id: "rel-loja", "aria-label": "Loja", onchange: function (e) { lojaId = Number(e.target.value); carregar(); } });
    var bPed = h("button", { type: "button", class: "seg", onclick: function () { setTipo("pedido"); } }, "PEDIDO");
    var bEst = h("button", { type: "button", class: "seg", onclick: function () { setTipo("estoque"); } }, "ESTOQUE");
    var data = h("input", { type: "date", class: "in", id: "rel-dia", "aria-label": "Dia dos pedidos", onchange: function (e) { if (e.target.value) { dia = e.target.value; carregar(); } } });
    var navDia = h("div", { class: "dia-nav" },
      h("button", { type: "button", class: "btn ghost", "aria-label": "Dia anterior", onclick: function () { dia = addDias(dia, -1); carregar(); } }, "‹"),
      data,
      h("button", { type: "button", class: "btn ghost", "aria-label": "Próximo dia", onclick: function () { dia = addDias(dia, 1); carregar(); } }, "›"),
      h("button", { type: "button", class: "btn ghost", onclick: function () { dia = hoje(); carregar(); } }, "Hoje"));

    function setTipo(t) { tipo = t; carregar(); }
    function controles() {
      var v = selLoja.value;
      selLoja.replaceChildren();
      S.lojas.forEach(function (l) { selLoja.append(h("option", { value: String(l.id) }, l.nome)); });
      selLoja.value = String(lojaId);
      bPed.setAttribute("aria-pressed", String(tipo === "pedido"));
      bEst.setAttribute("aria-pressed", String(tipo === "estoque"));
      navDia.hidden = tipo !== "pedido";
      if (document.activeElement !== data) data.value = dia;
    }
    function pintar() {
      controles();
      rel.replaceChildren();
      if (falha) { rel.append(h("p", { class: "empty", text: "Não foi possível carregar o relatório." })); return; }
      if (dados === null) { rel.append(h("p", { class: "empty", text: "Carregando…" })); return; }
      rel.append(tipo === "pedido" ? relPedidos(lojaId, dia, dados) : relEstoque(lojaId, dados));
    }
    async function carregar() {
      var my = ++tok; dados = null; falha = false; setMsg(mm, ""); pintar();
      var r = tipo === "pedido"
        ? await sb.from("pedidos").select("*").eq("loja_id", lojaId).eq("data", dia).order("criado_em")
        : await sb.from("estoque").select("*").eq("loja_id", lojaId).order("produto");
      if (my !== tok) return;
      if (r.error) { falha = true; setMsg(mm, erroDb(r.error), "err"); } else dados = r.data || [];
      pintar();
    }
    function baixar() {
      if (!dados) { setMsg(mm, "Aguarde o relatório carregar.", "err"); return; }
      if (tipo === "pedido") {
        var os = dados.filter(function (o) { return Array.isArray(o.itens); });
        salvarXlsx(HEAD, linhasDe(os), [11, 14, 12, 36, 10, 28, 7, 12, 22, 18], "Pedidos", "pedidos-" + slug(nomeLoja(lojaId)) + "-" + dia + ".xlsx", mm);
      } else exportarEstoque(lojaId, dados, mm);
    }
    function imprimir() {
      if (!dados) { setMsg(mm, "Aguarde o relatório carregar.", "err"); return; }
      window.print();
    }

    var el = h("section", { class: "stack" },
      h("div", { class: "card no-print" },
        h("h2", { text: "Relatório por loja" }),
        h("div", { class: "rel-ctl" },
          h("div", null, h("label", { class: "lbl", for: "rel-loja" }, "Loja"), selLoja),
          h("div", null, h("span", { class: "lbl" }, "O que ver"), h("div", { class: "segs", role: "group", "aria-label": "O que ver" }, bPed, bEst))),
        navDia,
        h("div", { class: "bar" },
          h("button", { type: "button", class: "btn", onclick: baixar }, "Baixar Excel"),
          h("button", { type: "button", class: "btn ghost", onclick: imprimir }, "Imprimir"),
          h("button", { type: "button", class: "btn ghost", onclick: carregar }, "Atualizar"),
          mm)),
      rel);
    return { el: el, show: carregar };
  }

  /* ---------- admin: lojas e acessos ---------- */
  function buildLojas() {
    var inputs = S.lojas.map(function (l) { return h("input", { class: "in", id: "nome-" + l.id, maxlength: "40", value: l.nome, "aria-label": "Nome da loja " + l.id, autocomplete: "off" }); });
    var m = h("span", { class: "msg small", role: "status" });
    var salvar = h("button", { type: "button", class: "btn", onclick: async function () {
      salvar.disabled = true; setMsg(m, "Salvando…");
      var jobs = [];
      S.lojas.forEach(function (l, i) {
        var nome = inputs[i].value.trim() || l.nome;
        if (nome !== l.nome) jobs.push(sb.from("lojas").update({ nome: nome }).eq("id", l.id).then(function (r) { if (!r.error) l.nome = nome; return r; }));
      });
      var rs = await Promise.all(jobs);
      salvar.disabled = false;
      if (rs.some(function (r) { return r.error; })) { setMsg(m, "Alguns nomes não foram salvos. Tente de novo.", "err"); return; }
      setMsg(m, jobs.length ? "Nomes salvos." : "Nada para salvar.", "ok");
      if (panels.dia) panels.dia.show(true);
    } }, "Salvar nomes");

    var acessos = S.acessos.slice().sort(function (a, b) { return a.usuario < b.usuario ? -1 : 1; }).map(function (a) {
      return h("div", { class: "ger" }, h("strong", { text: a.usuario }), h("span", { class: "muted", text: a.is_admin ? "Administrador" : nomeLoja(a.loja_id) }));
    });

    var el = h("section", { class: "stack" },
      h("div", { class: "card" },
        h("h2", { text: "Nomes das lojas" }),
        h("div", { class: "grid2" }, inputs),
        h("div", { class: "bar" }, salvar, m)),
      h("div", { class: "card" },
        h("h2", { text: "Acessos criados" }),
        h("p", { class: "muted small", text: "Cada login enxerga só a própria loja. Para criar logins, trocar uma senha ou mudar a loja de um login, use o passo a passo do README (o site não altera acessos de propósito)." }),
        acessos.length ? h("div", null, acessos) : h("p", { class: "empty", text: "Nenhum acesso criado." })));
    return { el: el, show: function () {} };
  }

  init();
})();
