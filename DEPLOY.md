# Deploy do PixelForge na VPS da Hostinger

Guia assumindo VPS Ubuntu (padrão da Hostinger, 22.04 ou 24.04) e
acesso root via SSH. Se seu plano vier com AlmaLinux/CentOS, os passos
mudam no gerenciador de pacotes (`dnf` em vez de `apt`) — me avisa que
adapto.

## 0. Antes de começar

Você vai precisar:
- IP da VPS (painel da Hostinger → VPS → Overview)
- Senha root (ou chave SSH, se já configurou)
- Opcional mas recomendado: um domínio/subdomínio apontando pro IP da
  VPS (tipo `pixelforge.seudominio.com`), pra poder usar HTTPS de
  verdade depois

## 1. Conectar na VPS

Do seu PC (Linux/CachyOS):
```bash
ssh root@SEU_IP_AQUI
```

## 2. Atualizar o sistema e instalar dependências

```bash
apt update && apt upgrade -y
apt install -y python3 python3-venv python3-pip nginx git ufw
```

## 3. Criar um usuário não-root pra rodar a aplicação

Rodar como root é desnecessário e arriscado. Cria um usuário dedicado:
```bash
adduser pixelforge --disabled-password --gecos ""
```

## 4. Subir o projeto pra VPS

Duas opções, escolha uma:

**Opção A — via git (recomendado, facilita atualizar depois):**
Suba o projeto pro seu GitHub (pode ser repo privado) e depois, na VPS:
```bash
su - pixelforge
git clone https://github.com/SEU_USUARIO/pixelforge.git
cd pixelforge
```

**Opção B — via scp direto do seu PC (mais rápido agora):**
No seu PC, dentro da pasta onde está o `pixelforge.zip`:
```bash
scp pixelforge.zip root@SEU_IP_AQUI:/home/pixelforge/
ssh root@SEU_IP_AQUI
chown pixelforge:pixelforge /home/pixelforge/pixelforge.zip
su - pixelforge
unzip pixelforge.zip
cd pixelforge
```
(se `unzip` não existir: `exit` de volta pro root, `apt install -y unzip`, `su - pixelforge` de novo)

## 5. Ambiente Python e dependências

Ainda como usuário `pixelforge`, dentro de `~/pixelforge`:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 6. Testar rodando na mão (antes de virar serviço)

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Em outro terminal do seu PC:
```bash
curl http://SEU_IP_AQUI:8000/api/sprites
```
Deve retornar `[]`. Se funcionar, `Ctrl+C` pra parar e seguir pro
passo 7 (rodar como serviço de verdade, que reinicia sozinho se cair
ou se a VPS reiniciar).

> Se o `curl` não responder, provavelmente é o firewall — pula pro
> passo 9 e depois volta aqui pra reconfirmar.

## 7. Rodar como serviço systemd (fica de pé sozinho)

Volte pro usuário root (`exit`) e crie o arquivo de serviço:

```bash
nano /etc/systemd/system/pixelforge.service
```

Cole isto (já ajustado pros caminhos deste guia):

