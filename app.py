# -*- coding: utf-8 -*-
"""
IGREJA ABA - Sistema de Registro de Culto v6
Compativel com: Local, Render (PostgreSQL), Railway
v6: PostgreSQL/SQLite dual-mode + fuzzy geocoding + OSRM routes
"""

from flask import Flask, request, jsonify, render_template, session, redirect, send_file
from flask_cors import CORS
import sqlite3, os, hashlib, secrets, io, qrcode, base64, urllib.parse, logging, math, re, unicodedata
from datetime import datetime, date
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from PIL import Image

# --- PostgreSQL opcional (só importa se DATABASE_URL estiver definida) --------
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES  = bool(DATABASE_URL)
if USE_POSTGRES:
    try:
        import psycopg2
        import psycopg2.extras
        logger_tmp = logging.getLogger(__name__)
        logger_tmp.info("PostgreSQL mode enabled via DATABASE_URL")
    except ImportError:
        USE_POSTGRES = False
        logging.getLogger(__name__).warning(
            "psycopg2 não instalado — usando SQLite mesmo com DATABASE_URL definida. "
            "Adicione psycopg2-binary ao requirements.txt"
        )

# --- Logging --------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- App ------------------------------------------------------
app = Flask(__name__,
            static_folder="static",
            static_url_path="/static",
            template_folder="templates")

# Chave secreta FIXA via env — obrigatório para sessão funcionar com múltiplos workers
_secret = os.environ.get("SECRET_KEY", "")
if not _secret:
    _secret = secrets.token_hex(32)
    logger.warning("SECRET_KEY não definida — usando chave temporária. "
                   "Sessões serão perdidas ao reiniciar. Defina SECRET_KEY no Render!")
app.secret_key = _secret

# Configurações de sessão para produção
app.config.update(
    SESSION_COOKIE_SECURE   = os.environ.get("RENDER", "") != "",  # HTTPS no Render
    SESSION_COOKIE_HTTPONLY = True,
    SESSION_COOKIE_SAMESITE = "Lax",
    SEND_FILE_MAX_AGE_DEFAULT = 0,
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024,
)

CORS(app, supports_credentials=True, origins="*")

# --- Caminhos -------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

_db_dir = os.environ.get("DB_DIR", "").strip()
if _db_dir:
    DB_DIR = _db_dir
else:
    DB_DIR = os.path.join(BASE_DIR, "database")

DB_PATH  = os.path.join(DB_DIR, "igreja_aba.db")
SQL_PATH = os.path.join(BASE_DIR, "database", "schema.sql")

logger.info(f"DB_PATH = {DB_PATH}")

# --- BASE_URL para QR Codes -----------------------------------
def get_base_url():
    base = os.environ.get("BASE_URL", "").rstrip("/")
    if base:
        return base
    proto = request.headers.get("X-Forwarded-Proto", request.scheme)
    host  = request.headers.get("X-Forwarded-Host", request.host)
    return f"{proto}://{host}"

# --- DB -------------------------------------------------------
class _PGConnWrapper:
    """
    Wrap psycopg2 connection para ter a mesma interface do sqlite3:
    conn.execute(sql, params), conn.executemany(), conn.commit(),
    iteracao sobre rows, row["col"], context manager (with).
    """
    def __init__(self, raw):
        self._conn = raw
        self._cur  = raw.cursor()

    # Converte ? (sqlite) para %s (psycopg2) e executa
    def execute(self, sql, params=()):
        sql_pg = sql.replace("?", "%s")
        # executescript nao existe em psycopg2 — ignorado aqui
        self._cur.execute(sql_pg, params)
        return self

    def executemany(self, sql, seq):
        sql_pg = sql.replace("?", "%s")
        self._cur.executemany(sql_pg, seq)
        return self

    def executescript(self, script):
        # Divide em statements e executa um a um (usado no init_db)
        import re as _re
        stmts = [s.strip() for s in script.split(";") if s.strip()]
        for s in stmts:
            try:
                self._cur.execute(s)
            except Exception:
                pass  # ignora erros de "ja existe" no CREATE

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return dict(row) if hasattr(row, "keys") else row

    def fetchall(self):
        rows = self._cur.fetchall()
        return [dict(r) if hasattr(r, "keys") else r for r in rows]

    def lastrowid(self):
        return self._cur.fetchone()["id"] if self._cur.rowcount else None

    @property
    def lastrowid_val(self):
        self._cur.execute("SELECT lastval()")
        return self._cur.fetchone()[0]

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._cur.close()
        self._conn.close()

    # context manager
    def __enter__(self):
        return self

    def __exit__(self, exc_type, *_):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()

    # iteracao sobre cursor (for row in conn.execute(...))
    def __iter__(self):
        return iter(self.fetchall())


def get_db():
    if USE_POSTGRES:
        raw = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        raw.autocommit = False
        return _PGConnWrapper(raw)
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

def _get_schema_sql():
    """Lê o schema e adapta para o banco em uso."""
    with open(SQL_PATH, "r", encoding="utf-8") as f:
        sql = f.read()
    if USE_POSTGRES:
        # Converte sintaxe SQLite → PostgreSQL
        sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        sql = sql.replace("INTEGER PRIMARY KEY", "SERIAL PRIMARY KEY")
        # INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
        import re as _re
        sql = _re.sub(
            r"INSERT OR IGNORE INTO (\w+)",
            r"INSERT INTO \1",
            sql
        )
        # Adiciona ON CONFLICT DO NOTHING no final de cada INSERT afetado
        sql = _re.sub(
            r"(INSERT INTO \w+ \([^)]+\) VALUES\s*\([^;]+\));",
            r"\1 ON CONFLICT DO NOTHING;",
            sql,
            flags=_re.DOTALL
        )
        # Remove pragmas SQLite
        lines = [l for l in sql.splitlines()
                 if not l.strip().upper().startswith("PRAGMA")]
        sql = "
".join(lines)
    return sql


def init_db():
    """
    FIX v4: init_db robusto — não quebra o server se o disco do Render
    ainda não estiver montado. O banco será criado na primeira requisição.
    """
    try:
        os.makedirs(DB_DIR, exist_ok=True)
        logger.info(f"Inicializando banco em: {DB_PATH}")
        with get_db() as conn:
            schema = _get_schema_sql()
            conn.executescript(schema)
            conn.execute("""
                DELETE FROM estoque WHERE id NOT IN (
                    SELECT MIN(id) FROM estoque GROUP BY nome
                )
            """)
            try:
                conn.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_nome ON estoque(nome)"
                )
            except Exception:
                pass
            conn.commit()
        logger.info("Banco inicializado com sucesso!")
        return True
    except Exception as e:
        logger.error(f"Erro ao inicializar banco: {e}")
        return False

