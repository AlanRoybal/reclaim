# Per-user style fine-tune (Phase 2, tier 1)

LoRA fine-tune of **Qwen2.5-1.5B-Instruct** on the user's message corpus, served on
**DigitalOcean Gradient Dedicated Inference** via BYOM. Few-shot prompting demonstrably
under-captures informal personal style (19–65% authorship match vs 95–97% on formal text);
this is the quality unlock.

## Pipeline

```
corpus.json (S3) ──prep_data.py──▶ gloss→message pairs (teacher: Llama 3.3 70B reverses
                                    each real message into ASL glosses; targets stay authentic)
                 ──train_model.py─▶ LoRA (r=16) on Qwen2.5-1.5B, merged → safetensors HF repo
                 ──BYOM──────────▶ DO Model Catalog → Dedicated Inference endpoint
                 ──model.json────▶ app routes this user's personal mode to their model
```

## Runbook

```bash
# 1. Build the dataset (anywhere with the DO + AWS creds)
pip install boto3 openai
python prep_data.py --bucket <S3_BUCKET> --user <user-sub> --out data/

# 2. Train on a DO GPU droplet (~minutes for 1.5B LoRA on RTX 4000 Ada, $0.76/hr)
./provision.sh                       # creates droplet, prints next steps
scp -r training data root@<ip>:~/
ssh root@<ip> 'pip install torch transformers trl peft datasets && python training/train_model.py --data data --out outputs/reclaim-style'

# 3. Publish weights → private HF repo (or DO Spaces)
huggingface-cli upload <you>/reclaim-style-<user> outputs/reclaim-style

# 4. Register + deploy (DO console): Gradient → Model Catalog → My Models →
#    Import Model (BYOM) → HF repo → attach Dedicated Inference deployment.
#    Qwen2ForCausalLM is on the supported list. $5/mo storage + GPU-hour while deployed.

# 5. Point the app at it
aws s3 cp - s3://<S3_BUCKET>/users/<user-sub>/model.json <<'EOF'
{"baseURL": "https://<deployment>.inference.do-ai.run/v1", "apiKey": "<model-access-key>", "model": "<model-name>"}
EOF
```

`/api/style` picks up `model.json` automatically — personal mode responses will report
`"source": "personal-finetuned"`. Delete `model.json` to fall back to the few-shot tier.

## Cost

| Item | Cost |
|---|---|
| Training (RTX 4000 Ada, <1 hr) | < $1 per user |
| BYOM weight storage | $5/mo |
| Dedicated inference | $2.59–$4.41/GPU-hr while deployed |

Dedicated GPU per user is the expensive part — batch multiple users' LoRA adapters onto
one deployment, or keep deployments scaled to zero except during active sessions.
