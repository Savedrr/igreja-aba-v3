"""
IGREJA ABA — Backend v5
Melhorias: Permissões granulares, NAREAL, Edição de cultos,
           Busca de endereço fuzzy, PDF real, GC com líder,
           Estoque corrigido, Dashboard analytics, Logs
"""
from flask import Flask, request, jsonify, render_template, session, redirect, send_file, make_response
from flask_cors import CORS
import os, hashlib, secrets, io, qrcode, base64, urllib.parse, logging, math, json, re, sqlite3
try:
    import psycopg2, psycopg2.extras
    HAS_PG = True
except ImportError:
    HAS_PG = False
from datetime import datetime, date, timedelta
from functools import wraps
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="static", static_url_path="/static",
            template_folder="templates")

_secret = os.environ.get("SECRET_KEY", "igreja-aba-key-2025-seguro")
app.secret_key = _secret
app.config.update(
    SESSION_COOKIE_SECURE   = bool(os.environ.get("RENDER","")),
    SESSION_COOKIE_HTTPONLY = True,
    SESSION_COOKIE_SAMESITE = "Lax",
    SEND_FILE_MAX_AGE_DEFAULT = 0,
    MAX_CONTENT_LENGTH = 16*1024*1024,
)
CORS(app, supports_credentials=True, origins="*")

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.environ.get("DATABASE_URL","").strip()
USE_PG       = bool(DATABASE_URL and HAS_PG)
_db_dir      = os.environ.get("DB_DIR","").strip() or os.path.join(BASE_DIR,"database")
DB_DIR       = _db_dir
DB_PATH      = os.path.join(DB_DIR,"igreja_aba.db")
SQL_PATH     = os.path.join(BASE_DIR,"database","schema.sql")

TIPOS_CULTO = ["Culto Regular","NAREAL","Evento","Reunião de Líderes","Culto de GC","Outro"]

# ── DB ────────────────────────────────────────────────────────

class _PGCursorWrapper:
    """Wrapper de cursor PG que suporta .lastrowid como SQLite"""
    def __init__(self, cur):
        self._cur = cur
        self.lastrowid = None
        # Tenta obter lastval após INSERT
        try:
            self._cur.execute("SELECT lastval()")
            row = self._cur.fetchone()
            if row:
                self.lastrowid = row.get("lastval") or row.get(0)
        except:
            pass
    def fetchone(self): return self._cur.fetchone()
    def fetchall(self): return self._cur.fetchall()
    def __iter__(self): return iter(self._cur.fetchall())

class _PGConnWrapper:
    """Wrapper de conexão PG que imita interface SQLite"""
    def __init__(self, conn):
        self._conn = conn
    def execute(self, sql, params=None):
        # Converte ? para %s (PostgreSQL não aceita ?)
        pg_sql = sql.replace("?", "%s")
        cur = self._conn.cursor()
        if params:
            cur.execute(pg_sql, params)
        else:
            cur.execute(pg_sql)
        # Se foi INSERT, tenta pegar lastrowid via lastval()
        wrapper = type('_R', (), {
            'lastrowid': None,
            'fetchone': cur.fetchone,
            'fetchall': cur.fetchall
        })()
        if pg_sql.strip().upper().startswith('INSERT'):
            try:
                cur2 = self._conn.cursor()
                cur2.execute("SELECT lastval()")
                row = cur2.fetchone()
                if row:
                    wrapper.lastrowid = row.get("lastval") or list(row.values())[0]
            except:
                pass
        return wrapper
    def commit(self): self._conn.commit()
    def rollback(self): self._conn.rollback()
    def close(self): self._conn.close()
    def cursor(self): return self._conn.cursor()
    def __enter__(self): return self
    def __exit__(self, *a):
        if a[0]: self._conn.rollback()
        else: self._conn.commit()
        return False

def get_db():
    if USE_PG:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        conn.autocommit = False
        return _PGConnWrapper(conn)
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

def _exec_pg(conn, sql):
    """Executa bloco SQL no PostgreSQL, ignorando erros de 'já existe'"""
    import psycopg2 as _pg
    cur = conn.cursor()
    for stmt in sql.split(";"):
        stmt = stmt.strip()
        if not stmt or stmt.startswith("--"):
            continue
        try:
            cur.execute(stmt)
            conn.commit()
        except _pg.errors.DuplicateTable:
            conn.rollback()
        except _pg.errors.DuplicateObject:
            conn.rollback()
        except _pg.errors.UniqueViolation:
            conn.rollback()
        except Exception as e:
            conn.rollback()
            logger.warning(f"init_db PG ignorou: {e}")

def _pg_schema():
    """Schema PostgreSQL — sem AUTOINCREMENT, sem PRAGMA, sem SQLite-specific"""
    return """
CREATE TABLE IF NOT EXISTS usuarios (
    id         SERIAL PRIMARY KEY,
    nome       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    cargo      TEXT DEFAULT 'voluntario',
    ativo      INTEGER DEFAULT 1,
    criado_em  TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    ultimo_acesso TEXT DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS cultos (
    id          SERIAL PRIMARY KEY,
    data        TEXT NOT NULL,
    hora        TEXT NOT NULL,
    dia_semana  TEXT NOT NULL,
    periodo     TEXT NOT NULL,
    tipo_culto  TEXT DEFAULT 'Culto Regular',
    responsavel TEXT NOT NULL,
    presentes   INTEGER DEFAULT 0,
    visitantes  INTEGER DEFAULT 0,
    criancas    INTEGER DEFAULT 0,
    observacoes TEXT DEFAULT '',
    usuario_id  INTEGER REFERENCES usuarios(id),
    editado_em  TEXT DEFAULT NULL,
    editado_por TEXT DEFAULT NULL,
    criado_em   TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS cultos_historico (
    id          SERIAL PRIMARY KEY,
    culto_id    INTEGER REFERENCES cultos(id) ON DELETE CASCADE,
    campo       TEXT NOT NULL,
    valor_antes TEXT DEFAULT '',
    valor_depois TEXT DEFAULT '',
    alterado_por TEXT DEFAULT '',
    alterado_em TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS visitantes (
    id          SERIAL PRIMARY KEY,
    culto_id    INTEGER REFERENCES cultos(id) ON DELETE SET NULL,
    nome        TEXT NOT NULL,
    idade       TEXT DEFAULT '',
    telefone    TEXT NOT NULL,
    endereco    TEXT DEFAULT '',
    endereco_padronizado TEXT DEFAULT '',
    cidade      TEXT DEFAULT '',
    bairro      TEXT DEFAULT '',
    cep         TEXT DEFAULT '',
    lat         REAL DEFAULT NULL,
    lng         REAL DEFAULT NULL,
    como_conheceu TEXT DEFAULT '',
    pedido_oracao TEXT DEFAULT '',
    quer_visita INTEGER DEFAULT 0,
    data_visita TEXT DEFAULT '',
    hora_visita TEXT DEFAULT '',
    observacao  TEXT DEFAULT '',
    origem      TEXT DEFAULT 'manual',
    criado_em   TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS checklists (
    id             SERIAL PRIMARY KEY,
    culto_id       INTEGER REFERENCES cultos(id) ON DELETE CASCADE,
    categoria      TEXT NOT NULL,
    item_key       TEXT NOT NULL,
    item_descricao TEXT NOT NULL,
    concluido      INTEGER DEFAULT 0,
    responsavel    TEXT DEFAULT '',
    criado_em      TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS itens_checklist_padrao (
    id        SERIAL PRIMARY KEY,
    categoria TEXT NOT NULL,
    ordem     INTEGER DEFAULT 0,
    descricao TEXT NOT NULL,
    item_key  TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS estoque (
    id                SERIAL PRIMARY KEY,
    nome              TEXT NOT NULL UNIQUE,
    categoria         TEXT DEFAULT 'Geral',
    quantidade        INTEGER DEFAULT 0,
    quantidade_minima INTEGER DEFAULT 0,
    unidade           TEXT DEFAULT 'unidade',
    descricao         TEXT DEFAULT '',
    fixo              INTEGER DEFAULT 0,
    criado_em         TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    atualizado_em     TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS grupos_crescimento (
    id        SERIAL PRIMARY KEY,
    nome      TEXT NOT NULL UNIQUE,
    lider     TEXT DEFAULT '',
    endereco  TEXT NOT NULL,
    bairro    TEXT DEFAULT '',
    cidade    TEXT DEFAULT 'Alvorada',
    setor     TEXT DEFAULT 'Verde',
    cor_hex   TEXT DEFAULT '#22C55E',
    lat       REAL DEFAULT NULL,
    lng       REAL DEFAULT NULL,
    ativo     INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS gc_direcionamentos (
    id             SERIAL PRIMARY KEY,
    visitante_id   INTEGER REFERENCES visitantes(id) ON DELETE SET NULL,
    gc_id          INTEGER REFERENCES grupos_crescimento(id) ON DELETE SET NULL,
    visitante_nome TEXT DEFAULT '',
    gc_nome        TEXT DEFAULT '',
    distancia_km   REAL DEFAULT NULL,
    criado_em      TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS cameras (
    id        SERIAL PRIMARY KEY,
    nome      TEXT NOT NULL,
    url       TEXT NOT NULL,
    local     TEXT DEFAULT '',
    ativa     INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS contagem_sessoes (
    id              SERIAL PRIMARY KEY,
    culto_id        INTEGER REFERENCES cultos(id) ON DELETE SET NULL,
    camera_id       INTEGER REFERENCES cameras(id) ON DELETE SET NULL,
    camera_nome     TEXT DEFAULT '',
    iniciado_em     TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    encerrado_em    TEXT DEFAULT NULL,
    total_entradas  INTEGER DEFAULT 0,
    total_saidas    INTEGER DEFAULT 0,
    pico_simultaneo INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'ativa'
);
CREATE TABLE IF NOT EXISTS contagem_registros (
    id            SERIAL PRIMARY KEY,
    sessao_id     INTEGER REFERENCES contagem_sessoes(id) ON DELETE CASCADE,
    track_id      INTEGER NOT NULL,
    direcao       TEXT NOT NULL,
    confianca     REAL DEFAULT 1.0,
    registrado_em TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
"""

