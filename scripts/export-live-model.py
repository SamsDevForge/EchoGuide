"""Optional developer export. The resulting ONNX is committed for npm-only recreation."""
import hashlib
import json
import os
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "artifacts" / "live-model-export"
WORK.mkdir(parents=True, exist_ok=True)
(WORK / "settings").mkdir(exist_ok=True)
os.environ["YOLO_CONFIG_DIR"] = str(WORK / "settings")
os.environ["YOLO_AUTOINSTALL"] = "False"
os.chdir(WORK)

import torch
import onnx
from ultralytics import YOLOE, settings

settings.update({"sync": False})
torch.set_num_threads(2)
SOURCE = "https://github.com/ultralytics/assets/releases/download/v8.4.0/yoloe-26s-seg.pt"
checkpoint = WORK / "yoloe-26s-seg.pt"
if not checkpoint.exists():
    urlretrieve(SOURCE, checkpoint)

prompts = ["person", "chair", "backpack", "metal gate", "building door", "fence", "window", "wall", "wooden gate", "gate", "door"]
labels = ["person", "chair", "backpack", "gate", "door", "fence", "window", "wall", "gate", "gate", "door"]
model = YOLOE("yoloe-26s.yaml").load(str(checkpoint))
model.set_classes(prompts, model.get_text_pe(prompts))
model.save_prompt_embeddings(str(WORK / "prompts.npz"))
output = Path(model.export(format="onnx", imgsz=640, opset=17, simplify=True,
                         nms=False, device="cpu", batch=1, dynamic=False))
graph = onnx.load(output)
onnx.checker.check_model(graph)
destination = ROOT / "client" / "public" / "live-models"
destination.mkdir(parents=True, exist_ok=True)
target = destination / "echoguide-yoloe.onnx"
target.write_bytes(output.read_bytes())
def shape(value):
    return [d.dim_value or d.dim_param for d in value.type.tensor_type.shape.dim]
record = {
    "model": "YOLOE-26s detection-only, fixed prompts",
    "source": SOURCE,
    "sourceSha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
    "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
    "bytes": target.stat().st_size,
    "labels": labels,
    "prompts": prompts,
    "inputSize": 640,
    "inputs": {x.name: shape(x) for x in graph.graph.input},
    "outputs": {x.name: shape(x) for x in graph.graph.output},
    "exporter": "ultralytics==8.4.171; torch==2.10.0; onnx==1.20.1; onnxslim==0.1.85",
    "license": "AGPL-3.0",
}
(destination / "provenance.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record, indent=2))
