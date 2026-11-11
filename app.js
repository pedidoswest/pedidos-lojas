(function () {
  "use strict";

  var cfg = window.APP_CONFIG || {};
  var DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  var HEAD = ["Data", "Loja", "Quantidade", "Produto", "Urgente", "Observação do pedido", "Hora", "Login", "Categoria", "Pedido por"];
  var CATEGORIAS = ["CONGELADOR", "LINGUIÇAS", "CARVÃO", "PÃO DE ALHO / QUEIJO COALHO"];
  var LOJAS_MODELO = ["AREAL","BANDEIRANTE","BICALHO","ESTRUTURAL","RECANTO I","SAMAMBAIA","SAMAMBAIA SUL","RIACHO FUNDO","TAGUACENTER","RECANTO II","VILA DIMAS"];
var PRODUTOS_POR_CATEGORIA = {
  "CONGELADOR": ["ASA DE FRANGO","COXINHA DA ASA","COXA / SOBRECOXA","FILE DE FRANGO","PEITO DE FRANGO","FRANGO INTEIRO","GALINHA SABOROSA","MOELA","CORACAO DE FRANGO","PE DE FRANGO","PESCOCO DE PERU","FIGADO BOVINO","LINGUA BOVINA","CORACAO BOVINO","CUPIM A","CUPIM B","RABADA","LAGARTO","CHARQUE BOVINO","MOCOTO BOVINO","BANDA SUINA","CARRE SUINO","COSTELINHA FRESCA","COSTELINHA SALGADA","JOELHINHO SALGADO","LOMBO SALGADO","ORELHA SALGADA","PE SALGADO","RABO SALGADO","TOUCINHO","BUCHO","BATATA PALITO LAR","BATATA BEM BRASIL 1,05KG","BATATA MC CAIN","PAO DE ALHO TRADICIONAL","PAO DE ALHO APIM","PAO DE ALHO BOLA","NUGGETS","HAMBURGUER BOUA","AVE FAMILIA","SALSICHA","CALABRESA","LINGUICA SUINA","LINGUICA PAIO","LINGUICA SUPER FRANGO","LINGUICA SEARA","BACON","COSTELA DEFUMADA","FRISSURA","COXA DORSAL"],
  "LINGUIÇAS": ["LINGUICA SUINA","LINGUICA PAIO","LINGUICA SUPER FRANGO","LINGUICA SEARA","CALABRESA","SALSICHA"],
  "CARVÃO": ["CARVAO"],
  "PÃO DE ALHO / QUEIJO COALHO": ["PAO DE ALHO TRADICIONAL","PAO DE ALHO APIM","PAO DE ALHO BOLA","QUEIJO COALHO"]
};
  var LIM_CX = 9, LIM_KG = 80;               // estoque em excesso: mais de 9 caixas ou mais de 80 KG
var UNID = { cx: "Caixas", kg: "KG", un: "UN", unidade: "UN", UN: "UN", UNIDADE: "UN", CX: "Caixas", KG: "KG" };
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
h("button", { type: "button", class: "btn ghost no-print", onclick: async function () { try { await sb.auth.signOut(); } catch (e) {} try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} location.reload(); } }, "Sair"),
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
    h("div", { class: "order-h" }, h("strong", { text: fmtData(o.data) + " às " + fmtHora(o.criado_em) }), quem,
    o.categoria ? h("span", { class: "pill_cat", text: o.categoria }) : null,
    o.categoria && o.solicitante ? h("span", { text: "Pedido por: " + o.solicitante }) : null),
    h("div", null, itens.map(itemRow)),
    o.obs ? h("div", { class: "obs", text: o.obs }) : null,
h("button", { type: "button", class: "btn", onclick: function(){ excluirPedido (o.id); } }, "Excluir"),
  );
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
    CATEGORIAS.map(function (c) { return h("option", { value: c }, c); }));

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
    var r = await sb.from("pedidos").select("*").eq("loja_id", S.perfil.loja_id).order("criado_em", { ascending: false }).limit(100);
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
 function copiarTabela() {
  const tabela = document.querySelector('table');
  if (!tabela) {
    alert('Nenhuma tabela para copiar');
    return;
  }
  let texto = '';
  tabela.querySelectorAll('tr').forEach(tr => {
    const celulas = [...tr.querySelectorAll('th, td')].map(td =>
      td.innerText.replace(/\t/g, ' ').replace(/\n/g, ' ')
    );
    texto += celulas.join('\t') + '\n';
  });
  navigator.clipboard.writeText(texto).then(() => {
    alert('Copiado! Agora é só colar no Excel (Ctrl+V)');
  });
}
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
  if (!window.XLSX) { setMsg(mm, "Não foi possível carregar o gerador de Excel.", "err"); return; }
  var cat = S.catFiltro || "TODAS";

  // Lista do dropdown - so da categoria escolhida
  var produtos = [];
  if (cat && cat !== "TODAS" && PRODUTOS_POR_CATEGORIA[cat]) {
    produtos = PRODUTOS_POR_CATEGORIA[cat];
  } else {
    Object.keys(PRODUTOS_POR_CATEGORIA).forEach(function(k){
      PRODUTOS_POR_CATEGORIA[k].forEach(function(p){ if (produtos.indexOf(p) === -1) produtos.push(p); });
    });
  }

  // OPCAO A: so pedidos da categoria escolhida
  var os = ordensDoDia();
  if (cat && cat !== "TODAS") {
    os = os.filter(function(o){ return (o.categoria || "") === cat; });
  }
  if (!os.length) { setMsg(mm, "Não há pedidos de " + cat + " neste dia.", "err"); return; }

  // Agrupa itens por loja_id
  var itensPorLojaId = {};
  os.forEach(function(o){
    if (!itensPorLojaId[o.loja_id]) itensPorLojaId[o.loja_id] = [];
    (o.itens || []).forEach(function(it){
      itensPorLojaId[o.loja_id].push({ qtd: it.qtd, produto: it.produto });
    });
  });
  // Acha id da loja pelo nome
  function idDaLoja(nome){
    var achada = (S.lojas || []).find(function(l){ return String(l.nome||"").trim().toUpperCase() === String(nome).trim().toUpperCase(); });
    return achada ? achada.id : null;
  }

  // Aba DADOS_PRODUTOS
  var dados = [["PRODUTOS (lista usada no dropdown) - EDITAVEL"]];
  produtos.forEach(function(p){ dados.push([p]); });
  var wsDados = XLSX.utils.aoa_to_sheet(dados);
  wsDados["!cols"] = [{ wch: 38 }];
  wsDados["A1"].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "4472C4" } } };

  // Aba PEDIDO - 11 lojas, preenchida
  var linhas = [];
  linhas.push(["PEDIDOS WEST CARNES"]);
  linhas.push(["Data do pedido: " + fmtData(S.dia) + "  |  Categoria: " + cat + "  |  QTD = ex: 60KG, 1CX, 10 UND"]);
  var validacoes = [];
  var LINHAS_POR_LOJA = 25;
  var ultimoFim = 2;

  for (var g = 0; g < 4; g++) {
    var linhaLoja = ultimoFim;
    var linhaCab = linhaLoja + 1;
    var linhaIni = linhaCab + 1;
    var linhaFim = linhaIni + LINHAS_POR_LOJA - 1;
    while (linhas.length <= linhaFim) linhas.push(["","","","","","","","",""]);
    for (var b = 0; b < 3; b++) {
      var idx = g * 3 + b;
      if (idx >= LOJAS_MODELO.length) continue;
      var nomeLojaAtual = LOJAS_MODELO[idx];
      var c0 = b * 3;
      linhas[linhaLoja][c0] = nomeLojaAtual;
      linhas[linhaCab][c0] = "QTD";
      linhas[linhaCab][c0+1] = "PRODUTO";
      linhas[linhaCab][c0+2] = "VISTO";
      // Preenche com os pedidos reais dessa loja
      var idLoja = idDaLoja(nomeLojaAtual);
      var itens = (idLoja != null && itensPorLojaId[idLoja]) ? itensPorLojaId[idLoja] : [];
      for (var i = 0; i < itens.length && i < LINHAS_POR_LOJA; i++) {
        linhas[linhaIni + i][c0] = itens[i].qtd;
        linhas[linhaIni + i][c0+1] = itens[i].produto;
        linhas[linhaIni + i][c0+2] = "";
      }
   var colLetra = XLSX.utils.encode_col(c0+1);
validacoes.push({
  sqref: colLetra + (linhaIni+1) + ":" + colLetra + (linhaIni+LINHAS_POR_LOJA),
  type: "list",
  formula1: "'DADOS_PRODUTOS'!$B$2:$B$27"
});
    }
    ultimoFim = linhaFim + 2;
  }

  var ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = [{wch:12},{wch:38},{wch:12},{wch:12},{wch:38},{wch:12},{wch:12},{wch:38},{wch:12}];
  ws["!merges"] = [{s:{r:0,c:0},e:{r:0,c:8}}, {s:{r:1,c:0},e:{r:1,c:8}}];
  ws["!dataValidations"] = validacoes;
  ws["!pageSetup"] = { orientation: "landscape", paperSize: 9, fitToPage: 1, fitToWidth: 1, fitToHeight: 0 };
  ws["!freeze"] = { xSplit: 0, ySplit: 3, topLeftCell: "A4" };

  var borda = { top:{style:"thin",color:{rgb:"B0B0B0"}}, bottom:{style:"thin",color:{rgb:"B0B0B0"}}, left:{style:"thin",color:{rgb:"B0B0B0"}}, right:{style:"thin",color:{rgb:"B0B0B0"}} };
  var range = XLSX.utils.decode_range(ws["!ref"]);
  for (var r = 0; r <= range.e.r; r++) {
    for (var c = 0; c <= 8; c++) {
      var addr = XLSX.utils.encode_cell({r:r,c:c});
      var cell = ws[addr];
      if (!cell) continue;
      cell.s = cell.s || {};
      if (r === 0) { cell.s.font = { bold:true, sz:16, color:{rgb:"1F4E78"} }; cell.s.alignment = { horizontal:"center" }; }
      else if (r === 1) { cell.s.font = { sz:10, italic:true }; cell.s.alignment = { horizontal:"center", wrapText:true }; }
      else if (cell.v && LOJAS_MODELO.indexOf(cell.v) !== -1) { cell.s.font = { bold:true, color:{rgb:"FFFFFF"}, sz:11 }; cell.s.fill = { fgColor:{rgb:"1F4E78"} }; cell.s.alignment = { horizontal:"center" }; cell.s.border = borda; }
      else if (cell.v === "QTD" || cell.v === "PRODUTO" || cell.v === "VISTO") { cell.s.font = { bold:true, sz:9 }; cell.s.fill = { fgColor:{rgb:"D9E2F3"} }; cell.s.alignment = { horizontal:"center" }; cell.s.border = borda; }
      else if (r > 2) { cell.s.border = borda; cell.s.alignment = { horizontal:"center" }; }
    }
  }

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDados, "DADOS_PRODUTOS");
  XLSX.utils.book_append_sheet(wb, ws, "PEDIDO");
  XLSX.writeFile(wb, "pedido-" + (cat === "TODAS" ? "todas" : cat.toLowerCase()) + "-" + S.dia + ".xlsx");
  setMsg(mm, "Planilha gerada: 11 lojas, categoria " + cat + ".", "ok");
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

            h("button", { type: "button", class: "btn ghost", onclick: baixarExcel }, "Baixar Excel"),
            h("div", { class: "bar" },
  h("label", { class: "lbl" }, "Categoria"),
  h("select", { class: "in", onchange: function(e){ S.catFiltro = e.target.value; self.show(true); } },
    h("option", { value: "TODAS" }, "Todas as categorias"),

    CATEGORIAS.map(function(c){ return h("option", { value: c }, c); })
  ),
  h("label", { class: "lbl" }, "Loja"),
  h("select", { class: "in", onchange: function(e){ S.lojaFiltro = e.target.value; self.show(true); } },
    h("option", { value: "TODAS" }, "Todas as lojas"),
    S.lojas.map(function(l){ return h("option", { value: String(l.id) }, l.nome); })
  )
),
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
        if (S.lojaFiltro && S.lojaFiltro !== "TODAS" && String(l.id) !== String(S.lojaFiltro)) return;
        var das = os.filter(function (o) { return o.loja_id === l.id; });
        if (S.soUrgentes) das = das.filter(temUrgente);
        if (S.soUrgentes && !das.length) return;
        var bloco = h("section", { class: "loja" },
          h("div", { class: "loja-h" }, h("h3", { text: l.nome }),
            das.length ? h("span", { class: "pill ok", text: das.length + (das.length === 1 ? " pedido" : " pedidos") }) : h("span", { class: "pill wait", text: "Sem pedido" })));
        das.forEach(function (o) {
         var itens = o.itens.filter(function (i) { if (S.soUrgentes && !i.urgente) return false; var cat = S.catFiltro || S.categoriaFiltro; if (cat && cat !== "GERAL" && cat !== "TODAS" && (i.categoria || i.cat) !== cat) return false; return true; });
          if (!itens.length) return;
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
    var lojaId = (typeof S.perfil.loja_id === "number" ? S.perfil.loja_id : idDaLoja(S.perfil.loja_id)), rows = null, falha = false;
    var m = h("span", { class: "msg grow", role: "status" });
    var resumo = h("div", { class: "bar" });
    var lista = h("div", { class: "est-lista" });
    var rel = h("div", { class: "print-only" });
    var inCat = h("select", { id: "est-cat", "aria-label": "Categoria" },
  h("option", { value: "CONGELADOR" }, "CONGELADOR"),
  h("option", { value: "LINGUIÇAS" }, "LINGUIÇAS"),
  h("option", { value: "PAO DE ALHO/QUEIJO COALHO" }, "PÃO DE ALHO / QUEIJO COALHO"),
  h("option", { value: "CARVAO" }, "CARVÃO"),
  h("option", { value: "CAMARA FRIA" }, "CÂMARA FRIA")
);inCat.onchange = function() { pintar(); };
var inProd = h("input", { id: "est-prod", placeholder: "Produto" });
var inQtd = h("input", { id: "est-qtd", placeholder: "Qtd", type: "number", inputMode: "decimal" });
var inUn = h("select", { id: "est-un" },
  h("option", { value: "cx" }, "CAIXA"),
  h("option", { value: "kg" }, "KG"),
  h("option", { value: "un" }, "UNIDADE")
);
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
     rows.filter(function (r) { return (r.categoria || "").toUpperCase() === inCat.value; }).forEach(function (r) { lista.append(linha(r)); });
      pintarResumo();
    }
    function linha(r) {
      var el = h("div", { class: "est-row" });
      var flag = h("span", { class: "est-flag" });
      var q = h("input", { class: "in qtd", value: String(Number(r.quantidade)).replace(".", ","), inputmode: "decimal", autocomplete: "off", "aria-label": "Quantidade de " + r.produto, onchange: salvar });
     var u = h("select", { class: "in", "aria-label": "Unidade de " + r.produto, onchange: salvar },
  h("option", { value: "cx" }, "Caixas"),
  h("option", { value: "kg" }, "KG"),
  h("option", { value: "un" }, "UNIDADE"));
u.value = (r.unidade || "").toLowerCase();
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
    rem.dataset.conf = "1";
    rem.textContent = "Confirmar?";
    rem.classList.add("conf");
    setTimeout(function () { delete rem.dataset.conf; rem.textContent = "×"; rem.classList.remove("conf"); }, 3400);
    return;
  }
  var res = await sb.from("estoque").delete().eq("id", r.id);
  if (res.error) { setMsg(m, erroDb(res.error), "err"); return; }
  rows = rows.filter(function (x) { return x.id !== r.id; });
  pintar();
  setMsg(m, "Removido: " + r.produto + ".", "ok");
}

