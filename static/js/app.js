/* IGREJA ABA — app.js v5 */
"use strict";
const S={presentes:0,visitantes:0,criancas:0,periodo:"Noite",tipoCulto:"Culto Regular",cultoAtual:null};
const DIAS=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const TIPOS=["Culto Regular","NAREAL","Evento","Reunião de Líderes","Culto de GC","Outro"];
const COR_TIPO={"Culto Regular":"badge-noite","NAREAL":"badge-nareal","Evento":"badge-evento","Reunião de Líderes":"badge-tarde","Culto de GC":"badge-manha","Outro":""};
function tipoBadgeClass(t){if(!t)return "";if(t.startsWith("Outro:"))return "";return COR_TIPO[t]||"";}
let _cargo="voluntario",_isAdmin=false,_isLider=false,_iaSessaoId=null,_iaTimer=null;

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded",async()=>{
  await verificarAuth();
  initData(); atualizarTopbarDate(); setInterval(atualizarTopbarDate,60000);
  await carregarCultosParaSelects();
  carregarVisitantes(); carregarEstoque(); carregarGCs();
  carregarDirecionamentos(); carregarSessoesIA(); carregarCameras();
  carregarDashboard(); buscarRelatorio();
  document.querySelectorAll(".nav-item").forEach(item=>{
    item.addEventListener("click",e=>{
      e.preventDefault(); if(item.classList.contains("disabled"))return;
      const tab=item.dataset.tab; if(tab){ativarTab(tab);toggleSidebar(false);}
    });
  });
});

// ── AUTH ──────────────────────────────────────────────────────
async function verificarAuth(){
  const r=await fetch("/api/me"); const d=await r.json();
  if(!d.autenticado){window.location.href="/";return;}
  _cargo=d.cargo; _isAdmin=(d.cargo==="admin"); _isLider=(d.cargo==="lider"||d.cargo==="admin");
  document.getElementById("userName").textContent=d.nome;
  const roleLabel={"admin":"Administrador","lider":"Líder","voluntario":"Voluntário"};
  const roleClass={"admin":"role-admin","lider":"role-lider","voluntario":"role-voluntario"};
  document.getElementById("userRole").textContent=roleLabel[d.cargo]||d.cargo;
  document.getElementById("userAvatar").textContent=d.nome.charAt(0).toUpperCase();
  // Badge de cargo no sidebar
  const badgeEl=document.getElementById("roleBadge");
  if(badgeEl){badgeEl.textContent=roleLabel[d.cargo];badgeEl.className=`badge-role ${roleClass[d.cargo]}`;}
  // Controla itens de menu restritos
  document.getElementById("navUsuarios").style.display=_isAdmin?"":"none";
  const _nl=document.getElementById("navLogs"); if(_nl)_nl.style.display="none";
  // Voluntário não vê botão de criar usuário
  if(d.cargo==="voluntario"){
    document.getElementById("responsavel").value=d.nome;
  }
  // Mostra aba usuários para admin
  if(_isAdmin){carregarUsuarios();}
  // Voluntário: oculta abas restritas no menu
  if(d.cargo==="voluntario"){
    ["gc","estoque","dashboard","relatorios","resumo","ia","usuarios","logs"].forEach(tab=>{
      const nav=document.querySelector(`[data-tab="${tab}"]`);
      if(nav)nav.closest("li").style.display="none";
    });
  }
}
async function logout(){await fetch("/api/logout",{method:"POST"});window.location.href="/";}

// ── TABS ──────────────────────────────────────────────────────
const TAB_TITLES={registro:"Registro de Culto",checklist:"Checklist",visitantes:"Visitantes",
  gc:"Conecta GC",estoque:"Estoque",ia:"IA Contagem",relatorios:"Relatórios",
  resumo:"Resumo Geral",escalas:"Escalas",dash_gc:"Dashboard GC",dashboard:"Dashboard",usuarios:"Usuários",logs:"Logs do Sistema"};

function ativarTab(tab){
  document.querySelectorAll(".tab-content").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
  document.getElementById("tab-"+tab)?.classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add("active");
  document.getElementById("topbarTitle").textContent=TAB_TITLES[tab]||tab;
  if(tab==="resumo")carregarResumo();
  if(tab==="dash_gc")carregarDashGC();
  if(tab==="escalas"){const hoje=new Date();document.getElementById("escala_mes").value=hoje.getFullYear()+"-"+String(hoje.getMonth()+1).padStart(2,"0");carregarVisualizacaoEscala();carregarVoluntarios();}
  if(tab==="visitantes"){carregarVisitantes();popularSelectVisitantes();}
  if(tab==="usuarios"&&_isAdmin)carregarUsuarios();
  if(tab==="gc"){carregarGCs();carregarDirecionamentos();popularSelectVisitantes();}
  if(tab==="estoque")carregarEstoque();
  if(tab==="dashboard")carregarDashboard();
  if(tab==="ia"){carregarSessoesIA();carregarCameras();}
  
}

// ── DATA / HORA ───────────────────────────────────────────────
function initData(){
  const n=new Date(),pad=v=>String(v).padStart(2,"0");
  document.getElementById("data").value=`${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`;
  document.getElementById("hora").value=`${pad(n.getHours())}:${pad(n.getMinutes())}`;
  atualizarDiaSemana();
}
function atualizarDiaSemana(){
  const v=document.getElementById("data").value; if(!v)return;
  const[y,m,d]=v.split("-").map(Number);
  document.getElementById("diaSemana").value=DIAS[new Date(y,m-1,d).getDay()];
}
function atualizarTopbarDate(){
  document.getElementById("topbarDate").textContent=
    new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}
function fmtBR(s){try{const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;}catch{return s||"";}}