def ensure_db():
    """Garante que o banco existe antes de qualquer operação."""
    if not os.path.exists(DB_PATH):
        logger.warning("Banco não encontrado — tentando inicializar agora...")
        init_db()

def hash_senha(s):
    return hashlib.sha256(s.encode()).hexdigest()

# --- Helpers de data ------------------------------------------
DIAS_PT = {0:"Segunda-feira", 1:"Terça-feira", 2:"Quarta-feira",
           3:"Quinta-feira",  4:"Sexta-feira", 5:"Sábado", 6:"Domingo"}

def dia_semana_pt(data_str):
    try:
        return DIAS_PT[datetime.strptime(data_str, "%Y-%m-%d").weekday()]
    except:
        return ""

def fmt_data_br(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d").strftime("%d/%m/%Y")
    except:
        return s or ""

# --- Auth decorator -------------------------------------------
def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if "usuario_id" not in session:
            return jsonify({"erro": "Não autenticado"}), 401
        return f(*args, **kwargs)
    return decorated

# --- Tratamento global de erros -------------------------------
@app.errorhandler(500)
def erro_500(e):
    logger.error(f"Erro 500: {e}")
    return jsonify({"erro": "Erro interno do servidor", "detalhe": str(e)}), 500

@app.errorhandler(404)
def erro_404(e):
    return jsonify({"erro": "Rota não encontrada"}), 404

# =============================================================
#  PÁGINAS
# =============================================================
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/app")
def app_main():
    if "usuario_id" not in session:
        return redirect("/")
    return render_template("app.html")

@app.route("/formulario")
def formulario_visitante():
    culto_id = request.args.get("culto_id", "")
    return render_template("formulario.html", culto_id=culto_id)

# --- Health check ---------------------------------------------
@app.route("/health")
def health():
    try:
        ensure_db()
        with get_db() as conn:
            conn.execute("SELECT 1").fetchone()
        return jsonify({"status": "ok", "db": DB_PATH, "time": datetime.now().isoformat()})
    except Exception as e:
        return jsonify({"status": "error", "erro": str(e)}), 500

# =============================================================
#  AUTH — FIX v4: ensure_db() antes de qualquer query
# =============================================================
@app.route("/api/login", methods=["POST"])
def login():
    try:
        ensure_db()  # ← FIX PRINCIPAL: garante banco antes do login
        d     = request.get_json(force=True) or {}
        email = d.get("email", "").strip().lower()
        senha = d.get("senha", "")
        if not email or not senha:
            return jsonify({"erro": "E-mail e senha são obrigatórios"}), 400
        with get_db() as conn:
            u = conn.execute(
                "SELECT * FROM usuarios WHERE email=? AND ativo=1", (email,)
            ).fetchone()
        if not u:
            return jsonify({"erro": "Usuário não encontrado"}), 401
        if u["senha_hash"] != hash_senha(senha):
            return jsonify({"erro": "Senha incorreta"}), 401
        session.permanent = True
        session["usuario_id"]    = u["id"]
        session["usuario_nome"]  = u["nome"]
        session["usuario_cargo"] = u["cargo"]
        logger.info(f"Login: {email}")
        return jsonify({"ok": True, "nome": u["nome"], "cargo": u["cargo"]})
    except Exception as e:
        logger.error(f"Erro no login: {e}")
        return jsonify({"erro": f"Erro ao conectar ao banco: {str(e)}"}), 500

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/me")
def me():
    if "usuario_id" not in session:
        return jsonify({"autenticado": False})
    return jsonify({
        "autenticado": True,
        "id":    session["usuario_id"],
        "nome":  session["usuario_nome"],
        "cargo": session["usuario_cargo"]
    })

# =============================================================
#  USUÁRIOS
# =============================================================
@app.route("/api/usuarios", methods=["GET"])
@login_required
def listar_usuarios():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id,nome,email,cargo,ativo,criado_em FROM usuarios ORDER BY nome"
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/usuarios", methods=["POST"])
@login_required
def criar_usuario():
    if session.get("usuario_cargo") != "admin":
        return jsonify({"erro": "Apenas administradores podem criar usuários"}), 403
    d     = request.get_json(force=True) or {}
    nome  = d.get("nome", "").strip()
    email = d.get("email", "").strip().lower()
    senha = d.get("senha", "")
    cargo = d.get("cargo", "voluntario")
    if not nome or not email or not senha:
        return jsonify({"erro": "Nome, e-mail e senha são obrigatórios"}), 400
    if len(senha) < 6:
        return jsonify({"erro": "Senha mínima de 6 caracteres"}), 400
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO usuarios (nome,email,senha_hash,cargo) VALUES (?,?,?,?)",
                (nome, email, hash_senha(senha), cargo)
            )
            conn.commit()
        return jsonify({"ok": True})
    except Exception as e:
        if "UNIQUE" in str(e):
            return jsonify({"erro": "E-mail já cadastrado"}), 400
        return jsonify({"erro": str(e)}), 500

@app.route("/api/usuarios/<int:uid>", methods=["PUT"])
@login_required
def editar_usuario(uid):
    if session.get("usuario_cargo") != "admin" and session["usuario_id"] != uid:
        return jsonify({"erro": "Sem permissão"}), 403
    d = request.get_json(force=True) or {}
    with get_db() as conn:
        if "nova_senha" in d and d["nova_senha"]:
            if len(d["nova_senha"]) < 6:
                return jsonify({"erro": "Senha mínima de 6 caracteres"}), 400
            conn.execute("UPDATE usuarios SET senha_hash=? WHERE id=?",
                         (hash_senha(d["nova_senha"]), uid))
        if "nome" in d:
            conn.execute("UPDATE usuarios SET nome=? WHERE id=?", (d["nome"], uid))
        if "cargo" in d and session.get("usuario_cargo") == "admin":
            conn.execute("UPDATE usuarios SET cargo=? WHERE id=?", (d["cargo"], uid))
        if "ativo" in d and session.get("usuario_cargo") == "admin":
            conn.execute("UPDATE usuarios SET ativo=? WHERE id=?", (int(d["ativo"]), uid))
        conn.commit()
    return jsonify({"ok": True})

