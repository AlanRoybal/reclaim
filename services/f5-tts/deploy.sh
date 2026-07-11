#!/usr/bin/env bash
# Deploy the F5-TTS voice service to a DO GPU droplet.
# Requires: DIGITALOCEAN_API_TOKEN, an SSH key on the DO account.
set -euo pipefail

: "${DIGITALOCEAN_API_TOKEN:?set DIGITALOCEAN_API_TOKEN}"
REGION="${REGION:-tor1}"
SIZE="${SIZE:-gpu-4000adax1-20gb}"   # RTX 4000 Ada — $0.76/hr, plenty for F5-TTS (2-3GB VRAM)
IMAGE="${IMAGE:-gpu-h100x1-base}"    # DO AI/ML-ready image (CUDA + docker preinstalled)
F5_API_KEY="${F5_API_KEY:-$(openssl rand -hex 24)}"

SSH_KEY_ID=$(curl -s -H "Authorization: Bearer $DIGITALOCEAN_API_TOKEN" \
  https://api.digitalocean.com/v2/account/keys | python3 -c "import json,sys; print(json.load(sys.stdin)['ssh_keys'][0]['id'])")

echo "Creating GPU droplet ($SIZE in $REGION)…"
ID=$(curl -s -X POST -H "Authorization: Bearer $DIGITALOCEAN_API_TOKEN" -H "content-type: application/json" \
  -d "{\"name\":\"reclaim-f5tts\",\"region\":\"$REGION\",\"size\":\"$SIZE\",\"image\":\"$IMAGE\",\"ssh_keys\":[$SSH_KEY_ID]}" \
  https://api.digitalocean.com/v2/droplets | python3 -c "import json,sys; print(json.load(sys.stdin)['droplet']['id'])")

echo "droplet id: $ID — waiting for IP…"
for _ in $(seq 1 30); do
  IP=$(curl -s -H "Authorization: Bearer $DIGITALOCEAN_API_TOKEN" \
    "https://api.digitalocean.com/v2/droplets/$ID" | python3 -c "
import json,sys
nets=json.load(sys.stdin)['droplet']['networks']['v4']
pub=[n['ip_address'] for n in nets if n['type']=='public']
print(pub[0] if pub else '')")
  [ -n "$IP" ] && break
  sleep 10
done

echo "Waiting for SSH on $IP…"
until ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 "root@$IP" true 2>/dev/null; do sleep 10; done

echo "Deploying service…"
scp -q server.py Dockerfile "root@$IP:/root/"
ssh "root@$IP" "docker build -t reclaim-f5tts /root && \
  docker run -d --restart unless-stopped --gpus all -p 8000:8000 -e F5_API_KEY=$F5_API_KEY reclaim-f5tts"

cat <<EOF

F5-TTS service deploying at http://$IP:8000 (model downloads on first start; watch: ssh root@$IP docker logs -f \$(docker ps -q))

Add to the app's .env.local:
  F5_TTS_URL=http://$IP:8000
  F5_TTS_API_KEY=$F5_API_KEY

Destroy when done:
  curl -X DELETE -H "Authorization: Bearer \$DIGITALOCEAN_API_TOKEN" https://api.digitalocean.com/v2/droplets/$ID
EOF