def _pg_inserts():
    """Dados iniciais para PostgreSQL"""
    return [
        ("INSERT INTO usuarios (nome,email,senha_hash,cargo) VALUES (%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING",
         ('Administrador','admin@igrejaaba.com','e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7','admin')),
    ]

_CHECKLIST_ITEMS = [
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
    ('final',8,'Recolher cones e placas','fin_cones'),
]

_GCS = [
    # (nome, lider, endereco, bairro, cidade, setor, cor_hex, lat, lng)
    ('GC Infinito e Amém','','Rua Cento e Trinta e Nove, 84','Jardim Algarve','Alvorada','Verde','#22C55E',-30.0344258,-51.0859922),
    ('GC Luz do Mundo','','Rua Alameda, 97','Jardim Algarve','Alvorada','Laranja','#F97316',-30.0287205,-51.0853365),
    ('GC Conectados','','Rua Beija-flores, 371','Porto Verde','Alvorada','Amarelo','#EAB308',-30.0364173,-51.0764339),
    ('GC Conectado','','Av. Borges de Medeiros, 196','Intersul','Alvorada','Amarelo','#EAB308',-30.0199558,-51.0719866),
    ('GC Palavra Viva','','Rua Trinta e Quatro, 318','Jardim Algarve','Alvorada','Vermelho','#EF4444',-30.032484,-51.081181),
    ('GC Manálovers','','Rua Flaviano Morais Monroe, 556','Jardim Algarve','Alvorada','Vermelho','#EF4444',-30.0324553,-51.0872635),
    ('GC Farol da Lagoa','','Av. Borges de Medeiros, 196','Intersul','Alvorada','Vermelho','#EF4444',-30.0199558,-51.0719866),
    ('GC Master Fé','','Rua Gonçalves de Magalhães, 806','Jardim Porto Alegre','Alvorada','Azul','#3B82F6',-30.0243709,-51.0766738),
    ('GC Maranata','','Rua Pedro Claudio Monassa, 380','Jardim Algarve','Alvorada','Roxo','#A855F7',-30.0292309,-51.0813237),
    ('GC Resgate da Cruz','','Av. Elmira Pereira Silveira, 327','Jardim Algarve','Alvorada','Roxo','#A855F7',-30.0309295,-51.0838007),
    ('GC Corujas','','Rua Corujas, 552','Porto Verde','Alvorada','Azul','#3B82F6',-30.0404527,-51.0751355),
]

_ESTOQUE = [
    ('Cálices de Santa Ceia — Individuais','Santa Ceia',0,50,'unidade','Cálices descartáveis individuais'),
    ('Pão da Santa Ceia','Santa Ceia',0,10,'pacote','Pão para celebração'),
    ('Suco de Uva da Santa Ceia','Santa Ceia',0,10,'garrafa','Suco de uva para celebração'),
    ('Bandeja de Santa Ceia','Santa Ceia',0,5,'unidade','Bandejas para distribuição'),
]

def init_db():
    if USE_PG:
        _init_pg()
    else:
        _init_sqlite()


def _pg_migrations(conn):
    """Adiciona colunas/tabelas que podem faltar em bancos antigos (safe ALTER TABLE)"""
    migrations = [
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso TEXT DEFAULT NULL",
        "ALTER TABLE grupos_crescimento ADD COLUMN IF NOT EXISTS lider TEXT DEFAULT ''",
        "ALTER TABLE cultos ADD COLUMN IF NOT EXISTS tipo_culto TEXT DEFAULT 'Culto Regular'",
        "ALTER TABLE cultos ADD COLUMN IF NOT EXISTS editado_em TEXT DEFAULT NULL",
        "ALTER TABLE cultos ADD COLUMN IF NOT EXISTS editado_por TEXT DEFAULT NULL",
        "ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS endereco_padronizado TEXT DEFAULT ''",
        "ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS lat REAL DEFAULT NULL",
        "ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS lng REAL DEFAULT NULL",
        "ALTER TABLE estoque ADD COLUMN IF NOT EXISTS atualizado_em TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criado_em TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')",
        "ALTER TABLE cultos ADD COLUMN IF NOT EXISTS tipo_culto TEXT DEFAULT 'Culto Regular'",
        "ALTER TABLE cultos ADD COLUMN IF NOT EXISTS editado_em TEXT DEFAULT NULL",
        "ALTER TABLE cultos ADD COLUMN IF NOT EXISTS editado_por TEXT DEFAULT NULL",
        "ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS endereco_padronizado TEXT DEFAULT ''",
        "ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS lat REAL DEFAULT NULL",
        "ALTER TABLE visitantes ADD COLUMN IF NOT EXISTS lng REAL DEFAULT NULL",
        "ALTER TABLE grupos_crescimento ADD COLUMN IF NOT EXISTS lider TEXT DEFAULT ''",
        "ALTER TABLE estoque ADD COLUMN IF NOT EXISTS atualizado_em TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')",
    ]
    cur = conn.cursor()
    for sql in migrations:
        try:
            cur.execute(sql)
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.warning(f"Migration ignorada: {e}")

def _init_pg():
    """Inicializa banco PostgreSQL"""
    try:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        conn.autocommit = False
        _exec_pg(conn, _pg_schema())
        # Migrations seguras — adiciona colunas que podem não existir em bancos antigos
        _pg_migrations(conn)
        # Limpa duplicatas antes de criar índice único
        cur = conn.cursor()
        try:
            cur.execute("""
                DELETE FROM grupos_crescimento WHERE id NOT IN (
                    SELECT MIN(id) FROM grupos_crescimento GROUP BY nome
                )
            """)
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.warning(f"Limpeza duplicatas GC: {e}")

        # Cria índice único no nome do GC (se não existir)
        try:
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_gc_nome ON grupos_crescimento(nome)")
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.warning(f"Índice GC: {e}")

        # Admin padrão
        cur.execute(
            "INSERT INTO usuarios (nome,email,senha_hash,cargo) VALUES (%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING",
            ('Administrador','admin@igrejaaba.com','e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7','admin')
        )
        # Checklist padrão
        for item in _CHECKLIST_ITEMS:
            cur.execute(
                "INSERT INTO itens_checklist_padrao (categoria,ordem,descricao,item_key) VALUES (%s,%s,%s,%s) ON CONFLICT (item_key) DO NOTHING",
                item
            )
        # GCs
        for gc in _GCS:
            cur.execute(
                "INSERT INTO grupos_crescimento (nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (nome) DO NOTHING",
                gc
            )
        # Estoque
        for est in _ESTOQUE:
            cur.execute(
                "INSERT INTO estoque (nome,categoria,quantidade,quantidade_minima,unidade,descricao,fixo) VALUES (%s,%s,%s,%s,%s,%s,0) ON CONFLICT (nome) DO NOTHING",
                est
            )
        # Câmera padrão

        # Atualiza coordenadas fixas dos GCs conhecidos
        _gc_coords = {
            'GC Infinito e Amém':  (-30.0344258,-51.08599221),
            'GC Luz do Mundo':     (-30.0287205,-51.0853365),
            'GC Conectados':       (-30.0364173,-51.0764339),
            'GC Conectados Intersul': (-30.0199558,-51.0719866),
            'GC Palavra Viva':     (-30.032484,-51.081181),
            'GC Manálovers':       (-30.0324553,-51.0872635),
            'GC Farol da Lagoa':   (-30.0199558,-51.0719866),
            'GC Master Fé':        (-30.0243709,-51.0766738),
            'GC Maranata':         (-30.0292309,-51.0813237),
            'GC Resgate da Cruz':  (-30.0309295,-51.0838007),
            'GC Corujas':          (-30.0404527,-51.0751355),
        }
        for nome, (lat, lng) in _gc_coords.items():
            try:
                cur.execute(
                    "UPDATE grupos_crescimento SET lat=%s, lng=%s WHERE nome=%s AND (lat IS NULL OR lat=0)",
                    (lat, lng, nome)
                )
                conn.commit()
            except Exception as e:
                conn.rollback()
        # Câmera: só insere se não existir nenhuma
        cur.execute("SELECT COUNT(*) as n FROM cameras")
        row = cur.fetchone()
        if (row.get("n") if hasattr(row,"get") else row[0]) == 0:
            cur.execute(
                "INSERT INTO cameras (nome,url,local) VALUES (%s,%s,%s)",
                ('Câmera Principal','0','Entrada Principal')
            )
        conn.commit()
        conn.close()
        logger.info("PostgreSQL inicializado com sucesso!")
    except Exception as e:
        logger.error(f"Erro init PostgreSQL: {e}")
        raise

def _init_sqlite():
    """Inicializa banco SQLite"""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    with open(SQL_PATH,"r",encoding="utf-8") as sf:
        conn.executescript(sf.read())
    conn.execute("DELETE FROM estoque WHERE id NOT IN (SELECT MIN(id) FROM estoque GROUP BY nome)")
    try:
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_nome ON estoque(nome)")
    except: pass
    conn.commit()
    conn.close()
    logger.info(f"SQLite inicializado: {DB_PATH}")




def get_lastid(conn, table=None):
    """Obtém o último ID inserido (PG usa lastval, SQLite usa lastrowid de outra forma)"""
    if USE_PG:
        try:
            cur2 = conn.cursor()
            cur2.execute("SELECT lastval()")
            row = cur2.fetchone()
            return row["lastval"] if row else None
        except:
            return None
    return None  # SQLite usa cur.lastrowid diretamente