function selecionarPeriodo(btn){
  document.querySelectorAll(".periodo-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); S.periodo=btn.dataset.periodo;
}
function selecionarTipo(btn){
  document.querySelectorAll(".tipo-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); S.tipoCulto=btn.dataset.tipo;
  // Mostra campo de texto se "Outro"
  const wrap=document.getElementById("tipo_outro_wrap");
  if(wrap) wrap.style.display=btn.dataset.tipo==="Outro"?"block":"none";
  if(btn.dataset.tipo==="Outro"){
    setTimeout(()=>document.getElementById("tipo_outro_input")?.focus(),100);
  }
}
function ajustar(c,d){S[c]=Math.max(0,S[c]+d);syncCnt(c);}
function setContador(c,v){S[c]=Math.max(0,parseInt(v)||0);syncCnt(c);}
function syncCnt(c){document.getElementById(`val-${c}`).textContent=S[c];document.getElementById(`inp-${c}`).value=S[c];}

// ── SENHA: mostrar/ocultar ────────────────────────────────────
function toggleSenha(inputId){
  const inp=document.getElementById(inputId);
  if(!inp)return;
  inp.type=inp.type==="password"?"text":"password";
}

// ── SALVAR REGISTRO ───────────────────────────────────────────
async function salvarRegistro(){
  const data=document.getElementById("data").value;
  const hora=document.getElementById("hora").value;
  const resp=document.getElementById("responsavel").value.trim();
  const obs =document.getElementById("observacoes").value.trim();
  if(!data||!hora)return toast("Preencha data e horário.","error");
  if(!resp)return toast("Informe o responsável.","error");
  const btn=document.querySelector("#tab-registro .btn-primary-lg");
  btn.innerHTML='<span class="spinner"></span>Salvando...'; btn.disabled=true;
  try{
    const r=await fetch("/api/cultos",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({data,hora,periodo:S.periodo,tipo_culto:S.tipoCulto,tipo_outro:document.getElementById('tipo_outro_input')?.value||'',responsavel:resp,
        presentes:S.presentes,visitantes:S.visitantes,criancas:S.criancas,observacoes:obs})});
    const d=await r.json();
    if(r.ok&&d.ok){
      toast(`✅ ${d.dia_semana} — ${S.tipoCulto} registrado!`,"success");
      S.cultoAtual=d.id; await carregarCultosParaSelects();
      setTimeout(()=>ativarTab("checklist"),1000);
    }else toast(d.erro||"Erro ao salvar.","error");
  }catch{toast("Erro de conexão.","error");}
  btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Salvar Registro';
  btn.disabled=false;
}

// ── EDITAR CULTO (lider/admin) ────────────────────────────────
async function abrirEdicaoCulto(id){
  if(!_isLider)return toast("Apenas líderes e admins podem editar relatórios.","error");
  const r=await fetch(`/api/cultos/${id}`); const d=await r.json();
  const c=d.culto; const hist=d.historico||[];
  const histHtml=hist.length?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:#4A6080;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Histórico de alterações</div>${hist.map(h=>`<div class="historico-item"><span class="historico-campo">${h.campo}</span>: <span class="historico-old">${h.valor_antes||"—"}</span> → <span class="historico-new">${h.valor_depois||"—"}</span> <span style="color:#8ca0c0;margin-left:4px">por ${h.alterado_por} em ${h.alterado_em?.substring(0,16)||""}</span></div>`).join("")}</div>`:"";
  abrirModal(`✏️ Editar Culto — ${c.data_br||fmtBR(c.data)}`,`
    <div class="info-box">Alterações ficam registradas no histórico do sistema.</div>
    <div class="grid-2" style="gap:10px;margin-bottom:12px">
      <div class="field-group"><label>Presentes</label>
        <input type="number" class="field-input" id="ed_presentes" value="${c.presentes}" min="0"></div>
      <div class="field-group"><label>Visitantes</label>
        <input type="number" class="field-input" id="ed_visitantes" value="${c.visitantes}" min="0"></div>
      <div class="field-group"><label>Crianças</label>
        <input type="number" class="field-input" id="ed_criancas" value="${c.criancas}" min="0"></div>
      <div class="field-group"><label>Período</label>
        <select class="field-input" id="ed_periodo">
          ${["Manhã","Tarde","Noite"].map(p=>`<option${c.periodo===p?" selected":""}>${p}</option>`).join("")}
        </select></div>
      <div class="field-group" style="grid-column:1/-1"><label>Tipo de Culto</label>
        <select class="field-input" id="ed_tipo">
          ${["Culto Regular","NAREAL","Evento","Reunião de Líderes","Culto de GC","Outro"].map(t=>`<option${c.tipo_culto===t?" selected":""}>${t}</option>`).join("")}
        </select></div>
      <div class="field-group" style="grid-column:1/-1"><label>Observações</label>
        <textarea class="field-input" id="ed_obs" rows="2" style="resize:vertical">${c.observacoes||""}</textarea></div>
    </div>
    <button class="btn-primary-lg" onclick="salvarEdicaoCulto(${id})" style="padding:12px;font-size:13px">💾 Salvar Alterações</button>
    ${histHtml}`,"wide");
}
async function salvarEdicaoCulto(id){
  const payload={
    presentes: parseInt(document.getElementById("ed_presentes").value)||0,
    visitantes:parseInt(document.getElementById("ed_visitantes").value)||0,
    criancas:  parseInt(document.getElementById("ed_criancas").value)||0,
    periodo:   document.getElementById("ed_periodo").value,
    tipo_culto:document.getElementById("ed_tipo").value,tipo_outro:document.getElementById("ed_tipo_outro")?.value||'',
    observacoes:document.getElementById("ed_obs").value
  };
  const r=await fetch(`/api/cultos/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  if(r.ok&&d.ok){toast("✅ Relatório atualizado!","success");fecharModal();buscarRelatorio();carregarResumo();}
  else toast(d.erro||"Erro.","error");
}

// ── SELECTS CULTOS ────────────────────────────────────────────
async function carregarCultosParaSelects(){
  const r=await fetch("/api/cultos"); const list=await r.json();
  const build=(id,extra)=>{
    const sel=document.getElementById(id); if(!sel)return;
    const prev=sel.value; sel.innerHTML=extra;
    list.forEach(c=>{
      const o=document.createElement("option"); o.value=c.id;
      const ico={"Manhã":"🌅","Tarde":"☀️","Noite":"🌙"}[c.periodo]||"";
      const tc=c.tipo_culto==="NAREAL"?"🟣":"";
      o.textContent=`${tc}${ico} ${c.data_br||fmtBR(c.data)} — ${c.dia_semana} — ${c.tipo_culto||c.periodo}`;
      sel.appendChild(o);
    });
    if(prev)sel.value=prev;
  };
  build("selectCultoChecklist","<option value=''>— Selecione —</option>");
  build("v_culto_id","<option value=''>— Sem culto vinculado —</option>");
  build("qr_culto_id","<option value=''>— Selecione o culto —</option>");
  build("ia_culto_id","<option value=''>— Sem culto vinculado —</option>");
  if(S.cultoAtual){
    const sel=document.getElementById("selectCultoChecklist");
    if(sel){sel.value=S.cultoAtual;carregarChecklist(S.cultoAtual);}
    S.cultoAtual=null;
  }
}

// ── CHECKLIST ─────────────────────────────────────────────────
async function carregarChecklist(cultoId){
  const c=document.getElementById("checklistContainer");
  if(!cultoId){c.innerHTML=`<div class="empty-state"><p>Selecione um culto</p></div>`;return;}
  c.innerHTML=`<div class="loading-msg">Carregando...</div>`;
  const r=await fetch(`/api/cultos/${cultoId}/checklist`); const data=await r.json();
  const CATS={antes:{label:"Antes do Culto",emoji:"⏰"},mesa_entrada:{label:"Mesa de Entrada",emoji:"📋"},
    banheiro:{label:"Banheiros",emoji:"🚿"},durante:{label:"Durante o Culto",emoji:"🎵"},final:{label:"Final do Culto",emoji:"🔒"}};
  const grupos={};data.forEach(i=>{if(!grupos[i.categoria])grupos[i.categoria]=[];grupos[i.categoria].push(i);});
  c.innerHTML="";
  for(const[cat,cfg]of Object.entries(CATS)){
    const itens=grupos[cat]||[]; if(!itens.length)continue;
    const total=itens.length,feitos=itens.filter(i=>i.concluido).length,pct=Math.round(feitos/total*100);
    const div=document.createElement("div"); div.className="checklist-cat";
    div.innerHTML=`<div class="cat-hdr" onclick="toggleCat(this)">
      <div class="cat-hdr-left"><span>${cfg.emoji}</span><span>${cfg.label}</span></div>
      <div class="cat-prog-wrap"><span class="cat-prog-txt">${feitos}/${total}</span>
        <div class="cat-prog-bg"><div class="cat-prog-bar" style="width:${pct}%"></div></div></div></div>
      <div class="cat-items"></div>`;
    const itemsDiv=div.querySelector(".cat-items");
    itens.forEach(item=>{
      const w=document.createElement("div"); w.className=`check-item${item.concluido?" done":""}`;
      w.innerHTML=`<input type="checkbox" id="cb-${item.id}" ${item.concluido?"checked":""}>
        <label for="cb-${item.id}">${item.item_descricao}</label>`;
      w.querySelector("input").addEventListener("change",function(){marcarItem(item.id,this.checked,w,div);});
      itemsDiv.appendChild(w);
    });
    c.appendChild(div);
  }
}
function toggleCat(h){const i=h.nextElementSibling;i.style.display=i.style.display==="none"?"":"none";}
async function marcarItem(id,v,wrap,catDiv){
  wrap.classList.toggle("done",v);
  const done=catDiv.querySelectorAll(".check-item.done").length;
  const total=catDiv.querySelectorAll(".check-item").length;
  catDiv.querySelector(".cat-prog-bar").style.width=Math.round(done/total*100)+"%";
  catDiv.querySelector(".cat-prog-txt").textContent=`${done}/${total}`;
  await fetch(`/api/checklist/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({concluido:v})});
}

// ── QR CODE ───────────────────────────────────────────────────
async function gerarQRCode(){
  const btn=document.getElementById("btnGerarQR");
  if(btn){btn.innerHTML='<span class="spinner"></span>Gerando...';btn.disabled=true;}
  try{
    const r=await fetch("/api/qrcode_fixo"); const d=await r.json();
    document.getElementById("qrImg").src=d.qrcode;
    document.getElementById("qrUrl").textContent=d.url;
    document.getElementById("qrContainer").style.display="block";
  }catch{toast("Erro ao gerar QR Code.","error");}
  if(btn){btn.innerHTML="📱 Exibir QR Code";btn.disabled=false;}
}
function baixarQR(){
  const a=document.createElement("a");
  a.href=document.getElementById("qrImg").src;
  a.download="qrcode_igrejaaba.png";a.click();
  toast("✅ QR Code baixado!","success");
}