```ini
[Unit]
Description=PixelForge editor + API
After=network.target

[Service]
User=pixelforge
Group=pixelforge
WorkingDirectory=/home/pixelforge/pixelforge/backend
ExecStart=/home/pixelforge/pixelforge/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Note que aqui o host é `127.0.0.1`, não `0.0.0.0` — a partir de agora
quem fala com a internet é o Nginx (passo 8), o uvicorn só escuta
localmente. Mais seguro.

Ativa e sobe o serviço:
```bash
systemctl daemon-reload
systemctl enable pixelforge
systemctl start pixelforge
systemctl status pixelforge
```
Deve aparecer `active (running)` em verde. Pra ver logs a qualquer
momento: `journalctl -u pixelforge -f`.

## 8. Nginx como proxy reverso

```bash
nano /etc/nginx/sites-available/pixelforge
```

Cole (troque `SEU_DOMINIO` pelo seu domínio real, ou deixe só o IP se
ainda não tiver domínio):

```nginx
server {
    listen 80;
    server_name SEU_DOMINIO;  # ou o IP da VPS, se ainda não tem domínio

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ativa o site e testa a config:
```bash
ln -s /etc/nginx/sites-available/pixelforge /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

## 9. Firewall

```bash
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw enable
```
Confirma com `y` se perguntar. Agora só as portas 22 (SSH), 80 e 443
ficam abertas — a 8000 do uvicorn fica só interna, o que é o correto.

Nesse ponto, `http://SEU_IP_AQUI` (ou `http://SEU_DOMINIO`) já deve
abrir o editor no navegador.

## 10. HTTPS de verdade (se tiver domínio apontado)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d SEU_DOMINIO
```
Segue o assistente (email, aceitar termos). Ele edita o Nginx sozinho
pra redirecionar HTTP → HTTPS e renova o certificado automaticamente.

## Atualizando o projeto depois (fluxo do dia a dia)

Se usou a Opção A (git):
```bash
su - pixelforge
cd pixelforge
git pull
cd backend && source .venv/bin/activate && pip install -r requirements.txt
exit
systemctl restart pixelforge
```

Se usou a Opção B (zip), repete o scp + unzip por cima e depois:
```bash
systemctl restart pixelforge
```

## Sincronizar VPS → PC local (scp/rsync)

Durante o desenvolvimento, algumas mudanças foram aplicadas **direto na
VPS** (via `nano` ou `cat > arquivo << 'EOF'` no terminal SSH), sem passar
primeiro pelo GitHub — geralmente porque o PC do trabalho tinha problemas
de conexão SSH com a VPS, mas o GitHub via HTTPS funcionava normalmente.
Isso significa que, em vários pontos, **a VPS ficou com código mais
atualizado que o repositório GitHub**.

Pra trazer esse estado da VPS de volta pro PC local (e daí sim commitar
pro GitHub), existem duas formas, rodando do terminal do **PC local**
(não da VPS):

**scp — copia a pasta inteira:**
```bash
scp -r root@89.116.225.87:~/pixelforge ./pixelforge_vps
```

**rsync — mais inteligente, ignora lixo (venv, cache, .git):**
```bash
rsync -avz --exclude='.venv' --exclude='__pycache__' --exclude='.git' \
  root@89.116.225.87:~/pixelforge/ ./pixelforge_vps/
```

Depois de baixado, sincroniza com o repositório clonado do GitHub e
commita normalmente:
```bash
cd sua-pasta-do-repo-github
cp -r ../pixelforge_vps/* .
git add -A
git commit -m "sync: aplica mudancas feitas direto na VPS"
git push
```

**Pré-requisito:** o SSH do PC local precisa conseguir conectar na VPS
(mesmo `ssh root@89.116.225.87` usado normalmente). Testa antes com:
```bash
ssh root@89.116.225.87 "echo teste ok"
```
Se responder `teste ok`, o `scp`/`rsync` também vai funcionar, já que usam
o mesmo protocolo/porta (22).

**Direção inversa (PC local → VPS)** também é possível com os mesmos
comandos invertendo origem/destino — útil depois que o GitHub estiver de
novo como fonte de verdade e a VPS precisar só de um `git pull` (fluxo
normal, ver seção anterior) em vez de scp.

## Checklist rápido de problemas comuns

- **502 Bad Gateway no Nginx** → o serviço `pixelforge` não está
  rodando. Confere com `systemctl status pixelforge` e
  `journalctl -u pixelforge -n 50`.
- **Editor abre mas export/salvar dá erro** → confere permissão das
  pastas `backend/data/sprites` e `backend/data/exports`, precisam
  pertencer ao usuário `pixelforge`.
- **`curl` do passo 6 não respondia** → geralmente é `ufw` bloqueando
  antes de você chegar no passo 9, ou você esqueceu `--host 0.0.0.0`
  no teste manual (não confundir com o systemd, que já é `127.0.0.1`
  de propósito).
