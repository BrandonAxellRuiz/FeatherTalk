import test from "node:test";
import assert from "node:assert/strict";
import { DictationPipeline } from "../src/core/dictationPipeline.js";
import { LlamaCleanupError } from "../src/core/errors.js";

function createPipeline({ shouldFailLlama = false } = {}) {
  const callOrder = [];
  let pasteCallCount = 0;

  const pipeline = new DictationPipeline({
    asrClient: {
      async transcribe() {
        callOrder.push("asr");
        return { raw_text: "hola mundo sin puntuacion" };
      }
    },
    llamaClient: {
      async cleanText() {
        callOrder.push("llama");
        if (shouldFailLlama) {
          throw new Error("ollama offline");
        }

        return "Hola mundo sin puntuacion.";
      }
    },
    pasteController: {
      async pasteText(text) {
        callOrder.push("paste");
        pasteCallCount += 1;
        return {
          pasted: true,
          copied_to_clipboard: false,
          text
        };
      }
    }
  });

  return {
    pipeline,
    callOrder,
    getPasteCallCount: () => pasteCallCount
  };
}

test("pipeline enforces order ASR -> Llama -> Paste", async () => {
  const { pipeline, callOrder } = createPipeline();

  const stageOrder = [];
  const result = await pipeline.processRecording({
    audioPath: "C:/tmp/test.wav",
    onStage: (stage) => stageOrder.push(stage)
  });

  assert.deepEqual(callOrder, ["asr", "llama", "paste"]);
  assert.deepEqual(stageOrder, ["asr", "llama", "paste"]);
  assert.equal(result.finalText, "Hola mundo sin puntuacion.");
});

test("pipeline blocks autopaste when llama fails", async () => {
  const { pipeline, callOrder, getPasteCallCount } = createPipeline({
    shouldFailLlama: true
  });

  await assert.rejects(
    () => pipeline.processRecording({ audioPath: "C:/tmp/test.wav" }),
    (error) => error instanceof LlamaCleanupError
  );

  assert.deepEqual(callOrder, ["asr", "llama"]);
  assert.equal(getPasteCallCount(), 0);
});