// ── VISITANTES ────────────────────────────────────────────────
async function salvarVisitante(){
  const nome=document.getElementById("v_nome").value.trim();
  const tel =document.getElementById("v_telefone").value.trim();
  if(!nome||!tel)return toast("Nome e telefone são obrigatórios.","error");
  const btn=document.querySelector("#tab-visitantes .btn-primary-lg");
  btn.innerHTML='<span class="spinner"></span>Salvando...'; btn.disabled=true;
  const payload={nome,telefone:tel,
    idade:         document.getElementById("v_idade").value,
    endereco:      document.getElementById("v_endereco").value,
    endereco_padronizado: document.getElementById("v_end_display")?.value||"",
    bairro:        document.getElementById("v_bairro").value,
    cidade:        document.getElementById("v_cidade").value,
    lat:           parseFloat(document.getElementById("v_lat")?.value)||null,
    lng:           parseFloat(document.getElementById("v_lng")?.value)||null,
    como_conheceu: document.getElementById("v_como").value,
    pedido_oracao: document.getElementById("v_oracao").value,
    quer_visita:   document.getElementById("v_quer_visita").checked,
    data_visita:   document.getElementById("v_data_visita").value,
    hora_visita:   document.getElementById("v_hora_visita").value,
    culto_id:      document.getElementById("v_culto_id").value||null,
    observacao:    document.getElementById("v_observacao").value,
    origem:"manual"};
  const r=await fetch("/api/visitantes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  btn.innerHTML='Cadastrar Visitante'; btn.disabled=false;
  if(r.ok&&d.ok){
    toast("✅ Visitante cadastrado!","success");
    ["v_nome","v_telefone","v_idade","v_endereco","v_bairro","v_cidade","v_oracao","v_observacao"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
    document.getElementById("v_como").value=""; document.getElementById("v_quer_visita").checked=false;
    document.getElementById("v_data_visita").value=""; document.getElementById("v_hora_visita").value="";
    if(document.getElementById("v_lat"))document.getElementById("v_lat").value="";
    if(document.getElementById("v_lng"))document.getElementById("v_lng").value="";
    carregarVisitantes(); popularSelectVisitantes();
  }else toast(d.erro||"Erro.","error");
}
async function carregarVisitantes(){
  const c=document.getElementById("listaVisitantes"); if(!c)return;
  c.innerHTML="<div class='loading-msg'>Carregando...</div>";
  const r=await fetch("/api/visitantes"); const list=await r.json();
  if(!list.length){c.innerHTML="<div class='empty-state'><p>Nenhum visitante cadastrado ainda.</p></div>";return;}
  c.innerHTML=list.map(v=>`
    <div class="visitante-card">
      <div class="visitante-av">${v.nome.charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="visitante-nome">${v.nome}
          <span class="badge-${v.origem==="qrcode"?"qr":"manual"}">${v.origem==="qrcode"?"📱 QR":"✏️ Manual"}</span>
          ${v.editado_em?'<span class="badge badge-editado">editado</span>':''}
        </div>
        ${v.idade?`<div class="visitante-info-line">🎂 ${v.idade} anos</div>`:""}
        <div class="visitante-info-line">📱 ${v.telefone}</div>
        ${v.endereco_padronizado||v.endereco?`<div class="visitante-info-line">📍 ${v.endereco_padronizado||v.endereco}</div>`:""}
        ${v.culto_data_br?`<div class="visitante-info-line">📅 ${v.culto_data_br}${v.culto_periodo?" — "+v.culto_periodo:""}${v.tipo_culto?" ("+v.tipo_culto+")":""}</div>`:""}
        ${v.quer_visita?`<div class="visitante-info-line" style="color:#2E7D32;font-weight:600">🏠 Visita${v.data_visita?" em "+fmtBR(v.data_visita):""}</div>`:""}
        ${v.pedido_oracao?`<div class="visitante-info-line" style="font-style:italic">🙏 ${v.pedido_oracao}</div>`:""}
        ${v.observacao?`<div class="visitante-info-line" style="color:#1B4FA8;font-weight:600">→ ${v.observacao}</div>`:""}
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
        <button class="btn-sm green" onclick="gerarLinks(${v.id})">🔗 Links</button>
        ${_isLider?`<button class="btn-sm red" onclick="deletarVisitante(${v.id})">🗑️</button>`:""}
      </div>
    </div>`).join("");
}
// Cache de visitantes para preenchimento automático
let _visitantesCache = [];

async function popularSelectVisitantes(){
  const r=await fetch("/api/visitantes"); const list=await r.json();
  _visitantesCache = list;
  const sel=document.getElementById("gc_visitante_id"); if(!sel)return;
  const prev=sel.value; sel.innerHTML="<option value=''>— Sem vínculo —</option>";
  list.forEach(v=>{
    const o=document.createElement("option");
    o.value=v.id;
    o.textContent=`${v.nome} — ${v.telefone}`;
    // Guarda endereço no data attribute
    o.dataset.endereco = [v.endereco_padronizado||v.endereco, v.bairro, v.cidade].filter(Boolean).join(", ");
    o.dataset.nome = v.nome;
    sel.appendChild(o);
  });
  if(prev)sel.value=prev;
}

function aoSelecionarVisitanteGC(){
  const sel=document.getElementById("gc_visitante_id");
  const opt=sel.options[sel.selectedIndex];
  if(!opt||!opt.value) return;
  const end = opt.dataset.endereco||"";
  const nome = opt.dataset.nome||"";
  // Preenche campo de endereço automaticamente
  const qField = document.getElementById("gc_query");
  if(qField && end){
    qField.value = end;
    qField.style.background = "#f0fff4";
    setTimeout(()=>qField.style.background="",1500);
    toast(`Endereço de ${nome} preenchido automaticamente!`,"success");
  }
}
async function deletarVisitante(id){
  if(!_isLider)return toast("Sem permissão para excluir.","error");
  if(!confirm("Excluir este visitante?"))return;
  await fetch(`/api/visitantes/${id}`,{method:"DELETE"});
  toast("Visitante removido.","info"); carregarVisitantes();
}
async function gerarLinks(id){
  const r=await fetch(`/api/visitantes/${id}/link`); const d=await r.json();
  if(!r.ok)return toast(d.erro,"error");
  abrirModal(`Links — ${d.nome}`,`
    <div class="link-card"><strong style="font-size:11px;color:#8ca0c0;display:block;margin-bottom:5px">📍 GOOGLE MAPS</strong>
      <a href="${d.maps_link}" target="_blank">Abrir endereço no Google Maps</a></div>
    <div class="link-card"><strong style="font-size:11px;color:#8ca0c0;display:block;margin-bottom:5px">💬 WHATSAPP</strong>
      <a href="${d.whatsapp_link}" target="_blank">Enviar mensagem para ${d.nome}</a></div>`);
}

// ══════════════════════════════════════════════════════════════
// GC FINDER
// ══════════════════════════════════════════════════════════════
async function resetarGCs(){
  if(!confirm("Isso vai APAGAR todos os GCs do banco e reinserir a lista padrão.\nOs direcionamentos também serão apagados.\n\nConfirmar?"))return;
  const r=await fetch("/api/gcs/resetar",{method:"POST"});
  const d=await r.json();
  if(r.ok&&d.ok){toast(`✅ ${d.msg}`,"success");carregarGCs();carregarDirecionamentos();}
  else toast(d.erro||"Erro.","error");
}
async function carregarGCs(){
  const c=document.getElementById("gc_lista"); if(!c)return;
  c.innerHTML="<div class='loading-msg'>Carregando...</div>";
  const r=await fetch("/api/gcs"); const list=await r.json();
  if(!list.length){c.innerHTML="<div class='empty-state'><p>Nenhum GC cadastrado.</p></div>";return;}
  c.innerHTML=list.map(gc=>`
    <div class="gc-lista-item">
      <div class="gc-dot" style="background:${gc.cor_hex}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;color:#0A2463">${gc.nome}</div>
        ${gc.lider?`<div style="font-size:11px;color:#8ca0c0">👤 ${gc.lider}</div>`:""}
        <div style="font-size:11px;color:#8ca0c0">📍 ${gc.endereco}, ${gc.bairro}</div>
      </div>
      <span class="sector-badge" style="background:${gc.cor_hex}">${gc.setor}</span>
      <span style="font-size:9px;font-weight:700;${gc.lat?"color:#38A169":"color:#E53E3E"}">${gc.lat?"✓ GPS":"Sem GPS"}</span>
      ${_isAdmin?`<button class="btn-sm blue" onclick="abrirEdicaoGC(${gc.id})">✏️</button>
        <button class="btn-sm red" onclick="desativarGC(${gc.id},'${esc(gc.nome)}')">🗑️</button>`:""}
    </div>`).join("");
}

async function calcularGC(){
  const query=document.getElementById("gc_query").value.trim();
  if(!query){
    toast("Digite o endereço do visitante.","error");
    document.getElementById("gc_query").focus();
    return;
  }
  const btn=document.getElementById("btnCalcularGC");
  const orig=btn.innerHTML;
  btn.innerHTML='<span class="spinner"></span> Buscando...'; btn.disabled=true;
  document.getElementById("gc_resultado").innerHTML='<div class="loading-msg">🔍 Localizando endereço e calculando distâncias...</div>';
  try{
    const r=await fetch("/api/gcs/calcular_proximo",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({query,cidade:"Alvorada"})
    });
    const d=await r.json();
    if(!r.ok){
      document.getElementById("gc_resultado").innerHTML=
        `<div class="permission-alert" style="border-radius:10px;padding:14px 16px">
          <div style="font-size:15px;margin-bottom:6px">❌ Endereço não encontrado</div>
          <div style="font-size:13px;opacity:.8">${d.dica||"Tente escrever: Rua das Flores 123 Jardim Algarve"}</div>
        </div>`;
    } else {
      renderizarResultadoGC(d);
    }
  }catch{
    document.getElementById("gc_resultado").innerHTML='<div class="permission-alert" style="border-radius:10px;padding:14px">❌ Erro de conexão. Verifique a internet.</div>';
  }
  btn.innerHTML=orig; btn.disabled=false;
}

function renderizarResultadoGC(data){
  const mp=data.mais_proximo; const vidId=document.getElementById("gc_visitante_id")?.value;
  let html=`<div class="gc-result-top" style="background:linear-gradient(135deg,#064E3B,#065F46);border-left:5px solid ${mp.cor_hex}">
    <div style="font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:1.5px">🏆 GC Mais Próximo</div>
    <div style="font-size:18px;font-weight:700;margin:3px 0">${mp.nome}</div>
    ${mp.lider?`<div style="font-size:12px;opacity:.8">👤 ${mp.lider}</div>`:""}
    <div style="font-size:12px;opacity:.8">📍 ${mp.endereco}, ${mp.bairro}</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
      <span style="background:rgba(255,255,255,.2);border-radius:12px;padding:3px 12px;font-size:12px;font-weight:700">📏 ${mp.distancia_km} km</span>
      <span class="sector-badge" style="background:${mp.cor_hex}">${mp.setor}</span>
    </div>
    <div style="display:flex;gap:7px;margin-top:12px;flex-wrap:wrap">
      <button class="btn-sm green" onclick="copiarLink('${mp.rota_link}')">📋 Copiar Rota</button>
      <a href="${mp.rota_link}" target="_blank" style="text-decoration:none"><button class="btn-sm blue">🗺️ Abrir Maps</button></a>
      ${vidId?`<button class="btn-sm orange" onclick="confirmarDirecionamento('${vidId}','${mp.id}','${esc(mp.nome)}',${mp.distancia_km},'${mp.rota_link}')">✅ Confirmar Direcionamento</button>`:""}
    </div>
  </div>`;
  data.gcs.forEach((gc,i)=>{
    html+=`<div class="gc-card${i===0?" primeiro":""}">
      <div class="gc-rank${i===0?'gold':''}">${ i+1}°</div>
      <div class="gc-dot" style="background:${gc.cor_hex}"></div>
      <div class="gc-info">
        <div class="gc-nome">${gc.nome}</div>
        ${gc.lider?`<div class="gc-lider">👤 ${gc.lider}</div>`:""}
        <div class="gc-end">📍 ${gc.endereco}, ${gc.bairro}</div>
      </div>
      <div style="text-align:right">
        <div class="gc-km">${gc.distancia_km}<span> km</span></div>
        <button class="btn-sm blue" style="margin-top:4px;font-size:10px" onclick="copiarLink('${gc.rota_link}')">📋 Rota</button>
        <a href="${gc.wa_rota||''}" target="_blank" style="text-decoration:none;display:block;margin-top:3px"><button class="btn-sm green" style="font-size:10px;background:#25D366;color:#fff;border:none;width:100%">📲 WhatsApp</button></a>
      </div>
    </div>`;
  });
  document.getElementById("gc_resultado").innerHTML=html;
  document.getElementById("gc_resultado").scrollIntoView({behavior:"smooth"});
}

function copiarLink(url){
  navigator.clipboard.writeText(url).then(()=>toast("✅ Link copiado!","success"))
    .catch(()=>{const i=document.createElement("input");i.value=url;document.body.appendChild(i);i.select();document.execCommand("copy");document.body.removeChild(i);toast("✅ Link copiado!","success");});
}
async function confirmarDirecionamento(vidId,gcId,gcNome,dist,rotaLink){
  const r=await fetch("/api/gcs/direcionar",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({visitante_id:parseInt(vidId),gc_id:parseInt(gcId),gc_nome:gcNome,
      distancia_km:dist,rota_link:rotaLink||""})});
  const d=await r.json();
  if(r.ok&&d.ok){
    toast(`✅ Direcionado para ${gcNome}!`,"success");
    carregarDirecionamentos();
    // Abre WhatsApp do líder se disponível
    if(d.whatsapp_lider){
      setTimeout(()=>{
        abrirModal("📲 Avisar Líder do GC",`
          <p style="font-size:14px;color:#4A6080;margin-bottom:14px">
            O visitante foi direcionado para <strong>${gcNome}</strong>.<br>
            Clique abaixo para avisar o líder pelo WhatsApp:
          </p>
          <a href="${d.whatsapp_lider}" target="_blank" style="text-decoration:none">
            <button class="btn-primary-lg" style="background:linear-gradient(135deg,#25D366,#128C7E);padding:14px;font-size:14px">
              📲 Enviar WhatsApp para o Líder
            </button>
          </a>`);
      },400);
    }
  }else toast(d.erro||"Erro.","error");
}
async function criarGC(){
  if(!_isAdmin)return toast("Apenas administradores podem criar GCs.","error");
  const nome=document.getElementById("gc_novo_nome")?.value.trim();
  const end =document.getElementById("gc_novo_end")?.value.trim();
  if(!nome||!end)return toast("Nome e endereço são obrigatórios.","error");
  const btn=document.getElementById("btnCriarGC");
  btn.innerHTML='<span class="spinner"></span>'; btn.disabled=true;
  const r=await fetch("/api/gcs",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome,lider:document.getElementById("gc_novo_lider")?.value||"",telefone_lider:document.getElementById("gc_novo_tel")?.value||"",
      endereco:end,bairro:document.getElementById("gc_novo_bairro")?.value||"",
      cidade:document.getElementById("gc_novo_cidade")?.value||"Alvorada",
      setor:document.getElementById("gc_novo_setor")?.value||"Verde"})});
  const d=await r.json();
  btn.innerHTML="Cadastrar GC"; btn.disabled=false;
  if(r.ok&&d.ok){
    toast(d.lat?"✅ GC cadastrado com GPS!":"✅ GC cadastrado (sem GPS ainda).","success");
    ["gc_novo_nome","gc_novo_lider","gc_novo_end","gc_novo_bairro"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
    carregarGCs();
  }else toast(d.erro||"Erro.","error");
}
function abrirEdicaoGC(id){
  fetch("/api/gcs").then(r=>r.json()).then(list=>{
    const gc=list.find(g=>g.id===id); if(!gc)return;
    abrirModal(`✏️ Editar GC — ${gc.nome}`,`
      <div style="display:grid;gap:10px">
        <div class="field-group"><label>Nome</label><input class="field-input" id="egc_nome" value="${esc(gc.nome)}"></div>
        <div class="field-group"><label>Líder</label><input class="field-input" id="egc_lider" value="${esc(gc.lider||"")}"></div>
        <div class="field-group"><label>WhatsApp do Líder</label><input type="tel" class="field-input" id="egc_tel" value="${esc(gc.telefone_lider||"")}" placeholder="(51) 99999-9999"></div>
        <div class="field-group"><label>Endereço</label><input class="field-input" id="egc_end" value="${esc(gc.endereco)}"></div>
        <div class="field-group"><label>Bairro</label><input class="field-input" id="egc_bairro" value="${esc(gc.bairro||"")}"></div>
        <div class="field-group"><label>Setor</label>
          <select class="field-input" id="egc_setor">
            ${["Verde","Laranja","Amarelo","Vermelho","Azul","Roxo"].map(s=>`<option${gc.setor===s?" selected":""}>${s}</option>`).join("")}
          </select></div>
        <div class="field-group"><label>Status</label>
          <select class="field-input" id="egc_ativo">
            <option value="1"${gc.ativo?" selected":""}>Ativo</option>
            <option value="0"${!gc.ativo?" selected":""}>Inativo</option>
          </select></div>
      </div>
      <button class="btn-primary-lg" onclick="salvarEdicaoGC(${id})" style="margin-top:14px;padding:12px;font-size:13px">💾 Salvar</button>`);
  });
}
async function salvarEdicaoGC(id){
  const r=await fetch(`/api/gcs/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome:document.getElementById("egc_nome").value,
      lider:document.getElementById("egc_lider").value,
telefone_lider:document.getElementById("egc_tel").value,
      endereco:document.getElementById("egc_end").value,
      bairro:document.getElementById("egc_bairro").value,
      setor:document.getElementById("egc_setor").value,
      ativo:parseInt(document.getElementById("egc_ativo").value)})});
  const d=await r.json();
  if(r.ok&&d.ok){toast("✅ GC atualizado!","success");fecharModal();carregarGCs();}
  else toast(d.erro||"Erro.","error");
}
async function desativarGC(id,nome){
  if(!confirm(`Desativar "${nome}"?`))return;
  await fetch(`/api/gcs/${id}`,{method:"DELETE"});
  toast("GC desativado.","info"); carregarGCs();
}

async function deletarDirecionamento(id){
  if(!confirm("Excluir este direcionamento?"))return;
  const r=await fetch(`/api/gcs/direcionamentos/${id}`,{method:"DELETE"});
  const d=await r.json();
  if(r.ok&&d.ok){toast("Direcionamento removido.","info");carregarDirecionamentos();}
  else toast(d.erro||"Erro.","error");
}
async function carregarDirecionamentos(){
  const c=document.getElementById("gc_historico"); if(!c)return;
  const r=await fetch("/api/gcs/direcionamentos"); const list=await r.json();
  if(!list.length){c.innerHTML="<p style='color:#8ca0c0;font-size:13px;padding:14px'>Nenhum direcionamento ainda.</p>";return;}
  c.innerHTML=`<div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Visitante</th><th>GC Indicado</th><th>Distância</th><th></th></tr></thead>
    <tbody>${list.map(d=>`<tr><td>${d.criado_em?.substring(0,16)||""}</td><td><strong>${d.visitante_nome||"—"}</strong></td>
      <td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${d.cor_hex||"#ccc"};margin-right:5px"></span>${d.gc_nome||"—"}</td>
      <td>${d.distancia_km?d.distancia_km+" km":"—"}</td>
      <td>${_isLider?`<button class="btn-sm red" onclick="deletarDirecionamento(${d.id})">Excluir</button>`:""}</td>
      </tr>`).join("")}</tbody></table></div>`;
}

// ══════════════════════════════════════════════════════════════
// ESTOQUE — corrigido (sem piscar, sem loop)
// ══════════════════════════════════════════════════════════════
let _estoqueCarregando=false;
async function carregarEstoque(){
  if(_estoqueCarregando)return;
  _estoqueCarregando=true;
  const c=document.getElementById("listaEstoque"); if(!c){_estoqueCarregando=false;return;}
  const r=await fetch("/api/estoque"); const list=await r.json();
  _estoqueCarregando=false;
  const alertas=list.filter(i=>i.quantidade<i.quantidade_minima);
  const ab=document.getElementById("alertasEstoque");
  if(ab)ab.innerHTML=alertas.length?`<div class="estoque-alerta">⚠️ <strong>${alertas.length} item(ns) abaixo do mínimo:</strong> ${alertas.map(a=>`<span class="alerta-tag">${a.nome} (${a.quantidade} ${a.unidade})</span>`).join(" ")}</div>`:"";
  if(!list.length){c.innerHTML="<div class='empty-state'><p>Nenhum item no estoque ainda.</p></div>";return;}
  const grupos={};list.forEach(i=>{if(!grupos[i.categoria])grupos[i.categoria]=[];grupos[i.categoria].push(i);});
  let html="";
  for(const[cat,itens]of Object.entries(grupos)){
    html+=`<div class="estoque-grupo"><div class="estoque-grupo-titulo">${cat}</div><div class="estoque-itens">`;
    itens.forEach(item=>{
      const baixo=item.quantidade<item.quantidade_minima;
      const canEdit=_isAdmin||_isLider;
      const canDelete=_isAdmin&&!item.fixo;
      html+=`<div class="estoque-card${baixo?" estoque-baixo":""}">
        <div class="estoque-top">
          <div><div class="estoque-nome">${item.nome}${item.fixo?'<span class="tag-fixo">🔒</span>':""}</div>
            ${item.descricao?`<div class="estoque-desc">${item.descricao}</div>`:""}</div>
          <div><div class="estoque-qtd${baixo?" baixo":""}">${item.quantidade}</div>
            <div class="estoque-unit">${item.unidade}</div></div>
        </div>
        ${item.quantidade_minima>0?`<div class="estoque-min">Mínimo: ${item.quantidade_minima} ${item.unidade}</div>`:""}
        <div class="estoque-acoes">
          ${canEdit?`<div class="est-btns">
            <button class="cbtn minus" onclick="ajEst(${item.id},${item.quantidade},-10)">−10</button>
            <button class="cbtn minus" onclick="ajEst(${item.id},${item.quantidade},-5)">−5</button>
            <button class="cbtn minus" onclick="ajEst(${item.id},${item.quantidade},-1)">−1</button>
            <button class="cbtn plus"  onclick="ajEst(${item.id},${item.quantidade},+1)">+1</button>
            <button class="cbtn plus"  onclick="ajEst(${item.id},${item.quantidade},+5)">+5</button>
            <button class="cbtn plus"  onclick="ajEst(${item.id},${item.quantidade},+10)">+10</button>
          </div>`:""}
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
            ${canEdit?`<button class="btn-sm blue" onclick="editarEst(${item.id})">✏️ Editar</button>`:""}
            ${canDelete?`<button class="btn-sm red" onclick="delEst(${item.id},'${esc(item.nome)}')">🗑️</button>`:""}
            ${item.fixo&&!_isAdmin?`<span style="font-size:10px;color:#8ca0c0">🔒 Só admin exclui</span>`:""}
          </div>
        </div>
      </div>`;
    });
    html+="</div></div>";
  }
  c.innerHTML=html;
}
async function ajEst(id,qtd,delta){
  const nova=Math.max(0,qtd+delta);
  try{
    const r=await fetch(`/api/estoque/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({quantidade:nova})});
    const d=await r.json();
    if(!r.ok)return toast(d.erro||"Erro.","error");
    await carregarEstoque();
  }catch{toast("Erro de conexão.","error");}
}
async function criarItemEstoque(){
  const nome=document.getElementById("est_nome")?.value.trim();
  if(!nome)return toast("Nome do item é obrigatório.","error");
  const btn=document.getElementById("btnAddEstoque");
  if(btn){btn.innerHTML='<span class="spinner"></span>Salvando...';btn.disabled=true;}
  try{
    const r=await fetch("/api/estoque",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({nome,categoria:document.getElementById("est_categoria").value,
        quantidade:parseInt(document.getElementById("est_qtd").value)||0,
        quantidade_minima:parseInt(document.getElementById("est_qtd_min").value)||0,
        unidade:document.getElementById("est_unidade").value,
        descricao:document.getElementById("est_desc")?.value||""})});
    const d=await r.json();
    if(r.ok&&d.ok){
      toast("✅ Item adicionado ao estoque!","success");
      ["est_nome","est_desc"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
      document.getElementById("est_qtd").value="0";
      document.getElementById("est_qtd_min").value="0";
      await carregarEstoque();
    }else toast(d.erro||"Erro ao salvar.","error");
  }catch(e){toast("Erro de conexão.","error");}
  if(btn){btn.innerHTML="📦 Adicionar ao Estoque";btn.disabled=false;}
}
function editarEst(id){
  fetch("/api/estoque").then(r=>r.json()).then(list=>{
    const item=list.find(i=>i.id===id); if(!item)return;
    abrirModal(`✏️ Editar — ${item.nome}`,`
      <div style="display:grid;gap:10px">
        ${!item.fixo?`<div class="field-group"><label>Nome</label><input class="field-input" id="m_nome" value="${esc(item.nome)}"></div>
        <div class="field-group"><label>Categoria</label><input class="field-input" id="m_cat" value="${esc(item.categoria)}"></div>`
        :`<input type="hidden" id="m_nome" value="${esc(item.nome)}"><input type="hidden" id="m_cat" value="${esc(item.categoria)}">`}
        <div class="field-group"><label>Quantidade Disponível</label>
          <input type="number" class="field-input" id="m_qtd" value="${item.quantidade}" min="0"></div>
        ${!item.fixo?`<div class="field-group"><label>Quantidade Mínima (alerta)</label>
          <input type="number" class="field-input" id="m_qtdmin" value="${item.quantidade_minima}" min="0"></div>`
        :`<input type="hidden" id="m_qtdmin" value="${item.quantidade_minima}">`}
      </div>
      <button class="btn-primary-lg" onclick="salvarEditEst(${id})" style="margin-top:14px;padding:12px;font-size:13px">💾 Salvar</button>`);
  });
}
async function salvarEditEst(id){
  const r=await fetch(`/api/estoque/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome:document.getElementById("m_nome").value,
      categoria:document.getElementById("m_cat").value,
      quantidade:parseInt(document.getElementById("m_qtd").value)||0,
      quantidade_minima:parseInt(document.getElementById("m_qtdmin").value)||0})});
  const d=await r.json();
  if(r.ok&&d.ok){toast("✅ Atualizado!","success");fecharModal();await carregarEstoque();}
  else toast(d.erro||"Erro.","error");
}
async function delEst(id,nome){
  if(!confirm(`Excluir "${nome}"?`))return;
  const r=await fetch(`/api/estoque/${id}`,{method:"DELETE"});
  const d=await r.json();
  if(r.ok&&d.ok){toast("Removido.","info");await carregarEstoque();}
  else toast(d.erro||"Erro.","error");
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function carregarDashboard(){
  const ano=document.getElementById("dash_ano")?.value||new Date().getFullYear();
  const r=await fetch(`/api/dashboard?ano=${ano}`); const d=await r.json();
  const g=d.resumo||{};

  // Stats
  const stats={st_dash_cultos:"total_cultos",st_dash_presentes:"total_presentes",
    st_dash_visitantes:"total_visitantes",st_dash_criancas:"total_criancas"};
  Object.entries(stats).forEach(([eid,key])=>{
    const el=document.getElementById(eid); if(el)el.textContent=g[key]||0;
  });

  // Gráfico mensal
  renderGraficoMensal(d.mensal||[]);

  // Por tipo
  renderGraficoPorTipo(d.por_tipo||[]);

  // Insights
  const ins=document.getElementById("dash_insights");
  if(ins)ins.innerHTML=(d.insights||[]).map(i=>`<div class="insight-item">${i}</div>`).join("")||
    `<div class="insight-item">📊 Sem dados suficientes para insights ainda.</div>`;

  // Top GCs
  const tgc=document.getElementById("dash_top_gcs");
  if(tgc&&d.top_gcs?.length){
    tgc.innerHTML=d.top_gcs.map((g,i)=>`
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #EEF2F9">
        <div style="font-family:'Bebas Neue';font-size:20px;color:${i===0?"#D97706":"#8CA0C0"};width:22px">${i+1}°</div>
        <div style="flex:1;font-weight:600;font-size:13px">${g.gc_nome}</div>
        <div style="font-family:'Bebas Neue';font-size:18px;color:#0A2463">${g.direcionamentos}</div>
      </div>`).join("");
  }else if(tgc){tgc.innerHTML="<p style='color:#8ca0c0;font-size:13px'>Sem direcionamentos ainda.</p>";}
}

function renderGraficoMensal(mensal){
  const wrap=document.getElementById("grafico_mensal"); if(!wrap)return;
  if(!mensal.length){wrap.innerHTML="<p style='color:#8ca0c0;font-size:13px;text-align:center;padding:20px'>Sem dados para este ano.</p>";return;}
  const maxVal=Math.max(...mensal.map(m=>m.presentes),1);
  const meses=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  wrap.innerHTML=`<div class="chart-bars">
    ${mensal.map(m=>{
      const mes=meses[parseInt(m.mes.split("-")[1])-1];
      const h=Math.round((m.presentes/maxVal)*100);
      const hv=Math.round((m.visitantes/maxVal)*100);
      return`<div class="bar-col">
        <div class="bar-fill" style="height:${h}px;background:#1B4FA8;width:45%;margin-right:2px;display:inline-block;vertical-align:bottom" data-val="${m.presentes}" title="${m.presentes} presentes"></div>
        <div class="bar-fill" style="height:${hv}px;background:#56B4D3;width:45%;display:inline-block;vertical-align:bottom" data-val="${m.visitantes}" title="${m.visitantes} visitantes"></div>
        <div class="bar-lbl">${mes}</div>
      </div>`;
    }).join("")}
  </div>
  <div class="legend" style="margin-top:10px">
    <div class="legend-item"><div class="legend-dot" style="background:#1B4FA8"></div>Presentes</div>
    <div class="legend-item"><div class="legend-dot" style="background:#56B4D3"></div>Visitantes</div>
  </div>`;
}

function renderGraficoPorTipo(porTipo){
  const wrap=document.getElementById("grafico_tipo"); if(!wrap)return;
  if(!porTipo.length){wrap.innerHTML="<p style='color:#8ca0c0;font-size:13px'>Sem dados.</p>";return;}
  const maxVal=Math.max(...porTipo.map(t=>t.total_presentes),1);
  const cores={"Culto Regular":"#1B4FA8","NAREAL":"#7C3AED","Evento":"#C2185B","Reunião de Líderes":"#D69E2E","Culto de GC":"#38A169","Outro":"#8CA0C0"};
  wrap.innerHTML=`<div class="tipo-list">
    ${porTipo.map(t=>{
      const pct=Math.round(t.total_presentes/maxVal*100);
      return`<div class="tipo-row">
        <div class="tipo-name">${t.tipo_culto||"Outro"}</div>
        <div class="tipo-bar-bg"><div class="tipo-bar-fill" style="width:${pct}%;background:${cores[t.tipo_culto]||"#8CA0C0"}"></div></div>
        <div class="tipo-count">${t.total_presentes}</div>
      </div>`;
    }).join("")}
  </div>`;
}

// ── RELATÓRIOS ────────────────────────────────────────────────
async function buscarRelatorio(){
  const per=document.getElementById("f_periodo")?.value;
  const ini=document.getElementById("f_data_ini")?.value;
  const fim=document.getElementById("f_data_fim")?.value;
  const tpc=document.getElementById("f_tipo_culto")?.value;
  const params=new URLSearchParams();
  if(per)params.append("periodo",per); if(ini)params.append("data_ini",ini);
  if(fim)params.append("data_fim",fim); if(tpc)params.append("tipo_culto",tpc);
  const r=await fetch(`/api/cultos?${params}`); const list=await r.json();
  const body=document.getElementById("bodyRelatorio");
  if(!list.length){body.innerHTML=`<tr><td colspan="10" style="text-align:center;padding:28px;color:#8ca0c0">Nenhum registro encontrado</td></tr>`;return;}
  body.innerHTML=list.map(c=>`<tr>
    <td><strong>${c.data_br||fmtBR(c.data)}</strong></td>
    <td style="color:#4A6080">${c.dia_semana}</td>
    <td><span class="badge ${tipoBadgeClass(c.tipo_culto)}">${c.tipo_culto||"—"}</span></td>
    <td><span class="badge badge-${c.periodo==="Manhã"?"manha":c.periodo==="Tarde"?"tarde":"noite"}">${c.periodo}</span></td>
    <td>${c.hora}</td><td><strong>${c.responsavel}</strong></td>
    <td><strong style="color:#0A2463">${c.presentes}</strong></td>
    <td><strong style="color:#1B4FA8">${c.visitantes}</strong></td>
    <td><strong style="color:#3E7CB1">${c.criancas}</strong></td>
    <td>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn-sm blue" onclick="verDetalhes(${c.id})">Ver</button>
        ${_isLider?`<button class="btn-sm purple" onclick="abrirEdicaoCulto(${c.id})">✏️</button>`:""}
        ${_isLider?`<button class="btn-sm red" onclick="deletarCulto(${c.id})">✕</button>`:""}
      </div>
    </td></tr>`).join("");
}
async function verDetalhes(id){
  const r=await fetch(`/api/cultos/${id}`); const d=await r.json(); const c=d.culto;
  abrirModal(`Detalhes — ${c.data_br||fmtBR(c.data)}`,`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;margin-bottom:14px">
      <div><strong>Data:</strong><br>${c.data_br||fmtBR(c.data)}</div>
      <div><strong>Horário:</strong><br>${c.hora}</div>
      <div><strong>Tipo:</strong><br><span class="badge ${tipoBadgeClass(c.tipo_culto)}">${c.tipo_culto||"—"}</span></div>
      <div><strong>Período:</strong><br>${c.periodo}</div>
      <div style="grid-column:1/-1"><strong>Responsável:</strong> ${c.responsavel}</div>
      ${c.editado_em?`<div style="grid-column:1/-1;font-size:11px;color:#8ca0c0">Última edição: ${c.editado_em?.substring(0,16)} por ${c.editado_por}</div>`:""}
      <div style="background:#EBF8FF;padding:10px;border-radius:8px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#0A2463;font-family:'Bebas Neue',sans-serif">${c.presentes}</div>
        <div style="font-size:10px;color:#8ca0c0;text-transform:uppercase">Presentes</div></div>
      <div style="background:#F0FFF4;padding:10px;border-radius:8px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#276749;font-family:'Bebas Neue',sans-serif">${c.visitantes}</div>
        <div style="font-size:10px;color:#8ca0c0;text-transform:uppercase">Visitantes</div></div>
    </div>
    ${c.observacoes?`<div style="background:#F8FAFF;border:1px solid #D8E4F0;border-radius:8px;padding:10px;font-size:13px;color:#4A6080"><strong>Obs:</strong> ${c.observacoes}</div>`:""}`);
}
async function deletarCulto(id){
  if(!_isLider)return toast("Sem permissão.","error");
  if(!confirm("Excluir este registro de culto?"))return;
  await fetch(`/api/cultos/${id}`,{method:"DELETE"});
  toast("Registro excluído.","info"); buscarRelatorio();
}
function exportarExcel(){
  const per=document.getElementById("f_periodo")?.value;
  const ini=document.getElementById("f_data_ini")?.value;
  const fim=document.getElementById("f_data_fim")?.value;
  const p=new URLSearchParams();
  if(per)p.append("periodo",per); if(ini)p.append("data_ini",ini); if(fim)p.append("data_fim",fim);
  window.location.href=`/api/exportar_excel?${p}`;
  toast("⬇️ Gerando Excel...","info");
}
function exportarPDF(){
  const per=document.getElementById("f_periodo")?.value;
  const ini=document.getElementById("f_data_ini")?.value;
  const fim=document.getElementById("f_data_fim")?.value;
  const p=new URLSearchParams();
  if(per)p.append("periodo",per); if(ini)p.append("data_ini",ini); if(fim)p.append("data_fim",fim);
  window.open(`/api/exportar_pdf?${p}`,"_blank");
  toast("📄 PDF aberto! Use Ctrl+P → Salvar como PDF.","info");
}

// ── RESUMO ────────────────────────────────────────────────────
async function carregarResumo(){
  const r=await fetch("/api/resumo"); const d=await r.json(); const g=d.geral;
  ["st_cultos","st_presentes","st_visitantes","st_criancas","st_media_presentes","st_media_visitantes","st_media_criancas"]
    .forEach((id,i)=>{const keys=["total_cultos","total_presentes","total_visitantes","total_criancas","media_presentes","media_visitantes","media_criancas"];const el=document.getElementById(id);if(el)el.textContent=g[keys[i]]||0;});
  const bp=document.getElementById("bodyPeriodo");
  if(bp)bp.innerHTML=d.por_periodo.length?d.por_periodo.map(p=>`<tr><td><strong>${p.periodo}</strong></td><td>${p.qtd}</td><td>${p.tp}</td><td>${p.mp}</td></tr>`).join("")
    :`<tr><td colspan="4" style="text-align:center;padding:16px;color:#8ca0c0">Sem dados</td></tr>`;
  const uc=document.getElementById("ultimosCultos");
  if(uc)uc.innerHTML=d.ultimos.length?d.ultimos.map(c=>`
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #EEF2F9">
      <div style="background:#EBF8FF;border-radius:8px;padding:6px 9px;text-align:center;min-width:50px">
        <div style="font-size:18px;font-weight:800;color:#0A2463;font-family:'Bebas Neue',sans-serif">${c.presentes}</div>
        <div style="font-size:9px;color:#8ca0c0;text-transform:uppercase">pres.</div></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px">${c.data_br||fmtBR(c.data)} — ${c.dia_semana}</div>
        <div style="font-size:11px;color:#8ca0c0">${c.tipo_culto||c.periodo} · ${c.responsavel}</div></div>
      <div style="text-align:right;font-size:11px;color:#8ca0c0">${c.visitantes} vis.<br>${c.criancas} cr.</div>
    </div>`).join(""):"<p style='text-align:center;padding:20px;color:#8ca0c0'>Nenhum culto registrado.</p>";
}

// ── USUÁRIOS (admin) ──────────────────────────────────────────
async function criarUsuario(){
  const nome =document.getElementById("nu_nome").value.trim();
  const email=document.getElementById("nu_email").value.trim().toLowerCase();
  const senha=document.getElementById("nu_senha").value;
  const conf =document.getElementById("nu_conf_senha").value;
  const cargo=document.getElementById("nu_cargo").value;
  if(!nome||!email||!senha)return toast("Preencha todos os campos.","error");
  const r=await fetch("/api/usuarios",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome,email,senha,confirmar_senha:conf,cargo})});
  const d=await r.json();
  if(r.ok&&d.ok){toast("✅ Usuário criado!","success");["nu_nome","nu_email","nu_senha","nu_conf_senha"].forEach(id=>document.getElementById(id).value="");carregarUsuarios();}
  else toast(d.erro||"Erro ao criar usuário.","error");
}
async function carregarUsuarios(){
  const c=document.getElementById("listaUsuarios"); if(!c)return;
  c.innerHTML="<div class='loading-msg'>Carregando...</div>";
  const r=await fetch("/api/usuarios"); const list=await r.json();
  const RL={"admin":"Administrador","lider":"Líder","voluntario":"Voluntário"};
  const RC={"admin":"role-admin","lider":"role-lider","voluntario":"role-voluntario"};
  c.innerHTML=list.map(u=>`
    <div class="usuario-card">
      <div class="usuario-av">${u.nome.charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="usuario-nome">${u.nome}<span class="badge-role ${RC[u.cargo]||""}">${RL[u.cargo]||u.cargo}</span>${!u.ativo?'<span class="badge-role" style="background:#E53E3E">Inativo</span>':""}</div>
        <div class="usuario-email">${u.email}</div>
        ${u.ultimo_acesso?`<div style="font-size:10px;color:#8ca0c0">Último acesso: ${u.ultimo_acesso?.substring(0,16)||"—"}</div>`:""}
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="btn-sm blue" onclick="modalSenha(${u.id},'${esc(u.nome)}')">🔑 Senha</button>
        <button class="btn-sm red"  onclick="deletarUser(${u.id},'${esc(u.nome)}')">🗑️</button>
      </div>
    </div>`).join("");
}
function modalSenha(uid,nome){
  abrirModal(`🔑 Alterar Senha — ${nome}`,`
    <div style="display:grid;gap:10px">
      <div class="field-group"><label>Nova Senha</label>
        <div class="pw-wrap"><input type="password" class="field-input" id="modal_senha" placeholder="Mínimo 8 caracteres, 1 maiúscula, 1 número">
          <button class="pw-eye" onclick="toggleSenha('modal_senha')" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        </div></div>
      <div class="field-group"><label>Confirmar Nova Senha</label>
        <div class="pw-wrap"><input type="password" class="field-input" id="modal_conf_senha" placeholder="Repita a senha">
          <button class="pw-eye" onclick="toggleSenha('modal_conf_senha')" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        </div></div>
    </div>
    <button class="btn-primary-lg" onclick="confirmarSenha(${uid})" style="margin-top:14px;padding:12px;font-size:13px">💾 Salvar Nova Senha</button>`);
}
async function confirmarSenha(uid){
  const nova=document.getElementById("modal_senha").value;
  const conf=document.getElementById("modal_conf_senha").value;
  const r=await fetch(`/api/usuarios/${uid}`,{method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nova_senha:nova,confirmar_nova_senha:conf})});
  const d=await r.json();
  if(r.ok&&d.ok){toast("✅ Senha alterada com segurança!","success");fecharModal();}
  else toast(d.erro||"Erro.","error");
}
async function deletarUser(uid,nome){
  if(!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`))return;
  const r=await fetch(`/api/usuarios/${uid}`,{method:"DELETE"});
  const d=await r.json();
  if(r.ok&&d.ok){toast("Usuário removido.","info");carregarUsuarios();}
  else toast(d.erro||"Erro.","error");
}

