# Igreja ABA — Tutoriais

---

## 📱 Como instalar o app no celular (PWA)

### Android (Chrome)
1. Abra o Chrome e acesse: **https://igrejaaba.onrender.com/app**
2. Faça login normalmente
3. Toque no menu (⋮) no canto superior direito
4. Toque em **"Adicionar à tela inicial"**
5. Confirme tocando em **"Adicionar"**
6. O app aparece na tela inicial como qualquer outro app ✅

### iPhone (Safari)
1. Abra o **Safari** (obrigatório — não funciona no Chrome no iPhone)
2. Acesse: **https://igrejaaba.onrender.com/app**
3. Faça login normalmente
4. Toque no botão de compartilhar (quadrado com seta ↑) na barra inferior
5. Toque em **"Adicionar à Tela de Início"**
6. Toque em **"Adicionar"**
7. O app aparece na tela inicial ✅

---

## 🗄️ Como configurar PostgreSQL no Render

### Opção 1 — Automático (usando render.yaml)
O arquivo `render.yaml` já configura tudo automaticamente.
Ao fazer deploy, o Render cria o banco e conecta via `DATABASE_URL`.

### Opção 2 — Manual
1. No painel do Render, vá em **New → PostgreSQL**
2. Nome: `igreja-aba-db`, plano: **Free**, região: **Ohio**
3. Clique em **Create Database**
4. Copie o valor de **"Internal Database URL"**
5. No seu Web Service → **Environment → Add Environment Variable**:
   - Key: `DATABASE_URL`
   - Value: (cole a URL copiada)
6. Clique em **Save** — o Render fará deploy automático

### Por que PostgreSQL?
- SQLite apaga os dados quando o Render reinicia o servidor (free tier)
- PostgreSQL é um banco separado, persistente, que nunca perde dados
- O sistema detecta automaticamente: se `DATABASE_URL` existir → usa PostgreSQL; senão → usa SQLite local

---

## 📦 Gerar APK Android gratuito (futuro)

### Opção A — Bubblewrap (Google)
```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest=https://igrejaaba.onrender.com/static/manifest.json
bubblewrap build
```
Gera um APK assinado para publicar na Play Store.

### Opção B — Capacitor (mais simples)
```bash
npm install -g @capacitor/cli
npx cap init "Igreja ABA" "com.igrejaaba.app"
npx cap add android
npx cap open android  # abre no Android Studio
```
No Android Studio, clique em **Build → Generate Signed APK**.

### Requisito
- Android Studio instalado (gratuito): https://developer.android.com/studio
- Conta de desenvolvedor Google Play: USD 25 (única vez) — opcional para distribuição interna

---

## 🔐 Credenciais padrão
- **Admin:** admin@igrejaaba.com / Admin@123
- **Troque a senha** após o primeiro acesso em: Usuários → 🔑 Senha
