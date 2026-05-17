"""
IGREJA ABA — Módulo de IA para Contagem de Pessoas
Usa YOLO (Ultralytics) + rastreamento próprio simples
Envia dados para a API do sistema via HTTP

COMO USAR:
  pip install ultralytics opencv-python requests
  python contador.py --sessao 1 --camera 0

  --sessao   ID da sessão criada no sistema (obrigatório)
  --camera   URL ou índice da câmera (0=webcam, rtsp://...)
  --api      URL base do sistema (padrão: http://localhost:5000)
  --linha    Posição Y da linha virtual em % da altura (padrão: 50)
"""
import argparse, time, math, requests, cv2, collections
from datetime import datetime

try:
    from ultralytics import YOLO
    YOLO_DISPONIVEL = True
except ImportError:
    YOLO_DISPONIVEL = False
    print("⚠️  ultralytics não instalado. Execute: pip install ultralytics")


# ─── Rastreador simples baseado em distância ──────────────────
class RastreadorSimples:
    """
    Rastreador leve sem dependências externas.
    Associa detecções por proximidade (distância euclidiana).
    Para câmeras simples com poucas pessoas simultâneas.
    """
    def __init__(self, dist_max=80, max_ausente=30):
        self.tracks      = {}    # track_id → {centroide, frames_ausente, historico_y}
        self.proximo_id  = 1
        self.dist_max    = dist_max
        self.max_ausente = max_ausente

    def _dist(self, a, b):
        return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)

    def atualizar(self, centroides):
        """Recebe lista de centroides (x,y) e retorna dict {track_id: centroide}"""
        # Marca todos como ausentes temporariamente
        for tid in self.tracks:
            self.tracks[tid]["frames_ausente"] += 1

        ativos = {}
        usados = set()

        for cx, cy in centroides:
            melhor_id   = None
            melhor_dist = self.dist_max

            for tid, info in self.tracks.items():
                if tid in usados: continue
                d = self._dist((cx, cy), info["centroide"])
                if d < melhor_dist:
                    melhor_dist = d; melhor_id = tid

            if melhor_id is not None:
                self.tracks[melhor_id]["centroide"]       = (cx, cy)
                self.tracks[melhor_id]["frames_ausente"]  = 0
                self.tracks[melhor_id]["historico_y"].append(cy)
                ativos[melhor_id] = (cx, cy)
                usados.add(melhor_id)
            else:
                tid = self.proximo_id; self.proximo_id += 1
                self.tracks[tid] = {
                    "centroide": (cx, cy),
                    "frames_ausente": 0,
                    "historico_y": collections.deque([cy], maxlen=30)
                }
                ativos[tid] = (cx, cy)

        # Remove tracks muito ausentes
        self.tracks = {tid: v for tid, v in self.tracks.items()
                       if v["frames_ausente"] < self.max_ausente}

        return ativos