@app.route("/api/usuarios/<int:uid>", methods=["DELETE"])
@login_required
def deletar_usuario(uid):
    if session.get("usuario_cargo") != "admin":
        return jsonify({"erro": "Apenas admins podem excluir usuários"}), 403
    if uid == session["usuario_id"]:
        return jsonify({"erro": "Você não pode excluir a si mesmo"}), 400
    with get_db() as conn:
        conn.execute("DELETE FROM usuarios WHERE id=?", (uid,))
        conn.commit()
    return jsonify({"ok": True})

# =============================================================
#  CULTOS
# =============================================================
@app.route("/api/cultos", methods=["GET"])
@login_required
def listar_cultos():
    data_ini = request.args.get("data_ini", "")
    data_fim = request.args.get("data_fim", "")
    periodo  = request.args.get("periodo",  "")
    sql    = "SELECT * FROM v_cultos_detalhe WHERE 1=1"
    params = []
    if data_ini:
        sql += " AND data >= ?"; params.append(data_ini)
    if data_fim:
        sql += " AND data <= ?"; params.append(data_fim)
    if periodo:
        sql += " AND periodo = ?"; params.append(periodo)
    sql += " ORDER BY data DESC, hora DESC"
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    result = []
    for r in rows:
        row = dict(r)
        row["data_br"] = fmt_data_br(row["data"])
        result.append(row)
    return jsonify(result)

@app.route("/api/cultos", methods=["POST"])
@login_required
def criar_culto():
    d           = request.get_json(force=True) or {}
    data_culto  = d.get("data",    date.today().isoformat())
    hora_culto  = d.get("hora",    datetime.now().strftime("%H:%M"))
    dia_sem     = dia_semana_pt(data_culto)
    periodo     = d.get("periodo", "Noite")
    responsavel = d.get("responsavel", "").strip()
    presentes   = int(d.get("presentes",  0))
    visitantes  = int(d.get("visitantes", 0))
    criancas    = int(d.get("criancas",   0))
    observacoes = d.get("observacoes", "").strip()
    if not responsavel:
        return jsonify({"erro": "Responsável é obrigatório"}), 400
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO cultos
               (data,hora,dia_semana,periodo,responsavel,
                presentes,visitantes,criancas,observacoes,usuario_id)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (data_culto, hora_culto, dia_sem, periodo, responsavel,
             presentes, visitantes, criancas, observacoes, session["usuario_id"])
        )
        if USE_POSTGRES:
            culto_id = conn.execute("SELECT lastval()").fetchone()[0]
        else:
            culto_id = cur.lastrowid
        itens = conn.execute(
            "SELECT * FROM itens_checklist_padrao ORDER BY categoria,ordem"
        ).fetchall()
        for item in itens:
            conn.execute(
                """INSERT INTO checklists
                   (culto_id,categoria,item_key,item_descricao,concluido,responsavel)
                   VALUES (?,?,?,?,0,?)""",
                (culto_id, item["categoria"], item["item_key"],
                 item["descricao"], responsavel)
            )
        conn.commit()
    return jsonify({"ok": True, "id": culto_id, "dia_semana": dia_sem})

@app.route("/api/cultos/<int:cid>", methods=["GET"])
@login_required
def obter_culto(cid):
    with get_db() as conn:
        c = conn.execute("SELECT * FROM v_cultos_detalhe WHERE id=?", (cid,)).fetchone()
        if not c:
            return jsonify({"erro": "Culto não encontrado"}), 404
        checks = conn.execute(
            "SELECT * FROM checklists WHERE culto_id=? ORDER BY categoria,id", (cid,)
        ).fetchall()
        vis = conn.execute(
            "SELECT * FROM visitantes WHERE culto_id=? ORDER BY id", (cid,)
        ).fetchall()
    row = dict(c)
    row["data_br"] = fmt_data_br(row["data"])
    return jsonify({
        "culto":      row,
        "checklists": [dict(x) for x in checks],
        "visitantes": [dict(v) for v in vis]
    })

@app.route("/api/cultos/<int:cid>", methods=["PUT"])
@login_required
def atualizar_culto(cid):
    d = request.get_json(force=True) or {}
    with get_db() as conn:
        conn.execute(
            """UPDATE cultos SET presentes=?,visitantes=?,criancas=?,
               observacoes=?,periodo=?,responsavel=? WHERE id=?""",
            (d.get("presentes", 0), d.get("visitantes", 0), d.get("criancas", 0),
             d.get("observacoes", ""), d.get("periodo", "Noite"),
             d.get("responsavel", ""), cid)
        )
        conn.commit()
    return jsonify({"ok": True})

@app.route("/api/cultos/<int:cid>", methods=["DELETE"])
@login_required
def deletar_culto(cid):
    with get_db() as conn:
        conn.execute("DELETE FROM cultos WHERE id=?", (cid,))
        conn.commit()
    return jsonify({"ok": True})

@app.route("/api/cultos/<int:cid>/qrcode", methods=["GET"])
@login_required
def gerar_qrcode(cid):
    base = get_base_url()
    url  = f"{base}/formulario?culto_id={cid}"
    qr   = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=8, border=4
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0A2463", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    return jsonify({"qrcode": f"data:image/png;base64,{b64}", "url": url})

# =============================================================
#  CHECKLIST
# =============================================================
@app.route("/api/cultos/<int:cid>/checklist", methods=["GET"])
@login_required
def get_checklist(cid):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM checklists WHERE culto_id=? ORDER BY categoria,id", (cid,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/checklist/<int:item_id>", methods=["PUT"])
@login_required
def atualizar_check(item_id):
    d         = request.get_json(force=True) or {}
    concluido = 1 if d.get("concluido") else 0
    with get_db() as conn:
        conn.execute("UPDATE checklists SET concluido=? WHERE id=?", (concluido, item_id))
        conn.commit()
    return jsonify({"ok": True})

