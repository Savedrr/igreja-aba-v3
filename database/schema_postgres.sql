-- ============================================================
--  IGREJA ABA — Schema PostgreSQL
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id         SERIAL PRIMARY KEY,
    nome       TEXT    NOT NULL,
    email      TEXT    NOT NULL UNIQUE,
    senha_hash TEXT    NOT NULL,
    cargo      TEXT    DEFAULT 'voluntario',
    ativo      INTEGER DEFAULT 1,
    criado_em  TEXT    DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS cultos (
    id          SERIAL PRIMARY KEY,
    data        TEXT    NOT NULL,
    hora        TEXT    NOT NULL,
    dia_semana  TEXT    NOT NULL,
    periodo     TEXT    NOT NULL,
    responsavel TEXT    NOT NULL,
    presentes   INTEGER DEFAULT 0,
    visitantes  INTEGER DEFAULT 0,
    criancas    INTEGER DEFAULT 0,
    observacoes TEXT    DEFAULT '',
    usuario_id  INTEGER REFERENCES usuarios(id),
    criado_em   TEXT    DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS visitantes (
    id            SERIAL PRIMARY KEY,
    culto_id      INTEGER REFERENCES cultos(id) ON DELETE SET NULL,
    nome          TEXT    NOT NULL,
    idade         TEXT    DEFAULT '',
    telefone      TEXT    NOT NULL,
    endereco      TEXT    DEFAULT '',
    cidade        TEXT    DEFAULT '',
    bairro        TEXT    DEFAULT '',
    cep           TEXT    DEFAULT '',
    como_conheceu TEXT    DEFAULT '',
    pedido_oracao TEXT    DEFAULT '',
    quer_visita   INTEGER DEFAULT 0,
    data_visita   TEXT    DEFAULT '',
    hora_visita   TEXT    DEFAULT '',
    lat           REAL    DEFAULT NULL,
    lng           REAL    DEFAULT NULL,
    observacao    TEXT    DEFAULT '',
    origem        TEXT    DEFAULT 'manual',
    criado_em     TEXT    DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS checklists (
    id             SERIAL PRIMARY KEY,
    culto_id       INTEGER REFERENCES cultos(id) ON DELETE CASCADE,
    categoria      TEXT    NOT NULL,
    item_key       TEXT    NOT NULL,
    item_descricao TEXT    NOT NULL,
    concluido      INTEGER DEFAULT 0,
    responsavel    TEXT    DEFAULT '',
    criado_em      TEXT    DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS itens_checklist_padrao (
    id        SERIAL PRIMARY KEY,
    categoria TEXT    NOT NULL,
    ordem     INTEGER DEFAULT 0,
    descricao TEXT    NOT NULL,
    item_key  TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estoque (
    id                SERIAL PRIMARY KEY,
    nome              TEXT    NOT NULL UNIQUE,
    categoria         TEXT    DEFAULT 'Geral',
    quantidade        INTEGER DEFAULT 0,
    quantidade_minima INTEGER DEFAULT 0,
    unidade           TEXT    DEFAULT 'unidade',
    descricao         TEXT    DEFAULT '',
    fixo              INTEGER DEFAULT 0,
    criado_em         TEXT    DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    atualizado_em     TEXT    DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ── Admin: email adrieladm@aba.com / senha Aba@2026 ──────────
INSERT INTO usuarios (nome, email, senha_hash, cargo)
VALUES ('Adriel','adrieladm@aba.com',
        '9fb629f59f0305ba847aa0f1847c1a6813b5a7574538330e7883743f5637a86d','admin')
ON CONFLICT DO NOTHING;

-- ── Checklist padrão ─────────────────────────────────────────
INSERT INTO itens_checklist_padrao (categoria,ordem,descricao,item_key) VALUES
('antes',1,'Verificar se tem copos no bebedouro','ant_copos'),
('antes',2,'Equipe do estacionamento: usar coletes, distribuir cones e organizar mesas da cantina','ant_estac'),
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
('final',8,'Recolher cones e placas','fin_cones')
ON CONFLICT DO NOTHING;

-- ── Estoque Santa Ceia ────────────────────────────────────────
INSERT INTO estoque (nome, categoria, quantidade, quantidade_minima, unidade, descricao, fixo) VALUES
('Cálices de Santa Ceia — Individuais','Santa Ceia',0,50,'unidade','Cálices descartáveis individuais usados na Santa Ceia',1),
('Pão da Santa Ceia','Santa Ceia',0,10,'pacote','Pão para a celebração da Santa Ceia',1),
('Suco de Uva da Santa Ceia','Santa Ceia',0,10,'garrafa','Suco de uva para a celebração da Santa Ceia',1),
('Bandeja de Santa Ceia','Santa Ceia',0,5,'unidade','Bandejas para distribuição dos cálices',1)
ON CONFLICT DO NOTHING;

-- ── Views ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_resumo_geral AS
SELECT
    COUNT(*)                    AS total_cultos,
    COALESCE(SUM(presentes),0)  AS total_presentes,
    COALESCE(SUM(visitantes),0) AS total_visitantes,
    COALESCE(SUM(criancas),0)   AS total_criancas,
    ROUND(AVG(presentes),1)     AS media_presentes,
    ROUND(AVG(visitantes),1)    AS media_visitantes,
    ROUND(AVG(criancas),1)      AS media_criancas
FROM cultos;

CREATE OR REPLACE VIEW v_cultos_detalhe AS
SELECT c.id, c.data, c.hora, c.dia_semana, c.periodo, c.responsavel,
       c.presentes, c.visitantes, c.criancas, c.observacoes, c.criado_em,
       COUNT(v.id) AS qtd_visitantes_cadastrados
FROM cultos c
LEFT JOIN visitantes v ON v.culto_id = c.id
GROUP BY c.id;