// ── IA CONTAGEM ───────────────────────────────────────────────
async function carregarCameras(){
  const sel=document.getElementById("ia_camera_id"); if(!sel)return;
  const r=await fetch("/api/cameras"); const list=await r.json();
  const prev=sel.value; sel.innerHTML="<option value=''>— Selecione câmera —</option>";
  list.forEach(c=>{const o=document.createElement("option");o.value=c.id;o.textContent=`${c.nome} (${c.local})`;sel.appendChild(o);});
  if(prev)sel.value=prev;
  const ld=document.getElementById("cameras_lista"); if(!ld)return;
  ld.innerHTML=list.length?list.map(c=>`
    <div style="display:flex;align-items:center;gap:9px;padding:8px 11px;border:1px solid #D8E4F0;border-radius:8px;margin-bottom:5px;background:#F8FAFF">
      <span>📷</span><div style="flex:1"><div style="font-weight:700;font-size:13px">${c.nome}</div>
        <div style="font-size:11px;color:#8ca0c0">${c.local} — ${c.url}</div></div>
      ${_isAdmin?`<button class="btn-sm red" onclick="delCamera(${c.id})">🗑️</button>`:""}
    </div>`).join(""):"<p style='color:#8ca0c0;font-size:13px'>Nenhuma câmera.</p>";
}
async function iniciarSessaoIA(){
  const camId=document.getElementById("ia_camera_id")?.value;
  const cultoId=document.getElementById("ia_culto_id")?.value||null;
  if(!camId)return toast("Selecione uma câmera.","error");
  const sel=document.getElementById("ia_camera_id");
  const camNome=sel.options[sel.selectedIndex]?.text||"";
  const r=await fetch("/api/contagem/sessoes",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({culto_id:cultoId,camera_id:camId,camera_nome:camNome})});
  const d=await r.json();
  if(r.ok&&d.ok){
    _iaSessaoId=d.id; toast(`✅ Sessão #${d.id} iniciada!`,"success");
    document.getElementById("ia_sessao_ativa").style.display="block";
    document.getElementById("ia_sessao_id_label").textContent=d.id;
    _iaTimer=setInterval(atualizarTempoReal,3000); atualizarTempoReal();
  }else toast(d.erro||"Erro.","error");
}
async function atualizarTempoReal(){
  if(!_iaSessaoId)return;
  const r=await fetch(`/api/contagem/tempo_real/${_iaSessaoId}`); if(!r.ok)return;
  const d=await r.json();
  document.getElementById("ia_entradas").textContent=d.entradas||0;
  document.getElementById("ia_saidas").textContent=d.saidas||0;
  document.getElementById("ia_dentro").textContent=d.dentro_agora||0;
}
async function encerrarSessaoIA(){
  if(!_iaSessaoId)return;
  await fetch(`/api/contagem/sessoes/${_iaSessaoId}/encerrar`,{method:"POST"});
  clearInterval(_iaTimer); _iaTimer=null;
  toast(`Sessão #${_iaSessaoId} encerrada.`,"info");
  _iaSessaoId=null; document.getElementById("ia_sessao_ativa").style.display="none";
  carregarSessoesIA();
}
async function carregarSessoesIA(){
  const c=document.getElementById("ia_historico"); if(!c)return;
  const r=await fetch("/api/contagem/sessoes"); const list=await r.json();
  if(!list.length){c.innerHTML="<p style='color:#8ca0c0;font-size:13px;padding:14px'>Nenhuma sessão ainda.</p>";return;}
  c.innerHTML=`<div class="table-wrap"><table class="data-table"><thead><tr><th>Início</th><th>Culto</th><th>Câmera</th><th>Entradas</th><th>Saídas</th><th>Dentro</th><th>Status</th></tr></thead>
    <tbody>${list.map(s=>`<tr><td>${s.iniciado_em?.substring(0,16)||""}</td>
      <td>${s.culto_data_br?s.culto_data_br+" "+s.periodo:"—"}</td><td>${s.camera_nome||"—"}</td>
      <td style="color:#38A169;font-weight:700">${s.total_entradas}</td>
      <td style="color:#E53E3E;font-weight:700">${s.total_saidas}</td>
      <td style="color:#0A2463;font-weight:700">${Math.max(0,s.total_entradas-s.total_saidas)}</td>
      <td><span style="padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;background:${s.status==="ativa"?"#C6EFCE":"#EEF2F9"};color:${s.status==="ativa"?"#375623":"#4A6080"}">${s.status}</span></td>
    </tr>`).join("")}</tbody></table></div>`;
}
async function adicionarCamera(){
  const nome=document.getElementById("cam_nome")?.value.trim();
  const url =document.getElementById("cam_url")?.value.trim();
  if(!nome)return toast("Nome obrigatório.","error");
  const r=await fetch("/api/cameras",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome,url:url||"0",local:document.getElementById("cam_local")?.value||""})});
  const d=await r.json();
  if(r.ok&&d.ok){toast("✅ Câmera adicionada!","success");["cam_nome","cam_url","cam_local"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});carregarCameras();}
  else toast(d.erro||"Erro.","error");
}
async function delCamera(id){
  if(!confirm("Remover câmera?"))return;
  await fetch(`/api/cameras/${id}`,{method:"DELETE"});
  toast("Câmera removida.","info"); carregarCameras();
}

