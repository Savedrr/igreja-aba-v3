/* IGREJA ABA — app.js v3 */
"use strict";

// ── Estado global ─────────────────────────────────────────────
const S = { presentes:0, visitantes:0, criancas:0, periodo:"Noite", cultoAtual:null };
const DIAS = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await verificarAuth();
  initData();
  atualizarTopbarDate();
  setInterval(atualizarTopbarDate, 60000);
  carregarCultosParaSelects();
  carregarVisitantes();
  carregarResumo();
  buscarRelatorio();
  carregarEstoque();

  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", e => {
      e.preventDefault();
      const tab = item.dataset.tab;
      if(tab){ ativarTab(tab); toggleSidebar(false); }
    });
  });
});

// ── Auth ──────────────────────────────────────────────────────
async function verificarAuth() {
  const r = await fetch("/api/me");
  const d = await r.json();
  if(!d.autenticado){ window.location.href="/"; return; }
  _isAdmin = (d.cargo === "admin");
  document.getElementById("userName").textContent   = d.nome;
  document.getElementById("userRole").textContent   =
    d.cargo==="admin"?"Administrador": d.cargo==="lider"?"Líder":"Voluntário";
  document.getElementById("userAvatar").textContent = d.nome.charAt(0).toUpperCase();
  document.getElementById("responsavel").value      = d.nome;
  if(d.cargo === "admin"){
    document.getElementById("navUsuarios").style.display = "";
    carregarUsuarios();
  }
}

async function logout(){
  await fetch("/api/logout",{method:"POST"});
  window.location.href="/";
}

// ── Navegação ─────────────────────────────────────────────────
function ativarTab(tab) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const el  = document.getElementById("tab-"+tab);
  const nav = document.querySelector(`[data-tab="${tab}"]`);
  if(el)  el.classList.add("active");
  if(nav) nav.classList.add("active");
  const titles = {
    registro:"Registro de Culto", checklist:"Checklist",
    visitantes:"Visitantes",      estoque:"Estoque",
    relatorios:"Relatórios",      resumo:"Resumo Geral",
    usuarios:"Usuários"
  };
  document.getElementById("topbarTitle").textContent = titles[tab] || tab;
  if(tab==="resumo")     carregarResumo();
  if(tab==="visitantes") carregarVisitantes();
  if(tab==="usuarios")   carregarUsuarios();
  if(tab==="estoque")    carregarEstoque();
}

// ── Data/Hora ─────────────────────────────────────────────────
function initData(){
  const now = new Date();
  const pad = n => String(n).padStart(2,"0");
  document.getElementById("data").value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  document.getElementById("hora").value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  atualizarDiaSemana();
}
function atualizarDiaSemana(){
  const val = document.getElementById("data").value;
  if(!val) return;
  const [y,m,d] = val.split("-").map(Number);
  document.getElementById("diaSemana").value = DIAS[new Date(y,m-1,d).getDay()];
}
function atualizarTopbarDate(){
  document.getElementById("topbarDate").textContent =
    new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}
function fmtBR(s){
  if(!s) return "";
  try{ const [y,m,d]=s.split("-"); return `${d}/${m}/${y}`; }catch{ return s; }
}

// ── Período ───────────────────────────────────────────────────
function selecionarPeriodo(btn){
  document.querySelectorAll(".periodo-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  S.periodo = btn.dataset.periodo;
}

// ── Contadores ────────────────────────────────────────────────
function ajustar(campo, delta){
  S[campo] = Math.max(0, S[campo] + delta);
  syncContador(campo);
}
function setContador(campo, val){
  S[campo] = Math.max(0, parseInt(val)||0);
  syncContador(campo);
}
function syncContador(campo){
  document.getElementById(`val-${campo}`).textContent = S[campo];
  document.getElementById(`inp-${campo}`).value       = S[campo];
}

// ── Salvar Registro ───────────────────────────────────────────
async function salvarRegistro(){
  const data        = document.getElementById("data").value;
  const hora        = document.getElementById("hora").value;
  const responsavel = document.getElementById("responsavel").value.trim();
  const observacoes = document.getElementById("observacoes").value.trim();
  if(!data||!hora)  return toast("Preencha data e horário.","error");
  if(!responsavel)  return toast("Informe o responsável.","error");
  try{
    const r = await fetch("/api/cultos",{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data,hora,periodo:S.periodo,responsavel,
        presentes:S.presentes,visitantes:S.visitantes,criancas:S.criancas,observacoes})});
    const d = await r.json();
    if(r.ok&&d.ok){
      toast(`✅ ${d.dia_semana} — culto registrado!`,"success");
      S.cultoAtual = d.id;
      // Reseta contadores e campos do formulário
      S.presentes  = 0; S.visitantes = 0; S.criancas = 0;
      ["presentes","visitantes","criancas"].forEach(k=>{
        const v = document.getElementById("val-"+k);
        const i = document.getElementById("inp-"+k);
        if(v) v.textContent = "0";
        if(i) i.value = "0";
      });
      const obsEl = document.getElementById("observacoes");
      const respEl = document.getElementById("responsavel");
      if(obsEl)  obsEl.value  = "";
      if(respEl) respEl.value = "";
      carregarCultosParaSelects();
      setTimeout(()=>ativarTab("checklist"),1100);
    }else{ toast(d.erro||"Erro ao salvar.","error"); }
  }catch(e){ toast("Erro de conexão.","error"); }
}