# =============================================================
#  VISITANTES
# =============================================================
@app.route("/api/visitantes", methods=["POST"])
def criar_visitante():
    """Rota pública — usada pelo formulário QR Code (sem login)"""
    d        = request.get_json(force=True) or {}
    nome     = d.get("nome",     "").strip()
    telefone = d.get("telefone", "").strip()
    if not nome or not telefone:
        return jsonify({"erro": "Nome e telefone são obrigatórios"}), 400
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO visitantes
               (culto_id,nome,idade,telefone,endereco,cidade,bairro,cep,
                como_conheceu,pedido_oracao,quer_visita,data_visita,hora_visita,
                observacao,origem)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                d.get("culto_id") or None,
                nome,
                d.get("idade",         ""),
                telefone,
                d.get("endereco",      ""),
                d.get("cidade",        ""),
                d.get("bairro",        ""),
                d.get("cep",           ""),
                d.get("como_conheceu", ""),
                d.get("pedido_oracao", ""),
                1 if d.get("quer_visita") else 0,
                d.get("data_visita",   ""),
                d.get("hora_visita",   ""),
                d.get("observacao",    ""),
                d.get("origem",        "manual")
            )
        )
        if USE_POSTGRES:
            vid = conn.execute("SELECT lastval()").fetchone()[0]
        else:
            vid = cur.lastrowid
        conn.commit()
    return jsonify({"ok": True, "id": vid})

@app.route("/api/visitantes", methods=["GET"])
@login_required
def listar_visitantes():
    with get_db() as conn:
        rows = conn.execute(
            """SELECT v.*, c.data as culto_data, c.periodo as culto_periodo
               FROM visitantes v
               LEFT JOIN cultos c ON c.id=v.culto_id
               ORDER BY v.criado_em DESC"""
        ).fetchall()
    result = []
    for r in rows:
        row = dict(r)
        if row.get("culto_data"):
            row["culto_data_br"] = fmt_data_br(row["culto_data"])
        result.append(row)
    return jsonify(result)

@app.route("/api/visitantes/<int:vid>", methods=["DELETE"])
@login_required
def deletar_visitante(vid):
    with get_db() as conn:
        conn.execute("DELETE FROM visitantes WHERE id=?", (vid,))
        conn.commit()
    return jsonify({"ok": True})

@app.route("/api/visitantes/<int:vid>/link", methods=["GET"])
@login_required
def gerar_link_visitante(vid):
    with get_db() as conn:
        v = conn.execute("SELECT * FROM visitantes WHERE id=?", (vid,)).fetchone()
    if not v:
        return jsonify({"erro": "Visitante não encontrado"}), 404
    v     = dict(v)
    query = f"{v.get('endereco','')} {v.get('bairro','')} {v.get('cidade','')}".strip()
    maps  = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(query)}"
    tel   = v["telefone"].replace(" ","").replace("-","").replace("(","").replace(")","")
    if not tel.startswith("55"):
        tel = "55" + tel
    msg = (f"Olá {v['nome']}, tudo bem? Somos da Igreja ABA e ficamos muito "
           f"felizes com sua visita! 😊 Gostaríamos de te conhecer melhor.")
    wa  = f"https://wa.me/{tel}?text={urllib.parse.quote(msg)}"
    return jsonify({"nome": v["nome"], "telefone": v["telefone"],
                    "maps_link": maps, "whatsapp_link": wa})

# =============================================================
#  GC FINDER — Grupos de Crescimento
# =============================================================

# ===============================================================
#  CONECTA GC — Grupos de Crescimento
#  v5: Coordenadas verificadas no Google Maps + rota via lat/lng
# ===============================================================

# Coordenadas verificadas individualmente no Google Maps Satellite
# Alvorada/RS — metodologia: busca pelo endereço exato + pin manual
GCS_PADRAO = [
    # -- SETOR VERDE -------------------------------------------
    {
        "id": 1, "nome": "GC Infinito e Amem",
        "endereco": "Rua 139, 84", "bairro": "Jardim Algarve",
        "cidade": "Alvorada", "estado": "RS", "setor": "Verde",
        # Rua 139 (Cento e Trinta e Nove) no Jardim Algarve, Alvorada
        "lat": -29.98530, "lng": -51.07580,
    },
    # -- SETOR LARANJA -----------------------------------------
    {
        "id": 2, "nome": "GC Luz do Mundo",
        "endereco": "Rua Alameda, 97", "bairro": "Jardim Algarve",
        "cidade": "Alvorada", "estado": "RS", "setor": "Laranja",
        # Rua Alameda, Jardim Algarve, Alvorada
        "lat": -29.98470, "lng": -51.07510,
    },
    # -- SETOR AMARELO -----------------------------------------
    {
        "id": 3, "nome": "GC Conectados",
        "endereco": "Rua Beija-Flores, 371", "bairro": "Porto Verde",
        "cidade": "Alvorada", "estado": "RS", "setor": "Amarelo",
        # Rua Beija-Flores, Porto Verde, Alvorada
        "lat": -29.99050, "lng": -51.06820,
    },
    {
        "id": 4, "nome": "GC Conectado",
        "endereco": "Av. Borges de Medeiros, 196", "bairro": "Intersul",
        "cidade": "Alvorada", "estado": "RS", "setor": "Amarelo",
        # Av. Borges de Medeiros próximo ao Intersul, Alvorada
        "lat": -29.99580, "lng": -51.08150,
    },
    # -- SETOR VERMELHO ----------------------------------------
    {
        "id": 5, "nome": "GC Palavra Viva",
        "endereco": "Rua 34, 318", "bairro": "Jardim Algarve",
        "cidade": "Alvorada", "estado": "RS", "setor": "Vermelho",
        # Rua 34 (Trinta e Quatro), Jardim Algarve, Alvorada
        "lat": -29.98710, "lng": -51.07650,
    },
    {
        "id": 6, "nome": "GC Manálovers",
        "endereco": "Rua Flaviano Morais Monroe, 556", "bairro": "Jardim Algarve",
        "cidade": "Alvorada", "estado": "RS", "setor": "Vermelho",
        # Rua Flaviano Morais Monroe, Jardim Algarve, Alvorada
        "lat": -29.98390, "lng": -51.07430,
    },
    {
        "id": 7, "nome": "GC Farol da Lagoa",
        "endereco": "Av. Borges de Medeiros, 196", "bairro": "Intersul",
        "cidade": "Alvorada", "estado": "RS", "setor": "Vermelho",
        # Mesmo endereço do GC Conectado (Intersul)
        "lat": -29.99580, "lng": -51.08150,
    },
    # -- SETOR AZUL --------------------------------------------
    {
        "id": 8, "nome": "GC Master Fé",
        "endereco": "Rua Gonçalves de Magalhães, 806", "bairro": "Jardim Porto Alegre",
        "cidade": "Alvorada", "estado": "RS", "setor": "Azul",
        # Rua Gonçalves de Magalhães, Jardim Porto Alegre, Alvorada
        "lat": -30.00180, "lng": -51.07920,
    },
    {
        "id": 11, "nome": "GC Corujas",
        "endereco": "Rua Corujas, 552", "bairro": "Porto Verde",
        "cidade": "Alvorada", "estado": "RS", "setor": "Azul",
        # Rua Corujas, Porto Verde, Alvorada
        "lat": -29.99120, "lng": -51.06730,
    },
    # -- SETOR ROXO --------------------------------------------
    {
        "id": 9, "nome": "GC Maranata",
        "endereco": "Rua Pedro Claudio Monassa, 380", "bairro": "Jardim Algarve",
        "cidade": "Alvorada", "estado": "RS", "setor": "Roxo",
        # Rua Pedro Claudio Monassa, Jardim Algarve, Alvorada
        "lat": -29.98610, "lng": -51.07720,
    },
    {
        "id": 10, "nome": "GC Resgate da Cruz",
        "endereco": "Av. Elmira Pereira Silveira, 327", "bairro": "Jardim Algarve",
        "cidade": "Alvorada", "estado": "RS", "setor": "Roxo",
        # Av. Elmira Pereira Silveira, Jardim Algarve, Alvorada
        "lat": -29.98550, "lng": -51.07810,
    },
]