def executar_insert(conn, sql, params):
    """Executa INSERT e retorna o ID inserido (funciona em PG e SQLite)"""
    if USE_PG:
        # Adiciona RETURNING id se não tiver
        sql_ret = sql.rstrip().rstrip(")").rstrip()
        if "RETURNING" not in sql.upper():
            # Precisamos usar cursor diretamente no PG
            cur = conn.cursor()
            cur.execute(qmark(sql), params)
            # Tenta obter id via lastval
            cur.execute("SELECT lastval()")
            row = cur.fetchone()
            return row["lastval"] if row else None
        else:
            cur = conn.cursor()
            cur.execute(qmark(sql), params)
            row = cur.fetchone()
            return row["id"] if row else None
    else:
        cur = conn.execute(sql, params)
        return cur.lastrowid

def ph(n=1):
    """Retorna placeholders corretos: %s para PG, ? para SQLite"""
    if USE_PG:
        return ",".join(["%s"]*n) if n>1 else "%s"
    return ",".join(["?"]*n) if n>1 else "?"

def qmark(sql):
    """Converte ? para %s quando usando PostgreSQL"""
    if USE_PG:
        return sql.replace("?", "%s")
    return sql

def lastid(conn, cur_or_result, table=None):
    """Retorna último ID inserido"""
    if USE_PG:
        r = cur_or_result.fetchone()
        return r["id"] if r else None
    return cur_or_result.lastrowid

def hs(s): return hashlib.sha256(s.encode()).hexdigest()

# ── Helpers ───────────────────────────────────────────────────
DIAS = {0:"Segunda-feira",1:"Terça-feira",2:"Quarta-feira",
        3:"Quinta-feira",4:"Sexta-feira",5:"Sábado",6:"Domingo"}

def dia_pt(s):
    try: return DIAS[datetime.strptime(s,"%Y-%m-%d").weekday()]
    except: return ""

def br(s):
    try: return datetime.strptime(s,"%Y-%m-%d").strftime("%d/%m/%Y")
    except: return s or ""

def get_base():
    b = os.environ.get("BASE_URL","").rstrip("/")
    if b: return b
    proto = request.headers.get("X-Forwarded-Proto", request.scheme)
    host  = request.headers.get("X-Forwarded-Host",  request.host)
    return f"{proto}://{host}"

def haversine(la1,lo1,la2,lo2):
    R=6371; r=math.pi/180
    d1=(la2-la1)*r; d2=(lo2-lo1)*r
    a=math.sin(d1/2)**2+math.cos(la1*r)*math.cos(la2*r)*math.sin(d2/2)**2
    return R*2*math.asin(math.sqrt(max(0,a)))


# ── Geocode melhorado com Nominatim ──────────────────────────
def geocode_smart(query, cidade_fallback='Alvorada'):
    """Geocode removido — GC Finder usa coordenadas pré-definidas"""
    return None, None, ""

# ── Auth decorators ───────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def dec(*a,**k):
        if "usuario_id" not in session:
            return jsonify({"erro":"Não autenticado"}),401
        return f(*a,**k)
    return dec

def role_required(*roles):
    """Exige que o usuário tenha um dos cargos especificados"""
    def decorator(f):
        @wraps(f)
        def dec(*a,**k):
            if "usuario_id" not in session:
                return jsonify({"erro":"Não autenticado"}),401
            cargo = session.get("usuario_cargo","voluntario")
            if cargo not in roles:
                return jsonify({"erro":"Sem permissão para esta ação"}),403
            return f(*a,**k)
        return dec
    return decorator

def can_edit():
    """Líderes e admins podem editar"""
    return session.get("usuario_cargo","voluntario") in ("lider","admin")

def is_admin():
    return session.get("usuario_cargo") == "admin"

# ── Erros ─────────────────────────────────────────────────────
@app.errorhandler(500)
def e500(e): return jsonify({"erro":"Erro interno","d":str(e)}),500
@app.errorhandler(404)
def e404(e): return jsonify({"erro":"Não encontrado"}),404

# ═══════════════════════════════════════════════════════════════
# PÁGINAS
# ═══════════════════════════════════════════════════════════════
@app.route("/")
def index(): return render_template("index.html")

@app.route("/app")
def app_main():
    if "usuario_id" not in session: return redirect("/")
    return render_template("app.html")

@app.route("/formulario")
def formulario():
    return render_template("formulario.html", culto_id=request.args.get("culto_id",""))

@app.route("/static/sw.js")
def service_worker():
    from flask import send_from_directory, Response
    sw_path = os.path.join(BASE_DIR, "static", "sw.js")
    with open(sw_path) as f:
        content = f.read()
    return Response(content, mimetype="application/javascript",
                    headers={"Service-Worker-Allowed": "/"})

@app.route("/health")
def health():
    try:
        with get_db() as conn: conn.execute("SELECT 1")
        return jsonify({"status":"ok","time":datetime.now().isoformat()})
    except Exception as e:
        return jsonify({"status":"error","e":str(e)}),500

# ═══════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════
@app.route("/api/login", methods=["POST"])
def login():
    try:
        d     = request.get_json(force=True) or {}
        email = d.get("email","").strip().lower()
        senha = d.get("senha","")
        if not email or not senha:
            return jsonify({"erro":"Preencha e-mail e senha"}),400
        with get_db() as conn:
            u = conn.execute(
                "SELECT * FROM usuarios WHERE email=? AND ativo=1",(email,)
            ).fetchone()
        if not u:
            return jsonify({"erro":"Usuário não encontrado ou inativo"}),401
        if u["senha_hash"] != hs(senha):
            return jsonify({"erro":"Senha incorreta"}),401
        session.permanent = True
        session["usuario_id"]    = u["id"]
        session["usuario_nome"]  = u["nome"]
        session["usuario_cargo"] = u["cargo"]
        # Atualiza último acesso
        with get_db() as conn:
            try:
                conn.execute(qmark("UPDATE usuarios SET ultimo_acesso=? WHERE id=?"),
                             (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), u["id"]))
                conn.commit()
            except Exception as _e:
                logger.warning(f"Nao salvou ultimo_acesso: {_e}")
                try: conn.rollback()
                except: pass
        return jsonify({"ok":True,"nome":u["nome"],"cargo":u["cargo"]})
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({"erro":str(e)}),500

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok":True})

@app.route("/api/me")
def me():
    if "usuario_id" not in session:
        return jsonify({"autenticado":False})
    return jsonify({
        "autenticado": True,
        "id":    session["usuario_id"],
        "nome":  session["usuario_nome"],
        "cargo": session["usuario_cargo"]
    })

# ═══════════════════════════════════════════════════════════════
# USUÁRIOS — apenas admin
# ═══════════════════════════════════════════════════════════════
@app.route("/api/usuarios", methods=["GET"])
@login_required
def listar_usuarios():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id,nome,email,cargo,ativo,criado_em FROM usuarios ORDER BY nome"
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/usuarios", methods=["POST"])
@role_required("admin")
def criar_usuario():
    d     = request.get_json(force=True) or {}
    nome  = d.get("nome","").strip()
    email = d.get("email","").strip().lower()
    senha = d.get("senha","")
    cargo = d.get("cargo","voluntario")
    conf  = d.get("confirmar_senha","")
    if not nome or not email or not senha:
        return jsonify({"erro":"Nome, e-mail e senha são obrigatórios"}),400
    if len(senha) < 8:
        return jsonify({"erro":"Senha deve ter no mínimo 8 caracteres"}),400
    if senha != conf:
        return jsonify({"erro":"As senhas não coincidem"}),400
    if not re.search(r'[A-Z]', senha):
        return jsonify({"erro":"Senha deve ter ao menos uma letra maiúscula"}),400
    if not re.search(r'[0-9]', senha):
        return jsonify({"erro":"Senha deve ter ao menos um número"}),400
    if cargo not in ("voluntario","lider","admin"):
        return jsonify({"erro":"Cargo inválido"}),400
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO usuarios(nome,email,senha_hash,cargo) VALUES(?,?,?,?)",
                (nome, email, hs(senha), cargo)
            )
            conn.commit()
        return jsonify({"ok":True})
    except Exception as e:
        return jsonify({"erro":"E-mail já cadastrado" if "UNIQUE" in str(e) else str(e)}),400

@app.route("/api/usuarios/<int:uid>", methods=["PUT"])
@login_required
def editar_usuario(uid):
    # Voluntário só pode mudar a própria senha
    cargo_atual = session.get("usuario_cargo","voluntario")
    meu_id = session["usuario_id"]
    d = request.get_json(force=True) or {}

    if cargo_atual == "voluntario" and meu_id != uid:
        return jsonify({"erro":"Sem permissão"}),403

    with get_db() as conn:
        alvo = conn.execute(qmark("SELECT * FROM usuarios WHERE id=?"), (uid,)).fetchone()
        if not alvo: return jsonify({"erro":"Usuário não encontrado"}),404

        # Ninguém (nem admin) pode mudar cargo de outro admin sem ser admin
        if "cargo" in d and cargo_atual != "admin":
            return jsonify({"erro":"Apenas admins alteram cargos"}),403

        # Não pode excluir/desativar o próprio admin
        if "ativo" in d and uid == meu_id:
            return jsonify({"erro":"Não pode desativar a si mesmo"}),400

        if "nova_senha" in d and d["nova_senha"]:
            nova = d["nova_senha"]
            conf = d.get("confirmar_nova_senha","")
            if len(nova) < 8:
                return jsonify({"erro":"Senha mínima de 8 caracteres"}),400
            if nova != conf:
                return jsonify({"erro":"As senhas não coincidem"}),400
            if not re.search(r'[A-Z]', nova):
                return jsonify({"erro":"Senha deve ter ao menos uma letra maiúscula"}),400
            if not re.search(r'[0-9]', nova):
                return jsonify({"erro":"Senha deve ter ao menos um número"}),400
            conn.execute(qmark("UPDATE usuarios SET senha_hash=? WHERE id=?"), (hs(nova),uid))

        if "nome" in d:
            conn.execute(qmark("UPDATE usuarios SET nome=? WHERE id=?"), (d["nome"],uid))
        if "cargo" in d and cargo_atual == "admin":
            conn.execute(qmark("UPDATE usuarios SET cargo=? WHERE id=?"), (d["cargo"],uid))
        if "ativo" in d and cargo_atual == "admin":
            conn.execute(qmark("UPDATE usuarios SET ativo=? WHERE id=?"), (int(d["ativo"]),uid))
        conn.commit()

    return jsonify({"ok":True})

