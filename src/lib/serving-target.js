export const SERVING_TARGET = Object.freeze({
  hfId: "Qwen/Qwen3.5-4B",
  mlxId: "mlx-community/Qwen3.5-4B-MLX-4bit",
  ollamaTag: "qwen3.5:4b",
  architecture: "Qwen3_5ForCausalLM",
  hiddenSize: 2560,
  vocabSize: 248320,
  numLayers: 32,
  numLinearAttentionLayers: 24,
  numFullAttentionLayers: 8,
  numAttentionHeads: 16,
  numKeyValueHeads: 4,
  loraTargetModules: Object.freeze([
    "in_proj_qkv",
    "in_proj_z",
    "in_proj_b",
    "in_proj_a",
    "out_proj",
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj"
  ])
});

