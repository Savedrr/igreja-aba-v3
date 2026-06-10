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
  carregarDirecionamentos();
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
  _cargo=d.cargo; _isAdmin=(d.cargo==="admin"); _isLider=(d.cargo==="lider"||d.cargo==="admin"||d.cargo==="lider_depto");
  window._deptoId = d.departamento_id||null;
  window._deptoNome = d.departamento_nome||"";
  document.getElementById("userName").textContent=d.nome;
  const roleLabel={"admin":"Administrador","lider":"Líder","voluntario":"Voluntário","lider_depto":"Líder de Depto"};
  const roleClass={"admin":"role-admin","lider":"role-lider","voluntario":"role-voluntario","lider_depto":"role-lider"};
  document.getElementById("userRole").textContent=roleLabel[d.cargo]||d.cargo;
  document.getElementById("userAvatar").textContent=d.nome.charAt(0).toUpperCase();
  // Badge de cargo no sidebar
  const badgeEl=document.getElementById("roleBadge");
  if(badgeEl){badgeEl.textContent=roleLabel[d.cargo];badgeEl.className=`badge-role ${roleClass[d.cargo]}`;}
  // Controla itens de menu restritos
  document.getElementById("navUsuarios").style.display=_isAdmin?"":"none";
  const _nl=document.getElementById("navLogs"); if(_nl)_nl.style.display="none";
  // Voluntário não vê botão de criar usuário
  // Não preenche responsável automaticamente — usuário digita
  // Campo responsável fica em branco para o usuário preencher
  // Mostra aba usuários para admin
  if(_isAdmin){carregarUsuarios();}
  // Voluntário: oculta abas restritas no menu
  if(d.cargo==="voluntario"){
    ["gc","estoque","relatorios","usuarios","escalas","dash_gc"].forEach(tab=>{
      const nav=document.querySelector(`[data-tab="${tab}"]`);
      if(nav)nav.closest("li").style.display="none";
    });
  }
  // Lider de departamento: vê só a aba de escalas
  if(d.cargo==="lider_depto"){
    ["registro","checklist","visitantes","gc","estoque","relatorios","usuarios","dash_gc"].forEach(tab=>{
      const nav=document.querySelector(`[data-tab="${tab}"]`);
      if(nav)nav.closest("li").style.display="none";
    });
    // Mostra badge do departamento no sidebar
    const sub=document.querySelector(".brand-sub");
    if(sub&&window._deptoNome)sub.textContent=window._deptoNome;
    // Vai direto para escalas
    setTimeout(()=>ativarTab("escalas"),300);
  }
}
async function logout(){await fetch("/api/logout",{method:"POST"});window.location.href="/";}

// ── TABS ──────────────────────────────────────────────────────
const TAB_TITLES={registro:"Registro de Culto",checklist:"Checklist",visitantes:"Visitantes",
  gc:"Conecta GC",estoque:"Estoque",escalas:"Escalas",dashboard:"Relatórios",usuarios:"Usuários",
  dash_gc:"Gestão de GC",relatorios:"Relatórios",ia:"IA Contagem"};