@app.route("/api/usuarios/<int:uid>", methods=["DELETE"])
@role_required("admin")
def deletar_usuario(uid):
    if uid == session["usuario_id"]:
        return jsonify({"erro":"Não pode excluir a si mesmo"}),400
    with get_db() as conn:
        alvo = conn.execute(qmark("SELECT cargo FROM usuarios WHERE id=?"), (uid,)).fetchone()
        if alvo and alvo["cargo"] == "admin":
            # Conta quantos admins existem
            total_admins = conn.execute(
                "SELECT COUNT(*) FROM usuarios WHERE cargo='admin' AND ativo=1"
            ).fetchone()[0]
            if total_admins <= 1:
                return jsonify({"erro":"Não é possível remover o único administrador"}),400
        conn.execute(qmark("DELETE FROM usuarios WHERE id=?"), (uid,)); conn.commit()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════════════
# CULTOS
# ═══════════════════════════════════════════════════════════════
@app.route("/api/cultos", methods=["GET"])
@login_required
def listar_cultos():
    ini = request.args.get("data_ini","")
    fim = request.args.get("data_fim","")
    per = request.args.get("periodo","")
    tpc = request.args.get("tipo_culto","")
    sql = "SELECT id,data,hora,dia_semana,periodo,COALESCE(tipo_culto,'Culto Regular') as tipo_culto,responsavel,presentes,visitantes,criancas,observacoes,criado_em,editado_em,editado_por FROM cultos WHERE 1=1"
    p   = []
    if ini: sql+=" AND data>=?"; p.append(ini)
    if fim: sql+=" AND data<=?"; p.append(fim)
    if per: sql+=" AND periodo=?"; p.append(per)
    if tpc: sql+=" AND tipo_culto=?"; p.append(tpc)
    sql += " ORDER BY data DESC,hora DESC"
    with get_db() as conn:
        rows = conn.execute(sql,p).fetchall()
    return jsonify([{**dict(r),"data_br":br(r["data"])} for r in rows])

@app.route("/api/cultos", methods=["POST"])
@login_required
def criar_culto():
    # Voluntário pode criar culto (preencher relatório)
    d   = request.get_json(force=True) or {}
    dc  = d.get("data", date.today().isoformat())
    hc  = d.get("hora", datetime.now().strftime("%H:%M"))
    resp= d.get("responsavel","").strip()
    tc  = d.get("tipo_culto","Culto Regular")
    if not resp: return jsonify({"erro":"Responsável obrigatório"}),400
    if tc not in TIPOS_CULTO: tc = "Culto Regular"
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO cultos(data,hora,dia_semana,periodo,tipo_culto,responsavel,
               presentes,visitantes,criancas,observacoes,usuario_id)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (dc,hc,dia_pt(dc),d.get("periodo","Noite"),tc,resp,
             int(d.get("presentes",0)),int(d.get("visitantes",0)),int(d.get("criancas",0)),
             d.get("observacoes",""),session["usuario_id"])
        )
        cid = cur.lastrowid
        for item in conn.execute(
            "SELECT * FROM itens_checklist_padrao ORDER BY categoria,ordem"
        ).fetchall():
            conn.execute(
                "INSERT INTO checklists(culto_id,categoria,item_key,item_descricao,concluido,responsavel) VALUES(?,?,?,?,0,?)",
                (cid,item["categoria"],item["item_key"],item["descricao"],resp)
            )
        conn.commit()
    return jsonify({"ok":True,"id":cid,"dia_semana":dia_pt(dc)})

@app.route("/api/cultos/<int:cid>", methods=["GET"])
@login_required
def obter_culto(cid):
    with get_db() as conn:
        c = conn.execute(qmark("SELECT id,data,hora,dia_semana,periodo,COALESCE(tipo_culto,'Culto Regular') as tipo_culto,responsavel,presentes,visitantes,criancas,observacoes,criado_em,editado_em,editado_por FROM cultos WHERE id=?"), (cid,)).fetchone()
        if not c: return jsonify({"erro":"Culto não encontrado"}),404
        chks= conn.execute(qmark("SELECT * FROM checklists WHERE culto_id=? ORDER BY categoria,id"), (cid,)).fetchall()
        vis = conn.execute(qmark("SELECT * FROM visitantes WHERE culto_id=? ORDER BY id"), (cid,)).fetchall()
        hist= conn.execute(qmark("SELECT * FROM cultos_historico WHERE culto_id=? ORDER BY alterado_em DESC LIMIT 20"), (cid,)).fetchall()
    row = dict(c); row["data_br"] = br(row["data"])
    return jsonify({
        "culto":      row,
        "checklists": [dict(x) for x in chks],
        "visitantes": [dict(v) for v in vis],
        "historico":  [dict(h) for h in hist]
    })

@app.route("/api/cultos/<int:cid>", methods=["PUT"])
@login_required
def atualizar_culto(cid):
    # Apenas líder e admin podem editar cultos existentes
    if not can_edit():
        return jsonify({"erro":"Apenas líderes e admins podem editar relatórios"}),403
    d = request.get_json(force=True) or {}
    with get_db() as conn:
        antigo = conn.execute(qmark("SELECT * FROM cultos WHERE id=?"), (cid,)).fetchone()
        if not antigo: return jsonify({"erro":"Culto não encontrado"}),404

        # Registra histórico de alterações
        campos = ["presentes","visitantes","criancas","observacoes","periodo","tipo_culto","responsavel"]
        for campo in campos:
            novo_val = str(d.get(campo, antigo[campo] or ""))
            vel      = str(antigo[campo] or "")
            if novo_val != vel:
                conn.execute(
                    "INSERT INTO cultos_historico(culto_id,campo,valor_antes,valor_depois,alterado_por) VALUES(?,?,?,?,?)",
                    (cid, campo, vel, novo_val, session.get("usuario_nome","?"))
                )

        tc = d.get("tipo_culto", antigo["tipo_culto"])
        if tc not in TIPOS_CULTO: tc = antigo["tipo_culto"]

        conn.execute(
            """UPDATE cultos SET presentes=?,visitantes=?,criancas=?,observacoes=?,
               periodo=?,tipo_culto=?,responsavel=?,editado_em=?,editado_por=?
               WHERE id=?""",
            (int(d.get("presentes",  antigo["presentes"])),
             int(d.get("visitantes", antigo["visitantes"])),
             int(d.get("criancas",   antigo["criancas"])),
             d.get("observacoes",    antigo["observacoes"] or ""),
             d.get("periodo",        antigo["periodo"]),
             tc,
             d.get("responsavel",    antigo["responsavel"]),
             datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
             session.get("usuario_nome","?"),
             cid)
        )
        conn.commit()
    return jsonify({"ok":True})

@app.route("/api/cultos/<int:cid>", methods=["DELETE"])
@role_required("admin","lider")
def deletar_culto(cid):
    with get_db() as conn:
        conn.execute(qmark("DELETE FROM cultos WHERE id=?"), (cid,)); conn.commit()
    return jsonify({"ok":True})

@app.route("/api/qrcode_fixo", methods=["GET"])
@login_required
def qrcode_fixo():
    """QR Code único permanente — serve para todos os cultos"""
    url = f"{get_base()}/formulario"
    qr  = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H,
                         box_size=8, border=4)
    qr.add_data(url); qr.make(fit=True)
    img = qr.make_image(fill_color="#0A2463", back_color="white")
    buf = io.BytesIO(); img.save(buf,"PNG"); buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    return jsonify({"qrcode":f"data:image/png;base64,{b64}","url":url})

@app.route("/api/cultos/<int:cid>/qrcode", methods=["GET"])
@login_required
def qrcode_culto(cid):
    return qrcode_fixo()

# ═══════════════════════════════════════════════════════════════
# CHECKLIST
# ═══════════════════════════════════════════════════════════════
@app.route("/api/cultos/<int:cid>/checklist", methods=["GET"])
@login_required
def get_checklist(cid):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM checklists WHERE culto_id=? ORDER BY categoria,id",(cid,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/checklist/<int:iid>", methods=["PUT"])
@login_required
def atualizar_check(iid):
    d = request.get_json(force=True) or {}
    concluido = 1 if d.get("concluido") else 0
    with get_db() as conn:
        conn.execute(qmark("UPDATE checklists SET concluido=? WHERE id=?"), (concluido,iid))
        conn.commit()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════════════
# VISITANTES
# ═══════════════════════════════════════════════════════════════
@app.route("/api/visitantes", methods=["POST"])
def criar_visitante():
    """Pública — usada pelo QR Code e por usuários logados"""
    d        = request.get_json(force=True) or {}
    nome     = d.get("nome","").strip()
    telefone = d.get("telefone","").strip()
    if not nome or not telefone:
        return jsonify({"erro":"Nome e telefone são obrigatórios"}),400
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO visitantes(culto_id,nome,idade,telefone,endereco,
               endereco_padronizado,cidade,bairro,cep,lat,lng,
               como_conheceu,pedido_oracao,quer_visita,data_visita,hora_visita,observacao,origem)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (d.get("culto_id") or None, nome, d.get("idade",""), telefone,
             d.get("endereco",""), d.get("endereco_padronizado",""),
             d.get("cidade",""), d.get("bairro",""), d.get("cep",""),
             d.get("lat"), d.get("lng"),
             d.get("como_conheceu",""), d.get("pedido_oracao",""),
             1 if d.get("quer_visita") else 0,
             d.get("data_visita",""), d.get("hora_visita",""),
             d.get("observacao",""), d.get("origem","manual"))
        )
        conn.commit(); vid = cur.lastrowid
    return jsonify({"ok":True,"id":vid})

