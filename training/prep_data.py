#!/usr/bin/env python3
"""Build a per-user SFT dataset for the style fine-tune.

The training objective mirrors production exactly: given an ASL gloss sequence,
produce a fluent sentence in the user's personal style. We synthesize the
training pairs by REVERSE-translating the user's real messages into glosses
with a strong teacher model (DO Gradient serverless), so the target side of
every pair is authentic user text.

  corpus.json (S3)  ──teacher──▶  {"glosses": "ME TIRED GO HOME",
                                   "text":    "ima head home its been a day"}

Usage:
  export DIGITALOCEAN_API_TOKEN=...
  python prep_data.py --bucket reclaim-user-data-... --user demo-user --out data/
"""

import argparse
import json
import pathlib
import random

import boto3
from openai import OpenAI

TEACHER_BASE_URL = "https://inference.do-ai.run/v1"
TEACHER_MODEL = "llama3.3-70b-instruct"

REVERSE_PROMPT = (
    "Convert this casual text message into an ASL-style gloss sequence: "
    "uppercase sign labels in ASL grammar order (topic-comment, no articles, "
    "no 'to be'). Use common single-word glosses. Reply with ONLY the glosses "
    "separated by spaces.\n\nMessage: {msg}"
)

SYSTEM = (
    "You translate ASL gloss sequences into a single fluent, natural English "
    "sentence written exactly the way this user texts. Reply with ONLY the sentence."
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--user", required=True)
    ap.add_argument("--out", default="data")
    ap.add_argument("--do-token", default=None, help="defaults to $DIGITALOCEAN_API_TOKEN")
    args = ap.parse_args()

    import os

    token = args.do_token or os.environ["DIGITALOCEAN_API_TOKEN"]
    s3 = boto3.client("s3")
    body = s3.get_object(Bucket=args.bucket, Key=f"users/{args.user}/texts/corpus.json")["Body"].read()
    lines = [l for l in json.loads(body)["lines"] if 4 <= len(l) <= 300]
    print(f"corpus: {len(lines)} messages")

    teacher = OpenAI(base_url=TEACHER_BASE_URL, api_key=token)
    pairs = []
    for i, msg in enumerate(lines):
        res = teacher.chat.completions.create(
            model=TEACHER_MODEL,
            max_tokens=60,
            temperature=0.2,
            messages=[{"role": "user", "content": REVERSE_PROMPT.format(msg=msg)}],
        )
        glosses = (res.choices[0].message.content or "").strip().upper()
        if glosses and all(c.isalpha() or c in " -'" for c in glosses):
            pairs.append({"glosses": glosses, "text": msg})
        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{len(lines)} reverse-translated")

    random.Random(13).shuffle(pairs)
    split = max(1, int(len(pairs) * 0.95))
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, chunk in [("train", pairs[:split]), ("eval", pairs[split:])]:
        with open(out / f"{name}.jsonl", "w") as f:
            for p in chunk:
                f.write(
                    json.dumps(
                        {
                            "messages": [
                                {"role": "system", "content": SYSTEM},
                                {"role": "user", "content": f"Glosses: {p['glosses']}"},
                                {"role": "assistant", "content": p["text"]},
                            ]
                        }
                    )
                    + "\n"
                )
        print(f"{name}: {len(chunk)} examples → {out / f'{name}.jsonl'}")


if __name__ == "__main__":
    main()