// ── LOGS ──────────────────────────────────────────────────────





// ── VOLUNTÁRIOS ────────────────────────────────────────────
async function carregarVoluntarios(){
  const c = document.getElementById("lista_voluntarios"); if(!c)return;
  const r = await fetch("/api/voluntarios"); const list = await r.json();
  if(!list.length){c.innerHTML='<p style="color:#8ca0c0;font-size:13px">Nenhum voluntário cadastrado.</p>';return;}
  c.innerHTML = list.map(v=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #EEF2F9">
      <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#0A2463,#56B4D3);
        display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:14px;flex-shrink:0">${v.nome.charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;color:#0A2463">${v.nome}</div>
        <div style="font-size:11px;color:#8ca0c0">📱 ${v.telefone}${v.departamentos?" · "+v.departamentos:""}</div>
      </div>
      ${_isLider?`<button class="btn-sm red" onclick="delVoluntario(${v.id})">✕</button>`:""}
    </div>`).join("");
}

async function salvarVoluntario(){
  const nome = document.getElementById("vol_nome")?.value.trim();
  const tel  = document.getElementById("vol_tel")?.value.trim();
  const dep  = document.getElementById("vol_dep")?.value.trim()||"";
  if(!nome||!tel)return toast("Nome e telefone são obrigatórios.","error");
  const r = await fetch("/api/voluntarios",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome,telefone:tel,departamentos:dep})});
  const d = await r.json();
  if(r.ok&&d.ok){
    toast("✅ Voluntário adicionado!","success");
    document.getElementById("vol_nome").value="";
    document.getElementById("vol_tel").value="";
    if(document.getElementById("vol_dep"))document.getElementById("vol_dep").value="";
    carregarVoluntarios();
  }else toast(d.erro||"Erro.","error");
}

async function delVoluntario(id){
  if(!confirm("Remover voluntário?"))return;
  await fetch(`/api/voluntarios/${id}`,{method:"DELETE"});
  toast("Removido.","info"); carregarVoluntarios();
}

// ── PUBLICAR ESCALA ─────────────────────────────────────────
async function publicarEscala(){
  const mes = document.getElementById("escala_mes")?.value;
  if(!mes)return toast("Selecione um mês.","error");
  if(!confirm(`Publicar a escala de ${mes}?\nApós publicar, os voluntários poderão confirmar via WhatsApp.`))return;
  const r = await fetch("/api/escala/publicar",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({mes})});
  const d = await r.json();
  if(r.ok&&d.ok){toast("✅ Escala publicada!","success");verificarStatusEscala();}
  else toast(d.erro||"Erro.","error");
}

async function reabrirEscala(){
  const mes = document.getElementById("escala_mes")?.value;
  if(!confirm("Reabrir a escala para edição?"))return;
  const r = await fetch("/api/escala/reabrir",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({mes})});
  const d = await r.json();
  if(r.ok&&d.ok){toast("✅ Escala reaberta para edição.","info");verificarStatusEscala();}
}

async function verificarStatusEscala(){
  const mes = document.getElementById("escala_mes")?.value; if(!mes)return;
  const r = await fetch(`/api/escala/status/${mes}`); const d = await r.json();
  const publicada = d.status==="publicada";
  const statusEl = document.getElementById("escala_status_badge");
  const btnPub   = document.getElementById("btnPublicar");
  const btnReab  = document.getElementById("btnReabrir");
  if(statusEl){
    statusEl.textContent = publicada ? "✅ Publicada" : "✏️ Rascunho";
    statusEl.style.background = publicada ? "#D1FAE5" : "#FEF3C7";
    statusEl.style.color = publicada ? "#065F46" : "#92400E";
  }
  if(btnPub)  btnPub.style.display  = publicada ? "none" : "";
  if(btnReab) btnReab.style.display = publicada ? "" : "none";
}

// ── NOTIFICAR VIA WHATSAPP ──────────────────────────────────
async function notificarVoluntarios(){
  const mes = document.getElementById("escala_mes")?.value;
  if(!mes)return toast("Selecione um mês.","error");
  const btn = document.getElementById("btnNotificar");
  btn.innerHTML='<span class="spinner"></span>Gerando links...'; btn.disabled=true;
  const r = await fetch("/api/escala/notificar",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({mes})});
  const d = await r.json();
  btn.innerHTML="📲 Notificar via WhatsApp"; btn.disabled=false;
  if(!r.ok||!d.ok)return toast(d.erro||"Erro ao gerar notificações.","error");
  // Abre modal com lista de links
  const linhas = d.notificacoes.map(n=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #EEF2F9">
      <div style="width:34px;height:34px;border-radius:50%;background:${n.tem_telefone?"linear-gradient(135deg,#0A2463,#56B4D3)":"#F1F5F9"};
        display:flex;align-items:center;justify-content:center;font-weight:700;color:${n.tem_telefone?"#fff":"#94A3B8"};font-size:14px;flex-shrink:0">${n.nome.charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;color:#0A2463">${n.nome}</div>
        <div style="font-size:11px;color:#8ca0c0">${n.qtd_escalas} escala(s) · ${n.tem_telefone?n.telefone:"sem telefone cadastrado"}</div>
      </div>
      ${n.wa_link?`<a href="${n.wa_link}" target="_blank" style="text-decoration:none">
        <button class="btn-sm green" style="background:#25D366;color:#fff;border:none;padding:5px 12px">📲 Enviar</button>
      </a>`:`<span style="font-size:10px;color:#EF4444">Sem telefone</span>`}
    </div>`).join("");
  abrirModal(`📲 Notificar ${d.total} voluntário(s)`,`
    <div class="info-box" style="margin-bottom:12px">Clique em <strong>Enviar</strong> para abrir o WhatsApp com a mensagem pronta. O voluntário receberá o link de confirmação.</div>
    <div style="max-height:60vh;overflow-y:auto">${linhas}</div>`,"wide");
}

