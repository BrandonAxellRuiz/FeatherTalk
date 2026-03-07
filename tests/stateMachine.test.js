import test from "node:test";
import assert from "node:assert/strict";
import { FeatherTalkStateMachine, STATES } from "../src/core/stateMachine.js";

test("state machine follows expected happy-path transitions", () => {
  const transitions = [];
  const fsm = new FeatherTalkStateMachine((event) => transitions.push(event));

  fsm.transition(STATES.RECORDING);
  fsm.transition(STATES.PROCESSING_ASR);
  fsm.transition(STATES.PROCESSING_LLAMA);
  fsm.transition(STATES.PASTING);
  fsm.transition(STATES.DONE);
  fsm.transition(STATES.IDLE);

  assert.equal(fsm.state, STATES.IDLE);
  assert.equal(transitions.length, 6);
  assert.equal(transitions[0].to, STATES.RECORDING);
  assert.equal(transitions.at(-1).to, STATES.IDLE);
});

test("state machine rejects invalid transitions", () => {
  const fsm = new FeatherTalkStateMachine();

  assert.throws(() => {
    fsm.transition(STATES.PROCESSING_ASR);
  }, /Invalid transition/);
});

test("state machine can move from error back to idle", () => {
  const fsm = new FeatherTalkStateMachine();

  fsm.transition(STATES.RECORDING);
  fsm.fail(new Error("boom"));
  assert.equal(fsm.state, STATES.ERROR);

  fsm.transition(STATES.IDLE);
  assert.equal(fsm.state, STATES.IDLE);
});