// FECHA a linha() aqui:
el.append(h("span", { class: "est-cat", text: r.categoria || "" }), h("strong", { class: "est-nome", text: r.produto }), q, u, flag, rem);
marca();
return el;
} // <-- fim da linha(r)
   async function carregar() {
  var data = S.dia;
  var limite = new Date(data + "T00:00:00");
  limite.setDate(limite.getDate() - 7);
  var limiteStr = limite.toISOString().slice(0, 10);

  // Apaga o que tem mais de 7 dias
  await sb.from("estoque").delete().eq("loja_id", lojaId).lt("data_ref", limiteStr);

  // Busca final - traz tudo de hoje
  var r = await sb.from("estoque").select("*").eq("loja_id", lojaId).eq("data_ref", data).order("produto", { ascending: true });
  if (r.error) {
    falha = true;
    rows = [];
    pintar();
    return;
  }
  falha = false;
  rows = r.data || [];

  // Virada do dia - se hoje esta vazio, copia os produtos de ontem com quantidade 0
  if (rows.length === 0) {
    var ant = await sb.from("estoque").select("*").eq("loja_id", lojaId).lt("data_ref", data).order("data_ref", { ascending: false }).limit(500);
    if (ant.data && ant.data.length) {
      var ultimoDia = ant.data[0].data_ref;
      var copiar = ant.data.filter(function (x) { return x.data_ref === ultimoDia; });
      var vistos = {};
      var novos = [];
      copiar.forEach(function (x) {
        var k = (x.categoria || "") + "|" + String(x.produto).toLowerCase();
        if (!vistos[k]) {
          vistos[k] = 1;
          novos.push({ loja_id: lojaId, produto: x.produto, quantidade: 0, unidade: x.unidade, categoria: x.categoria, data_ref: data });
        }
      });
      if (novos.length) {
        var ins = await sb.from("estoque").insert(novos).select();
        if (ins.data) rows = ins.data;
      }
    }
  }
  pintar();
}
async function adicionar() {
  inProd.classList.remove("bad"); inQtd.classList.remove("bad");
  var prod = inProd.value.trim(), q = num(inQtd.value);
  if (!prod) { inProd.classList.add("bad"); setMsg(m, "Informe o produto.", "err"); return; }
  if (inQtd.value.trim() === "" || !isFinite(q) || q < 0) { inQtd.classList.add("bad"); setMsg(m, "Informe uma quantidade válida.", "err"); return; }
 if (rows === null) { await carregar(); }
if (rows === null) rows = [];
  var cat = inCat.value;
  var ja = rows.find(function (r) { return r.produto.trim().toLowerCase() === prod.toLowerCase() && r.categoria === cat; });
  add.disabled = true; setMsg(m, "Salvando...");
  var data = S.dia;
  var res = ja
    ? await sb.from("estoque").update({ quantidade: q, unidade: inUn.value, categoria: cat, data_ref: data }).eq("id", ja.id).select()
    : await sb.from("estoque").upsert({ loja_id: lojaId, produto: prod, quantidade: q, unidade: inUn.value, categoria: cat, data_ref: data }, { onConflict: "loja_id,produto" }).select();
  add.disabled = false;
  if (res.error || !res.data || !res.data.length) { setMsg(m, res.error ? erroDb(res.error) : "Você não tem permissão para salvar.", "err"); return; }
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
          h("div", null, h("label", { class: "lbl", for: "est-cat" }, "Categoria"), inCat),
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
    var lojaId = S.lojas.length ? S.lojas[0].id : 1, tipo = "pedido", dia = hoje(), dados = null, relCat = "todas", falha = false, tok = 0;
    var mm = h("span", { class: "msg small", role: "status" });
    var rel = h("div", { class: "relatorio" });
    var selLoja = h("select", { class: "in", id: "rel-loja", "aria-label": "Loja", onchange: function (e) { lojaId = Number(e.target.value); carregar(); } });
    var selCat = h("select", { class: "in", id: "rel-cat", "aria-label": "Categoria", onchange: function (e) { relCat = e.target.value; carregar(); } }, [h("option", { value: "todas" }, "Todas as categorias")]);
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
     navDia.hidden = false;
      if (document.activeElement !== data) data.value = dia;
    }
    function pintar() {
      controles();
      rel.replaceChildren();
      if (falha) { rel.append(h("p", { class: "empty", text: "Não foi possível carregar o relatório." })); return; }
      if (dados === null) { rel.append(h("p", { class: "empty", text: "Carregando…" })); return; }
    rel.append(tipo === "pedido" ? relPedidos(lojaId, dia, dados) : relEstoque(lojaId, (tipo === "estoque" && relCat !== "todas" ? dados.filter(function (r) { return (r.categoria || "Sem categoria") === relCat; }) : dados)));
    }
    async function carregar() {
      var my = ++tok; dados = null; falha = false; setMsg(mm, ""); pintar();
      var r = tipo === "pedido"
        ? await sb.from("pedidos").select("*").eq("loja_id", lojaId).eq("data", dia).order("criado_em")
: await sb.from("estoque").select("*").eq("loja_id", lojaId).eq("data_ref", dia).order("produto");
      if (my !== tok) return;
      if (r.error) { falha = true; setMsg(mm, erroDb(r.error), "err"); } else dados = r.data || [];
      if (tipo === "estoque") {
  var cats = [...new Set((Array.isArray(dados) ? dados : []).map(function (r) { return r.categoria || "Sem categoria"; }))].sort();
  var atual = relCat;
  selCat.innerHTML = "";
  var optTodas = document.createElement("option"); optTodas.value = "todas"; optTodas.textContent = "Todas as categorias"; selCat.appendChild(optTodas);
  cats.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; selCat.appendChild(o); });
  selCat.value = atual;
  if (selCat.value !== atual) { relCat = "todas"; selCat.value = "todas"; }
}
      pintar();
    }
    function baixar() {
      if (!dados) { setMsg(mm, "Aguarde o relatório carregar.", "err"); return; }
      if (tipo === "pedido") {
        var os = dados.filter(function (o) { return Array.isArray(o.itens); });
        salvarXlsx(HEAD, linhasDe(os), [11, 14, 12, 36, 10, 28, 7, 12, 22, 18], "Pedidos", "pedidos-" + slug(nomeLoja(lojaId)) + "-" + dia + ".xlsx", mm);
      } else exportarEstoque(lojaId, (tipo === "estoque" && relCat !== "todas" ? dados.filter(function (r) { return (r.categoria || "Sem categoria") === relCat; }) : dados), mm);
    }
    function imprimir() {
      if (!dados) { setMsg(mm, "Aguarde o relatório carregar.", "err"); return; }
      if (tipo === "estoque" && relCat !== "todas") {
  var lista = dados.filter(function (r) { return (r.categoria || "Sem categoria") === relCat; });
  if (!lista.length) { setMsg(mm, "Não há produtos nessa categoria.", "err"); return; }
  var w = window.open("", "_blank");
  w.document.write("<h2>Relatório de Estoque - " + relCat + "</h2><table border='1' cellpadding='6' style='border-collapse:collapse;width:100%'><tr><th>Produto</th><th>Categoria</th><th>Qtd</th><th>Unidade</th></tr>" + lista.map(function (r) { return "<tr><td>" + r.produto + "</td><td>" + (r.categoria || "") + "</td><td>" + r.quantidade + "</td><td>" + (r.unidade || "") + "</td></tr>"; }).join("") + "</table>");
  w.document.close(); w.print(); return;
}
window.print();
    }

    var el = h("section", { class: "stack" },
      h("div", { class: "card no-print" },
        h("h2", { text: "Relatório por loja" }),
        h("div", { class: "rel-ctl" },
          h("div", null, h("label", { class: "lbl", for: "rel-loja" }, "Loja"), selLoja),
          h("div", null, h("label", { class: "lbl", for: "rel-cat" }, "Categoria"), selCat),
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
async function excluirPedido(id){
  if(!confirm("Excluir este pedido?")) return;
  try{
    var cfg = window.APP_CONFIG || {};
    var client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const { error } = await client.from("pedidos").delete().eq("id", id);
    if(error){
      alert("Erro ao excluir: " + error.message);
      console.log(error);
      return;
    }
    location.reload();
  }catch(e){
    alert("Erro ao excluir: " + e.message);
    console.log(e);
  }
}
window.excluirPedido = excluirPedido;
  init();
})();