// ── CONFIRMAÇÕES ────────────────────────────────────────────
async function verConfirmacoes(){
  const mes = document.getElementById("escala_mes")?.value||"";
  const r = await fetch(`/api/escala/confirmacoes_admin?mes=${mes}`);
  const list = await r.json();
  if(!list.length){toast("Nenhuma resposta ainda.","info");return;}
  const pend = list.filter(c=>c.status==="pendente").length;
  const conf = list.filter(c=>c.status==="confirmado").length;
  const rec  = list.filter(c=>c.status==="recusado").length;
  const html = `
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <span style="background:#D1FAE5;color:#065F46;padding:4px 12px;border-radius:8px;font-size:12px;font-weight:700">✅ ${conf} confirmados</span>
      <span style="background:#FEE2E2;color:#991B1B;padding:4px 12px;border-radius:8px;font-size:12px;font-weight:700">❌ ${rec} trocas</span>
      <span style="background:#FEF3C7;color:#92400E;padding:4px 12px;border-radius:8px;font-size:12px;font-weight:700">⏳ ${pend} pendentes</span>
    </div>
    <div style="max-height:55vh;overflow-y:auto">
      ${list.map(c=>`<div style="padding:9px 0;border-bottom:1px solid #EEF2F9;display:flex;align-items:flex-start;gap:10px">
        <span style="padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;background:${c.status==="confirmado"?"#D1FAE5":c.status==="recusado"?"#FEE2E2":"#FEF3C7"};color:${c.status==="confirmado"?"#065F46":c.status==="recusado"?"#991B1B":"#92400E"};flex-shrink:0">${c.status}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px">${c.voluntario_nome}</div>
          <div style="font-size:11px;color:#8ca0c0">${c.data_br} · ${c.culto_periodo} · ${c.departamento}</div>
          ${c.sugestao_troca?`<div style="font-size:11px;color:#991B1B;margin-top:3px;font-style:italic">↪ ${c.sugestao_troca}</div>`:""}
        </div>
      </div>`).join("")}
    </div>`;
  abrirModal(`Respostas da escala — ${mes}`, html, "wide");
}
// ── ESCALAS ────────────────────────────────────────────────
async function carregarVisualizacaoEscala(){
  const mes = document.getElementById("escala_mes")?.value;
  const per = document.getElementById("escala_periodo")?.value||"";
  verificarStatusEscala();
  const cont = document.getElementById("escala_visualizacao");
  if(!mes){cont.innerHTML='<div class="loading-msg">Selecione um mês.</div>';return;}
  cont.innerHTML='<div class="loading-msg">Carregando escala...</div>';
  try{
    const [rDatas,rItens,rDeptos] = await Promise.all([
      fetch(`/api/escala/datas?mes=${mes}`),
      fetch(`/api/escala?mes=${mes}${per?"&periodo="+encodeURIComponent(per):""}`),
      fetch("/api/departamentos")
    ]);
    const datas  = await rDatas.json();
    const itens  = await rItens.json();
    const deptos = await rDeptos.json();
    const datasF = per ? datas.filter(d=>d.periodo===per) : datas;
    if(!datasF.length){cont.innerHTML='<div class="empty-state"><p>Nenhum culto neste mês.</p></div>';return;}

    // Monta mapa de itens
    const mapa = {};
    itens.forEach(i=>mapa[`${i.departamento_id}_${i.culto_data}_${i.culto_periodo}`]=i.responsavel||"");

    // Agrupa por período
    const periodos={};
    datasF.forEach(d=>{if(!periodos[d.periodo])periodos[d.periodo]=[];periodos[d.periodo].push(d);});

    let html="";
    for(const [periodo,datasP] of Object.entries(periodos)){
      const corPer=periodo==="Manhã"?"#F59E0B":"#6366F1";
      const cols=`160px repeat(${datasP.length},1fr)`;
      html+=`<div class="form-card" style="margin-bottom:14px;overflow:hidden">
        <div style="background:${corPer};padding:9px 14px;display:flex;align-items:center;gap:7px">
          <span style="font-size:15px">${periodo==="Manhã"?"☀️":"🌙"}</span>
          <span style="font-size:13px;font-weight:800;color:#fff">DOMINGO — ${periodo.toUpperCase()}</span>
        </div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
          <table style="width:100%;border-collapse:collapse;min-width:400px;font-size:12px">
            <thead><tr style="background:#1E293B">
              <th style="color:rgba(255,255,255,.6);font-size:10px;padding:8px 12px;text-align:left;font-weight:600;white-space:nowrap">DEPARTAMENTO</th>
              ${datasP.map(d=>`<th style="color:#fff;font-size:11px;padding:8px;text-align:center;font-weight:700">
                <div style="font-size:15px;font-weight:800">${d.data_br}</div>
                <div style="font-size:9px;opacity:.6">${d.dia_semana.substring(0,3).toUpperCase()}</div>
              </th>`).join("")}
            </tr></thead>
            <tbody>
              ${deptos.map((dep,idx)=>`<tr style="border-bottom:1px solid #F1F5F9;background:${idx%2===0?"#fff":"#FAFBFF"}">
                <td style="padding:9px 12px;border-right:2px solid #E2E8F0">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:14px">${dep.icone||"👥"}</span>
                    <span style="font-weight:700;color:#0A2463;font-size:12px">${dep.nome}</span>
                  </div>
                </td>
                ${datasP.map(d=>{
                  const v=mapa[`${dep.id}_${d.data}_${d.periodo}`]||"";
                  return`<td style="padding:7px 8px;text-align:center;border-right:1px solid #F1F5F9">
                    <span style="font-size:12px;${v?"font-weight:600;color:#0A2463":"color:#CBD5E1"}">${v||"—"}</span>
                  </td>`;
                }).join("")}
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    }
    cont.innerHTML=html;
    // Carrega lista de deptos
    renderListaDeptos(deptos);
  }catch(e){cont.innerHTML='<div class="permission-alert">❌ Erro ao carregar escala.</div>';}
}