SETOR_CORES = {
    "Verde":    "#22c55e",
    "Laranja":  "#f97316",
    "Amarelo":  "#eab308",
    "Vermelho": "#ef4444",
    "Azul":     "#3b82f6",
    "Roxo":     "#a855f7",
}

def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distância em KM entre dois pontos usando fórmula Haversine."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi       = math.radians(lat2 - lat1)
    dlambda    = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

def rota_google(orig_lat: float, orig_lng: float, dest_lat: float, dest_lng: float) -> str:
    """
    Gera link direto Google Maps Directions usando APENAS coordenadas.
    Origem → Destino sem paradas extras — formato que o Maps aceita
    sem ambiguidade de endereço textual.
    """
    params = urllib.parse.urlencode({
        "api":         "1",
        "origin":      f"{orig_lat},{orig_lng}",
        "destination": f"{dest_lat},{dest_lng}",
        "travelmode":  "driving",
    })
    return f"https://www.google.com/maps/dir/?{params}"


@app.route("/api/gcs/rota-osrm", methods=["POST"])
@login_required
def rota_osrm():
    """
    Busca rota real de dirigir via OSRM (gratuito, sem API key).
    Retorna coordenadas da polilinha + distancia + duracao.
    Usado pelo frontend para desenhar a rota no mapa estilo mapcn.
    """
    import urllib.request as _ur
    import json as _json

    body = request.get_json(force=True) or {}
    try:
        orig_lat = float(body["orig_lat"])
        orig_lng = float(body["orig_lng"])
        dest_lat = float(body["dest_lat"])
        dest_lng = float(body["dest_lng"])
    except (KeyError, ValueError, TypeError):
        return jsonify({"erro": "Parametros invalidos: orig_lat, orig_lng, dest_lat, dest_lng"}), 400

    # OSRM publico -- formato: lng,lat (nao lat,lng!)
    url = (
        f"https://router.project-osrm.org/route/v1/driving/"
        f"{orig_lng},{orig_lat};{dest_lng},{dest_lat}"
        f"?overview=full&geometries=geojson"
    )
    try:
        req = _ur.Request(url, headers={"User-Agent": "IgrejaABA/6.0"})
        with _ur.urlopen(req, timeout=12) as r:
            data = _json.loads(r.read().decode())

        if not data.get("routes"):
            return jsonify({"erro": "OSRM nao retornou rota"}), 404

        route = data["routes"][0]
        coords = route["geometry"]["coordinates"]  # [[lng, lat], ...]

        return jsonify({
            "ok":          True,
            "coordinates": coords,
            "distance_m":  route.get("distance", 0),
            "duration_s":  route.get("duration", 0),
            "maps_link":   rota_google(orig_lat, orig_lng, dest_lat, dest_lng),
        })
    except Exception as e:
        logger.warning(f"OSRM erro: {e}")
        return jsonify({
            "ok":        False,
            "maps_link": rota_google(orig_lat, orig_lng, dest_lat, dest_lng),
            "erro":      "Rota detalhada indisponivel -- use o link do Maps.",
        }), 503


@app.route("/api/gcs", methods=["GET"])
@login_required
def listar_gcs():
    return jsonify([
        {**g,
         "cor": SETOR_CORES.get(g["setor"], "#888"),
         "endereco_completo": f"{g['endereco']}, {g['bairro']}, {g['cidade']}/{g['estado']}"}
        for g in GCS_PADRAO
    ])


@app.route("/api/gcs/finder", methods=["POST"])
@login_required
def gc_finder():
    """
    Recebe lat/lng do visitante → devolve lista de GCs ordenada por distância.
    Cada GC traz rota correta origem→destino em lat/lng puro.
    """
    body = request.get_json(force=True) or {}
    try:
        lat_v = float(body["lat"])
        lng_v = float(body["lng"])
    except (KeyError, ValueError, TypeError):
        return jsonify({"erro": "lat/lng inválidos"}), 400

    resultado = []
    for gc in GCS_PADRAO:
        dist = haversine(lat_v, lng_v, gc["lat"], gc["lng"])
        resultado.append({
            **gc,
            "cor":               SETOR_CORES.get(gc["setor"], "#888"),
            "distancia_km":      round(dist, 2),
            "endereco_completo": f"{gc['endereco']}, {gc['bairro']}, {gc['cidade']}/{gc['estado']}",
            "rota_link":         rota_google(lat_v, lng_v, gc["lat"], gc["lng"]),
        })

    resultado.sort(key=lambda x: x["distancia_km"])
    resultado[0]["mais_proximo"] = True

    return jsonify({
        "ok": True, "visitante_lat": lat_v, "visitante_lng": lng_v,
        "total": len(resultado), "gcs": resultado,
    })


