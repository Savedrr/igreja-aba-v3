-- IGREJA ABA — Schema v5
CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    senha_hash  TEXT    NOT NULL,
    cargo       TEXT    DEFAULT 'voluntario', -- voluntario | lider | admin
    ativo       INTEGER DEFAULT 1,
    criado_em   TEXT    DEFAULT (datetime('now','localtime')),
    ultimo_acesso TEXT  DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS cultos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    data            TEXT    NOT NULL,
    hora            TEXT    NOT NULL,
    dia_semana      TEXT    NOT NULL,
    periodo         TEXT    NOT NULL,  -- Manhã | Tarde | Noite
    tipo_culto      TEXT    DEFAULT 'Culto Regular', -- Culto Regular | NAREAL | Evento | Reunião de Líderes | Outro
    responsavel     TEXT    NOT NULL,
    presentes       INTEGER DEFAULT 0,
    visitantes      INTEGER DEFAULT 0,
    criancas        INTEGER DEFAULT 0,
    observacoes     TEXT    DEFAULT '',
    usuario_id      INTEGER REFERENCES usuarios(id),
    editado_em      TEXT    DEFAULT NULL,
    editado_por     TEXT    DEFAULT NULL,
    criado_em       TEXT    DEFAULT (datetime('now','localtime'))
);

