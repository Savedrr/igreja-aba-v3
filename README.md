# ⛪ IGREJA ABA — Sistema de Registro de Culto v3

---

## 🔐 Login padrão
| E-mail | Senha |
|---|---|
| admin@igrejaaba.com | Admin@123 |

---

## 🚀 OPÇÃO 1 — Rodar localmente (VS Code)

```bash
pip install -r requirements.txt
python app.py
```
Acesse: http://localhost:5000
Celular (mesma rede): http://[SEU-IP]:5000

---

## ☁️ OPÇÃO 2 — Deploy no Vercel (mais fácil)

### ⚠️ Aviso importante sobre o Vercel
O Vercel é **serverless** — cada requisição pode rodar em um servidor diferente.
Isso significa que o banco de dados SQLite fica em `/tmp` e **pode ser resetado**.
O Vercel é ótimo para sites estáticos, mas **não é ideal para apps com banco de dados**.

**Se quiser usar o Vercel mesmo assim:**
- Os dados ficam no `/tmp` do servidor
- Funcionam enquanto o servidor estiver "quente"
- Após inatividade, o `/tmp` é apagado e o banco reseta

**Para dados permanentes, use o Render (Opção 3).**

### Passos para deploy no Vercel

**1. Instale o Vercel CLI**
```bash
npm install -g vercel
```

**2. Faça login**
```bash
vercel login
```

**3. Na pasta do projeto, rode:**
```bash
vercel
```

**4. Responda as perguntas:**
- Set up and deploy? → `Y`
- Which scope? → sua conta
- Link to existing project? → `N`
- Project name? → `igreja-aba`
- In which directory is your code? → `.` (ponto, significa pasta atual)
- Want to modify settings? → `N`

**5. Adicione as variáveis de ambiente no painel do Vercel:**
- Acesse: vercel.com → seu projeto → Settings → Environment Variables
- Adicione:
  - `SECRET_KEY` → qualquer texto longo (ex: `minha-chave-secreta-2024`)
  - `BASE_URL` → a URL que o Vercel te deu (ex: `https://igreja-aba.vercel.app`)

**6. Para atualizar após mudanças:**
```bash
vercel --prod
```

### Por que o erro aconteceu antes?
```
error: Python requirement: ==3.12.*
```
O Vercel forçava Python 3.12, mas o arquivo `.python-version` pedia 3.11.9.
**Isso já está corrigido** — o arquivo agora diz `3.12` e o `requirements.txt`
usa versões compatíveis com Python 3.12.

---

## ☁️ OPÇÃO 3 — Deploy no Render (recomendado para dados permanentes)

O Render permite montar um **disco persistente** — os dados nunca são perdidos.

### Passos

**1. Suba o código para o GitHub**
```bash
git init
git add .
git commit -m "Igreja ABA v3"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/igreja-aba.git
git push -u origin main
```

**2. Crie conta em render.com** (login com GitHub)

**3. New → Web Service → conecte seu repositório**

**4. Configure:**
| Campo | Valor |
|---|---|
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn app:app` |

**5. Environment Variables:**
| Chave | Valor |
|---|---|
| `PYTHON_VERSION` | `3.12` |
| `SECRET_KEY` | (clique Generate) |
| `BASE_URL` | `https://igreja-aba.onrender.com` |
| `DB_DIR` | `/opt/render/project/src/database` |

**6. Add Disk:**
- Name: `database`
- Mount Path: `/opt/render/project/src/database`
- Size: `1 GB`

**7. Create Web Service** → aguarde o build

---

## 🔧 Arquivos de configuração

| Arquivo | Para que serve |
|---|---|
| `vercel.json` | Configura o Vercel para rodar Flask |
| `render.yaml` | Configura o Render automaticamente |
| `Procfile` | Comando de start para Render/Heroku |
| `.python-version` | Define Python 3.12 para todos os serviços |
| `requirements.txt` | Dependências compatíveis com Python 3.12 |
| `.gitignore` | Protege o banco local de subir para o GitHub |

---

## ✅ Funcionalidades

| Recurso | Descrição |
|---|---|
| 🔐 Login individual | Cada membro tem e-mail e senha próprios |
| 📝 Registro de Culto | Data BR, hora, dia da semana, período |
| ✅ Checklist | 5 categorias com barra de progresso |
| 📦 Estoque | Inventário com alertas, separado por categoria |
| ✝️ Santa Ceia | Itens pré-cadastrados (só admin exclui) |
| 📱 QR Code | Link correto local e em produção |
| 👥 Visitantes | Ficha completa, oração, visita pastoral |
| 📊 Relatórios | Filtros por período e data |
| 📥 Excel | Cultos + Checklist + Estoque Santa Ceia + Estoque Geral + Resumo |
| 👤 Usuários | Admin gerencia quem acessa |
| 🏷️ Favicon | Logo em todas as abas e celulares |
| 📱 Mobile | Layout responsivo |

---

*Igreja ABA — Um Lar Para Pertencer* ⛪