// ── Selects de cultos ─────────────────────────────────────────
async function carregarCultosParaSelects(){
  const r    = await fetch("/api/cultos");
  const list = await r.json();
  const buildSel = (id, extra) => {
    const sel = document.getElementById(id);
    if(!sel) return;
    const prev = sel.value;
    sel.innerHTML = extra;
    list.forEach(c => {
      const o   = document.createElement("option");
      o.value   = c.id;
      const ico = {Manhã:"🌅",Tarde:"☀️",Noite:"🌙"}[c.periodo]||"";
      o.textContent = `${ico} ${c.data_br||fmtBR(c.data)} — ${c.dia_semana} — ${c.periodo}`;
      sel.appendChild(o);
    });
    if(prev) sel.value = prev;
  };
  buildSel("selectCultoChecklist","<option value=''>— Selecione —</option>");
  buildSel("v_culto_id","<option value=''>— Sem culto vinculado —</option>");
  buildSel("qr_culto_id","<option value=''>— Selecione o culto —</option>");
  if(S.cultoAtual){
    const sel = document.getElementById("selectCultoChecklist");
    if(sel){ sel.value = S.cultoAtual; carregarChecklist(S.cultoAtual); }
    S.cultoAtual = null;
  }
}

// ── CHECKLIST ─────────────────────────────────────────────────
async function carregarChecklist(cultoId){
  const container = document.getElementById("checklistContainer");
  if(!cultoId){
    container.innerHTML=`<div class="empty-state"><p>Selecione um culto para ver o checklist</p></div>`;
    return;
  }
  container.innerHTML=`<div class="loading-msg">Carregando checklist...</div>`;
  const r    = await fetch(`/api/cultos/${cultoId}/checklist`);
  const data = await r.json();
  const CATS = {
    antes:       {label:"Antes do Culto",  emoji:"⏰"},
    mesa_entrada:{label:"Mesa de Entrada", emoji:"📋"},
    banheiro:    {label:"Banheiros",       emoji:"🚿"},
    durante:     {label:"Durante o Culto", emoji:"🎵"},
    final:       {label:"Final do Culto",  emoji:"🔒"}
  };
  const grupos = {};
  data.forEach(item => {
    if(!grupos[item.categoria]) grupos[item.categoria]=[];
    grupos[item.categoria].push(item);
  });
  container.innerHTML = "";
  for(const [cat,cfg] of Object.entries(CATS)){
    const itens = grupos[cat]||[];
    if(!itens.length) continue;
    const total  = itens.length;
    const feitos = itens.filter(i=>i.concluido).length;
    const pct    = Math.round((feitos/total)*100);
    const catDiv = document.createElement("div");
    catDiv.className = "checklist-cat";
    catDiv.innerHTML = `
      <div class="cat-hdr" onclick="toggleCat(this)">
        <div class="cat-hdr-left"><span class="cat-emoji">${cfg.emoji}</span><span>${cfg.label}</span></div>
        <div class="cat-prog-wrap">
          <span class="cat-prog-txt">${feitos}/${total}</span>
          <div class="cat-prog-bar-bg"><div class="cat-prog-bar" style="width:${pct}%"></div></div>
        </div>
      </div>
      <div class="cat-items"></div>`;
    const itemsDiv = catDiv.querySelector(".cat-items");
    itens.forEach(item => {
      const wrap = document.createElement("div");
      wrap.className = `check-item${item.concluido?" done":""}`;
      wrap.id = `ci-${item.id}`;
      wrap.innerHTML = `
        <input type="checkbox" id="cb-${item.id}" ${item.concluido?"checked":""}>
        <label for="cb-${item.id}">${item.item_descricao}</label>`;
      wrap.querySelector("input").addEventListener("change", function(){
        marcarItem(item.id, this.checked, wrap, catDiv);
      });
      itemsDiv.appendChild(wrap);
    });
    container.appendChild(catDiv);
  }
}
function toggleCat(hdr){
  const items = hdr.nextElementSibling;
  items.style.display = items.style.display==="none" ? "" : "none";
}
async function marcarItem(itemId, concluido, wrap, catDiv){
  wrap.classList.toggle("done", concluido);
  const allItems = catDiv.querySelectorAll(".check-item");
  const checked  = catDiv.querySelectorAll(".check-item.done").length;
  const total    = allItems.length;
  catDiv.querySelector(".cat-prog-bar").style.width = Math.round((checked/total)*100)+"%";
  catDiv.querySelector(".cat-prog-txt").textContent = `${checked}/${total}`;
  await fetch(`/api/checklist/${itemId}`,{method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({concluido})});
}