@app.route("/api/visitantes", methods=["GET"])
@login_required
def listar_visitantes():
    with get_db() as conn:
        rows = conn.execute(
            """SELECT v.*,c.data as culto_data,c.periodo as culto_periodo,c.tipo_culto
               FROM visitantes v LEFT JOIN cultos c ON c.id=v.culto_id
               ORDER BY v.criado_em DESC"""
        ).fetchall()
    return jsonify([{**dict(r),"culto_data_br":br(r["culto_data"]) if r["culto_data"] else ""} for r in rows])

@app.route("/api/visitantes/<int:vid>", methods=["DELETE"])
@role_required("admin","lider")
def deletar_visitante(vid):
    with get_db() as conn:
        conn.execute(qmark("DELETE FROM visitantes WHERE id=?"), (vid,)); conn.commit()
    return jsonify({"ok":True})

@app.route("/api/visitantes/<int:vid>/link", methods=["GET"])
@login_required
def link_visitante(vid):
    with get_db() as conn:
        v = conn.execute(qmark("SELECT * FROM visitantes WHERE id=?"), (vid,)).fetchone()
    if not v: return jsonify({"erro":"Não encontrado"}),404
    v = dict(v)
    q = f"{v.get('endereco','')} {v.get('bairro','')} {v.get('cidade','')}".strip()
    maps = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(q)}"
    tel  = re.sub(r'\D','',v["telefone"])
    if not tel.startswith("55"): tel = "55"+tel
    msg = f"Olá {v['nome']}, tudo bem? Somos da Igreja ABA e ficamos muito felizes com sua visita! 😊"
    wa  = f"https://wa.me/{tel}?text={urllib.parse.quote(msg)}"
    return jsonify({"nome":v["nome"],"telefone":v["telefone"],"maps_link":maps,"whatsapp_link":wa})

# ═══════════════════════════════════════════════════════════════
# GEOCODIFICAÇÃO
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# ESTOQUE — corrigido
# ═══════════════════════════════════════════════════════════════
@app.route("/api/estoque", methods=["GET"])
@login_required
def listar_estoque():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM estoque ORDER BY fixo DESC,categoria,nome").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/estoque", methods=["POST"])
@role_required("admin","lider")
def criar_estoque():
    d    = request.get_json(force=True) or {}
    nome = d.get("nome","").strip()
    if not nome:
        return jsonify({"erro":"Nome do item é obrigatório"}),400
    try:
        with get_db() as conn:
            qtd     = int(d.get("quantidade",0))
            qtd_min = int(d.get("quantidade_minima",0))
            cur = conn.execute(
                "INSERT INTO estoque(nome,categoria,quantidade,quantidade_minima,unidade,descricao,fixo) VALUES(?,?,?,?,?,?,0)",
                (nome, d.get("categoria","Geral"), qtd, qtd_min,
                 d.get("unidade","unidade"), d.get("descricao",""))
            )
            conn.commit()
        return jsonify({"ok":True,"id":cur.lastrowid})
    except Exception as e:
        if "UNIQUE" in str(e):
            return jsonify({"erro":f"Já existe um item chamado '{nome}'"}),400
        logger.error(f"Erro criar estoque: {e}")
        return jsonify({"erro":"Erro ao salvar. Tente novamente."}),500

@app.route("/api/estoque/<int:iid>", methods=["PUT"])
@role_required("admin","lider")
def update_estoque(iid):
    d = request.get_json(force=True) or {}
    with get_db() as conn:
        item = conn.execute(qmark("SELECT * FROM estoque WHERE id=?"), (iid,)).fetchone()
        if not item: return jsonify({"erro":"Item não encontrado"}),404
        if is_admin():
            conn.execute(
                """UPDATE estoque SET nome=?,categoria=?,quantidade=?,quantidade_minima=?,
                   unidade=?,descricao=?,atualizado_em=? WHERE id=?""",
                (d.get("nome",item["nome"]),d.get("categoria",item["categoria"]),
                 int(d.get("quantidade",item["quantidade"])),
                 int(d.get("quantidade_minima",item["quantidade_minima"])),
                 d.get("unidade",item["unidade"]),d.get("descricao",item["descricao"]),datetime.now().strftime('%Y-%m-%d %H:%M:%S'),iid)
            )
        else:
            conn.execute(
                "UPDATE estoque SET quantidade=?,atualizado_em=? WHERE id=?",
                (int(d.get("quantidade",item["quantidade"])),datetime.now().strftime('%Y-%m-%d %H:%M:%S'),iid)
            )
        conn.commit()
    return jsonify({"ok":True})

@app.route("/api/estoque/<int:iid>", methods=["DELETE"])
@role_required("admin")
def del_estoque(iid):
    with get_db() as conn:
        item = conn.execute(qmark("SELECT fixo FROM estoque WHERE id=?"), (iid,)).fetchone()
        if not item: return jsonify({"erro":"Não encontrado"}),404
        if item["fixo"]:
            return jsonify({"erro":"Itens de Santa Ceia não podem ser excluídos"}),403
        conn.execute(qmark("DELETE FROM estoque WHERE id=?"), (iid,)); conn.commit()
    return jsonify({"ok":True})

# ═══════════════════════════════════════════════════════════════
# CONECTA GC — com líder e edição completa
# ═══════════════════════════════════════════════════════════════
@app.route("/api/gcs", methods=["GET"])
@login_required
def listar_gcs():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM grupos_crescimento WHERE ativo=1 ORDER BY setor,nome"
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/gcs", methods=["POST"])
@role_required("admin")
def criar_gc():
    d    = request.get_json(force=True) or {}
    nome = d.get("nome","").strip()
    end  = d.get("endereco","").strip()
    if not nome or not end:
        return jsonify({"erro":"Nome e endereço são obrigatórios"}),400
    bairro = d.get("bairro",""); cidade = d.get("cidade","Alvorada")
    # Geocodifica automaticamente
    lat, lng = None, None  # Geocode desativado
    cor_map = {"Verde":"#22C55E","Laranja":"#F97316","Amarelo":"#EAB308",
               "Vermelho":"#EF4444","Azul":"#3B82F6","Roxo":"#A855F7"}
    setor = d.get("setor","Verde")
    with get_db() as conn:
        cur = conn.execute(
            qmark("INSERT INTO grupos_crescimento(nome,lider,endereco,bairro,cidade,setor,cor_hex,lat,lng) VALUES(?,?,?,?,?,?,?,?,?)"),
            (nome, d.get("lider",""), end, bairro, cidade, setor,
             d.get("cor_hex", cor_map.get(setor,"#22C55E")), lat, lng)
        )
        conn.commit()
    return jsonify({"ok":True,"id":cur.lastrowid})

@app.route("/api/gcs/<int:gid>", methods=["PUT"])
@role_required("admin")
def atualizar_gc(gid):
    d = request.get_json(force=True) or {}
    with get_db() as conn:
        gc = conn.execute(qmark("SELECT * FROM grupos_crescimento WHERE id=?"), (gid,)).fetchone()
        if not gc: return jsonify({"erro":"GC não encontrado"}),404
        novo_end = d.get("endereco", gc["endereco"])
        novo_bai = d.get("bairro",   gc["bairro"])
        nova_cid = d.get("cidade",   gc["cidade"])
        lat, lng = gc["lat"], gc["lng"]
        if novo_end != gc["endereco"] or novo_bai != gc["bairro"]:
            lat, lng = None, None  # Geocode desativado
        conn.execute(
            qmark("""UPDATE grupos_crescimento SET nome=?,lider=?,endereco=?,bairro=?,cidade=?,
               setor=?,cor_hex=?,lat=?,lng=?,ativo=? WHERE id=?"""),
            (d.get("nome",gc["nome"]), d.get("lider",gc.get("lider","")),
             novo_end, novo_bai, nova_cid,
             d.get("setor",gc["setor"]), d.get("cor_hex",gc["cor_hex"]),
             lat, lng, int(d.get("ativo",gc["ativo"])), gid)
        )
        conn.commit()
    return jsonify({"ok":True})

@app.route("/api/gcs/<int:gid>", methods=["DELETE"])
@role_required("admin")
def del_gc(gid):
    with get_db() as conn:
        conn.execute(qmark("UPDATE grupos_crescimento SET ativo=0 WHERE id=?"), (gid,)); conn.commit()
    return jsonify({"ok":True})


@app.route("/api/gcs/calcular_proximo", methods=["POST"])
@login_required
def calcular_gc():
    d   = request.get_json(force=True) or {}
    q   = d.get("query","").strip()  # campo único de busca
    end = d.get("endereco","").strip()
    bai = d.get("bairro","").strip()
    cid = d.get("cidade","Alvorada").strip()
    if not q and not end:
        return jsonify({"erro":"Digite um endereço"}),400
    busca = q or f"{end}, {bai}, {cid}"
    lat_v, lng_v, display_v = None, None, busca
    # Geocode desativado — usa coordenadas do centro de Alvorada como base
    # O cálculo de distância é por proximidade relativa dos GCs
    lat_v = -29.9727   # Centro de Alvorada RS
    lng_v = -51.0808
    display_v = busca
    with get_db() as conn:
        gcs = conn.execute(
            "SELECT * FROM grupos_crescimento WHERE ativo=1 AND lat IS NOT NULL AND lat!=0"
        ).fetchall()
    if not gcs:
        return jsonify({"erro":"GCs ainda sem coordenadas. Clique em 'Geocodificar GCs'."}),422
    results = []
    for gc in gcs:
        dist = haversine(lat_v,lng_v,gc["lat"],gc["lng"])
        _o = urllib.parse.quote(display_v or busca)
        _d = urllib.parse.quote(f"{gc['endereco']}, {gc['bairro']}, {gc['cidade']}, RS")
        rota = f"https://www.google.com/maps/dir/?api=1&origin={_o}&destination={_d}&travelmode=driving"
        results.append({**dict(gc),"distancia_km":round(dist,2),"rota_link":rota})
    results.sort(key=lambda x:x["distancia_km"])
    return jsonify({"ok":True,
                    "visitante":{"lat":lat_v,"lng":lng_v,"endereco":display_v or busca},
                    "gcs":results,"mais_proximo":results[0]})

