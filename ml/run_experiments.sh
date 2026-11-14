#!/usr/bin/env bash
# Full pipeline: data -> pretraining -> fine-tuning -> ablation -> export.
# Run from the ml/ folder, ideally on a Colab/Kaggle GPU:
#   bash run_experiments.sh
# Edit the people lists first. Test people are NEVER used for training or tuning.
set -euo pipefail

TEST_PEOPLE="P07,P08"     # >= 2 people, ideally outside the team
VAL_PEOPLE="P06"          # 1-2 people for picking the best epoch
EPOCHS_PRE=15
EPOCHS_FT=30
D=data/processed

echo "== 1. data =="
[ -f $D/synthetic.jsonl.gz ] || python data_prep/make_synthetic.py --per-class 3000
[ -f $D/quickdraw.jsonl.gz ] || python data_prep/quickdraw.py --per-class 4000
[ -f $D/hds.npz ]            || python data_prep/hand_drawn_shapes.py --src hand-drawn-shapes-dataset
[ -f $D/letters.npz ]        || python data_prep/letters.py --hf
python data_prep/own_recordings.py recordings/*.json

echo "== 2. pretraining =="
python train.py --mode cnn --name pre_cnn --epochs $EPOCHS_PRE \
  --images $D/hds.npz $D/letters.npz --traj $D/quickdraw.jsonl.gz $D/synthetic.jsonl.gz
python train.py --mode gru --name pre_gru --epochs $EPOCHS_PRE \
  --traj $D/quickdraw.jsonl.gz $D/synthetic.jsonl.gz

echo "== 3. fine-tuning + ablation (all evaluated on the same held-out people) =="
COMMON="--own $D/own.jsonl.gz --test-people $TEST_PEOPLE --val-people $VAL_PEOPLE --epochs $EPOCHS_FT --lr 3e-4"
# main model: fusion, pretrained, public data mixed in at low weight
python train.py --mode fusion --name fusion $COMMON --traj $D/synthetic.jsonl.gz:0.3 $D/quickdraw.jsonl.gz:0.3 \
  --init runs/pre_cnn/best.pt runs/pre_gru/best.pt
# single branches
python train.py --mode cnn --name cnn_only $COMMON --traj $D/synthetic.jsonl.gz:0.3 $D/quickdraw.jsonl.gz:0.3 \
  --init runs/pre_cnn/best.pt
python train.py --mode gru --name gru_only $COMMON --traj $D/synthetic.jsonl.gz:0.3 $D/quickdraw.jsonl.gz:0.3 \
  --init runs/pre_gru/best.pt
# no pretraining, own data only
python train.py --mode fusion --name fusion_scratch $COMMON --lr 1e-3

for run in fusion cnn_only gru_only fusion_scratch; do
  python evaluate.py runs/$run/best.pt --own $D/own.jsonl.gz --label $run
done
# public-only model tested on real air-writing (shows why own data is needed)
python evaluate.py runs/pre_cnn/best.pt --own $D/own.jsonl.gz --people $TEST_PEOPLE --label "pre_cnn (no own data)"
python evaluate.py runs/pre_gru/best.pt --own $D/own.jsonl.gz --people $TEST_PEOPLE --label "pre_gru (no own data)"

echo "== 4. scores + export =="
python calibrate_scores.py --own $D/own.jsonl.gz --exclude $TEST_PEOPLE
python export_onnx.py runs/fusion/best.pt --bounds models/score_bounds.json --metrics runs/fusion/eval/test/metrics.json
cp models/airscribe.onnx models/airscribe_meta.json ../backend/models/
echo "done. Ablation table: results/summary.md"