// ── QR CODE ───────────────────────────────────────────────────
async function gerarQRCode(){
  const cultoId = document.getElementById("qr_culto_id").value;
  if(!cultoId) return toast("Selecione um culto primeiro.","error");
  const r = await fetch(`/api/cultos/${cultoId}/qrcode`);
  const d = await r.json();
  document.getElementById("qrImg").src = d.qrcode;
  document.getElementById("qrUrl").textContent = d.url;
  document.getElementById("qrContainer").style.display="block";
}
function baixarQR(){
  const a   = document.createElement("a");
  a.href    = document.getElementById("qrImg").src;
  a.download= "qrcode_culto.png";
  a.click();
}

// ── VISITANTES ────────────────────────────────────────────────
async function salvarVisitante(){
  const nome     = document.getElementById("v_nome").value.trim();
  const telefone = document.getElementById("v_telefone").value.trim();
  if(!nome||!telefone) return toast("Nome e telefone são obrigatórios.","error");
  const payload={
    nome, telefone,
    idade:        document.getElementById("v_idade").value,
    endereco:     document.getElementById("v_endereco").value,
    bairro:       document.getElementById("v_bairro").value,
    cidade:       document.getElementById("v_cidade").value,
    como_conheceu:document.getElementById("v_como").value,
    pedido_oracao:document.getElementById("v_oracao").value,
    quer_visita:  document.getElementById("v_quer_visita").checked,
    data_visita:  document.getElementById("v_data_visita").value,
    hora_visita:  document.getElementById("v_hora_visita").value,
    culto_id:     document.getElementById("v_culto_id").value||null,
    observacao:   document.getElementById("v_observacao").value,
    origem:"manual"
  };
  const r=await fetch("/api/visitantes",{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  if(r.ok&&d.ok){
    toast("✅ Visitante cadastrado!","success");
    ["v_nome","v_telefone","v_idade","v_endereco","v_bairro","v_cidade","v_oracao","v_observacao"]
      .forEach(id=>{ document.getElementById(id).value=""; });
    document.getElementById("v_como").value="";
    document.getElementById("v_quer_visita").checked=false;
    document.getElementById("v_data_visita").value="";
    document.getElementById("v_hora_visita").value="";
    carregarVisitantes();
  }else{ toast(d.erro||"Erro ao cadastrar.","error"); }
}
async function carregarVisitantes(){
  const c = document.getElementById("listaVisitantes");
  if(!c) return;
  c.innerHTML="<div class='loading-msg'>Carregando...</div>";
  const r=await fetch("/api/visitantes");
  const list=await r.json();
  if(!list.length){ c.innerHTML="<div class='empty-state'><p>Nenhum visitante cadastrado ainda.</p></div>"; return; }
  c.innerHTML=list.map(v=>`
    <div class="visitante-card">
      <div class="visitante-avatar">${v.nome.charAt(0).toUpperCase()}</div>
      <div class="visitante-info">
        <div class="visitante-nome">${v.nome}
          <span class="badge-${v.origem==='qrcode'?'qr':'manual'}">${v.origem==='qrcode'?'📱 QR Code':'✏️ Manual'}</span>
        </div>
        ${v.idade?`<div class="visitante-tel">🎂 ${v.idade} anos</div>`:''}
        <div class="visitante-tel">📱 ${v.telefone}</div>
        ${v.endereco?`<div class="visitante-end">📍 ${v.endereco}${v.bairro?', '+v.bairro:''}${v.cidade?' — '+v.cidade:''}</div>`:''}
        ${v.culto_data_br?`<div class="visitante-end">📅 Culto: ${v.culto_data_br}${v.culto_periodo?' — '+v.culto_periodo:''}</div>`:''}
        ${v.quer_visita?`<div class="visitante-end" style="color:#2E7D32;font-weight:600">🏠 Quer visita${v.data_visita?' em '+fmtBR(v.data_visita)+(v.hora_visita?' às '+v.hora_visita:''):''}</div>`:''}
        ${v.pedido_oracao?`<div class="visitante-end" style="font-style:italic">🙏 ${v.pedido_oracao}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button class="btn-sm green" onclick="gerarLinks(${v.id})">🔗 Links</button>
        <button class="btn-sm red"   onclick="deletarVisitante(${v.id})">🗑️</button>
      </div>
    </div>`).join("");
}
async function deletarVisitante(id){
  if(!confirm("Excluir este visitante?")) return;
  await fetch(`/api/visitantes/${id}`,{method:"DELETE"});
  toast("Visitante excluído.","info");
  carregarVisitantes();
}
async function gerarLinks(id){
  const r=await fetch(`/api/visitantes/${id}/link`);
  const d=await r.json();
  if(!r.ok) return toast(d.erro,"error");
  abrirModal(`Links — ${d.nome}`,`
    <p style="margin-bottom:14px;color:#4A6080;font-size:13px">Use os links abaixo para contato e visita pastoral.</p>
    <div class="link-card">
      <strong style="font-size:11px;color:#8ca0c0;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px">📍 Google Maps — Endereço</strong>
      <a href="${d.maps_link}" target="_blank">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Abrir endereço no Google Maps
      </a>
    </div>
    <div class="link-card">
      <strong style="font-size:11px;color:#8ca0c0;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px">💬 WhatsApp</strong>
      <a href="${d.whatsapp_link}" target="_blank">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        Enviar mensagem para ${d.nome}
      </a>
    </div>`);
}

// ═══════════════════════════════════════════════
//  ESTOQUE
// ═══════════════════════════════════════════════

// Guarda se o usuário atual é admin (setado no verificarAuth)
let _isAdmin = false;

async function carregarEstoque(){
  const c = document.getElementById("listaEstoque");
  if(!c) return;
  c.innerHTML = "<div class='loading-msg'>Carregando...</div>";
  const r    = await fetch("/api/estoque");
  const list = await r.json();

  // Alertas de estoque baixo
  const alertas = list.filter(i => i.quantidade < i.quantidade_minima);
  const alertBox = document.getElementById("alertasEstoque");
  if(alertBox){
    alertBox.innerHTML = alertas.length
      ? `<div class="estoque-alerta">
          <strong>⚠️ ${alertas.length} item(ns) abaixo do mínimo:</strong>
          ${alertas.map(a=>`<span class="alerta-tag">${a.nome} (${a.quantidade} ${a.unidade})</span>`).join("")}
         </div>`
      : "";
  }

  if(!list.length){
    c.innerHTML = "<div class='empty-state'><p>Nenhum item no estoque ainda.</p></div>";
    return;
  }

  // Agrupa por categoria
  const grupos = {};
  list.forEach(item => {
    if(!grupos[item.categoria]) grupos[item.categoria]=[];
    grupos[item.categoria].push(item);
  });

  let html = "";
  for(const [cat, itens] of Object.entries(grupos)){
    html += `<div class="estoque-grupo">
      <div class="estoque-grupo-titulo">${cat}</div>
      <div class="estoque-itens">`;
    itens.forEach(item => {
      const baixo   = item.quantidade < item.quantidade_minima;
      // Itens fixos mostram cadeado — mas admin pode excluir
      const fixoTag = item.fixo ? `<span class="tag-fixo">🔒 Santa Ceia</span>` : "";
      // Botão excluir: sempre visível para admin; para não-admin, só se não for fixo
      const podeExcluir = _isAdmin || !item.fixo;
      const btnExcluir  = podeExcluir
        ? `<button class="btn-sm red" onclick="deletarEstoque(${item.id},'${escHtml(item.nome)}',${item.fixo})">🗑️ Excluir</button>`
        : `<span style="font-size:11px;color:#8ca0c0">🔒 Só admin exclui</span>`;

      html += `
        <div class="estoque-card${baixo?' estoque-baixo':''}">
          <div class="estoque-card-top">
            <div>
              <div class="estoque-nome">${item.nome} ${fixoTag}</div>
              ${item.descricao?`<div class="estoque-desc">${item.descricao}</div>`:''}
            </div>
            <div class="estoque-qtd-badge${baixo?' badge-alerta':''}">${item.quantidade}<span class="estoque-unidade"> ${item.unidade}</span></div>
          </div>
          ${item.quantidade_minima>0?`<div class="estoque-minimo">Mínimo recomendado: ${item.quantidade_minima} ${item.unidade}</div>`:''}
          <div class="estoque-acoes">
            <div class="estoque-counter-row">
              <button class="cbtn minus" onclick="ajustarEstoque(${item.id},${item.quantidade},-10)">−10</button>
              <button class="cbtn minus" onclick="ajustarEstoque(${item.id},${item.quantidade},-5)">−5</button>
              <button class="cbtn minus" onclick="ajustarEstoque(${item.id},${item.quantidade},-1)">−1</button>
              <button class="cbtn plus"  onclick="ajustarEstoque(${item.id},${item.quantidade},+1)">+1</button>
              <button class="cbtn plus"  onclick="ajustarEstoque(${item.id},${item.quantidade},+5)">+5</button>
              <button class="cbtn plus"  onclick="ajustarEstoque(${item.id},${item.quantidade},+10)">+10</button>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
              <button class="btn-sm blue" onclick="editarEstoque(${item.id},'${escHtml(item.nome)}',${item.quantidade},${item.quantidade_minima},'${item.unidade}','${escHtml(item.descricao)}','${escHtml(item.categoria)}',${item.fixo})">✏️ Editar</button>
              ${btnExcluir}
            </div>
          </div>
        </div>`;
    });
    html += `</div></div>`;
  }
  c.innerHTML = html;
}

async function ajustarEstoque(id, qtdAtual, delta){
  const nova = Math.max(0, qtdAtual + delta);
  await fetch(`/api/estoque/${id}`,{method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({quantidade:nova})});
  carregarEstoque();
}

async function criarItemEstoque(){
  const nome = document.getElementById("est_nome").value.trim();
  if(!nome) return toast("Informe o nome do item.","error");
  const payload = {
    nome,
    categoria:        document.getElementById("est_categoria").value,
    quantidade:       parseInt(document.getElementById("est_qtd").value)||0,
    quantidade_minima:parseInt(document.getElementById("est_qtd_min").value)||0,
    unidade:          document.getElementById("est_unidade").value,
    descricao:        document.getElementById("est_desc").value
  };
  const r=await fetch("/api/estoque",{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  if(r.ok&&d.ok){
    toast("✅ Item adicionado ao estoque!","success");
    ["est_nome","est_desc"].forEach(id=>{ document.getElementById(id).value=""; });
    document.getElementById("est_qtd").value = "0";
    document.getElementById("est_qtd_min").value = "0";
    carregarEstoque();
  }else{ toast(d.erro||"Erro ao adicionar.","error"); }
}

function editarEstoque(id, nome, qtd, qtdMin, unidade, desc, cat, fixo){
  abrirModal(`Editar — ${nome}`,`
    <div style="display:grid;gap:12px">
      ${!fixo?`
      <div class="field-group">
        <label style="font-size:11px;font-weight:600;color:#4A6080;text-transform:uppercase;display:block;margin-bottom:5px">Nome</label>
        <input type="text" class="field-input" id="m_nome" value="${escHtml(nome)}" style="width:100%">
      </div>
      <div class="field-group">
        <label style="font-size:11px;font-weight:600;color:#4A6080;text-transform:uppercase;display:block;margin-bottom:5px">Categoria</label>
        <input type="text" class="field-input" id="m_cat" value="${escHtml(cat)}" style="width:100%">
      </div>` : `<input type="hidden" id="m_nome" value="${escHtml(nome)}"><input type="hidden" id="m_cat" value="${escHtml(cat)}">`}
      <div class="field-group">
        <label style="font-size:11px;font-weight:600;color:#4A6080;text-transform:uppercase;display:block;margin-bottom:5px">Quantidade Disponível</label>
        <input type="number" class="field-input" id="m_qtd" value="${qtd}" min="0" style="width:100%">
      </div>
      ${!fixo?`
      <div class="field-group">
        <label style="font-size:11px;font-weight:600;color:#4A6080;text-transform:uppercase;display:block;margin-bottom:5px">Qtd. Mínima (alerta)</label>
        <input type="number" class="field-input" id="m_qtdmin" value="${qtdMin}" min="0" style="width:100%">
      </div>
      <div class="field-group">
        <label style="font-size:11px;font-weight:600;color:#4A6080;text-transform:uppercase;display:block;margin-bottom:5px">Descrição</label>
        <input type="text" class="field-input" id="m_desc" value="${escHtml(desc)}" style="width:100%">
      </div>` : `<input type="hidden" id="m_qtdmin" value="${qtdMin}"><input type="hidden" id="m_desc" value="${escHtml(desc)}">`}
    </div>
    <button class="btn-primary-lg" onclick="salvarEdicaoEstoque(${id})" style="margin-top:16px;font-size:13px;padding:12px">Salvar Alterações</button>`
  );
}

async function salvarEdicaoEstoque(id){
  const payload = {
    nome:              document.getElementById("m_nome").value,
    categoria:         document.getElementById("m_cat").value,
    quantidade:        parseInt(document.getElementById("m_qtd").value)||0,
    quantidade_minima: parseInt(document.getElementById("m_qtdmin").value)||0,
    descricao:         document.getElementById("m_desc").value
  };
  const r=await fetch(`/api/estoque/${id}`,{method:"PUT",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  if(r.ok&&d.ok){ toast("✅ Estoque atualizado!","success"); fecharModal(); carregarEstoque(); }
  else { toast(d.erro||"Erro.","error"); }
}

async function deletarEstoque(id, nome, fixo){
  const aviso = fixo
    ? `⚠️ "${nome}" é um item de Santa Ceia.\n\nTem certeza que deseja excluir permanentemente?`
    : `Excluir "${nome}" do estoque?`;
  if(!confirm(aviso)) return;
  const r=await fetch(`/api/estoque/${id}`,{method:"DELETE"});
  const d=await r.json();
  if(r.ok&&d.ok){ toast("Item removido do estoque.","info"); carregarEstoque(); }
  else { toast(d.erro||"Erro ao excluir.","error"); }
}

function escHtml(s){ return String(s||"").replace(/'/g,"&#39;").replace(/"/g,"&quot;"); }

// ── RELATÓRIOS (sem filtro de responsável) ────────────────────
async function buscarRelatorio(){
  const params = new URLSearchParams();
  const per  = document.getElementById("f_periodo")?.value;
  const ini  = document.getElementById("f_data_ini")?.value;
  const fim  = document.getElementById("f_data_fim")?.value;
  if(per) params.append("periodo", per);
  if(ini) params.append("data_ini", ini);
  if(fim) params.append("data_fim", fim);
  const r    = await fetch(`/api/cultos?${params}`);
  const list = await r.json();
  const body = document.getElementById("bodyRelatorio");
  if(!list.length){
    body.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:28px;color:#8ca0c0">Nenhum registro encontrado</td></tr>`;
    return;
  }
  const bc={"Manhã":"badge-manha","Tarde":"badge-tarde","Noite":"badge-noite"};
  body.innerHTML=list.map(c=>`
    <tr>
      <td><strong>${c.data_br||fmtBR(c.data)}</strong></td>
      <td style="color:#4A6080">${c.dia_semana}</td>
      <td><span class="badge ${bc[c.periodo]||''}">${c.periodo}</span></td>
      <td>${c.hora}</td>
      <td><strong>${c.responsavel}</strong></td>
      <td><strong style="color:#0A2463">${c.presentes}</strong></td>
      <td><strong style="color:#1B4FA8">${c.visitantes}</strong></td>
      <td><strong style="color:#3E7CB1">${c.criancas}</strong></td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn-sm blue" onclick="verDetalhes(${c.id})">Ver</button>
          <button class="btn-sm red"  onclick="deletarCulto(${c.id})">✕</button>
        </div>
      </td>
    </tr>`).join("");
}
async function verDetalhes(id){
  const r=await fetch(`/api/cultos/${id}`);
  const d=await r.json();
  const c=d.culto;
  abrirModal(`Detalhes — ${c.data_br||fmtBR(c.data)}`,`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;margin-bottom:16px">
      <div><strong>Data:</strong><br>${c.data_br||fmtBR(c.data)}</div>
      <div><strong>Horário:</strong><br>${c.hora}</div>
      <div><strong>Dia:</strong><br>${c.dia_semana}</div>
      <div><strong>Período:</strong><br>${c.periodo}</div>
      <div style="grid-column:1/-1"><strong>Responsável:</strong> ${c.responsavel}</div>
      <div style="background:#EBF8FF;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:30px;font-weight:800;color:#0A2463;font-family:'Bebas Neue',sans-serif">${c.presentes}</div>
        <div style="font-size:10px;color:#8ca0c0;text-transform:uppercase">Presentes</div>
      </div>
      <div style="background:#F0FFF4;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:30px;font-weight:800;color:#276749;font-family:'Bebas Neue',sans-serif">${c.visitantes}</div>
        <div style="font-size:10px;color:#8ca0c0;text-transform:uppercase">Visitantes</div>
      </div>
    </div>
    ${c.observacoes?`<div style="background:#F8FAFF;border:1px solid #D8E4F0;border-radius:8px;padding:12px;font-size:13px;color:#4A6080;margin-bottom:14px"><strong>Obs:</strong> ${c.observacoes}</div>`:''}
    ${d.visitantes.length?`<div><strong style="font-size:12px">Visitantes do culto (${d.visitantes.length}):</strong>${d.visitantes.map(v=>`<div style="padding:7px 0;border-bottom:1px solid #EEF2F9;font-size:13px">${v.nome} — ${v.telefone}</div>`).join("")}</div>`:''}`);
}
async function deletarCulto(id){
  if(!confirm("Excluir este registro de culto?")) return;
  await fetch(`/api/cultos/${id}`,{method:"DELETE"});
  toast("Registro excluído.","info");
  buscarRelatorio();
}
function exportarExcel(){
  const params = new URLSearchParams();
  const per = document.getElementById("f_periodo")?.value;
  const ini = document.getElementById("f_data_ini")?.value;
  const fim = document.getElementById("f_data_fim")?.value;
  if(per) params.append("periodo", per);
  if(ini) params.append("data_ini", ini);
  if(fim) params.append("data_fim", fim);
  window.location.href=`/api/exportar_excel?${params}`;
  toast("⬇️ Gerando Excel com estoque e checklist...","info");
}

// ── RESUMO ────────────────────────────────────────────────────
async function carregarResumo(){
  const r=await fetch("/api/resumo");
  const d=await r.json();
  const g=d.geral;
  document.getElementById("st_cultos").textContent           = g.total_cultos||0;
  document.getElementById("st_presentes").textContent        = g.total_presentes||0;
  document.getElementById("st_visitantes").textContent       = g.total_visitantes||0;
  document.getElementById("st_criancas").textContent         = g.total_criancas||0;
  document.getElementById("st_media_presentes").textContent  = g.media_presentes||"0";
  document.getElementById("st_media_visitantes").textContent = g.media_visitantes||"0";
  document.getElementById("st_media_criancas").textContent   = g.media_criancas||"0";
  const bp=document.getElementById("bodyPeriodo");
  bp.innerHTML = d.por_periodo.length
    ? d.por_periodo.map(p=>`<tr><td><strong>${p.periodo}</strong></td><td>${p.qtd}</td><td>${p.total_presentes}</td><td>${p.media_presentes}</td></tr>`).join("")
    : `<tr><td colspan="4" style="text-align:center;padding:20px;color:#8ca0c0">Sem dados</td></tr>`;
  const uc=document.getElementById("ultimosCultos");
  uc.innerHTML = d.ultimos.length
    ? d.ultimos.map(c=>`
        <div style="display:flex;align-items:center;gap:14px;padding:11px 0;border-bottom:1px solid #EEF2F9">
          <div style="background:#EBF8FF;border-radius:8px;padding:7px 10px;text-align:center;min-width:58px">
            <div style="font-size:20px;font-weight:800;color:#0A2463;font-family:'Bebas Neue',sans-serif">${c.presentes}</div>
            <div style="font-size:9px;color:#8ca0c0;text-transform:uppercase">presentes</div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">${c.data_br||fmtBR(c.data)} — ${c.dia_semana}</div>
            <div style="font-size:12px;color:#8ca0c0">${c.periodo} · ${c.responsavel}</div>
          </div>
          <div style="text-align:right;font-size:12px;color:#8ca0c0;flex-shrink:0">
            ${c.visitantes} visit.<br>${c.criancas} crian.
          </div>
        </div>`).join("")
    : `<div style="text-align:center;padding:24px;color:#8ca0c0">Nenhum culto registrado ainda.</div>`;
}

// ── USUÁRIOS ──────────────────────────────────────────────────
async function criarUsuario(){
  const nome  = document.getElementById("nu_nome").value.trim();
  const email = document.getElementById("nu_email").value.trim().toLowerCase();
  const senha = document.getElementById("nu_senha").value;
  const cargo = document.getElementById("nu_cargo").value;
  if(!nome||!email||!senha) return toast("Preencha nome, e-mail e senha.","error");
  const r=await fetch("/api/usuarios",{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome,email,senha,cargo})});
  const d=await r.json();
  if(r.ok&&d.ok){
    toast("✅ Usuário criado!","success");
    ["nu_nome","nu_email","nu_senha"].forEach(id=>{ document.getElementById(id).value=""; });
    carregarUsuarios();
  }else{ toast(d.erro||"Erro ao criar usuário.","error"); }
}
async function carregarUsuarios(){
  const c=document.getElementById("listaUsuarios");
  if(!c) return;
  c.innerHTML="<div class='loading-msg'>Carregando...</div>";
  const r=await fetch("/api/usuarios");
  const list=await r.json();
  const CL={admin:"cargo-admin",lider:"cargo-lider",voluntario:"cargo-voluntario"};
  const CN={admin:"Administrador",lider:"Líder",voluntario:"Voluntário"};
  c.innerHTML=list.map(u=>`
    <div class="usuario-card">
      <div class="usuario-avatar">${u.nome.charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="usuario-nome">${u.nome}
          <span class="badge-cargo ${CL[u.cargo]||''}">${CN[u.cargo]||u.cargo}</span>
          ${!u.ativo?'<span class="badge-cargo cargo-inativo">Inativo</span>':''}
        </div>
        <div class="usuario-email">${u.email}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn-sm blue" onclick="modalSenha(${u.id},'${u.nome.replace(/'/g,"\\'")}')">🔑</button>
        <button class="btn-sm red"  onclick="deletarUsuario(${u.id},'${u.nome.replace(/'/g,"\\'")}')">🗑️</button>
      </div>
    </div>`).join("");
}
function modalSenha(uid, nome){
  abrirModal(`Alterar senha — ${nome}`,`
    <div class="field-group" style="margin-bottom:14px">
      <label style="font-size:11px;font-weight:600;color:#4A6080;text-transform:uppercase;display:block;margin-bottom:6px">Nova Senha</label>
      <input type="password" class="field-input" id="modal_senha" placeholder="Mínimo 6 caracteres" style="width:100%">
    </div>
    <button class="btn-primary-lg" onclick="confirmarSenha(${uid})" style="font-size:13px;padding:12px">Salvar Senha</button>`);
}
async function confirmarSenha(uid){
  const nova=document.getElementById("modal_senha").value;
  if(!nova||nova.length<6) return toast("Senha mínima de 6 caracteres.","error");
  const r=await fetch(`/api/usuarios/${uid}`,{method:"PUT",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({nova_senha:nova})});
  const d=await r.json();
  if(r.ok&&d.ok){ toast("✅ Senha alterada!","success"); fecharModal(); }
  else { toast(d.erro||"Erro.","error"); }
}
async function deletarUsuario(uid, nome){
  if(!confirm(`Excluir o usuário "${nome}"?`)) return;
  const r=await fetch(`/api/usuarios/${uid}`,{method:"DELETE"});
  const d=await r.json();
  if(r.ok&&d.ok){ toast("Usuário excluído.","info"); carregarUsuarios(); }
  else{ toast(d.erro||"Erro.","error"); }
}

// ── Sidebar ───────────────────────────────────────────────────
function toggleSidebar(force){
  const sb=document.getElementById("sidebar");
  if(typeof force==="boolean") sb.classList.toggle("open",force);
  else sb.classList.toggle("open");
}
document.addEventListener("click",e=>{
  const sb=document.getElementById("sidebar");
  const mt=document.querySelector(".menu-toggle");
  if(sb&&sb.classList.contains("open")&&!sb.contains(e.target)&&mt&&!mt.contains(e.target))
    sb.classList.remove("open");
});

// ── Toast & Modal ─────────────────────────────────────────────
function toast(msg, tipo="info"){
  const el=document.getElementById("toast");
  el.textContent=msg; el.className=`toast show ${tipo}`;
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove("show"),3600);
}
function abrirModal(titulo, html){
  document.getElementById("modalTitle").textContent=titulo;
  document.getElementById("modalBody").innerHTML=html;
  document.getElementById("modalOverlay").classList.add("open");
}
function fecharModal(){
  document.getElementById("modalOverlay").classList.remove("open");
}