@app.route("/api/gcs/direcionar", methods=["POST"])
@login_required
def direcionar():
    d = request.get_json(force=True) or {}
    with get_db() as conn:
        conn.execute(
            "INSERT INTO gc_direcionamentos(visitante_id,gc_id,visitante_nome,gc_nome,distancia_km) VALUES(?,?,?,?,?)",
            (d.get("visitante_id"),d.get("gc_id"),d.get("visitante_nome",""),d.get("gc_nome",""),d.get("distancia_km"))
        )
        if d.get("visitante_id"):
            conn.execute(qmark("UPDATE visitantes SET observacao=? WHERE id=?"), (f"Direcionado para: {d.get('gc_nome','')}", d.get("visitante_id")))
        conn.commit()
    return jsonify({"ok":True})

@app.route("/api/gcs/direcionamentos", methods=["GET"])
@login_required
def direcionamentos():
    with get_db() as conn:
        rows = conn.execute(
            """SELECT d.*,gc.cor_hex FROM gc_direcionamentos d
               LEFT JOIN grupos_crescimento gc ON gc.id=d.gc_id
               ORDER BY d.criado_em DESC LIMIT 100"""
        ).fetchall()
    return jsonify([dict(r) for r in rows])

# ═══════════════════════════════════════════════════════════════
# DASHBOARD — Analytics
# ═══════════════════════════════════════════════════════════════
@app.route("/api/dashboard", methods=["GET"])
@role_required("lider","admin")
def dashboard():
    ano  = request.args.get("ano",  str(date.today().year))
    mes  = request.args.get("mes",  "")
    tpc  = request.args.get("tipo", "")
    with get_db() as conn:
        # Resumo geral
        try:
            if USE_PG:
                resumo = dict(conn.execute("""SELECT COUNT(*) as total_cultos,
                   COALESCE(SUM(presentes),0) as total_presentes,
                   COALESCE(SUM(visitantes),0) as total_visitantes,
                   COALESCE(SUM(criancas),0) as total_criancas,
                   COALESCE(ROUND(CAST(AVG(presentes) AS NUMERIC),1),0) as media_presentes,
                   COALESCE(ROUND(CAST(AVG(visitantes) AS NUMERIC),1),0) as media_visitantes
                   FROM cultos""").fetchone() or {})
            else:
                resumo = dict(conn.execute("SELECT * FROM v_resumo_geral").fetchone() or {})
        except Exception as e:
            logger.warning(f"Dashboard resumo erro: {e}")
            resumo = {}

        # Evolução mensal — compatível PG e SQLite
        if USE_PG:
            sql_m = """SELECT to_char(data::date,'YYYY-MM') as mes,
                       COALESCE(SUM(presentes),0) as presentes,
                       COALESCE(SUM(visitantes),0) as visitantes,
                       COALESCE(SUM(criancas),0) as criancas,
                       COUNT(*) as cultos
                       FROM cultos WHERE to_char(data::date,'YYYY')=%s
                       GROUP BY mes ORDER BY mes"""
        else:
            sql_m = """SELECT strftime('%Y-%m',data) as mes,
                       SUM(presentes) as presentes, SUM(visitantes) as visitantes,
                       SUM(criancas) as criancas, COUNT(*) as cultos
                       FROM cultos WHERE strftime('%Y',data)=?
                       GROUP BY mes ORDER BY mes"""
        try:
            mensal = [dict(r) for r in conn.execute(sql_m,(ano,)).fetchall()]
        except Exception as e:
            logger.warning(f"Dashboard mensal erro: {e}")
            mensal = []

        # Por tipo de culto
        try:
            por_tipo = [dict(r) for r in conn.execute(
                """SELECT COALESCE(tipo_culto,'Culto Regular') as tipo_culto,
                   COUNT(*) as qtd,
                   COALESCE(SUM(presentes),0) as total_presentes,
                   COALESCE(SUM(visitantes),0) as total_visitantes
                   FROM cultos GROUP BY tipo_culto ORDER BY total_presentes DESC"""
            ).fetchall()]
            # Adiciona media_presentes manualmente
            for t in por_tipo:
                t['media_presentes'] = round(t['total_presentes']/max(t['qtd'],1),1)
        except Exception as e:
            logger.warning(f"Dashboard por_tipo erro: {e}")
            por_tipo = []

        # Top GCs
        try:
            top_gcs = [dict(r) for r in conn.execute(
                """SELECT gc_nome, COUNT(*) as direcionamentos
                   FROM gc_direcionamentos GROUP BY gc_nome
                   ORDER BY direcionamentos DESC LIMIT 5"""
            ).fetchall()]
        except:
            top_gcs = []

        # Últimos 5 cultos
        try:
            ultimos = [dict(r) for r in conn.execute(
                qmark("SELECT id,data,hora,dia_semana,periodo,COALESCE(tipo_culto,'Culto Regular') as tipo_culto,responsavel,presentes,visitantes,criancas,observacoes,criado_em FROM cultos ORDER BY data DESC,hora DESC LIMIT 5")
            ).fetchall()]
        except Exception as e:
            logger.warning(f"Dashboard ultimos erro: {e}")
            ultimos = []

        # Crescimento mês a mês
        try:
            if USE_PG:
                meses_list = [dict(r) for r in conn.execute(
                    """SELECT to_char(data::date,'YYYY-MM') as mes,
                       COALESCE(SUM(presentes),0) as presentes
                       FROM cultos GROUP BY mes ORDER BY mes DESC LIMIT 12"""
                ).fetchall()]
            else:
                meses_list = [dict(r) for r in conn.execute(
                    """SELECT strftime('%Y-%m',data) as mes, SUM(presentes) as presentes
                       FROM cultos GROUP BY mes ORDER BY mes DESC LIMIT 12"""
                ).fetchall()]
        except:
            meses_list = []

        # Visitantes por mês
        try:
            if USE_PG:
                vis_mensal = [dict(r) for r in conn.execute(
                    """SELECT to_char(data::date,'MM') as mes,
                       COALESCE(SUM(visitantes),0) as visitantes
                       FROM cultos WHERE to_char(data::date,'YYYY')=%s
                       GROUP BY mes ORDER BY mes""", (ano,)
                ).fetchall()]
            else:
                vis_mensal = [dict(r) for r in conn.execute(
                    """SELECT strftime('%m',data) as mes, SUM(visitantes) as visitantes
                       FROM cultos WHERE strftime('%Y',data)=? GROUP BY mes ORDER BY mes""", (ano,)
                ).fetchall()]
        except:
            vis_mensal = []

    # Insights automáticos
    insights = []
    if mensal:
        melhor = max(mensal, key=lambda x: x["presentes"])
        insights.append(f"🏆 {_mes_nome(melhor['mes'])} foi o mês com maior presença ({melhor['presentes']} pessoas).")
    if por_tipo:
        t = por_tipo[0]
        insights.append(f"📌 '{t['tipo_culto']}' é o tipo de culto com mais presença (média: {t['media_presentes']}).")
    if top_gcs:
        insights.append(f"🌟 {top_gcs[0]['gc_nome']} recebeu mais visitantes direcionados ({top_gcs[0]['direcionamentos']}).")
    if len(meses_list) >= 2:
        atual = meses_list[0]["presentes"] or 0
        ant   = meses_list[1]["presentes"] or 1
        diff  = round((atual - ant) / ant * 100, 1) if ant else 0
        sinal = "cresceu" if diff >= 0 else "caiu"
        insights.append(f"📈 A presença {sinal} {abs(diff)}% em relação ao mês anterior.")

    # Converte Decimal para int/float para JSON
    def safe(v):
        if v is None: return 0
        try: return float(v) if '.' in str(v) else int(v)
        except: return 0

    resumo_clean = {k: safe(v) for k,v in resumo.items()}
    mensal_clean = [{k: safe(v) if k != "mes" else v for k,v in m.items()} for m in mensal]
    por_tipo_clean = [{k: safe(v) if k != "tipo_culto" else v for k,v in t.items()} for t in por_tipo]

    return jsonify({
        "resumo":     resumo_clean,
        "mensal":     mensal_clean,
        "por_tipo":   por_tipo_clean,
        "top_gcs":    top_gcs,
        "ultimos":    [{**u,"data_br":br(u["data"])} for u in ultimos],
        "vis_mensal": vis_mensal,
        "insights":   insights
    })

def _mes_nome(ym):
    meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
    try:
        m = int(ym.split("-")[1]) - 1
        return f"{meses[m]}/{ym.split('-')[0]}"
    except: return ym

# ═══════════════════════════════════════════════════════════════
# RESUMO
# ═══════════════════════════════════════════════════════════════
@app.route("/api/resumo", methods=["GET"])
@login_required
def resumo():
    with get_db() as conn:
        if USE_PG:
            r = conn.execute("""SELECT
               COUNT(*) as total_cultos,
               COALESCE(SUM(presentes),0) as total_presentes,
               COALESCE(SUM(visitantes),0) as total_visitantes,
               COALESCE(SUM(criancas),0) as total_criancas,
               COALESCE(ROUND(CAST(AVG(presentes) AS NUMERIC),1),0) as media_presentes,
               COALESCE(ROUND(CAST(AVG(visitantes) AS NUMERIC),1),0) as media_visitantes,
               COALESCE(ROUND(CAST(AVG(criancas) AS NUMERIC),1),0) as media_criancas
               FROM cultos""").fetchone()
        else:
            r = conn.execute("SELECT * FROM v_resumo_geral").fetchone()
        ult = conn.execute("SELECT id,data,hora,dia_semana,periodo,COALESCE(tipo_culto,'Culto Regular') as tipo_culto,responsavel,presentes,visitantes,criancas,observacoes,criado_em,editado_em,editado_por FROM cultos ORDER BY data DESC,hora DESC LIMIT 5").fetchall()
        pp  = conn.execute("""SELECT periodo,COUNT(*) as qtd,
                            COALESCE(ROUND(CAST(AVG(presentes) AS NUMERIC),1),0) as mp,
                            COALESCE(SUM(presentes),0) as tp FROM cultos GROUP BY periodo""").fetchall()
    # Converte Decimal/None para tipos JSON-serializáveis
    def safe(v):
        if v is None: return 0
        try: return float(v) if '.' in str(v) else int(v)
        except: return 0
    geral = {}
    if r:
        rd = dict(r)
        geral = {k: safe(v) for k,v in rd.items()}
    return jsonify({
        "geral":      geral,
        "ultimos":    [{**dict(u),"data_br":br(u["data"])} for u in ult],
        "por_periodo":[{k: safe(v) if k not in ("periodo",) else v for k,v in dict(x).items()} for x in pp]
    })