-- Histórico de edições de culto
CREATE TABLE IF NOT EXISTS cultos_historico (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    culto_id    INTEGER REFERENCES cultos(id) ON DELETE CASCADE,
    campo       TEXT    NOT NULL,
    valor_antes TEXT    DEFAULT '',
    valor_depois TEXT   DEFAULT '',
    alterado_por TEXT   DEFAULT '',
    alterado_em TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS visitantes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    culto_id        INTEGER REFERENCES cultos(id) ON DELETE SET NULL,
    nome            TEXT    NOT NULL,
    idade           TEXT    DEFAULT '',
    telefone        TEXT    NOT NULL,
    endereco        TEXT    DEFAULT '',
    endereco_padronizado TEXT DEFAULT '',
    cidade          TEXT    DEFAULT '',
    bairro          TEXT    DEFAULT '',
    cep             TEXT    DEFAULT '',
    lat             REAL    DEFAULT NULL,
    lng             REAL    DEFAULT NULL,
    como_conheceu   TEXT    DEFAULT '',
    pedido_oracao   TEXT    DEFAULT '',
    quer_visita     INTEGER DEFAULT 0,
    data_visita     TEXT    DEFAULT '',
    hora_visita     TEXT    DEFAULT '',
    observacao      TEXT    DEFAULT '',
    origem          TEXT    DEFAULT 'manual',
    criado_em       TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS checklists (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    culto_id        INTEGER REFERENCES cultos(id) ON DELETE CASCADE,
    categoria       TEXT    NOT NULL,
    item_key        TEXT    NOT NULL,
    item_descricao  TEXT    NOT NULL,
    concluido       INTEGER DEFAULT 0,
    responsavel     TEXT    DEFAULT '',
    criado_em       TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS itens_checklist_padrao (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT    NOT NULL,
    ordem     INTEGER DEFAULT 0,
    descricao TEXT    NOT NULL,
    item_key  TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estoque (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nome              TEXT    NOT NULL UNIQUE,
    categoria         TEXT    DEFAULT 'Geral',
    quantidade        INTEGER DEFAULT 0,
    quantidade_minima INTEGER DEFAULT 0,
    unidade           TEXT    DEFAULT 'unidade',
    descricao         TEXT    DEFAULT '',
    fixo              INTEGER DEFAULT 0,
    criado_em         TEXT    DEFAULT (datetime('now','localtime')),
    atualizado_em     TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS grupos_crescimento (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nome         TEXT    NOT NULL,
    lider        TEXT    DEFAULT '',
    telefone_lider TEXT   DEFAULT '',
    endereco     TEXT    NOT NULL,
    bairro       TEXT    DEFAULT '',
    cidade       TEXT    DEFAULT 'Alvorada',
    setor        TEXT    DEFAULT 'Verde',
    cor_hex      TEXT    DEFAULT '#22C55E',
    lat          REAL    DEFAULT NULL,
    lng          REAL    DEFAULT NULL,
    ativo        INTEGER DEFAULT 1,
    criado_em    TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS gc_direcionamentos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visitante_id    INTEGER REFERENCES visitantes(id) ON DELETE SET NULL,
    gc_id           INTEGER REFERENCES grupos_crescimento(id) ON DELETE SET NULL,
    visitante_nome  TEXT    DEFAULT '',
    gc_nome         TEXT    DEFAULT '',
    distancia_km    REAL    DEFAULT NULL,
    criado_em       TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS cameras (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT    NOT NULL,
    url       TEXT    NOT NULL,
    local     TEXT    DEFAULT '',
    ativa     INTEGER DEFAULT 1,
    criado_em TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS contagem_sessoes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    culto_id         INTEGER REFERENCES cultos(id) ON DELETE SET NULL,
    camera_id        INTEGER REFERENCES cameras(id) ON DELETE SET NULL,
    camera_nome      TEXT    DEFAULT '',
    iniciado_em      TEXT    DEFAULT (datetime('now','localtime')),
    encerrado_em     TEXT    DEFAULT NULL,
    total_entradas   INTEGER DEFAULT 0,
    total_saidas     INTEGER DEFAULT 0,
    pico_simultaneo  INTEGER DEFAULT 0,
    status           TEXT    DEFAULT 'ativa'
);

CREATE TABLE IF NOT EXISTS contagem_registros (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sessao_id     INTEGER REFERENCES contagem_sessoes(id) ON DELETE CASCADE,
    track_id      INTEGER NOT NULL,
    direcao       TEXT    NOT NULL,
    confianca     REAL    DEFAULT 1.0,
    registrado_em TEXT    DEFAULT (datetime('now','localtime'))
);


-- ═══════════════════════════════════════
-- DADOS INICIAIS
-- ═══════════════════════════════════════

-- Admin: Admin@123
INSERT OR IGNORE INTO usuarios (nome, email, senha_hash, cargo) VALUES
('Administrador','admin@igrejaaba.com',
 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7','admin');

-- Checklist padrão
INSERT OR IGNORE INTO itens_checklist_padrao (categoria,ordem,descricao,item_key) VALUES
('antes',1,'Verificar se tem copos no bebedouro','ant_copos'),
('antes',2,'Equipe do estacionamento: usar coletes, distribuir cones','ant_estac'),
('antes',3,'Ligar os ar-condicionados em dias de calor','ant_ar'),
('antes',4,'Estacionamento organizado','ant_estac2'),
('antes',5,'Usar crachá','ant_cracha'),
('antes',6,'Varrer a frente da igreja e a área da cantina','ant_varrer'),
('mesa_entrada',1,'Envelopes de dízimos e oferta','mesa_envelopes'),
('mesa_entrada',2,'Fichas "Quero ser membro de um GC"','mesa_fichas_gc'),
('mesa_entrada',3,'Fichas "Preciso de oração"','mesa_fichas_oracao'),
('mesa_entrada',4,'Organizar os vales presentes dos visitantes','mesa_vales'),
('banheiro',1,'Verificar papel higiênico','ban_papel_hig'),
('banheiro',2,'Verificar papel toalha','ban_papel_toalha'),
('banheiro',3,'Verificar sabonete líquido','ban_sabonete'),
('banheiro',4,'Verificar lixeiras','ban_lixeiras'),
('durante',1,'Distribuir envelopes na oferta','dur_envelopes'),
('durante',2,'Levar água ao ministrador','dur_agua'),
('durante',3,'Atenção nas situações diversas','dur_atencao'),
('durante',4,'Contagem de presentes, visitantes e crianças','dur_contagem'),
('durante',5,'Entregar vale presente','dur_vale'),
('final',1,'Retirar lixo','fin_lixo'),
('final',2,'Organizar cadeiras','fin_cadeiras'),
('final',3,'Desligar ar-condicionado','fin_ar'),
('final',4,'Verificar se todas as luzes estão apagadas','fin_luzes'),
('final',5,'Verificar as torneiras dos banheiros','fin_torneiras'),
('final',6,'Fechar portas','fin_portas'),
('final',7,'Acionar alarme','fin_alarme'),
('final',8,'Recolher cones e placas','fin_cones');

-- Estoque Santa Ceia
INSERT OR IGNORE INTO estoque (nome,categoria,quantidade,quantidade_minima,unidade,descricao,fixo) VALUES
('Cálices de Santa Ceia — Individuais','Santa Ceia',0,50,'unidade','Cálices descartáveis individuais',0),
('Pão da Santa Ceia','Santa Ceia',0,10,'pacote','Pão para celebração',0),
('Suco de Uva da Santa Ceia','Santa Ceia',0,10,'garrafa','Suco de uva para celebração',0),
('Bandeja de Santa Ceia','Santa Ceia',0,5,'unidade','Bandejas para distribuição',0);

-- GCs
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Conectados - Intersul','','Av. Borges de Medeiros, 196','Intersul','Alvorada','Amarelo','#EAB308',-30.0195,-51.072);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Conectados - Jardim Algarve','Gomes e Marilu','Rua Hermínio Machado, 475','Jardim Algarve','Alvorada','Amarelo','#EAB308',-30.0301,-51.0826);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Conectados - Porto Verde','','Rua Beija-flores, 371','Porto Verde','Alvorada','Amarelo','#EAB308',-29.9745,-51.0823);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Corujas','Dinho e Andressa','Rua Corujas, 552','Porto Verde','Alvorada','Azul','#3B82F6',-30.0404,-51.0751);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Master Fé','Eduardo e Vanessa','Rua Gonçalves de Magalhães, 806','Jardim Porto Alegre','Alvorada','Azul','#3B82F6',-30.0243,-51.0766);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Caraá','Nubia e Matheus','Rua Hermínio Machado, 574','Rio dos Sinos','Caraá','Laranja','#F97316',-30.031,-51.0827);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Luz do Mundo','Adriel e Paola','Rua Alameda, 97','Jardim Algarve','Alvorada','Laranja','#F97316',-30.0287,-51.0853);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Maranata','Oriton e Eliane','Rua Pedro Claudio Monassa, 380','Jardim Algarve','Alvorada','Roxo','#A855F7',-30.0292,-51.0813);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Resgate da Cruz','Regis e Gilda','Av. Elmira Pereira Silveira, 327','Jardim Algarve','Alvorada','Roxo','#A855F7',-30.0309,-51.0838);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Infinito e Amém','Gabriel e Bruna','Rua Cento e Trinta e Nove, 84','Jardim Algarve','Alvorada','Verde','#22C55E',-30.0344,-51.0859);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Farol da Lagoa','Vanessa e Lucas','Av. Borges de Medeiros, 196','Intersul','Alvorada','Vermelho','#EF4444',-30.0199,-51.0719);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Manálovers','Juliana e Luiz','Rua Flaviano Morais Monroe, 556','Jardim Algarve','Alvorada','Vermelho','#EF4444',-30.0324,-51.0872);
INSERT OR IGNORE INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES ('GC Palavra Viva','','Rua Trinta e Quatro, 318','Jardim Algarve','Alvorada','Vermelho','#EF4444',-30.0248,-51.0811);


-- Câmera padrão
INSERT OR IGNORE INTO cameras (nome,url,local) VALUES ('Câmera Principal','0','Entrada Principal');

-- ═══════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════
CREATE VIEW IF NOT EXISTS v_resumo_geral AS
SELECT
    COUNT(*)                    AS total_cultos,
    COALESCE(SUM(presentes),0)  AS total_presentes,
    COALESCE(SUM(visitantes),0) AS total_visitantes,
    COALESCE(SUM(criancas),0)   AS total_criancas,
    ROUND(AVG(presentes),1)     AS media_presentes,
    ROUND(AVG(visitantes),1)    AS media_visitantes,
    ROUND(AVG(criancas),1)      AS media_criancas
FROM cultos;

CREATE VIEW IF NOT EXISTS v_cultos_detalhe AS
SELECT c.id, c.data, c.hora, c.dia_semana, c.periodo, c.tipo_culto,
       c.responsavel, c.presentes, c.visitantes, c.criancas,
       c.observacoes, c.criado_em, c.editado_em, c.editado_por,
       COUNT(v.id) AS qtd_visitantes_cadastrados
FROM cultos c
LEFT JOIN visitantes v ON v.culto_id = c.id
GROUP BY c.id;