function renderListaDeptos(deptos){
  const el=document.getElementById("lista_deptos"); if(!el)return;
  if(!deptos||!deptos.length){el.innerHTML='<p style="color:#8ca0c0;font-size:13px">Nenhum departamento.</p>';return;}
  el.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px">
    ${deptos.map(d=>`<span style="background:#EBF5FF;color:#0A2463;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:5px">
      ${d.icone||"👥"} ${d.nome}
      ${_isAdmin?`<button style="background:none;border:none;cursor:pointer;color:#94A3B8;font-size:12px;padding:0 2px" onclick="delDepto(${d.id},'${d.nome.replace(/'/g,"\'")}')">✕</button>`:""}
    </span>`).join("")}
  </div>`;
}

async function adicionarDepto(){
  const nome=document.getElementById("novo_depto")?.value.trim();
  const icone=document.getElementById("novo_depto_icone")?.value.trim()||"👥";
  if(!nome)return toast("Digite o nome do departamento.","error");
  const r=await fetch("/api/departamentos",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome,icone})});
  const d=await r.json();
  if(r.ok&&d.ok){
    toast("✅ Departamento adicionado!","success");
    document.getElementById("novo_depto").value="";
    document.getElementById("novo_depto_icone").value="";
    carregarVisualizacaoEscala();
  }else toast(d.erro||"Erro.","error");
}