# ─── Contador principal ───────────────────────────────────────
class ContadorPessoas:
    def __init__(self, sessao_id, api_url, camera_src, linha_pct=50):
        self.sessao_id   = sessao_id
        self.api_url     = api_url.rstrip("/")
        self.camera_src  = camera_src
        self.linha_pct   = linha_pct          # % da altura da imagem
        self.rastreador  = RastreadorSimples()
        self.ja_contados = {}  # track_id → "entrada"|"saida" (anti-duplicação)
        self.entradas    = 0
        self.saidas      = 0

        if YOLO_DISPONIVEL:
            print("🔄 Carregando modelo YOLO (yolov8n)...")
            self.model = YOLO("yolov8n.pt")  # Baixa automaticamente na 1ª vez
            print("✅ YOLO carregado!")
        else:
            self.model = None

    def _registrar(self, track_id, direcao, confianca=1.0):
        """Envia passagem para a API e evita duplicatas"""
        if track_id in self.ja_contados:
            return  # Anti-duplicação
        self.ja_contados[track_id] = direcao
        if direcao == "entrada": self.entradas += 1
        else: self.saidas += 1

        # Envia para API em background (não bloqueia o vídeo)
        try:
            requests.post(f"{self.api_url}/api/contagem/registrar",
                json={"sessao_id": self.sessao_id, "track_id": track_id,
                      "direcao": direcao, "confianca": confianca},
                timeout=3)
        except Exception as e:
            print(f"⚠️  API offline: {e}")

    def _detectar_frame_simulado(self, frame):
        """
        Simulação para quando YOLO não está disponível.
        Detecta contornos simples por diferença de frames.
        Use apenas para testes.
        """
        # Retorna lista vazia — sem detecção real sem YOLO
        return []

    def _detectar_frame_yolo(self, frame):
        """Detecta pessoas com YOLO e retorna lista de centroides"""
        results = self.model(frame, classes=[0], conf=0.45, verbose=False)
        centroides = []
        for box in results[0].boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2
            centroides.append((cx, cy))
        return centroides, results[0].boxes

    def rodar(self, mostrar_video=True):
        # Abre câmera
        src = int(self.camera_src) if str(self.camera_src).isdigit() else self.camera_src
        cap = cv2.VideoCapture(src)
        if not cap.isOpened():
            print(f"❌ Não foi possível abrir câmera: {self.camera_src}")
            return

        print(f"▶️  Câmera aberta | Sessão {self.sessao_id} | API: {self.api_url}")
        frame_count = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                print("⚠️  Frame não lido. Tentando reconectar...")
                time.sleep(1); cap.set(cv2.CAP_PROP_POS_FRAMES, 0); continue

            h, w = frame.shape[:2]
            linha_y = int(h * self.linha_pct / 100)
            frame_count += 1

            # ── Detecção (a cada 2 frames para performance) ──
            if frame_count % 2 == 0:
                if self.model:
                    centroides, boxes_raw = self._detectar_frame_yolo(frame)
                    # Desenha bounding boxes
                    if mostrar_video:
                        for box in boxes_raw:
                            x1,y1,x2,y2 = map(int,box.xyxy[0])
                            cv2.rectangle(frame,(x1,y1),(x2,y2),(0,200,100),2)
                else:
                    centroides = self._detectar_frame_simulado(frame)

                # ── Rastreamento ──
                tracks = self.rastreador.atualizar(centroides)

                # ── Verificação de cruzamento da linha ──
                for tid, (cx, cy) in tracks.items():
                    hist = list(self.rastreador.tracks[tid]["historico_y"])
                    if len(hist) >= 6:
                        media_ant = sum(hist[:3]) / 3
                        media_rec = sum(hist[-3:]) / 3
                        margem = 25  # pixels de tolerância
                        # Cruzou a linha com movimento consistente
                        if (media_ant < linha_y - margem and media_rec > linha_y + margem):
                            self._registrar(tid, "entrada")
                        elif (media_ant > linha_y + margem and media_rec < linha_y - margem):
                            self._registrar(tid, "saida")

                    # Desenha ID e ponto
                    if mostrar_video:
                        cor = (0,100,255) if tid in self.ja_contados else (255,255,0)
                        cv2.circle(frame, (cx, cy), 5, cor, -1)
                        cv2.putText(frame, f"#{tid}", (cx+5, cy-5),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, cor, 1)

            # ── Overlay visual ──
            if mostrar_video:
                cv2.line(frame, (0, linha_y), (w, linha_y), (0, 0, 255), 2)
                cv2.putText(frame, "LINHA DE CONTAGEM", (10, linha_y-8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,0,255), 1)
                overlay = frame.copy()
                cv2.rectangle(overlay, (0,0), (260,80), (0,0,0), -1)
                cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)
                cv2.putText(frame, f"ENTRADAS: {self.entradas}", (10,28),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,255,100), 2)
                cv2.putText(frame, f"SAIDAS:   {self.saidas}",  (10,58),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,150,255), 2)
                cv2.putText(frame, f"DENTRO:   {max(0,self.entradas-self.saidas)}", (10,82),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 2)
                cv2.imshow(f"Igreja ABA — Contagem | Sessão {self.sessao_id}", frame)

            # Q para sair
            if cv2.waitKey(1) & 0xFF == ord("q"):
                print(f"\n📊 RESULTADO FINAL")
                print(f"   Entradas : {self.entradas}")
                print(f"   Saídas   : {self.saidas}")
                print(f"   Dentro   : {max(0,self.entradas-self.saidas)}")
                break

        cap.release()
        cv2.destroyAllWindows()
        # Encerra sessão na API
        try:
            requests.post(f"{self.api_url}/api/contagem/sessoes/{self.sessao_id}/encerrar", timeout=3)
            print(f"✅ Sessão {self.sessao_id} encerrada na API.")
        except: pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Igreja ABA — Contador de Pessoas por IA")
    parser.add_argument("--sessao",  type=int, required=True,  help="ID da sessão de contagem")
    parser.add_argument("--camera",  default="0",              help="Índice ou URL da câmera")
    parser.add_argument("--api",     default="http://localhost:5000", help="URL base do sistema")
    parser.add_argument("--linha",   type=int, default=50,     help="Posição da linha em %% da altura")
    parser.add_argument("--sem-video", action="store_true",    help="Rodar sem exibir vídeo (headless)")
    args = parser.parse_args()

    contador = ContadorPessoas(
        sessao_id  = args.sessao,
        api_url    = args.api,
        camera_src = args.camera,
        linha_pct  = args.linha
    )
    contador.rodar(mostrar_video=not args.sem_video)