# ═══════════════════════════════════════════════════════════════
# PDF REAL
# ═══════════════════════════════════════════════════════════════
@app.route("/api/exportar_pdf", methods=["GET"])
@role_required("lider","admin")
def exportar_pdf():
    """Gera PDF real usando HTML→bytes via reportlab ou fallback HTML"""
    ini = request.args.get("data_ini","")
    fim = request.args.get("data_fim","")
    per = request.args.get("periodo","")
    tpc = request.args.get("tipo_culto","")

    sql = "SELECT id,data,hora,dia_semana,periodo,COALESCE(tipo_culto,'Culto Regular') as tipo_culto,responsavel,presentes,visitantes,criancas,observacoes,criado_em,editado_em,editado_por FROM cultos WHERE 1=1"; p=[]
    if ini: sql+=" AND data>=?"; p.append(ini)
    if fim: sql+=" AND data<=?"; p.append(fim)
    if per: sql+=" AND periodo=?"; p.append(per)
    if tpc: sql+=" AND tipo_culto=?"; p.append(tpc)
    sql+=" ORDER BY data ASC"

    with get_db() as conn:
        cultos  = [dict(r) for r in conn.execute(sql,p).fetchall()]
        resumo  = dict((conn.execute("""SELECT COUNT(*) as total_cultos,
               COALESCE(SUM(presentes),0) as total_presentes,
               COALESCE(SUM(visitantes),0) as total_visitantes,
               COALESCE(SUM(criancas),0) as total_criancas,
               ROUND(CAST(AVG(presentes) AS NUMERIC),1) as media_presentes,
               ROUND(CAST(AVG(visitantes) AS NUMERIC),1) as media_visitantes,
               ROUND(CAST(AVG(criancas) AS NUMERIC),1) as media_criancas
               FROM cultos""").fetchone() if USE_PG else conn.execute("SELECT * FROM v_resumo_geral").fetchone()) or {})

    total_p = sum(c["presentes"]  for c in cultos)
    total_v = sum(c["visitantes"] for c in cultos)
    total_c = sum(c["criancas"]   for c in cultos)
    n = max(len(cultos),1)

    # Gera HTML que o navegador pode imprimir como PDF
    linhas_html = ""
    for c in cultos:
        linhas_html += f"""
        <tr>
          <td>{br(c['data'])}</td>
          <td>{c['dia_semana']}</td>
          <td>{c['tipo_culto'] or 'Culto Regular'}</td>
          <td>{c['periodo']}</td>
          <td>{c['responsavel']}</td>
          <td class="num">{c['presentes']}</td>
          <td class="num">{c['visitantes']}</td>
          <td class="num">{c['criancas']}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório — Igreja ABA</title>
<style>
  @page {{ size: A4 landscape; margin: 15mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: Arial, sans-serif; font-size: 11px; color: #222; }}
  .header {{ background: #0A2463; color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-radius: 6px; }}
  .header h1 {{ font-size: 18px; letter-spacing: 2px; }}
  .header p {{ font-size: 10px; opacity: .8; }}
  .stats {{ display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 16px; }}
  .stat {{ background: #EBF8FF; border: 1px solid #BEE3F8; border-radius: 6px; padding: 12px; text-align: center; }}
  .stat .v {{ font-size: 24px; font-weight: bold; color: #0A2463; }}
  .stat .l {{ font-size: 10px; color: #4A6080; text-transform: uppercase; letter-spacing: .5px; margin-top: 3px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 10px; }}
  thead th {{ background: #0A2463; color: #fff; padding: 8px; text-align: left; font-size: 10px; }}
  tbody tr:nth-child(even) {{ background: #F8FAFF; }}
  tbody td {{ padding: 7px 8px; border-bottom: 1px solid #EEF2F9; }}
  .num {{ text-align: center; font-weight: bold; }}
  .footer {{ margin-top: 16px; text-align: center; font-size: 9px; color: #8ca0c0; }}
  @media print {{ button {{ display: none; }} }}
</style>
</head>
<body>
<div style="text-align:right;margin-bottom:8px">
  <button onclick="window.focus();setTimeout(()=>window.print(),300)" style="background:#0A2463;color:#fff;border:none;padding:9px 22px;border-radius:6px;font-size:13px;cursor:pointer;margin-bottom:8px">📥 Salvar PDF</button>
  <p style="font-size:11px;color:#888;margin-top:4px">Na tela de impressão, escolha <strong>Salvar como PDF</strong></p>
</div>
<div class="header">
  <div>
    <h1>IGREJA ABA</h1>
    <p>Um Lar Para Pertencer</p>
  </div>
  <div style="text-align:right">
    <div style="font-size:14px;font-weight:bold">Relatório de Cultos</div>
    <div style="font-size:10px;opacity:.8">Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}</div>
    {f'<div style="font-size:10px;opacity:.8">Período: {br(ini)} a {br(fim)}</div>' if ini or fim else ''}
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="v">{len(cultos)}</div><div class="l">Cultos</div></div>
  <div class="stat"><div class="v">{total_p}</div><div class="l">Total Presentes</div></div>
  <div class="stat"><div class="v">{total_v}</div><div class="l">Total Visitantes</div></div>
  <div class="stat"><div class="v">{total_c}</div><div class="l">Total Crianças</div></div>
</div>

<table>
  <thead>
    <tr>
      <th>Data</th><th>Dia</th><th>Tipo</th><th>Período</th>
      <th>Responsável</th><th>Presentes</th><th>Visitantes</th><th>Crianças</th>
    </tr>
  </thead>
  <tbody>
    {linhas_html}
    <tr style="background:#EBF8FF;font-weight:bold">
      <td colspan="5">TOTAIS / MÉDIAS</td>
      <td class="num">{total_p} / {round(total_p/n,1)}</td>
      <td class="num">{total_v} / {round(total_v/n,1)}</td>
      <td class="num">{total_c} / {round(total_c/n,1)}</td>
    </tr>
  </tbody>
</table>
<div class="footer">Igreja ABA — Um Lar Para Pertencer &nbsp;·&nbsp; Relatório gerado automaticamente</div>
</body></html>"""

    resp = make_response(html)
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    return resp