async function delDepto(id,nome){
  if(!confirm(`Remover "${nome}"?`))return;
  const r=await fetch(`/api/departamentos/${id}`,{method:"DELETE"});
  const d=await r.json();
  if(r.ok&&d.ok){toast("Departamento removido.","info");carregarVisualizacaoEscala();}
  else toast(d.erro||"Erro.","error");
}
// ── DASHBOARD GC ──────────────────────────────────────────────
function copiarLinkRelatorio(){
  const url = window.location.origin + "/relatorio-gc";
  copiarLink(url);
}

async function carregarDashGC(){
  // Mostra link do formulário
  const linkEl = document.getElementById("linkRelatorioGC");
  if(linkEl) linkEl.textContent = window.location.origin + "/relatorio-gc";

  try{
    const r = await fetch("/api/relatorios_gc/dashboard");
    if(!r.ok){
      // Sem permissão ou erro
      document.getElementById("dash_gc_por_gc").innerHTML =
        `<div class="permission-alert">❌ Erro ao carregar. Tente recarregar a página.</div>`;
      return;
    }
    const d = await r.json();

    // Stats
    const t = d.totais||{};
    document.getElementById("dg_relatorios").textContent = t.total_relatorios||0;
    document.getElementById("dg_membros").textContent    = t.total_membros||0;
    document.getElementById("dg_visitantes").textContent = t.total_visitantes||0;
    document.getElementById("dg_lideres").textContent    = t.total_lideres_trein||0;

    // Por GC
    const porGC = document.getElementById("dash_gc_por_gc");
    if(d.por_gc && d.por_gc.length){
      const maxMem = Math.max(...d.por_gc.map(g=>g.total_membros),1);
      porGC.innerHTML = d.por_gc.map(g=>`
        <div style="padding:10px 0;border-bottom:1px solid #EEF2F9;display:flex;align-items:center;gap:12px">
          <div style="min-width:160px;font-weight:700;font-size:13px;color:#0A2463">${g.gc_nome}</div>
          <div style="flex:1;background:#EEF2F9;border-radius:6px;height:10px;overflow:hidden">
            <div style="height:100%;width:${Math.round(g.total_membros/maxMem*100)}%;background:linear-gradient(90deg,#1B4FA8,#56B4D3);border-radius:6px"></div>
          </div>
          <div style="text-align:right;min-width:100px;font-size:12px">
            <span style="font-weight:700;color:#0A2463">${g.total_membros}</span> membros<br>
            <span style="color:#059669;font-weight:600">${g.total_visitantes}</span> visit.
          </div>
          <div style="font-size:10px;color:#8ca0c0;min-width:60px;text-align:right">${g.total_reunioes} reun.<br>Ult: ${g.ultima_reuniao?g.ultima_reuniao.substring(0,10).split("-").reverse().join("/"):"—"}</div>
        </div>`).join("");
    }else{
      porGC.innerHTML = '<p style="color:#8ca0c0;font-size:13px;padding:14px">Nenhum relatório enviado ainda.<br><a href="/relatorio-gc" target="_blank" style="color:#1B4FA8">👉 Abrir formulário de GC</a></p>';
    }

    // Últimos
    const ult = document.getElementById("dash_gc_ultimos");
    if(d.ultimos && d.ultimos.length){
      ult.innerHTML = `<table class="data-table">
        <thead><tr><th>Data</th><th>GC</th><th>Líder</th><th>Membros</th><th>Visit.</th><th>Trein.</th><th>Obs</th><th></th></tr></thead>
        <tbody>${d.ultimos.map(r=>`<tr>
          <td><strong>${r.dia_br||r.dia}</strong></td>
          <td>${r.gc_nome}</td>
          <td style="font-size:11px;color:#4A6080">${r.lider_nome}</td>
          <td><strong style="color:#0A2463">${r.membros_presentes}</strong></td>
          <td><strong style="color:#059669">${r.visitantes}</strong></td>
          <td>${r.lider_treinamento?'<span style="color:#7C3AED;font-weight:700">✓ Sim</span>':'Não'}</td>
          <td style="font-size:11px;color:#4A6080;max-width:150px;overflow:hidden;text-overflow:ellipsis">${r.observacoes||'—'}</td>
          <td>${_isLider?`<button class="btn-sm red" onclick="delRelatorioGC(${r.id})" style="font-size:10px">✕</button>`:''}</td>
        </tr>`).join("")}</tbody></table>`;
    }else{
      ult.innerHTML = '<p style="color:#8ca0c0;padding:14px;font-size:13px">Sem relatórios ainda.</p>';
    }
  }catch(e){ console.error("Erro dashboard GC",e); }
}

async function delRelatorioGC(id){
  if(!confirm("Excluir este relatório?"))return;
  const r = await fetch(`/api/relatorios_gc/${id}`,{method:"DELETE"});
  const d = await r.json();
  if(r.ok&&d.ok){toast("Relatório removido.","info");carregarDashGC();}
  else toast(d.erro||"Erro.","error");
}
// ── UTIL ──────────────────────────────────────────────────────
function esc(s){return String(s||"").replace(/'/g,"&#39;").replace(/"/g,"&quot;");}
function toggleSidebar(force){
  const sb=document.getElementById("sidebar");
  if(typeof force==="boolean")sb.classList.toggle("open",force);
  else sb.classList.toggle("open");
}
document.addEventListener("click",e=>{
  const sb=document.getElementById("sidebar"),mt=document.querySelector(".menu-toggle");
  if(sb&&sb.classList.contains("open")&&!sb.contains(e.target)&&mt&&!mt.contains(e.target))
    sb.classList.remove("open");
});
function toast(msg,tipo="info"){
  const el=document.getElementById("toast");
  el.textContent=msg; el.className=`toast show ${tipo}`;
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove("show"),3800);
}
function abrirModal(titulo,html,size=""){
  document.getElementById("modalTitle").textContent=titulo;
  document.getElementById("modalBody").innerHTML=html;
  const box=document.querySelector(".modal-box");
  box.className=`modal-box${size==="wide"?" wide":""}`;
  document.getElementById("modalOverlay").classList.add("open");
}
function fecharModal(){document.getElementById("modalOverlay").classList.remove("open");}