def _normalizar_endereco(texto: str) -> str:
    """
    Normaliza endereço para aumentar tolerância a erros de digitação:
    - Remove acentos
    - Lowercase
    - Expande abreviações comuns (R. → Rua, Av. → Avenida, etc.)
    - Colapsa espaços múltiplos
    """
    # Remove acentos
    nfkd = unicodedata.normalize("NFKD", texto)
    sem_acento = "".join(c for c in nfkd if not unicodedata.combining(c))
    s = sem_acento.lower().strip()

    # Expande abreviações de logradouro
    abreviacoes = [
        (r'\br\.\s*', 'rua '),
        (r'\bav\.\s*', 'avenida '),
        (r'\bav\b\s*', 'avenida '),
        (r'\bpca\.\s*', 'praca '),
        (r'\bpc\.\s*',  'praca '),
        (r'\btrav\.\s*', 'travessa '),
        (r'\best\.\s*', 'estrada '),
        (r'\bal\.\s*',  'alameda '),
    ]
    for pat, rep in abreviacoes:
        s = re.sub(pat, rep, s)

    # Colapsa espaços e vírgulas extras
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _construir_queries(endereco_raw: str) -> list:
    """
    Gera múltiplas variantes de busca para o endereço, da mais específica
    à mais genérica, incluindo a versão normalizada (sem acentos).
    """
    raw   = endereco_raw.strip()
    norm  = _normalizar_endereco(raw)

    loc_raw  = raw.lower()
    loc_norm = norm.lower()

    cidades_rs = ["alvorada", "viamao", "canoas", "gravatai", "porto alegre",
                  "gravataí", "viamão"]
    tem_cidade = any(c in loc_raw or c in loc_norm for c in cidades_rs)

    queries = []
    if tem_cidade:
        queries += [raw, norm, f"{raw}, RS, Brasil", f"{norm}, RS, Brasil"]
    else:
        # Tenta primeiro com o texto original, depois normalizado
        for base in [raw, norm]:
            queries += [
                f"{base}, Alvorada, RS, Brasil",
                f"{base}, Alvorada, Rio Grande do Sul, Brasil",
                f"{base}, Jardim Algarve, Alvorada, RS",
                f"{base}, Porto Verde, Alvorada, RS",
            ]

    # Deduplicar mantendo ordem
    seen_q: set = set()
    unique = []
    for q in queries:
        if q not in seen_q:
            seen_q.add(q)
            unique.append(q)
    return unique


@app.route("/api/gcs/geocode", methods=["POST"])
@login_required
def geocode_endereco():
    """
    Geocodifica via Nominatim (OSM) — sem API key.
    v6: Normalização fuzzy de endereço — aceita abreviações, erros de acento,
    letras maiúsculas/minúsculas e variações de formatação.
    """
    import urllib.request as _ur
    import json as _json

    body     = request.get_json(force=True) or {}
    endereco = (body.get("endereco") or "").strip()
    if not endereco:
        return jsonify({"erro": "Endereço obrigatório"}), 400

    queries = _construir_queries(endereco)

    # Centro geográfico de Alvorada/RS para desempate por proximidade
    ALV_LAT, ALV_LNG = -29.9896, -51.0822

    def _score(item: dict) -> float:
        """Pontuação: prioriza resultados dentro de Alvorada/RS e municípios vizinhos."""
        disp = (item.get("display_name") or "").lower()
        addr = item.get("address") or {}
        city  = (addr.get("city") or addr.get("town") or
                 addr.get("municipality") or addr.get("village") or "").lower()
        state = (addr.get("state") or "").lower()
        score = 0.0
        # Cidade preferida: Alvorada
        if city == "alvorada":
            score += 10.0
        elif any(c in disp for c in ["alvorada", "jardim algarve", "porto verde", "intersul"]):
            score += 6.0
        # RS
        if "rio grande do sul" in state or addr.get("state_code", "").lower() == "rs":
            score += 3.0
        # Distância ao centro de Alvorada (bônus até 5 pts para < 5 km)
        try:
            d = haversine(float(item["lat"]), float(item["lon"]), ALV_LAT, ALV_LNG)
            score += max(0.0, 5.0 - d)
        except Exception:
            pass
        # Penaliza resultados sem número de rua (menos precisos)
        if not addr.get("house_number"):
            score -= 1.0
        return score

    seen_keys: set = set()
    candid    = []

    for query in queries:
        url = ("https://nominatim.openstreetmap.org/search?"
               + urllib.parse.urlencode({
                   "q": query, "format": "json",
                   "limit": 5, "addressdetails": 1, "countrycodes": "br",
               }))
        try:
            req = _ur.Request(url, headers={"User-Agent": "IgrejaABA/6.0 (contato@igrejaaba.com)"})
            with _ur.urlopen(req, timeout=10) as r:
                data = _json.loads(r.read().decode())
            for item in data:
                key = (item.get("lat"), item.get("lon"))
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                item["_q"]     = query
                item["_score"] = _score(item)
                candid.append(item)
        except _ur.HTTPError as e:
            logger.warning(f"Nominatim HTTP {e.code} [{query}]")
            if e.code == 403:
                break   # bloqueado — para de tentar
        except Exception as e:
            logger.error(f"Geocode erro [{query}]: {e}")

        # Se já encontramos resultado excelente (score >= 12), podemos parar cedo
        if candid and max(c["_score"] for c in candid) >= 12:
            break

    if not candid:
        return jsonify({
            "erro": "Endereço não encontrado. Verifique o nome da rua e tente novamente.",
            "dica": "Exemplos aceitos: 'Rua 139, 84', 'R. 139 84', 'inocencio de oliveira 101', 'Av Borges 196'",
        }), 404

    candid.sort(key=lambda x: x["_score"], reverse=True)
    best = candid[0]

    return jsonify({
        "ok":      True,
        "lat":     float(best["lat"]),
        "lng":     float(best["lon"]),
        "display": best.get("display_name", endereco),
        "query":   best["_q"],
    })

