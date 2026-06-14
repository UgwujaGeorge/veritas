require("ts-node/register");

const assert = require("node:assert/strict");
const { decodeReadableResult, extractReadableResult, parseVerdict } = require("../backend/relay.ts");

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

runTest("decodes GenLayer readable JSON string literals", () => {
  const readable = JSON.stringify(
    ' {"approved": false, "reasoning": "The evidence is not the grantee\'s own repository."}',
  );

  assert.equal(
    decodeReadableResult(readable),
    '{"approved": false, "reasoning": "The evidence is not the grantee\'s own repository."}',
  );
});

runTest("parses the StudioNet leader receipt result shape", () => {
  const readable = JSON.stringify(
    ' {"approved": false, "reasoning": "The submitted evidence is merely a third-party page rather than the grantee\'s own repository."}',
  );
  const receipt = {
    consensus_data: {
      leader_receipt: [
        {
          result: {
            status: "return",
            payload: { readable },
          },
        },
      ],
    },
  };

  assert.equal(extractReadableResult(receipt), readable);
  assert.deepEqual(parseVerdict(receipt), {
    approved: false,
    reasoning: "The submitted evidence is merely a third-party page rather than the grantee's own repository.",
  });
});

runTest("parses direct JSON object text", () => {
  assert.deepEqual(parseVerdict('{"approved": true, "reasoning": "Meets the criteria."}'), {
    approved: true,
    reasoning: "Meets the criteria.",
  });
});

runTest("rejects verdicts without a boolean approved field", () => {
  assert.throws(() => parseVerdict('{"approved": "yes"}'), /boolean approved field/);
});