# ═══════════════════════════════════════════════════════════════
# EXCEL
# ═══════════════════════════════════════════════════════════════
@app.route("/api/exportar_excel", methods=["GET"])
@role_required("lider","admin")
def exportar_excel():
    ini = request.args.get("data_ini",""); fim=request.args.get("data_fim",""); per=request.args.get("periodo","")
    sql = "SELECT id,data,hora,dia_semana,periodo,COALESCE(tipo_culto,'Culto Regular') as tipo_culto,responsavel,presentes,visitantes,criancas,observacoes,criado_em,editado_em,editado_por FROM cultos WHERE 1=1"; p=[]
    if ini: sql+=" AND data>=?"; p.append(ini)
    if fim: sql+=" AND data<=?"; p.append(fim)
    if per: sql+=" AND periodo=?"; p.append(per)
    sql+=" ORDER BY data ASC"
    with get_db() as conn:
        cr  = [dict(r) for r in conn.execute(sql,p).fetchall()]
        rr  = dict((conn.execute("""SELECT COUNT(*) as total_cultos,
               COALESCE(SUM(presentes),0) as total_presentes,
               COALESCE(SUM(visitantes),0) as total_visitantes,
               COALESCE(SUM(criancas),0) as total_criancas,
               ROUND(CAST(AVG(presentes) AS NUMERIC),1) as media_presentes,
               ROUND(CAST(AVG(visitantes) AS NUMERIC),1) as media_visitantes,
               ROUND(CAST(AVG(criancas) AS NUMERIC),1) as media_criancas
               FROM cultos""").fetchone() if USE_PG else conn.execute("SELECT * FROM v_resumo_geral").fetchone()) or {})
        er  = [dict(r) for r in conn.execute("SELECT * FROM estoque ORDER BY fixo DESC,categoria,nome").fetchall()]
        cm  = {c["id"]:[dict(x) for x in conn.execute(qmark("SELECT * FROM checklists WHERE culto_id=? ORDER BY categoria,id"), (c["id"],)).fetchall()] for c in cr}
        gcs = [dict(r) for r in conn.execute("SELECT * FROM grupos_crescimento ORDER BY setor,nome").fetchall()]
        dirs= [dict(r) for r in conn.execute("SELECT * FROM gc_direcionamentos ORDER BY criado_em DESC").fetchall()]

    hf=PatternFill("solid",fgColor="0A2463"); hfont=Font(color="FFFFFF",bold=True,size=11)
    gf=PatternFill("solid",fgColor="C6EFCE"); rf=PatternFill("solid",fgColor="FFC7CE"); of=PatternFill("solid",fgColor="FFEB9C")
    bdr=Border(*[Side(style="thin")]*4)
    wb=openpyxl.Workbook()
    def hrow(ws,cols):
        ws.append(cols)
        for i in range(1,len(cols)+1):
            c=ws.cell(ws.max_row,i); c.fill=hf; c.font=hfont
            c.alignment=Alignment(horizontal="center"); c.border=bdr

    ws1=wb.active; ws1.title="Registros"
    ws1.append(["IGREJA ABA – Registros de Culto"]); ws1["A1"].font=Font(bold=True,size=14,color="0A2463"); ws1.append([])
    hrow(ws1,["Data","Dia","Tipo de Culto","Período","Responsável","Presentes","Visitantes","Crianças","Observações"])
    for r in cr: ws1.append([br(r["data"]),r["dia_semana"],r.get("tipo_culto",""),r["periodo"],r["responsavel"],r["presentes"],r["visitantes"],r["criancas"],r["observacoes"]])
    if cr:
        ws1.append([]); ws1.append(["TOTAIS","","","","",sum(r["presentes"] for r in cr),sum(r["visitantes"] for r in cr),sum(r["criancas"] for r in cr),""])
        for cell in ws1[ws1.max_row]: cell.font=Font(bold=True,color="0A2463")
    for i,w in enumerate([14,16,18,10,22,12,12,12,35],1): ws1.column_dimensions[get_column_letter(i)].width=w

    ws2=wb.create_sheet("Checklist"); ws2.append(["Checklist"]); ws2["A1"].font=Font(bold=True,size=14,color="0A2463"); ws2.append([])
    hrow(ws2,["Data","Período","Responsável","Categoria","Item","Concluído"])
    cl={"antes":"Antes","mesa_entrada":"Mesa de Entrada","banheiro":"Banheiros","durante":"Durante","final":"Final"}
    for culto in cr:
        for chk in cm.get(culto["id"],[]):
            sn="SIM ✓" if chk["concluido"] else "NÃO ✗"; ri=ws2.max_row+1
            ws2.append([br(culto["data"]),culto["periodo"],culto["responsavel"],cl.get(chk["categoria"],chk["categoria"]),chk["item_descricao"],sn])
            cf=ws2.cell(ri,6); cf.fill=gf if chk["concluido"] else rf; cf.font=Font(bold=True,color="375623" if chk["concluido"] else "9C0006")
    for col,w in zip("ABCDEF",[14,10,22,18,48,12]): ws2.column_dimensions[col].width=w

    ws3=wb.create_sheet("GCs"); ws3.append(["GCs"]); ws3["A1"].font=Font(bold=True,size=14,color="0A2463"); ws3.append([])
    hrow(ws3,["Nome","Líder","Endereço","Bairro","Cidade","Setor","Lat","Lng"])
    for gc in gcs: ws3.append([gc["nome"],gc.get("lider",""),gc["endereco"],gc["bairro"],gc["cidade"],gc["setor"],gc.get("lat",""),gc.get("lng","")])
    for col,w in zip("ABCDEFGH",[28,22,30,20,15,12,12,12]): ws3.column_dimensions[col].width=w

    ws4=wb.create_sheet("Direcionamentos GC"); ws4.append(["Direcionamentos"]); ws4["A1"].font=Font(bold=True,size=14,color="0A2463"); ws4.append([])
    hrow(ws4,["Data","Visitante","GC Indicado","Distância (km)"])
    for dr in dirs: ws4.append([dr["criado_em"][:16],dr["visitante_nome"],dr["gc_nome"],dr.get("distancia_km","")])
    for col,w in zip("ABCD",[18,28,28,15]): ws4.column_dimensions[col].width=w

    sc=[i for i in er if i["categoria"]=="Santa Ceia"]; ou=[i for i in er if i["categoria"]!="Santa Ceia"]
    def aba_est(titulo,itens):
        ws=wb.create_sheet(titulo); ws.append([titulo]); ws["A1"].font=Font(bold=True,size=14,color="0A2463"); ws.append([])
        hrow(ws,["Item","Categoria","Quantidade","Qtd. Mínima","Unidade","Status"])
        for item in itens:
            baixo=item["quantidade"]<item["quantidade_minima"]; ri=ws.max_row+1
            ws.append([item["nome"],item["categoria"],item["quantidade"],item["quantidade_minima"],item["unidade"],"⚠️ Baixo" if baixo else "✓ OK"])
            ws.cell(ri,6).fill=of if baixo else gf; ws.cell(ri,6).font=Font(bold=True,color="9C5700" if baixo else "375623")
        for col,w in zip("ABCDEF",[36,18,14,14,12,14]): ws.column_dimensions[col].width=w
    if sc: aba_est("Estoque Santa Ceia",sc)
    if ou: aba_est("Estoque Geral",ou)

    ws7=wb.create_sheet("Resumo Geral"); ws7.append(["RESUMO GERAL"]); ws7["A1"].font=Font(bold=True,size=14,color="0A2463"); ws7.append([])
    for item in [["Total de Cultos",rr.get("total_cultos",0)],["Total Presentes",rr.get("total_presentes",0)],
                 ["Total Visitantes",rr.get("total_visitantes",0)],["Total Crianças",rr.get("total_criancas",0)],
                 ["Média Presentes/Culto",rr.get("media_presentes",0)],["Média Visitantes/Culto",rr.get("media_visitantes",0)],
                 ["Total GCs Ativos",len([g for g in gcs if g["ativo"]])],["Total Direcionamentos",len(dirs)]]:
        ws7.append(item); ws7.cell(ws7.max_row,1).font=Font(bold=True)
    ws7.column_dimensions["A"].width=35; ws7.column_dimensions["B"].width=20

    buf=io.BytesIO(); wb.save(buf); buf.seek(0)
    return send_file(buf,as_attachment=True,download_name=f"igrejaaba_{date.today().isoformat()}.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# ═══════════════════════════════════════════════════════════════
# IA CONTAGEM
# ═══════════════════════════════════════════════════════════════
@app.route("/api/cameras", methods=["GET"])
@login_required
def listar_cameras():
    with get_db() as conn:
        rows=conn.execute("SELECT * FROM cameras WHERE ativa=1 ORDER BY nome").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/cameras", methods=["POST"])
@role_required("admin")
def criar_camera():
    d=request.get_json(force=True) or {}
    nome=d.get("nome","").strip(); url=d.get("url","").strip()
    if not nome: return jsonify({"erro":"Nome obrigatório"}),400
    with get_db() as conn:
        cur=conn.execute(qmark("INSERT INTO cameras(nome,url,local) VALUES(?,?,?)"), (nome,url,d.get("local","")))
        conn.commit()
    return jsonify({"ok":True,"id":cur.lastrowid})

@app.route("/api/cameras/<int:cid>", methods=["DELETE"])
@role_required("admin")
def del_camera(cid):
    with get_db() as conn:
        conn.execute(qmark("UPDATE cameras SET ativa=0 WHERE id=?"), (cid,)); conn.commit()
    return jsonify({"ok":True})

@app.route("/api/contagem/sessoes", methods=["GET"])
@login_required
def listar_sessoes():
    with get_db() as conn:
        rows=conn.execute("""SELECT s.*,c.data as culto_data,c.periodo FROM contagem_sessoes s
            LEFT JOIN cultos c ON c.id=s.culto_id ORDER BY s.iniciado_em DESC LIMIT 50""").fetchall()
    return jsonify([{**dict(r),"culto_data_br":br(r["culto_data"]) if r["culto_data"] else ""} for r in rows])

@app.route("/api/contagem/sessoes", methods=["POST"])
@login_required
def criar_sessao():
    d=request.get_json(force=True) or {}
    with get_db() as conn:
        cur=conn.execute(qmark("INSERT INTO contagem_sessoes(culto_id,camera_id,camera_nome) VALUES(?,?,?)"), (d.get("culto_id"),d.get("camera_id"),d.get("camera_nome","")))
        conn.commit()
    return jsonify({"ok":True,"id":cur.lastrowid})

@app.route("/api/contagem/sessoes/<int:sid>/encerrar", methods=["POST"])
@login_required
def encerrar_sessao(sid):
    with get_db() as conn:
        conn.execute(qmark("UPDATE contagem_sessoes SET status='encerrada',encerrado_em=? WHERE id=?"), (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), sid,)); conn.commit()
    return jsonify({"ok":True})

@app.route("/api/contagem/registrar", methods=["POST"])
@login_required
def registrar_passagem():
    d=request.get_json(force=True) or {}
    sid=d.get("sessao_id"); tid=d.get("track_id"); direcao=d.get("direcao")
    if not sid or tid is None or not direcao:
        return jsonify({"erro":"sessao_id, track_id e direcao obrigatórios"}),400
    with get_db() as conn:
        existe=conn.execute(qmark("SELECT id FROM contagem_registros WHERE sessao_id=? AND track_id=? AND direcao=?"), (sid,tid,direcao)).fetchone()
        if existe: return jsonify({"ok":True,"duplicado":True})
        conn.execute(qmark("INSERT INTO contagem_registros(sessao_id,track_id,direcao,confianca) VALUES(?,?,?,?)"), (sid,tid,direcao,d.get("confianca",1.0)))
        col="total_entradas" if direcao=="entrada" else "total_saidas"
        conn.execute(f"UPDATE contagem_sessoes SET {col}={col}+1 WHERE id=?",(sid,))
        conn.commit()
    return jsonify({"ok":True,"duplicado":False})

@app.route("/api/contagem/tempo_real/<int:sid>", methods=["GET"])
@login_required
def tempo_real(sid):
    with get_db() as conn:
        s=conn.execute(qmark("SELECT * FROM contagem_sessoes WHERE id=?"), (sid,)).fetchone()
        if not s: return jsonify({"erro":"Sessão não encontrada"}),404
    s=dict(s)
    return jsonify({"sessao_id":sid,"entradas":s["total_entradas"],"saidas":s["total_saidas"],
                    "dentro_agora":max(0,s["total_entradas"]-s["total_saidas"]),"status":s["status"]})



# ═══════════════════════════════════════════════════════════════
# INIT
# ═══════════════════════════════════════════════════════════════
init_db()

if __name__=="__main__":
    print(f"  IGREJA ABA v5 | DB: {DB_PATH}")
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT",5000)), debug=False)