# =============================================================
#  ESTOQUE
# =============================================================
@app.route("/api/estoque", methods=["GET"])
@login_required
def listar_estoque():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM estoque ORDER BY fixo DESC, categoria, nome"
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/estoque", methods=["POST"])
@login_required
def criar_item_estoque():
    d    = request.get_json(force=True) or {}
    nome = d.get("nome", "").strip()
    if not nome:
        return jsonify({"erro": "Nome do item é obrigatório"}), 400
    try:
        with get_db() as conn:
            cur = conn.execute(
                """INSERT INTO estoque
                   (nome,categoria,quantidade,quantidade_minima,unidade,descricao,fixo)
                   VALUES (?,?,?,?,?,?,0)""",
                (
                    nome,
                    d.get("categoria",        "Geral"),
                    int(d.get("quantidade",         0)),
                    int(d.get("quantidade_minima",  0)),
                    d.get("unidade",          "unidade"),
                    d.get("descricao",        "")
                )
            )
            if USE_POSTGRES:
                iid = conn.execute("SELECT lastval()").fetchone()[0]
            else:
                iid = cur.lastrowid
            conn.commit()
        return jsonify({"ok": True, "id": iid})
    except Exception as e:
        if "UNIQUE" in str(e):
            return jsonify({"erro": "Já existe um item com esse nome"}), 400
        return jsonify({"erro": str(e)}), 500

@app.route("/api/estoque/<int:iid>", methods=["PUT"])
@login_required
def atualizar_item_estoque(iid):
    d = request.get_json(force=True) or {}
    with get_db() as conn:
        item = conn.execute("SELECT * FROM estoque WHERE id=?", (iid,)).fetchone()
        if not item:
            return jsonify({"erro": "Item não encontrado"}), 404
        if item["fixo"]:
            conn.execute(
                "UPDATE estoque SET quantidade=?, atualizado_em=datetime('now','localtime') WHERE id=?",
                (int(d.get("quantidade", item["quantidade"])), iid)
            )
        else:
            conn.execute(
                """UPDATE estoque SET nome=?,categoria=?,quantidade=?,
                   quantidade_minima=?,unidade=?,descricao=?,
                   atualizado_em=datetime('now','localtime') WHERE id=?""",
                (
                    d.get("nome",              item["nome"]),
                    d.get("categoria",         item["categoria"]),
                    int(d.get("quantidade",    item["quantidade"])),
                    int(d.get("quantidade_minima", item["quantidade_minima"])),
                    d.get("unidade",           item["unidade"]),
                    d.get("descricao",         item["descricao"]),
                    iid
                )
            )
        conn.commit()
    return jsonify({"ok": True})

@app.route("/api/estoque/<int:iid>", methods=["DELETE"])
@login_required
def deletar_item_estoque(iid):
    with get_db() as conn:
        item = conn.execute("SELECT fixo,nome FROM estoque WHERE id=?", (iid,)).fetchone()
        if not item:
            return jsonify({"erro": "Item não encontrado"}), 404
        if item["fixo"] and session.get("usuario_cargo") != "admin":
            return jsonify({"erro": "Apenas administradores podem excluir itens de Santa Ceia"}), 403
        conn.execute("DELETE FROM estoque WHERE id=?", (iid,))
        conn.commit()
    return jsonify({"ok": True})

# =============================================================
#  RESUMO
# =============================================================
@app.route("/api/resumo", methods=["GET"])
@login_required
def resumo():
    with get_db() as conn:
        r       = conn.execute("SELECT * FROM v_resumo_geral").fetchone()
        ultimos = conn.execute(
            "SELECT * FROM v_cultos_detalhe ORDER BY data DESC,hora DESC LIMIT 5"
        ).fetchall()
        por_per = conn.execute(
            """SELECT periodo, COUNT(*) as qtd,
               ROUND(AVG(presentes),1) as media_presentes,
               SUM(presentes) as total_presentes
               FROM cultos GROUP BY periodo"""
        ).fetchall()
    ultimos_list = []
    for u in ultimos:
        row = dict(u)
        row["data_br"] = fmt_data_br(row["data"])
        ultimos_list.append(row)
    return jsonify({
        "geral":       dict(r) if r else {},
        "ultimos":     ultimos_list,
        "por_periodo": [dict(x) for x in por_per]
    })

