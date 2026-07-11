#!/usr/bin/env bash
# Provision a DigitalOcean GPU Droplet for the style fine-tune.
# Requires: DIGITALOCEAN_API_TOKEN, an SSH key already added to the DO account.
#
# Cost note: RTX 4000 Ada ($0.76/hr) is plenty for a 1.5B LoRA — the run takes
# minutes. Destroy the droplet when done (this script prints the command).
set -euo pipefail

: "${DIGITALOCEAN_API_TOKEN:?set DIGITALOCEAN_API_TOKEN}"
REGION="${REGION:-tor1}"
SIZE="${SIZE:-gpu-4000adax1-20gb}"   # RTX 4000 Ada x1
IMAGE="${IMAGE:-gpu-h100x1-base}"     # DO AI/ML-ready image (CUDA + drivers)

SSH_KEY_ID=$(curl -s -H "Authorization: Bearer $DIGITALOCEAN_API_TOKEN" \
  https://api.digitalocean.com/v2/account/keys | python3 -c "import json,sys; print(json.load(sys.stdin)['ssh_keys'][0]['id'])")

echo "Creating GPU droplet ($SIZE in $REGION)…"
DROPLET=$(curl -s -X POST -H "Authorization: Bearer $DIGITALOCEAN_API_TOKEN" -H "content-type: application/json" \
  -d "{\"name\":\"reclaim-finetune\",\"region\":\"$REGION\",\"size\":\"$SIZE\",\"image\":\"$IMAGE\",\"ssh_keys\":[$SSH_KEY_ID]}" \
  https://api.digitalocean.com/v2/droplets)
ID=$(echo "$DROPLET" | python3 -c "import json,sys; print(json.load(sys.stdin)['droplet']['id'])")
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

cat <<EOF

GPU droplet ready: root@$IP

Next steps:
  scp -r training data root@$IP:~/
  ssh root@$IP
    pip install torch transformers trl peft datasets
    python training/train_model.py --data data --out outputs/reclaim-style
    # upload outputs/reclaim-style to a (private) Hugging Face repo or DO Spaces

Register in DO (console): Gradient → Model Catalog → My Models → Import (BYOM)
  → point at the HF repo / Spaces path → attach a Dedicated Inference deployment
  → copy the endpoint URL + model key into users/<sub>/model.json (see README).

When finished, DESTROY the droplet to stop billing:
  curl -X DELETE -H "Authorization: Bearer \$DIGITALOCEAN_API_TOKEN" \\
    https://api.digitalocean.com/v2/droplets/$ID
EOF
