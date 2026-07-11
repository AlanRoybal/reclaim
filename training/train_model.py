#!/usr/bin/env python3
"""LoRA fine-tune of Qwen2.5-1.5B-Instruct on the user's style dataset.

Follows DigitalOcean's BYOM + Dedicated Inference tutorial: TRL SFTTrainer on
a GPU Droplet, LoRA adapters merged back into the base weights, exported as a
standard Hugging Face repo (config.json + tokenizer + .safetensors) — exactly
what DO's Bring-Your-Own-Model import expects. Qwen2ForCausalLM is on DO's
supported-architecture list.

Run on a DO GPU Droplet (see provision.sh):
  pip install torch transformers trl peft datasets
  python train_model.py --data data/ --out outputs/reclaim-style
"""

import argparse

from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer

BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", default="outputs/reclaim-style")
    ap.add_argument("--epochs", type=float, default=3.0)
    ap.add_argument("--lr", type=float, default=1e-4)
    args = ap.parse_args()

    dataset = load_dataset(
        "json",
        data_files={"train": f"{args.data}/train.jsonl", "eval": f"{args.data}/eval.jsonl"},
    )

    model = AutoModelForCausalLM.from_pretrained(BASE_MODEL, torch_dtype="bfloat16", device_map="auto")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        task_type="CAUSAL_LM",
    )

    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset["train"],
        eval_dataset=dataset["eval"],
        peft_config=peft_config,
        args=SFTConfig(
            output_dir=args.out + "-checkpoints",
            num_train_epochs=args.epochs,
            learning_rate=args.lr,
            per_device_train_batch_size=4,
            gradient_accumulation_steps=4,
            logging_steps=5,
            eval_strategy="epoch",
            save_strategy="epoch",
            bf16=True,
            max_length=512,
        ),
    )
    trainer.train()

    # Merge LoRA into the base weights and export a plain HF repo — DO BYOM
    # requires full safetensors weights, not adapter-only checkpoints.
    merged = trainer.model.merge_and_unload()
    merged.save_pretrained(args.out, safe_serialization=True)
    tokenizer.save_pretrained(args.out)
    print(f"merged model exported to {args.out} — ready for BYOM import")


if __name__ == "__main__":
    main()