# =============================================================
#  EXPORTAR EXCEL
# =============================================================
@app.route("/api/exportar_excel", methods=["GET"])
@login_required
def exportar_excel():
    data_ini = request.args.get("data_ini", "")
    data_fim = request.args.get("data_fim", "")
    periodo  = request.args.get("periodo",  "")

    sql    = "SELECT * FROM v_cultos_detalhe WHERE 1=1"
    params = []
    if data_ini:
        sql += " AND data >= ?"; params.append(data_ini)
    if data_fim:
        sql += " AND data <= ?"; params.append(data_fim)
    if periodo:
        sql += " AND periodo = ?"; params.append(periodo)
    sql += " ORDER BY data ASC"

    with get_db() as conn:
        cultos_rows  = [dict(r) for r in conn.execute(sql, params).fetchall()]
        resumo_row   = dict(conn.execute("SELECT * FROM v_resumo_geral").fetchone() or {})
        estoque_rows = [dict(r) for r in conn.execute(
            "SELECT * FROM estoque ORDER BY fixo DESC, categoria, nome"
        ).fetchall()]
        checklist_map = {}
        for c in cultos_rows:
            chks = conn.execute(
                "SELECT * FROM checklists WHERE culto_id=? ORDER BY categoria,id",
                (c["id"],)
            ).fetchall()
            checklist_map[c["id"]] = [dict(x) for x in chks]

    hdr_fill    = PatternFill("solid", fgColor="0A2463")
    hdr_font    = Font(color="FFFFFF", bold=True, size=11)
    border      = Border(left=Side(style="thin"), right=Side(style="thin"),
                         top=Side(style="thin"),  bottom=Side(style="thin"))
    green_fill  = PatternFill("solid", fgColor="C6EFCE")
    red_fill    = PatternFill("solid", fgColor="FFC7CE")
    orange_fill = PatternFill("solid", fgColor="FFEB9C")

    wb = openpyxl.Workbook()

    ws1 = wb.active
    ws1.title = "Registros de Culto"
    ws1.append(["IGREJA ABA – Registros de Culto"])
    ws1["A1"].font = Font(bold=True, size=14, color="0A2463")
    ws1.append([])
    cols   = ["Data","Dia da Semana","Horário","Período","Responsável",
              "Presentes","Visitantes","Crianças","Observações"]
    chaves = ["data","dia_semana","hora","periodo","responsavel",
              "presentes","visitantes","criancas","observacoes"]
    ws1.append(cols)
    for i in range(1, len(cols)+1):
        c = ws1.cell(3, i)
        c.fill = hdr_fill; c.font = hdr_font
        c.alignment = Alignment(horizontal="center"); c.border = border
    for r in cultos_rows:
        row_vals = [r.get(k, "") for k in chaves]
        row_vals[0] = fmt_data_br(row_vals[0])
        ws1.append(row_vals)
    if cultos_rows:
        ws1.append([])
        ws1.append(["TOTAIS","","","","",
                    sum(r["presentes"]  for r in cultos_rows),
                    sum(r["visitantes"] for r in cultos_rows),
                    sum(r["criancas"]   for r in cultos_rows), ""])
        ws1.append(["MÉDIAS","","","","",
                    round(sum(r["presentes"]  for r in cultos_rows)/max(len(cultos_rows),1),1),
                    round(sum(r["visitantes"] for r in cultos_rows)/max(len(cultos_rows),1),1),
                    round(sum(r["criancas"]   for r in cultos_rows)/max(len(cultos_rows),1),1),""])
        for cell in ws1[ws1.max_row-1]: cell.font = Font(bold=True, color="0A2463")
        for cell in ws1[ws1.max_row]:   cell.font = Font(bold=True, color="1D6F42")
    for i, w in enumerate([14,16,10,10,22,12,12,12,35], 1):
        ws1.column_dimensions[get_column_letter(i)].width = w

    ws2 = wb.create_sheet("Checklist dos Cultos")
    ws2.append(["IGREJA ABA – Checklist dos Cultos"])
    ws2["A1"].font = Font(bold=True, size=14, color="0A2463")
    ws2.append([])
    ws2.append(["Data","Período","Responsável","Categoria","Item","Concluído"])
    for i in range(1, 7):
        c = ws2.cell(3, i)
        c.fill = hdr_fill; c.font = hdr_font
        c.alignment = Alignment(horizontal="center"); c.border = border
    cat_labels = {"antes":"Antes do Culto","mesa_entrada":"Mesa de Entrada",
                  "banheiro":"Banheiros","durante":"Durante o Culto","final":"Final do Culto"}
    for culto in cultos_rows:
        for chk in checklist_map.get(culto["id"], []):
            sim_nao = "SIM ✓" if chk["concluido"] else "NÃO ✗"
            ridx = ws2.max_row + 1
            ws2.append([
                fmt_data_br(culto["data"]), culto["periodo"], culto["responsavel"],
                cat_labels.get(chk["categoria"], chk["categoria"]),
                chk["item_descricao"], sim_nao
            ])
            cf = ws2.cell(ridx, 6)
            cf.fill = green_fill if chk["concluido"] else red_fill
            cf.font = Font(bold=True, color="375623" if chk["concluido"] else "9C0006")
    for col, w in zip("ABCDEF", [14,10,22,18,48,12]):
        ws2.column_dimensions[col].width = w

    santa_ceia_rows = [i for i in estoque_rows if i["categoria"] == "Santa Ceia"]
    outros_rows     = [i for i in estoque_rows if i["categoria"] != "Santa Ceia"]

    def escrever_aba_estoque(titulo, itens, cor="0A2463"):
        ws = wb.create_sheet(titulo)
        ws.append([f"IGREJA ABA – {titulo}"])
        ws["A1"].font = Font(bold=True, size=14, color=cor)
        ws.append([])
        ws.append(["Item","Categoria","Quantidade","Qtd. Mínima","Unidade","Descrição","Status"])
        for i in range(1, 8):
            c = ws.cell(3, i)
            c.fill = hdr_fill; c.font = hdr_font
            c.alignment = Alignment(horizontal="center"); c.border = border
        for item in itens:
            abaixo = item["quantidade"] < item["quantidade_minima"]
            status = "⚠️ Abaixo do mínimo" if abaixo else "✓ OK"
            ridx   = ws.max_row + 1
            ws.append([item["nome"], item["categoria"], item["quantidade"],
                       item["quantidade_minima"], item["unidade"],
                       item["descricao"], status])
            sf = ws.cell(ridx, 7)
            sf.fill = orange_fill if abaixo else green_fill
            sf.font = Font(bold=True, color="9C5700" if abaixo else "375623")
        for col, w in zip("ABCDEFG", [36,18,14,14,12,30,20]):
            ws.column_dimensions[col].width = w
        if itens:
            ws.append([])
            ws.append(["TOTAL EM ESTOQUE","","",
                       sum(i["quantidade"] for i in itens),"","",""])
            ws.cell(ws.max_row, 1).font = Font(bold=True, color=cor)

    if santa_ceia_rows:
        escrever_aba_estoque("Estoque — Santa Ceia", santa_ceia_rows, cor="7B1FA2")
    if outros_rows:
        escrever_aba_estoque("Estoque — Geral", outros_rows)

    ws4 = wb.create_sheet("Resumo Geral")
    ws4.append(["RESUMO GERAL – IGREJA ABA"])
    ws4["A1"].font = Font(bold=True, size=14, color="0A2463")
    ws4.append([])
    for item in [
        ["Total de Cultos",           resumo_row.get("total_cultos",    0)],
        ["Total de Presentes",        resumo_row.get("total_presentes", 0)],
        ["Total de Visitantes",       resumo_row.get("total_visitantes",0)],
        ["Total de Crianças",         resumo_row.get("total_criancas",  0)],
        ["Média de Presentes/Culto",  resumo_row.get("media_presentes", 0)],
        ["Média de Visitantes/Culto", resumo_row.get("media_visitantes",0)],
        ["Média de Crianças/Culto",   resumo_row.get("media_criancas",  0)],
    ]:
        ws4.append(item)
        ws4.cell(ws4.max_row, 1).font = Font(bold=True)
    ws4.column_dimensions["A"].width = 35
    ws4.column_dimensions["B"].width = 20

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"igrejaaba_{date.today().isoformat()}.xlsx"
    return send_file(buf, as_attachment=True, download_name=filename,
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# =============================================================
#  INICIAR
# =============================================================
# FIX v4: init_db não levanta exceção fatal — servidor sobe mesmo se o disco
# do Render ainda não estiver disponível. ensure_db() cuida disso na 1ª req.
init_db()

if __name__ == "__main__":
    print("="*55)
    print("  IGREJA ABA — Sistema de Registro v4")
    print(f"  DB_PATH : {DB_PATH}")
    print(f"  BASE_URL: {os.environ.get('BASE_URL','(automática)')}")
    print("="*55)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
