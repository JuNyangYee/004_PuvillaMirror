# Person detector assets

YOLO11n-seg FP32 from https://huggingface.co/EdgeFirst/yolo11-seg (onnx/yolo11n-seg-fp32.onnx).
Copied byte-for-byte from the existing PickPod_FaceReading installation.
Input: 640x640 RGB float32 NCHW, letterbox gray 114. Output: COCO 80 classes,
normalized box coordinates, channel-first [1,116,8400].
Only person boxes are consumed. No silhouette masks are built or applied.
The supplied graph still includes its segmentation output; a detection-only export
can reduce inference cost in a future model change (update decoder/tests together).
Model license: AGPL-3.0 (Ultralytics). See LICENSE-AGPL-3.0.txt.

ONNX Runtime Web assets in ../onnxruntime are copied from the same installation.
They stay local; inference never uploads camera frames. Runtime license: MIT.
WebGPU is preferred, WASM in the worker is the fallback. Files are included by Vite
in normal and portable builds. Legacy single-HTML export disables YOLO explicitly.