function ativarTab(tab){
  // Dashboard e resumo agora vivem dentro de Relatórios (unificado)
  if(tab==="resumo"||tab==="dashboard") tab="relatorios";
  document.querySelectorAll(".tab-content").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
  const tabEl = document.getElementById("tab-"+tab);
  if(tabEl) tabEl.classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add("active");
  document.getElementById("topbarTitle").textContent=TAB_TITLES[tab]||tab;
  if(tab==="relatorios"){carregarDashboard();atualizarSelectCultos();buscarRelatorio();}
  if(tab==="dash_gc"){carregarDashGC();}
  if(tab==="escalas"){const hoje=new Date();document.getElementById("escala_mes").value=hoje.getFullYear()+"-"+String(hoje.getMonth()+1).padStart(2,"0");carregarVisualizacaoEscala();carregarVoluntarios();}
  if(tab==="visitantes"){carregarVisitantes();popularSelectVisitantes();}
  if(tab==="usuarios"&&_isAdmin){carregarUsuarios();carregarDeptosSelect();}
  if(tab==="gc"){carregarGCs();carregarDirecionamentos();popularSelectVisitantes();}
  if(tab==="estoque")carregarEstoque();
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
  if(r.ok&&d.ok){toast("✅ Relatório atualizado!","success");fecharModal();buscarRelatorio();carregarDashboard();}
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
        ${vidId?`<button class="btn-sm orange" style="margin-top:3px;font-size:10px;width:100%" onclick="confirmarDirecionamento('${vidId}','${gc.id}','${esc(gc.nome)}',${gc.distancia_km},'${gc.rota_link}')">✅ Confirmar</button>`:""}
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
        <div class="field-group"><label>Rede / Setor</label>
          <select class="field-input" id="egc_setor">
            ${["Verde","Laranja","Amarelo","Vermelho","Azul","Roxo"].map(s=>`<option${gc.setor===s?" selected":""}>${s}</option>`).join("")}
          </select></div>
        <div class="field-group"><label>Status</label>
          <select class="field-input" id="egc_ativo">
            <option value="1"${gc.ativo?" selected":""}>Ativo</option>
            <option value="0"${!gc.ativo?" selected":""}>Inativo</option>
          </select></div>
      </div>
      <p style="font-size:11px;color:#94A3B8;margin-top:10px">💡 Supervisor, GC de origem, metas e membros são gerenciados na aba <strong>Gestão de GC</strong>.</p>
      <button class="btn-primary-lg" onclick="salvarEdicaoGC(${id})" style="margin-top:14px;padding:12px;font-size:13px">💾 Salvar GC</button>`);
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
// Aplica todos os filtros de uma vez: painel + histórico + select de cultos
async function aplicarFiltrosRelatorio(){
  await atualizarSelectCultos();
  const cultoId=document.getElementById("f_culto_id")?.value;
  // Se um culto específico está selecionado, os cards vêm de buscarRelatorio (client-side).
  // Senão, o dashboard recalcula os cards normalmente.
  if(!cultoId) await carregarDashboard();
  else await carregarDashboardSemCards();
  buscarRelatorio();
}

// Versão do dashboard que NÃO sobrescreve os cards (usada quando há culto específico)
async function carregarDashboardSemCards(){
  window._pularCards = true;
  await carregarDashboard();
  window._pularCards = false;
}

async function buscarRelatorio(){
  const per=document.getElementById("f_periodo")?.value;
  const ini=document.getElementById("f_data_ini")?.value;
  const fim=document.getElementById("f_data_fim")?.value;
  const tpc=document.getElementById("f_tipo_culto")?.value;
  const cultoId=document.getElementById("f_culto_id")?.value;
  const params=new URLSearchParams();
  if(per)params.append("periodo",per); if(ini)params.append("data_ini",ini);
  if(fim)params.append("data_fim",fim); if(tpc)params.append("tipo_culto",tpc);
  const r=await fetch(`/api/cultos?${params}`); let list=await r.json();
  // Filtro de culto específico (client-side)
  if(cultoId) list = list.filter(c=>String(c.id)===String(cultoId));
  const body=document.getElementById("bodyRelatorio");
  if(!list.length){body.innerHTML=`<tr><td colspan="10" style="text-align:center;padding:28px;color:#8ca0c0">Nenhum registro encontrado</td></tr>`;}
  else{
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
  // Atualiza os cards de resumo com base na lista filtrada (reflete o culto selecionado)
  atualizarCardsResumo(list);
}

// Recalcula os cards de resumo a partir de uma lista de cultos
function atualizarCardsResumo(list){
  const el=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  const n=list.length;
  const sp=list.reduce((s,c)=>s+(c.presentes||0),0);
  const sv=list.reduce((s,c)=>s+(c.visitantes||0),0);
  const sc=list.reduce((s,c)=>s+(c.criancas||0),0);
  el("st_dash_cultos",n);
  el("st_dash_presentes",sp);
  el("st_dash_visitantes",sv);
  el("st_dash_criancas",sc);
  el("st_dash_media_p", n?Math.round(sp/n*10)/10:0);
  el("st_dash_media_v", n?Math.round(sv/n*10)/10:0);
}

// Chamado quando o usuário seleciona um culto específico
function onSelecionarCulto(){
  buscarRelatorio();
}

// Popula o select de culto específico conforme os filtros atuais
async function atualizarSelectCultos(){
  const sel = document.getElementById("f_culto_id");
  if(!sel) return;
  const per=document.getElementById("f_periodo")?.value;
  const ini=document.getElementById("f_data_ini")?.value;
  const fim=document.getElementById("f_data_fim")?.value;
  const tpc=document.getElementById("f_tipo_culto")?.value;
  const params=new URLSearchParams();
  if(per)params.append("periodo",per); if(ini)params.append("data_ini",ini);
  if(fim)params.append("data_fim",fim); if(tpc)params.append("tipo_culto",tpc);
  try{
    const r=await fetch(`/api/cultos?${params}`); const list=await r.json();
    const atual = sel.value;
    sel.innerHTML='<option value="">Todos os cultos</option>';
    list.forEach(c=>{
      const o=document.createElement("option");
      o.value=c.id;
      o.textContent=`${c.data_br||fmtBR(c.data)} · ${c.periodo} · ${c.tipo_culto||"Culto"} (${c.responsavel})`;
      sel.appendChild(o);
    });
    // Mantém seleção se ainda existir
    if(atual && [...sel.options].some(o=>o.value===atual)) sel.value=atual;
  }catch(e){ console.warn("Erro ao popular cultos:",e); }
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
  const tpc=document.getElementById("f_tipo_culto")?.value;
  const cultoId=document.getElementById("f_culto_id")?.value;
  const p=new URLSearchParams();
  if(per)p.append("periodo",per); if(ini)p.append("data_ini",ini); if(fim)p.append("data_fim",fim);
  if(tpc)p.append("tipo_culto",tpc); if(cultoId)p.append("culto_id",cultoId);
  window.location.href=`/api/exportar_excel?${p}`;
  toast("⬇️ Gerando Excel...","info");
}
function exportarPDF(){
  const per=document.getElementById("f_periodo")?.value;
  const ini=document.getElementById("f_data_ini")?.value;
  const fim=document.getElementById("f_data_fim")?.value;
  const tpc=document.getElementById("f_tipo_culto")?.value;
  const cultoId=document.getElementById("f_culto_id")?.value;
  const p=new URLSearchParams();
  if(per)p.append("periodo",per); if(ini)p.append("data_ini",ini); if(fim)p.append("data_fim",fim);
  if(tpc)p.append("tipo_culto",tpc); if(cultoId)p.append("culto_id",cultoId);
  window.open(`/api/exportar_pdf?${p}`,"_blank");
  toast("📄 PDF aberto! Use Ctrl+P → Salvar como PDF.","info");
}

// ── RESUMO ────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════
// DASHBOARD UNIFICADO — Cultos + GCs + Escalas
// ═══════════════════════════════════════════════════════
async function carregarDashboard(){
  // Ano fixo em 2026 (único ano com dados)
  const ano = document.getElementById("dash_ano")?.value || "2026";
  // Filtros unificados (mesmos do histórico)
  const per = document.getElementById("f_periodo")?.value || "";
  const ini = document.getElementById("f_data_ini")?.value || "";
  const fim = document.getElementById("f_data_fim")?.value || "";
  const tpc = document.getElementById("f_tipo_culto")?.value || "";
  const el  = (id,v)=>{ const e=document.getElementById(id); if(e)e.textContent=v??'—'; };

  const params = new URLSearchParams();
  params.append("ano",ano);
  if(per) params.append("periodo",per);
  if(ini) params.append("data_ini",ini);
  if(fim) params.append("data_fim",fim);
  if(tpc) params.append("tipo",tpc);

  // ── CULTOS ────────────────────────────────────────────
  try{
    const r = await fetch(`/api/dashboard?${params}`);
    const d = await r.json();
    if(!r.ok) throw new Error(d.erro||"Erro");

    const res = d.resumo||{};
    // Cards unificados (dashboard + resumo na mesma tela)
    if(!window._pularCards){
      el("st_dash_cultos",     res.total_cultos);
      el("st_dash_presentes",  res.total_presentes);
      el("st_dash_visitantes", res.total_visitantes);
      el("st_dash_criancas",   res.total_criancas);
      el("st_dash_media_p",    res.media_presentes);
      el("st_dash_media_v",    res.media_visitantes);
    }
    // Mantém IDs legados para compatibilidade
    el("st_cultos",           res.total_cultos);
    el("st_presentes",        res.total_presentes);
    el("st_visitantes",       res.total_visitantes);
    el("st_criancas",         res.total_criancas);
    el("st_media_presentes",  res.media_presentes);
    el("st_media_visitantes", res.media_visitantes);
    el("st_media_criancas",   res.media_criancas||"—");

    // Tabela por período (usando dados de por_tipo agora)
    const bp = document.getElementById("bodyPeriodo");
    if(bp && d.por_tipo){
      bp.innerHTML = d.por_tipo.map(t=>`<tr>
        <td><strong>${t.tipo_culto||"—"}</strong></td>
        <td style="text-align:center">${t.qtd||0}</td>
        <td style="text-align:center">${t.total_presentes||0}</td>
        <td style="text-align:center">${t.media_presentes||0}</td>
      </tr>`).join("") || '<tr><td colspan="4" class="loading-msg">Sem dados</td></tr>';
    }

    // Últimos cultos
    const uc = document.getElementById("ultimosCultos");
    if(uc && d.ultimos){
      uc.innerHTML = d.ultimos.length ? d.ultimos.map(c=>`
        <div style="padding:9px 0;border-bottom:1px solid #EEF2F9;display:flex;align-items:center;gap:12px">
          <div style="min-width:130px;font-weight:700;font-size:12px;color:#0A2463">${c.data_br||c.data||""} — ${c.periodo||""}</div>
          <div style="flex:1;font-size:12px;color:#64748B">${c.tipo_culto||"Culto Regular"} · ${c.responsavel||"—"}</div>
          <div style="font-size:13px;font-weight:700;color:#1B4FA8">${c.presentes||0} pres.</div>
        </div>`).join("")
        : '<p style="color:#8ca0c0;font-size:13px">Sem registros.</p>';
    }

    // Gráfico mensal
    const gm = document.getElementById("grafico_mensal");
    if(gm && d.mensal && d.mensal.length){
      const maxVal = Math.max(...d.mensal.map(m=>m.presentes||0), 1);
      const MESES_BR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      gm.innerHTML = `<div style="display:flex;align-items:flex-end;gap:5px;height:140px;padding:8px 0 0;min-width:${d.mensal.length*48}px">
        ${d.mensal.map(m=>{
          const h = Math.max(6, Math.round((m.presentes||0)/maxVal*110));
          const mesLabel = m.mes ? MESES_BR[parseInt(m.mes.split("-")[1]||0)-1]||"?" : "?";
          const isMax = (m.presentes||0) === maxVal;
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:40px">
            <div style="font-size:10px;font-weight:700;color:${isMax?'#059669':'#0A2463'}">${m.presentes||0}</div>
            <div style="width:100%;max-width:36px;height:${h}px;
              background:${isMax?'linear-gradient(180deg,#059669,#34D399)':'linear-gradient(180deg,#1B4FA8,#56B4D3)'};
              border-radius:4px 4px 0 0;position:relative" title="${m.presentes||0} presentes">
            </div>
            <div style="font-size:9px;color:#94A3B8">${mesLabel}</div>
          </div>`;
        }).join("")}
      </div>`;
    } else if(gm){
      gm.innerHTML = '<p style="color:#8ca0c0;font-size:12px;padding:12px 0">Sem dados para este ano.</p>';
    }

    // Gráfico por tipo de culto
    const gt = document.getElementById("grafico_tipo");
    if(gt && d.por_tipo && d.por_tipo.length){
      const maxP = Math.max(...d.por_tipo.map(t=>t.total_presentes||0),1);
      gt.innerHTML = d.por_tipo.map((t,i)=>{
        const pct = Math.round((t.total_presentes||0)/maxP*100);
        const cores = ["#1B4FA8","#059669","#F59E0B","#6366F1","#EF4444","#8B5CF6"];
        const cor = cores[i%cores.length];
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
            <span style="font-weight:600;color:#0A2463">${t.tipo_culto||"—"}</span>
            <span style="color:#64748B">${t.qtd||0} cultos · média ${t.media_presentes||0}</span>
          </div>
          <div style="background:#EEF2F9;border-radius:6px;height:10px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${cor};border-radius:6px;transition:width .5s ease"></div>
          </div>
        </div>`;
      }).join("");
    } else if(gt){
      gt.innerHTML = '<p style="color:#8ca0c0;font-size:12px">Sem dados.</p>';
    }

    // Insights
    const ins = document.getElementById("dash_insights");
    if(ins){
      const insights = d.insights || [];
      if(d.por_tipo && d.por_tipo.length){
        const top = d.por_tipo[0];
        if(!insights.find(x=>x.includes(top.tipo_culto)))
          insights.push(`🎯 '${top.tipo_culto}' lidera com média de ${top.media_presentes} presentes.`);
      }
      if(d.mensal && d.mensal.length >= 2){
        const ult = d.mensal[d.mensal.length-1];
        const ant = d.mensal[d.mensal.length-2];
        if(ant.presentes > 0 && !insights.find(x=>x.includes("presença"))){
          const diff = Math.round((ult.presentes - ant.presentes)/ant.presentes*100);
          const icone = diff >= 0 ? "📈" : "📉";
          insights.push(`${icone} A presença ${diff>=0?'cresceu':'caiu'} ${Math.abs(diff)}% em relação ao mês anterior.`);
        }
      }
      ins.innerHTML = insights.length
        ? insights.map(i=>`<div style="padding:8px 0;border-bottom:1px solid #EEF2F9;font-size:13px;color:#374151;display:flex;gap:6px"><span style="flex-shrink:0">${i.charAt(0)}</span><span>${i.substring(1)}</span></div>`).join("")
        : '<p style="color:#8ca0c0;font-size:13px">Dados insuficientes para insights.</p>';
    }

    // Top GCs
    const tgc = document.getElementById("dash_top_gcs");
    if(tgc && d.top_gcs){
      tgc.innerHTML = d.top_gcs.length
        ? d.top_gcs.map((g,i)=>`
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #EEF2F9;font-size:12px">
            <span style="font-weight:800;color:${i===0?'#F59E0B':i===1?'#94A3B8':i===2?'#CD7F32':'#CBD5E1'};min-width:22px;font-size:15px">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span>
            <span style="flex:1;font-weight:600;color:#0A2463">${g.gc_nome||g.nome}</span>
            <span style="background:#EBF5FF;color:#0A2463;padding:2px 9px;border-radius:6px;font-weight:700">${g.direcionamentos||0} dir.</span>
          </div>`).join("")
        : '<p style="color:#8ca0c0;font-size:13px">Sem direcionamentos ainda.</p>';
    }

  }catch(e){ console.error("Erro dashboard cultos:",e); }

  // ── GCs ───────────────────────────────────────────────
  try{
    const rg = await fetch("/api/relatorios_gc/dashboard");
    if(rg.ok){
      const dg = await rg.json();
      const t = dg.totais||{};
      el("dg_relatorios",    t.total_relatorios);
      el("dg_membros",       t.total_membros);
      el("dg_visitantes",    t.total_visitantes);
      el("dg_lideres",       t.total_lideres_trein);

      // Gráfico comparativo GCs no Dashboard principal
      const gcs = document.getElementById("grafico_gc_comp");
      if(gcs){
        if(dg.por_gc && dg.por_gc.length){
          const maxMem = Math.max(...dg.por_gc.map(g=>g.total_membros||0), 1);
          gcs.innerHTML = dg.por_gc.slice(0,8).map((g,i)=>`
            <div style="display:grid;grid-template-columns:160px 1fr 90px 60px;
              align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #EEF2F9">
              <div style="font-weight:700;font-size:11px;color:#0A2463;overflow:hidden;
                text-overflow:ellipsis;white-space:nowrap" title="${g.gc_nome}">${i+1}. ${g.gc_nome}</div>
              <div style="position:relative;height:10px;background:#EEF2F9;border-radius:6px;overflow:hidden">
                <div style="position:absolute;left:0;top:0;height:100%;
                  width:${Math.round((g.total_membros||0)/maxMem*100)}%;
                  background:linear-gradient(90deg,#1B4FA8,#56B4D3);border-radius:6px"></div>
              </div>
              <div style="font-size:11px;text-align:right">
                <strong style="color:#0A2463">${g.total_membros||0}</strong>
                <span style="color:#059669"> +${g.total_visitantes||0}</span>
              </div>
              <div style="font-size:10px;color:#64748B;text-align:center">${g.media_membros||0} méd.</div>
            </div>`).join("");
        }else{
          gcs.innerHTML='<p style="color:#8ca0c0;font-size:13px;padding:10px 0">Nenhum relatório de GC. <a href="/relatorio-gc" target="_blank" style="color:#1B4FA8">Enviar primeiro</a></p>';
        }
      }
    }
  }catch(e){ console.warn("Erro GC:",e); }
}


async function carregarDeptosSelect(){
  const sel = document.getElementById("nu_depto_id"); if(!sel) return;
  if(sel.options.length > 1) return; // já carregado
  const r = await fetch("/api/departamentos?todos=1");
  const list = await r.json();
  sel.innerHTML = '<option value="">— Selecione o departamento —</option>';
  list.forEach(d=>{
    const o = document.createElement("option");
    o.value = d.id; o.textContent = (d.icone||"") + " " + d.nome;
    sel.appendChild(o);
  });
}

// Mostra/oculta campo de departamento conforme o cargo selecionado
function toggleDeptoField(){
  const cargo = document.getElementById("nu_cargo")?.value || "";
  const wrap  = document.getElementById("nu_depto_wrap");
  if(!wrap) return;
  // Líder de departamento e voluntário de escala precisam de departamento
  const precisa = (cargo === "lider_depto");
  wrap.style.display = precisa ? "" : "none";
  if(precisa) carregarDeptosSelect();
}

async function criarUsuario(){
  const nome =document.getElementById("nu_nome").value.trim();
  const email=document.getElementById("nu_email").value.trim().toLowerCase();
  const senha=document.getElementById("nu_senha").value;
  const conf =document.getElementById("nu_conf_senha").value;
  const cargo=document.getElementById("nu_cargo").value;
  const deptoId=document.getElementById("nu_depto_id")?.value||null;
  if(!nome||!email||!senha)return toast("Preencha todos os campos.","error");
  if(cargo==="lider_depto"&&!deptoId)return toast("Selecione o departamento do líder.","error");
  const r=await fetch("/api/usuarios",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome,email,senha,confirmar_senha:conf,cargo,departamento_id:deptoId?parseInt(deptoId):null})});
  const d=await r.json();
  if(r.ok&&d.ok){toast("✅ Usuário criado!","success");["nu_nome","nu_email","nu_senha","nu_conf_senha"].forEach(id=>document.getElementById(id).value="");carregarUsuarios();}
  else toast(d.erro||"Erro ao criar usuário.","error");
}
async function carregarUsuarios(){
  const c=document.getElementById("listaUsuarios"); if(!c)return;
  c.innerHTML="<div class='loading-msg'>Carregando usuários...</div>";
  try{
    const r=await fetch("/api/usuarios");
    if(!r.ok){ c.innerHTML="<div class='permission-alert'>❌ Erro ao carregar usuários.</div>"; return; }
    const list=await r.json();
    if(!list || !list.length){ c.innerHTML="<p style='color:#8ca0c0;padding:10px'>Nenhum usuário cadastrado.</p>"; return; }
    const RL={"admin":"Administrador","lider":"Líder","voluntario":"Voluntário","lider_depto":"Líder Depto","voluntario_escala":"Vol. Escala"};
    const RC={"admin":"role-admin","lider":"role-lider","voluntario":"role-voluntario","lider_depto":"role-lider","voluntario_escala":"role-voluntario"};
    c.innerHTML=list.map(u=>`
      <div class="usuario-card">
        <div class="usuario-av">${u.nome.charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="usuario-nome">${u.nome}
            <span class="badge-role ${RC[u.cargo]||""}">${RL[u.cargo]||u.cargo}</span>
            ${u.departamento_nome?`<span style="font-size:10px;color:#4A6080;margin-left:4px">${u.departamento_nome}</span>`:""}
            ${!u.ativo?'<span class="badge-role" style="background:#E53E3E">Inativo</span>':""}
          </div>
          <div class="usuario-email">${u.email}</div>
          ${u.ultimo_acesso?`<div style="font-size:10px;color:#8ca0c0">Último acesso: ${u.ultimo_acesso?.substring(0,16)||"—"}</div>`:""}
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button class="btn-sm blue" onclick="modalSenha(${u.id},'${esc(u.nome)}')">🔑 Senha</button>
          ${_isAdmin&&u.ativo?`<button class="btn-sm" style="background:#F59E0B;color:#fff" onclick="toggleAtivoUser(${u.id},${u.ativo},'${esc(u.nome)}')">${u.ativo?'⏸ Desativar':'▶ Ativar'}</button>`:""}
          <button class="btn-sm red"  onclick="deletarUser(${u.id},'${esc(u.nome)}')">🗑️</button>
        </div>
      </div>`).join("");
  }catch(e){
    c.innerHTML=`<div class='permission-alert'>❌ Erro ao carregar: ${e.message}</div>`;
    console.error("Erro carregarUsuarios:",e);
  }
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

async function toggleAtivoUser(uid,ativo,nome){
  const novoAtivo = ativo ? 0 : 1;
  const acao = ativo ? "desativar" : "reativar";
  if(!confirm(`Deseja ${acao} o usuário "${nome}"?`))return;
  const r=await fetch(`/api/usuarios/${uid}`,{method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ativo:novoAtivo})});
  const d=await r.json();
  if(r.ok&&d.ok){toast(`Usuário ${ativo?'desativado':'reativado'}.`,"info");carregarUsuarios();}
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
  // Carrega departamentos para o select do formulário
  const rd = await fetch("/api/departamentos?todos=1");
  const deptos = await rd.json();
  const selDep = document.getElementById("vol_depto_id");
  if(selDep && selDep.options.length <= 1){
    selDep.innerHTML = '<option value="">— Selecione o departamento —</option>';
    deptos.forEach(d=>{
      const o=document.createElement("option");
      o.value=d.id; o.textContent=(d.icone||"")+" "+d.nome;
      selDep.appendChild(o);
    });
  }

  const r = await fetch("/api/voluntarios?todos=1");
  const list = await r.json();
  if(!list.length){c.innerHTML='<p style="color:#8ca0c0;font-size:13px;padding:10px">Nenhum voluntário cadastrado ainda.</p>';return;}

  // Agrupa por departamento
  const grupos = {};
  list.forEach(v=>{
    const key = v.departamento_nome||"Sem departamento";
    if(!grupos[key]) grupos[key]=[];
    grupos[key].push(v);
  });

  let html = "";
  for(const [depNome, vols] of Object.entries(grupos)){
    html += `<div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;
        color:#0A2463;border-bottom:2px solid #EBF5FF;padding-bottom:5px;margin-bottom:8px">${depNome} (${vols.length})</div>`;
    vols.forEach(v=>{
      html += `<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid #F1F5F9">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#0A2463,#56B4D3);
          display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0">${v.nome.charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;color:#0A2463">${v.nome}</div>
          <div style="font-size:11px;color:#8ca0c0;display:flex;align-items:center;gap:6px">
            <span>📱 ${v.telefone}</span>
            ${v.departamentos?`<span style="color:#4A6080">· ${v.departamentos}</span>`:""}
            <a href="https://wa.me/55${v.telefone.replace(/\D/g,'')}" target="_blank"
              style="color:#22C55E;font-weight:600;font-size:10px;text-decoration:none">WhatsApp</a>
          </div>
        </div>
        ${_isLider?`<button class="btn-sm red" onclick="delVoluntario(${v.id})" style="font-size:10px">✕</button>`:""}
      </div>`;
    });
    html += "</div>";
  }
  c.innerHTML = html;
}

async function salvarVoluntario(){
  const nome    = document.getElementById("vol_nome")?.value.trim();
  const tel     = document.getElementById("vol_tel")?.value.trim();
  const dep     = document.getElementById("vol_dep")?.value.trim()||"";
  const deptoId = document.getElementById("vol_depto_id")?.value||null;
  if(!nome||!tel)return toast("Nome e telefone são obrigatórios.","error");
  if(!deptoId)return toast("Selecione o departamento do voluntário.","error");
  const r = await fetch("/api/voluntarios",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({nome,telefone:tel,departamentos:dep,departamento_id:parseInt(deptoId)})});
  const d = await r.json();
  if(r.ok&&d.ok){
    toast("✅ Voluntário adicionado!","success");
    document.getElementById("vol_nome").value="";
    document.getElementById("vol_tel").value="";
    if(document.getElementById("vol_dep"))document.getElementById("vol_dep").value="";
    if(document.getElementById("vol_depto_id"))document.getElementById("vol_depto_id").value="";
    carregarVoluntarios();
  }else toast(d.erro||"Erro.","error");
}

async function vincularUsuario(volId, volNome){
  // Busca lista de usuários sem vínculo
  const r = await fetch("/api/usuarios"); const users = await r.json();
  const opts = users.filter(u=>u.cargo==="voluntario_escala"||!u.cargo_vinculado)
    .map(u=>`<option value="${u.id}">${u.nome} (${u.email})</option>`).join("");
  abrirModal(`🔗 Vincular Login — ${volNome}`,`
    <div class="info-box" style="margin-bottom:12px">
      Vincule um usuário com cargo <strong>Voluntário Escala</strong> a este voluntário.<br>
      Ele poderá fazer login e ver a própria escala em <strong>/minha-escala</strong>.
    </div>
    <div class="field-group">
      <label>Usuário para vincular</label>
      <select class="field-input" id="sel_usuario_vinc">
        <option value="">— Selecione o usuário —</option>
        ${opts}
      </select>
    </div>
    <button class="btn-primary-lg" onclick="confirmarVinculo(${volId})" style="margin-top:12px;padding:12px">
      🔗 Vincular
    </button>`);
}

async function confirmarVinculo(volId){
  const uid = document.getElementById("sel_usuario_vinc")?.value;
  if(!uid) return toast("Selecione um usuário.","error");
  const url = `/api/voluntarios/${volId}/vincular_usuario`;
  const r = await fetch(url,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({usuario_id:parseInt(uid)})
  });
  const d = await r.json();
  if(r.ok&&d.ok){toast("✅ Usuário vinculado!","success");fecharModal();carregarVoluntarios();}
  else toast(d.erro||"Erro.","error");
}

async function delVoluntario(id){
  if(!confirm("Remover voluntário?"))return;
  await fetch(`/api/voluntarios/${id}`,{method:"DELETE"});
  toast("Removido.","info"); carregarVoluntarios();
}

// ── PUBLICAR ESCALA ─────────────────────────────────────────




function marcarEnviado(el){
  const btn = el.querySelector("button");
  if(btn){ btn.textContent="✅ Enviado"; btn.style.background="#059669"; }
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
function exportarEscalaPDF(){
  const mes = document.getElementById("escala_mes")?.value||"";
  const per = document.getElementById("escala_periodo")?.value||"";
  if(!mes){ toast("Selecione um mês primeiro.","error"); return; }
  const p = new URLSearchParams();
  p.append("mes",mes);
  if(per && per!=="Todos") p.append("periodo",per);
  window.open(`/api/escala/pdf?${p}`,"_blank");
  toast("📄 PDF aberto! Use Imprimir → Salvar como PDF.","info");
}

let _confData = [];
let _confFiltro = "todos";

async function verConfirmacoes(){
  await carregarConfirmacoes(true);
}

async function carregarConfirmacoes(abrirModalNovo){
  const mes = document.getElementById("escala_mes")?.value||"";
  const r = await fetch(`/api/escala/confirmacoes_admin?mes=${mes}`);
  _confData = await r.json();
  const html = renderConfirmacoes(mes);
  if(abrirModalNovo){
    abrirModal(`Respostas da escala — ${mes}`, html, "wide");
  }else{
    // Atualiza o conteúdo do modal já aberto
    const corpo = document.getElementById("confCorpo");
    if(corpo) corpo.outerHTML = html;
  }
}

function renderConfirmacoes(mes){
  const list = _confData;
  const conf = list.filter(c=>c.status==="confirmado");
  const rec  = list.filter(c=>c.status==="recusado");
  const pend = list.filter(c=>c.status==="pendente");
  const total = list.length;
  const pctConf = total? Math.round(conf.length/total*100):0;

  // Aplica filtro
  let visiveis = list;
  if(_confFiltro==="confirmado") visiveis = conf;
  else if(_confFiltro==="recusado") visiveis = rec;
  else if(_confFiltro==="pendente") visiveis = pend;

  const fBtn=(id,label,cor,n)=>`
    <button onclick="filtrarConf('${id}')" style="flex:1;min-width:90px;padding:10px 8px;border-radius:10px;cursor:pointer;
      border:2px solid ${_confFiltro===id?cor:'transparent'};
      background:${_confFiltro===id?cor+'22':'#F8FAFF'};transition:all .15s">
      <div style="font-size:20px;font-weight:800;color:${cor}">${n}</div>
      <div style="font-size:10px;color:#64748B;text-transform:uppercase;font-weight:600;margin-top:2px">${label}</div>
    </button>`;

  // Agrupa por status para visual mais claro
  const cardConf = (c)=>{
    const cor = c.status==="confirmado"?"#059669":c.status==="recusado"?"#DC2626":"#D97706";
    const bg  = c.status==="confirmado"?"#F0FDF4":c.status==="recusado"?"#FEF2F2":"#FFFBEB";
    const ic  = c.status==="confirmado"?"✅":c.status==="recusado"?"🔄":"⏳";
    const lbl = c.status==="confirmado"?"Confirmado":c.status==="recusado"?"Pediu troca":"Aguardando";
    return `<div style="background:${bg};border-left:4px solid ${cor};border-radius:10px;padding:11px 13px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="font-weight:700;font-size:14px;color:#0F2747">${ic} ${c.voluntario_nome}</div>
        <span style="font-size:10px;font-weight:700;color:${cor};background:${cor}1A;padding:3px 9px;border-radius:20px;white-space:nowrap">${lbl}</span>
      </div>
      <div style="font-size:12px;color:#64748B;margin-top:4px">📅 ${c.data_br} · ${c.culto_periodo} · <strong>${c.departamento}</strong></div>
      ${c.sugestao_troca?`<div style="font-size:12px;color:#B91C1C;margin-top:6px;background:#fff;border-radius:8px;padding:6px 9px">💬 <em>${c.sugestao_troca}</em></div>`:""}
    </div>`;
  };

  return `<div id="confCorpo">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="flex:1;min-width:160px">
        <div style="font-size:12px;color:#64748B;margin-bottom:4px">Taxa de confirmação: <strong style="color:#059669">${pctConf}%</strong></div>
        <div style="background:#EEF2F9;border-radius:8px;height:8px;overflow:hidden">
          <div style="width:${pctConf}%;height:100%;background:linear-gradient(90deg,#059669,#34D399);border-radius:8px;transition:width .5s"></div>
        </div>
      </div>
      <button onclick="carregarConfirmacoes(false)" class="btn-sm blue" style="padding:8px 14px;font-size:12px">🔄 Atualizar</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${fBtn("todos","Todos","#1B4FA8",total)}
      ${fBtn("confirmado","Confirmados","#059669",conf.length)}
      ${fBtn("recusado","Trocas","#DC2626",rec.length)}
      ${fBtn("pendente","Pendentes","#D97706",pend.length)}
    </div>
    <div style="max-height:50vh;overflow-y:auto;padding-right:4px">
      ${visiveis.length? visiveis.map(cardConf).join("")
        : '<p style="text-align:center;color:#8ca0c0;padding:30px;font-size:13px">Nenhuma resposta nesta categoria.</p>'}
    </div>
  </div>`;
}

function filtrarConf(f){
  _confFiltro = f;
  const mes = document.getElementById("escala_mes")?.value||"";
  const corpo = document.getElementById("confCorpo");
  if(corpo) corpo.outerHTML = renderConfirmacoes(mes);
}

// ── EDITOR DE ESCALA INLINE ────────────────────────────────
let _escalaDados = {};     // key: deptoId_data_periodo → nome
let _escalaDatas = [];     // datas do mês
let _escalaDeptos = [];    // departamentos
let _escalaVolsMap = {};   // deptoId → [voluntarios]

async function abrirEditorEscala(){
  const mes = document.getElementById("escala_mes")?.value;
  if(!mes){ toast("Selecione um mês primeiro.","error"); return; }

  // Carrega dados em paralelo
  const [rDatas, rItens, rDeptos] = await Promise.all([
    fetch(`/api/escala/datas?mes=${mes}`),
    fetch(`/api/escala?mes=${mes}`),
    fetch("/api/departamentos")
  ]);
  _escalaDatas  = await rDatas.json();
  const itens   = await rItens.json();
  _escalaDeptos = await rDeptos.json();

  // Monta mapa de itens existentes
  _escalaDados = {};
  itens.forEach(i => {
    _escalaDados[`${i.departamento_id}_${i.culto_data}_${i.culto_periodo}`] = i.responsavel||"";
  });

  // Carrega voluntários de cada depto
  _escalaVolsMap = {};
  await Promise.all(_escalaDeptos.map(async dep => {
    const rv = await fetch(`/api/voluntarios/por_departamento/${dep.id}`);
    _escalaVolsMap[dep.id] = await rv.json();
  }));

  const per = document.getElementById("escala_periodo")?.value||"";
  const datasF = per ? _escalaDatas.filter(d=>d.periodo===per) : _escalaDatas;
  if(!datasF.length){ toast('Nenhuma data de culto neste mês.','info'); return; }

  if(!datasF.length){
    toast("Nenhuma data de culto neste mês.","info"); return;
  }

  // Gera HTML do editor
  const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  let html = `
    <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="font-size:13px;color:#4A6080">Editando escala de <strong style="color:#0A2463">${mes}</strong></span>
      <button class="btn-secondary" style="background:#22C55E;margin-left:auto"
        onclick="salvarEscalaModal('${mes}')">💾 Salvar Tudo</button>
    </div>`;

  for(const dep of _escalaDeptos){
    const vols = _escalaVolsMap[dep.id]||[];
    html += `<div style="margin-bottom:14px;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
      <div style="background:#F8FAFF;padding:9px 14px;border-bottom:1px solid #E2E8F0;
        display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">${dep.icone||"👥"}</span>
        <span style="font-weight:700;font-size:13px;color:#0A2463">${dep.nome}</span>
        <span style="font-size:11px;color:#8ca0c0;margin-left:auto">${vols.length} voluntários</span>
      </div>
      <div style="padding:10px 12px;display:grid;gap:8px">`;

    datasF.forEach(d => {
      const key = `${dep.id}_${d.data}_${d.periodo}`;
      const val = _escalaDados[key]||"";
      const perEmoji = d.periodo==="Manhã"?"☀️":"🌙";
      const mesNum = parseInt(d.data.split("-")[1])||0;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;
        border-bottom:1px solid #F8FAFF">
        <div style="background:#0A2463;color:#fff;border-radius:7px;padding:4px 7px;
          text-align:center;min-width:42px;flex-shrink:0">
          <div style="font-size:14px;font-weight:800;line-height:1">${d.data_br.split("/")[0]}</div>
          <div style="font-size:8px;opacity:.7">${MESES[mesNum]||""}</div>
        </div>
        <span style="font-size:11px;color:#64748B;min-width:55px">${perEmoji} ${d.periodo}</span>
        <select style="flex:1;padding:7px 10px;border:1.5px solid #D1D5DB;border-radius:8px;
          font-size:12px;font-family:var(--font-sans,inherit);background:#fff;outline:none;
          -webkit-appearance:none;cursor:pointer;${val?"border-color:#1B4FA8;background:#EBF5FF;font-weight:600":""};"
          data-key="${key}" data-data="${d.data}" data-periodo="${d.periodo}" data-depid="${dep.id}"
          onchange="onChangeEscalaSelect(this)">
          <option value="">— Selecionar —</option>
          ${vols.map(v=>`<option value="${v.nome}" ${val===v.nome?"selected":""}>${v.nome}</option>`).join("")}
        </select>
        <div id="conf_modal_${key}" style="font-size:10px;color:#DC2626;display:none;min-width:80px">⚠️ Conflito</div>
      </div>`;
    });

    html += `</div></div>`;
  }

  abrirModal(`✏️ Escala — ${mes}`, html, "wide");
}

async function onChangeEscalaSelect(sel){
  const key    = sel.dataset.key;
  const nome   = sel.value;
  const data   = sel.dataset.data;
  const periodo= sel.dataset.periodo;
  const depId  = parseInt(sel.dataset.depid);
  _escalaDados[key] = nome;
  sel.style.borderColor = nome ? "#1B4FA8" : "#D1D5DB";
  sel.style.background  = nome ? "#EBF5FF" : "#fff";
  sel.style.fontWeight  = nome ? "600" : "400";
  const confEl = document.getElementById(`conf_modal_${key}`);
  if(confEl) confEl.style.display = "none";

  if(nome){
    try{
      const r = await fetch("/api/escala/verificar_conflito",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({nome,culto_data:data,culto_periodo:periodo,departamento_id:depId})
      });
      const d = await r.json();
      if(d.conflito && confEl){
        confEl.textContent = "⚠️ Já escalado em outro depto";
        confEl.title = d.mensagem;
        confEl.style.display = "block";
      }
    }catch(e){}
  }
}

async function salvarEscalaModal(mes){
  const sels = document.querySelectorAll("[data-key]");
  const lote = [];
  sels.forEach(sel => {
    if(!sel.dataset.depid) return;
    lote.push({
      departamento_id: parseInt(sel.dataset.depid),
      culto_data:      sel.dataset.data,
      culto_periodo:   sel.dataset.periodo,
      responsavel:     sel.value||""
    });
  });

  const r = await fetch("/api/escala/lote",{
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify(lote)
  });
  const d = await r.json();
  if(r.ok && d.ok){
    toast(`✅ Escala salva! ${d.salvos} itens.`,"success");
    fecharModal();
    carregarVisualizacaoEscala();
  } else {
    toast(d.erro||"Erro ao salvar.","error");
  }
}

// ── PUBLICAR + NOTIFICAR TODOS ─────────────────────────────
async function publicarEscala(){
  const mes = document.getElementById("escala_mes")?.value;
  if(!mes) return toast("Selecione um mês.","error");
  if(!confirm(`Publicar escala de ${mes} e notificar os voluntários via WhatsApp?`)) return;

  const btn = document.getElementById("btnPublicar");
  if(btn){ btn.innerHTML="⏳ Publicando..."; btn.disabled=true; }

  try{
    // 1. Publica
    const rp = await fetch("/api/escala/publicar",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({mes})
    });
    const dp = await rp.json();
    if(!rp.ok||!dp.ok){ toast(dp.erro||"Erro ao publicar.","error"); return; }

    verificarStatusEscala();

    // 2. Gera notificações
    const rn = await fetch("/api/escala/notificar",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({mes})
    });
    const dn = await rn.json();

    if(!rn.ok||!dn.ok){
      toast("Escala publicada! Erro ao gerar notificações.","info"); return;
    }

    const comTel = (dn.notificacoes||[]).filter(n=>n.wa_link);
    const semTel = (dn.notificacoes||[]).filter(n=>!n.wa_link);

    if(!comTel.length){
      toast("Escala publicada! Cadastre WhatsApp nos voluntários para notificar.","info");
      return;
    }

    // 3. Abre modal com todos os links prontos
    window._waLinks = comTel.map(n=>n.wa_link);

    const lista = comTel.map((n,i)=>`
      <div id="wai${i}" style="display:flex;align-items:center;gap:9px;padding:9px 0;
        border-bottom:1px solid #EEF2F9">
        <div style="width:32px;height:32px;border-radius:50%;
          background:linear-gradient(135deg,#0A2463,#56B4D3);
          display:flex;align-items:center;justify-content:center;
          font-weight:700;color:#fff;font-size:13px;flex-shrink:0">
          ${n.nome.charAt(0).toUpperCase()}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px">${n.nome}</div>
          <div style="font-size:11px;color:#8ca0c0">${n.qtd_escalas} escala(s)</div>
        </div>
        <a href="${n.wa_link}" target="_blank" style="text-decoration:none"
          onclick="marcarEnviado(${i})">
          <button class="btn-sm green" id="waBtn${i}"
            style="background:#25D366;color:#fff;border:none;padding:6px 12px;
            border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">
            📲 Enviar
          </button>
        </a>
      </div>`).join("");

    const semTelMsg = semTel.length ?
      `<div style="background:#FEF3C7;border-radius:8px;padding:8px 12px;
        font-size:12px;color:#92400E;margin-top:8px">
        ⚠️ Sem WhatsApp: ${semTel.map(n=>n.nome).join(", ")}
      </div>` : "";

    abrirModal(`📲 Notificar ${comTel.length} voluntário(s)`, `
      <div style="background:#EBF5FF;border-radius:9px;padding:10px 14px;
        margin-bottom:14px;font-size:13px;color:#0A2463">
        ✅ Escala <strong>publicada</strong>! Clique em <strong>"Abrir todos"</strong>
        para enviar para todos ao mesmo tempo.
      </div>
      <div style="margin-bottom:12px">
        <button onclick="enviarTodos()" style="width:100%;padding:11px;
          background:#25D366;border:none;border-radius:10px;color:#fff;
          font-size:14px;font-weight:700;cursor:pointer">
          📲 Abrir todos de uma vez (${comTel.length})
        </button>
      </div>
      <div style="max-height:50vh;overflow-y:auto">${lista}</div>
      ${semTelMsg}`, "wide");

    toast(`✅ Publicada! ${comTel.length} voluntários para notificar.`,"success");

  }catch(e){
    toast("Erro de conexão.","error");
    console.error(e);
  }
  if(btn){ btn.innerHTML="✅ Publicar"; btn.disabled=false; }
}

function enviarTodos(){
  if(!window._waLinks||!window._waLinks.length) return;
  window._waLinks.forEach((link,i) => {
    setTimeout(() => window.open(link,"_blank"), i*800);
  });
  // Marca todos como enviados visualmente
  window._waLinks.forEach((_,i) => {
    const btn = document.getElementById(`waBtn${i}`);
    if(btn){ btn.textContent="✅ Enviado"; btn.style.background="#059669"; }
  });
  toast(`📲 Abrindo ${window._waLinks.length} conversas...`,"info");
}


// ── ESCALAS ────────────────────────────────────────────────
async function carregarVisualizacaoEscala(){
  const mes = document.getElementById("escala_mes")?.value;
  const per = document.getElementById("escala_periodo")?.value||"";
  verificarStatusEscala();
  // Se lider_depto, mostra nome do departamento como título
  if(_cargo==="lider_depto"&&window._deptoNome){
    const tit=document.querySelector("#tab-escalas .page-title");
    if(tit)tit.innerHTML=`Minha Escala <span style="font-size:14px;font-weight:400;color:#4A6080">${window._deptoNome}</span>`;
  }
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
// Stub seguro de geocodificação (campo de endereço de visitante — opcional)
async function geocodificarCampo(idEnd, idResult, idLat, idLng, idDisplay){
  const end = document.getElementById(idEnd)?.value?.trim();
  const res = document.getElementById(idResult);
  if(!end){ if(res) res.textContent="Digite um endereço primeiro."; return; }
  if(res) res.textContent="Endereço salvo: "+end;
  const disp = document.getElementById(idDisplay);
  if(disp) disp.textContent = end;
}

// ── DASHBOARD GC ──────────────────────────────────────────────
function copiarLinkRelatorio(){
  const url = window.location.origin + "/relatorio-gc";
  copiarLink(url);
}

// ── GENEALOGIA E MULTIPLICAÇÃO ──────────────────────────────
async function carregarGenealogia(){
  try{
    const ini = document.getElementById("gc_freq_ini")?.value||"";
    const fim = document.getElementById("gc_freq_fim")?.value||"";
    const p = new URLSearchParams();
    if(ini) p.append("data_ini",ini); if(fim) p.append("data_fim",fim);
    const r = await fetch("/api/gcs/genealogia?"+p);
    if(!r.ok) return;
    const d = await r.json();
    const c = d.cards||{};
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    set("gen_ativos", c.total_ativos||0);
    set("gen_multiplicados", c.total_multiplicados||0);
    set("gen_geracoes", c.geracoes||0);
    set("gen_rede_maior", c.rede_maior||"—");
    set("gen_maior_desc", c.maior_descendencia ? `${c.maior_descendencia.nome} (${c.maior_descendencia.qtd})` : "—");
    set("gen_mult_periodo", c.multiplicacoes_periodo||0);

    // Árvore
    const arv = document.getElementById("gen_arvore");
    if(arv){
      if(d.arvore && d.arvore.length){
        arv.innerHTML = d.arvore.map(n=>renderNoArvore(n,0)).join("");
      }else{
        arv.innerHTML = '<p style="color:#8ca0c0;font-size:13px;padding:14px">Nenhum GC cadastrado. Vincule GCs de origem na edição de cada GC (Conecta GC) para montar a árvore.</p>';
      }
    }

    // Redes
    const redes = document.getElementById("gen_redes");
    if(redes){
      if(d.redes && d.redes.length){
        const maxG = Math.max(...d.redes.map(x=>x.total_gcs),1);
        redes.innerHTML = d.redes.map(rd=>`
          <div style="margin-bottom:11px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span style="font-weight:700;color:#0A2463"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${rd.cor};margin-right:5px"></span>${rd.rede}</span>
              <span style="color:#64748B">${rd.total_gcs} GCs · ${rd.multiplicacoes} mult.</span>
            </div>
            <div style="background:#EEF2F9;border-radius:6px;height:10px;overflow:hidden">
              <div style="width:${Math.round(rd.total_gcs/maxG*100)}%;height:100%;background:${rd.cor};border-radius:6px"></div>
            </div>
          </div>`).join("");
      }else{
        redes.innerHTML = '<p style="color:#8ca0c0;font-size:13px">Sem dados de rede.</p>';
      }
    }

    // Supervisores
    carregarSupervisores();

    // Linha do tempo das multiplicações
    const tl = document.getElementById("gen_timeline");
    if(tl){
      const ev = d.timeline||[];
      if(ev.length){
        tl.innerHTML = ev.map((e,i)=>{
          const ultimo = i === ev.length-1;
          const linhaVert = ultimo ? "" : `<div style="position:absolute;left:7px;top:20px;bottom:-16px;width:2px;background:#E2E8F0"></div>`;
          return `<div style="position:relative;padding-left:28px;padding-bottom:16px">
            ${linhaVert}
            <div style="position:absolute;left:0;top:3px;width:16px;height:16px;border-radius:50%;background:${e.cor};border:3px solid #fff;box-sizing:border-box"></div>
            <div style="font-size:11px;color:#94A3B8;font-weight:600">${e.data_label||e.data}</div>
            <div style="font-size:14px;font-weight:700;color:#0F2747;margin:1px 0 3px">${e.nome}
              <span style="background:${e.cor};color:#fff;font-size:9px;padding:1px 7px;border-radius:20px;vertical-align:1px">${e.rede||""}</span>
            </div>
            <div style="font-size:11px;color:#64748B">nasceu de <strong style="color:#0A2463">${e.pai}</strong></div>
          </div>`;
        }).join("");
      }else{
        tl.innerHTML = '<p style="color:#8ca0c0;font-size:13px;padding:10px">Nenhuma multiplicação registrada ainda. Quando um GC for vinculado a um GC de origem, ele aparece aqui na data em que foi criado.</p>';
      }
    }
  }catch(e){ console.warn("Erro genealogia:",e); }
}

function renderNoArvore(no, prof){
  // Raiz (nível 0): cartão destacado com a cor da rede
  // Filhos (nível > 0): conectados por linhas tipo organograma
  const desc = no.qtd_descendentes ? ` · ${no.qtd_descendentes} desc.` : "";
  const filhosCount = no.qtd_filhos
    ? `<span style="background:${no.cor_hex};color:#fff;padding:1px 8px;border-radius:20px;font-size:9px;font-weight:700;margin-left:6px;white-space:nowrap">${no.qtd_filhos} filho(s)</span>`
    : "";
  const meta = `👤 ${no.lider||"—"} · Nível ${no.nivel}${desc}${no.supervisor?` · 👁️ ${no.supervisor}`:""}`;

  let cartao;
  if(prof === 0){
    // GC raiz — cartão com destaque na cor da rede
    cartao = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;
        padding:9px 12px;background:${no.cor_hex}14;border-left:4px solid ${no.cor_hex};border-radius:8px">
      <div style="min-width:0">
        <div style="font-size:14px;font-weight:700;color:#0F2747">${no.nome}
          <span style="background:${no.cor_hex};color:#fff;padding:1px 8px;border-radius:20px;font-size:9px;font-weight:700">${no.setor||""}</span>
          ${filhosCount}
        </div>
        <div style="font-size:11px;color:#64748B;margin-top:2px">${meta}</div>
      </div>
      <button class="btn-sm blue" style="font-size:10px;flex-shrink:0" onclick="gerenciarGC(${no.id})">⚙️</button>
    </div>`;
  } else {
    // GC filho — conectado por linha horizontal + ponto na cor da rede
    cartao = `<div style="display:flex;align-items:center;gap:0">
      <div style="width:18px;height:2px;background:#CBD5E1;flex-shrink:0"></div>
      <div style="flex:1;min-width:0;display:flex;justify-content:space-between;align-items:center;gap:8px;
          padding:8px 11px;background:#F8FAFF;border-radius:8px;border:0.5px solid #E2E8F0">
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:700;color:#0F2747">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${no.cor_hex};margin-right:6px;vertical-align:1px"></span>${no.nome}
            <span style="background:${no.cor_hex};color:#fff;padding:1px 7px;border-radius:20px;font-size:9px;font-weight:700">${no.setor||""}</span>
            ${filhosCount}
          </div>
          <div style="font-size:11px;color:#64748B;margin-top:2px;padding-left:14px">${meta}</div>
        </div>
        <button class="btn-sm blue" style="font-size:10px;flex-shrink:0" onclick="gerenciarGC(${no.id})">⚙️</button>
      </div>
    </div>`;
  }

  let html;
  if(prof === 0){
    html = `<div style="margin-bottom:10px">${cartao}`;
  } else {
    // Indenta e desenha a linha vertical de conexão à esquerda
    html = `<div style="margin-left:${(prof-1)*22 + 8}px;border-left:2px solid #CBD5E1;padding-left:0;margin-top:6px">${cartao}`;
  }

  if(no.filhos && no.filhos.length){
    html += no.filhos.map(f=>renderNoArvore(f, prof+1)).join("");
  }
  html += `</div>`;
  return html;
}

// ── GESTÃO ESTRATÉGICA DO GC (supervisor, pai, rede, metas, membros) ──
async function gerenciarGC(id){
  const list = await (await fetch("/api/gcs")).json();
  const gc = list.find(g=>g.id===id); if(!gc) return;
  const opcoesPai = list.filter(g=>g.id!==id).map(g=>
    `<option value="${g.id}"${gc.gc_pai_id===g.id?" selected":""}>${esc(g.nome)}</option>`).join("");
  abrirModal(`⚙️ Gestão — ${gc.nome}`,`
    <div style="display:grid;gap:10px">
      <div class="field-group"><label>Nome do GC</label><input class="field-input" id="ggc_nome" value="${esc(gc.nome)}"></div>
      <div class="field-group"><label>Líder</label><input class="field-input" id="ggc_lider" value="${esc(gc.lider||"")}"></div>
      <div class="field-group"><label>👁️ Supervisor</label><input class="field-input" id="ggc_supervisor" value="${esc(gc.supervisor||"")}" placeholder="Supervisor responsável"></div>
      <div class="field-group"><label>🌱 GC de Origem (pai)</label>
        <select class="field-input" id="ggc_pai">
          <option value="">— Nenhum (GC raiz) —</option>
          ${opcoesPai}
        </select>
        <span style="font-size:11px;color:#64748B">Define a multiplicação: de qual GC este nasceu.</span>
      </div>
      <div class="field-group"><label>🎨 Rede / Setor</label>
        <select class="field-input" id="ggc_setor">
          ${["Verde","Laranja","Amarelo","Vermelho","Azul","Roxo"].map(s=>`<option${gc.setor===s?" selected":""}>${s}</option>`).join("")}
        </select></div>
    </div>
    <button class="btn-primary-lg" onclick="salvarGestaoGC(${id})" style="margin-top:14px;padding:12px;font-size:13px">💾 Salvar Gestão</button>`);
}

async function salvarGestaoGC(id){
  const r=await fetch(`/api/gcs/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      nome:document.getElementById("ggc_nome").value,
      lider:document.getElementById("ggc_lider").value,
      supervisor:document.getElementById("ggc_supervisor").value,
      gc_pai_id:document.getElementById("ggc_pai").value||null,
      setor:document.getElementById("ggc_setor").value})});
  const d=await r.json();
  if(r.ok&&d.ok){toast("✅ Gestão do GC atualizada!","success");fecharModal();carregarGenealogia();}
  else toast(d.erro||"Erro.","error");
}

async function carregarSupervisores(){
  const el = document.getElementById("gen_supervisores");
  if(!el) return;
  try{
    const r = await fetch("/api/gcs/por_supervisor");
    const d = await r.json();
    if(!d.supervisores || !d.supervisores.length){
      el.innerHTML = '<p style="color:#8ca0c0;font-size:13px">Nenhum supervisor cadastrado. Defina supervisores na edição de cada GC (Conecta GC).</p>';
      return;
    }
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
      ${d.supervisores.map(s=>`
        <div style="border:1px solid #E2E8F0;border-radius:10px;padding:11px 13px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong style="font-size:13px;color:#0A2463">👁️ ${s.supervisor}</strong>
            <span style="background:#EBF5FF;color:#0A2463;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">${s.gcs.length} GC(s)</span>
          </div>
          ${s.gcs.map(g=>`<div style="font-size:11px;color:#64748B;padding:2px 0">• ${g.nome}${g.lider?` (${g.lider})`:''}</div>`).join("")}
        </div>`).join("")}
    </div>`;
  }catch(e){ el.innerHTML='<p style="color:#8ca0c0;font-size:13px">Erro ao carregar supervisores.</p>'; }
}

function exportarGenealogiaExcel(){
  window.open("/api/gcs/genealogia/excel","_blank");
  toast("⬇️ Gerando Excel da genealogia...","info");
}
function exportarGenealogiaPDF(){
  window.open("/api/gcs/genealogia/pdf","_blank");
  toast("📄 PDF da genealogia aberto!","info");
}

async function carregarDashGC(){
  const linkEl = document.getElementById("linkRelatorioGC");
  if(linkEl) linkEl.textContent = window.location.origin + "/relatorio-gc";

  carregarGenealogia();

  try{
    const r = await fetch("/api/relatorios_gc/dashboard");
    if(!r.ok){
      document.getElementById("dash_gc_por_gc").innerHTML =
        `<div class="permission-alert">❌ Erro ao carregar. Tente recarregar a página.</div>`;
      return;
    }
    const d = await r.json();
    const t = d.totais||{};
    document.getElementById("dg_relatorios").textContent = t.total_relatorios||0;
    document.getElementById("dg_membros").textContent    = t.total_membros||0;
    document.getElementById("dg_visitantes").textContent = t.total_visitantes||0;
    document.getElementById("dg_lideres").textContent    = t.total_lideres_trein||0;

    // Ranking por GC
    const porGC = document.getElementById("dash_gc_por_gc");
    if(d.por_gc && d.por_gc.length){
      const maxMem = Math.max(...d.por_gc.map(g=>g.total_membros),1);
      porGC.innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>#</th><th>GC</th><th style="text-align:center">Reuniões</th><th style="text-align:center">Total Membros</th><th style="text-align:center">Visitantes</th><th style="text-align:center">Média/Reunião</th><th>Última Reunião</th></tr></thead>
        <tbody>${d.por_gc.map((g,i)=>`<tr>
          <td><strong style="color:${i===0?'#F59E0B':i===1?'#94A3B8':i===2?'#CD7F32':'#CBD5E1'}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</strong></td>
          <td><strong style="color:#0A2463">${g.gc_nome}</strong>
            <div style="height:4px;background:#EEF2F9;border-radius:3px;margin-top:3px;overflow:hidden">
              <div style="height:100%;width:${Math.round((g.total_membros||0)/maxMem*100)}%;background:linear-gradient(90deg,#1B4FA8,#56B4D3);border-radius:3px"></div>
            </div>
          </td>
          <td style="text-align:center">${g.total_reunioes||0}</td>
          <td style="text-align:center"><strong style="color:#0A2463;font-size:14px">${g.total_membros||0}</strong></td>
          <td style="text-align:center"><strong style="color:#059669">${g.total_visitantes||0}</strong></td>
          <td style="text-align:center">${g.media_membros||0}</td>
          <td style="font-size:11px;color:#64748B">${g.ultima_reuniao?g.ultima_reuniao.substring(0,10).split("-").reverse().join("/"):"—"}</td>
        </tr>`).join("")}</tbody></table></div>`;
    }else{
      porGC.innerHTML = '<p style="color:#8ca0c0;font-size:13px;padding:14px">Nenhum relatório enviado ainda.<br><a href="/relatorio-gc" target="_blank" style="color:#1B4FA8">👉 Abrir formulário de GC</a></p>';
    }

    // Gráfico de evolução
    const gEv = document.getElementById("grafico_gc_evolucao");
    if(gEv && d.por_gc && d.por_gc.length){
      const MESES_BR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      const maxM = Math.max(...d.por_gc.map(g=>g.media_membros||0),1);
      gEv.innerHTML = d.por_gc.slice(0,6).map((g,i)=>{
        const pct = Math.round((g.media_membros||0)/maxM*100);
        const cores = ["#1B4FA8","#059669","#F59E0B","#6366F1","#EF4444","#8B5CF6"];
        return `<div style="margin-bottom:9px">
          <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">
            <span style="font-weight:600;color:#0A2463;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px" title="${g.gc_nome}">${i+1}. ${g.gc_nome}</span>
            <span style="color:#64748B">méd. ${g.media_membros||0} · ${g.total_reunioes||0} reun.</span>
          </div>
          <div style="background:#EEF2F9;border-radius:6px;height:10px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${cores[i]};border-radius:6px;transition:width .6s ease"></div>
          </div>
        </div>`;
      }).join("");
    }

    // Últimos relatórios
    const ult = document.getElementById("dash_gc_ultimos");
    if(d.ultimos && d.ultimos.length){
      ult.innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Data</th><th>GC</th><th>Líder</th><th>Anfitrião</th><th>Membros</th><th>Visit.</th><th>Trein.</th><th>Obs</th><th></th></tr></thead>
        <tbody>${d.ultimos.map(r=>`<tr>
          <td><strong>${r.dia_br||r.dia}</strong></td>
          <td>${r.gc_nome}</td>
          <td style="font-size:11px;color:#4A6080">${r.lider_nome}</td>
          <td style="font-size:11px;color:#4A6080">${r.anfitriao||"—"}</td>
          <td><strong style="color:#0A2463">${r.membros_presentes}</strong></td>
          <td><strong style="color:#059669">${r.visitantes}</strong></td>
          <td>${r.lider_treinamento?'<span style="color:#7C3AED;font-weight:700">✓</span>':'—'}</td>
          <td style="font-size:11px;color:#4A6080;max-width:120px;overflow:hidden;text-overflow:ellipsis">${r.observacoes||"—"}</td>
          <td>${_isLider?`<button class="btn-sm red" onclick="delRelatorioGC(${r.id})" style="font-size:10px">✕</button>`:""}</td>
        </tr>`).join("")}</tbody></table></div>`;
    }else{
      ult.innerHTML = '<p style="color:#8ca0c0;padding:14px;font-size:13px">Sem relatórios ainda.</p>';
    }
  }catch(e){ console.error("Erro dashboard GC",e); }

  // Carrega lista de GCs para filtro
  await carregarFrequenciaGC();
}

async function carregarFrequenciaGC(){
  const gcFiltro = document.getElementById("gc_freq_filtro")?.value||"";
  const ini      = document.getElementById("gc_freq_ini")?.value||"";
  const fim      = document.getElementById("gc_freq_fim")?.value||"";
  const el       = document.getElementById("gc_freq_detalhado");
  if(!el) return;
  el.innerHTML='<div class="loading-msg">Carregando frequência...</div>';
  try{
    const params = new URLSearchParams();
    if(gcFiltro) params.append("gc_nome",gcFiltro);
    if(ini) params.append("data_ini",ini);
    if(fim) params.append("data_fim",fim);
    const r = await fetch("/api/relatorios_gc/frequencia?"+params);
    if(!r.ok){ el.innerHTML='<div class="permission-alert">❌ Erro ao carregar frequência.</div>'; return; }
    const d = await r.json();

    // Popula select de GCs
    const sel = document.getElementById("gc_freq_filtro");
    if(sel && d.gcs_lista && sel.options.length <= 1){
      d.gcs_lista.forEach(nome=>{
        const o=document.createElement("option"); o.value=nome; o.textContent=nome; sel.appendChild(o);
      });
    }

    if(!d.por_gc || !d.por_gc.length){
      el.innerHTML='<p style="color:#8ca0c0;padding:10px">Nenhum relatório encontrado para os filtros selecionados.</p>';
      return;
    }

    let html=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:16px">
      <div style="background:#EBF5FF;border-radius:12px;padding:12px;text-align:center">
        <div style="font-size:24px;font-weight:800;color:#0A2463">${d.totais.total_relatorios}</div>
        <div style="font-size:11px;color:#4A6080;text-transform:uppercase">Relatórios</div>
      </div>
      <div style="background:#D1FAE5;border-radius:12px;padding:12px;text-align:center">
        <div style="font-size:24px;font-weight:800;color:#065F46">${d.totais.total_gcs}</div>
        <div style="font-size:11px;color:#4A6080;text-transform:uppercase">GCs Ativos</div>
      </div>
      <div style="background:#FEF3C7;border-radius:12px;padding:12px;text-align:center">
        <div style="font-size:24px;font-weight:800;color:#92400E">${d.totais.media_geral_membros}</div>
        <div style="font-size:11px;color:#4A6080;text-transform:uppercase">Média Geral/Reunião</div>
      </div>
    </div>`;

    // Tabela por GC com frequência detalhada
    d.por_gc.forEach((g,idx)=>{
      const datas_html = g.datas.slice(-5).map(dt=>`
        <tr style="font-size:11px">
          <td style="padding:5px 8px;color:#4A6080">${dt.dia_br||dt.dia}</td>
          <td style="padding:5px 8px;text-align:center;font-weight:700;color:#0A2463">${dt.membros||0}</td>
          <td style="padding:5px 8px;text-align:center;color:#059669">${dt.visitantes||0}</td>
          <td style="padding:5px 8px;font-size:10px;color:#64748B">${dt.anfitriao||"—"}</td>
        </tr>`).join("");
      html+=`<div style="border:1px solid #E2E8F0;border-radius:12px;margin-bottom:12px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0A2463,#1B4FA8);padding:10px 14px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:800;color:#fff;font-size:13px">${idx+1}. ${g.gc_nome}</span>
          <div style="display:flex;gap:8px">
            <span style="background:rgba(255,255,255,.2);color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700">${g.reunioes} reuniões</span>
            <span style="background:#22C55E;color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700">Méd: ${g.media_membros}</span>
          </div>
        </div>
        <div style="padding:10px 14px">
          <div style="display:flex;gap:16px;margin-bottom:8px;font-size:12px">
            <span>👥 Total membros: <strong>${g.total_membros}</strong></span>
            <span>🙋 Total visitantes: <strong style="color:#059669">${g.total_visitantes}</strong></span>
            <span>📊 Média visitantes: <strong>${g.media_visitantes}</strong></span>
          </div>
          ${g.datas.length?`<table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#F8FAFF">
              <th style="padding:5px 8px;text-align:left;font-size:10px;color:#4A6080">Data</th>
              <th style="padding:5px 8px;text-align:center;font-size:10px;color:#4A6080">Membros</th>
              <th style="padding:5px 8px;text-align:center;font-size:10px;color:#4A6080">Visitantes</th>
              <th style="padding:5px 8px;text-align:left;font-size:10px;color:#4A6080">Anfitrião</th>
            </tr></thead>
            <tbody>${datas_html}</tbody>
          </table>
          ${g.datas.length>5?`<p style="font-size:10px;color:#94A3B8;text-align:center;margin-top:5px">Mostrando últimas 5 de ${g.datas.length} reuniões</p>`:""}
          `:""}
        </div>
      </div>`;
    });
    el.innerHTML=html;
  }catch(e){ el.innerHTML=`<div class="permission-alert">❌ Erro: ${e.message}</div>`; }
}

function exportarFrequenciaExcel(){
  const gcFiltro = document.getElementById("gc_freq_filtro")?.value||"";
  const ini      = document.getElementById("gc_freq_ini")?.value||"";
  const fim      = document.getElementById("gc_freq_fim")?.value||"";
  const p = new URLSearchParams();
  if(gcFiltro) p.append("gc_nome",gcFiltro);
  if(ini) p.append("data_ini",ini);
  if(fim) p.append("data_fim",fim);
  window.open("/api/relatorios_gc/frequencia/excel?"+p,"_blank");
}

function exportarFrequenciaPDF(){
  const gcFiltro = document.getElementById("gc_freq_filtro")?.value||"";
  const ini      = document.getElementById("gc_freq_ini")?.value||"";
  const fim      = document.getElementById("gc_freq_fim")?.value||"";
  const p = new URLSearchParams();
  if(gcFiltro) p.append("gc_nome",gcFiltro);
  if(ini) p.append("data_ini",ini);
  if(fim) p.append("data_fim",fim);
  window.open("/api/relatorios_gc/frequencia/pdf?"+p,"_blank");
}

function carregarGraficoGC(){
  const el = document.getElementById("grafico_gc_comp");
  if(el) el.innerHTML='<div class="loading-msg">Carregando...</div>';
  carregarDashboard();
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
